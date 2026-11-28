import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.SPIRITSPEAKER_EARNED_SAVE??'work/earned-overseer/complete.json';
const out=process.env.SPIRITSPEAKER_OUTPUT??'work/earned-spiritspeaker';
const url=process.env.LAB_URL??'http://127.0.0.1:51366/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,quarry,road,arena]=['natlan-hub','natlan-quarry-road','natlan-field','spiritspeaker-field-grotto'];
const boss='boss-25520101',quest='spiritspeaker-commission';
const sprite='spiritspeaker-field-poses-source-v1.png';
const equipment=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
const feather=equipment(input).find(item=>item.owner===1&&item.slot===2);
const weapon=input.weapons.equipped.traveler;
assert.ok(weapon&&feather&&!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const read=()=>page.evaluate(()=>{
 const {fieldBoss,actors:[actor],t,story,progression,mora,returns}=window.lab.frame;
 return {boss:fieldBoss,actor,t,node:story.node,progression,mora,returns};
});
const stored=view=>view.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

async function saveProgress(){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 return stored(page);
}

async function gear(actions,weapon){
 await page.evaluate(actions=>actions.forEach(action=>window.lab.action(action)),actions);
 await page.waitForFunction(id=>window.lab.frame.weaponView?.traveler===id,weapon);
 return (await read()).actor.atk;
}

async function enter(){
 if(!await page.evaluate(()=>window.lab.frame.holdAllyFire))await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 for(const id of [quarry,road,arena])await drive.cross(id);
}

async function at(move,first,last=Infinity){
 await page.waitForFunction(([move,first])=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move===move&&b.tick>=first;
 },[move,first]);
 const state=await read();
 assert.ok(state.boss.tick<last,move+' reached tick '+state.boss.tick);
 return state;
}

async function face(x){
 const {actor}=await read();
 const dir=Math.sign(x-actor.x);
 if(dir===actor.dir||!dir)return;
 const key=dir<0?'KeyA':'KeyD';
 await page.keyboard.down(key);
 try{await page.waitForFunction(dir=>window.lab.frame.actors[0].dir===dir,dir)}
 finally{await page.keyboard.up(key)}
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(name,label,numbers){
 await pause(true);
 const {t,boss:phase}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),label);
 const drawn=await page.evaluate(src=>{
  const f=window.lab.frame;
  return {marks:f.draws.filter(d=>d.kind==='text'&&d.y===501).map(d=>[d.text,d.x+f.camera]),
   poses:f.draws.filter(d=>d.source===src).map(d=>({x:d.x+f.camera,opacity:d.opacity,box:d.box}))};
 },sprite);
 assert.deepEqual(drawn.marks.map(([text])=>text),numbers);
 assert.ok(Math.abs(drawn.poses.at(-1).x-phase.x)<.001);
 assert.equal(drawn.poses.at(-1).opacity,undefined);
 if(phase.echoesVisible){
  assert.equal(drawn.poses.length,3);
  assert.ok(drawn.poses.slice(0,2).every((pose,i)=>{
   const {left,right}=phase.echoLanes[i];
   return pose.opacity>0&&pose.opacity<1&&Math.abs(pose.x-(left+right)/2)<.001;
  }));
 }else assert.equal(drawn.poses.length,1);
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.equal(packed.raster,raw.raster,name+' '+profile);
  assert.equal(raw.snapshot.t,t);
  assert.equal(packed.snapshot.t,t);
  assert.ok(packed.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount&&packed.gzipBytes<raw.gzipBytes);
  profiles[profile]={plainDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
   plainGzip:raw.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await page.waitForFunction(src=>window.lab.frame.draws.some(d=>d.source===src),sprite);
 await pause(false);
 return {label:phase.label,tick:phase.tick,...drawn,profiles};
}

try{
 await importSave(page,source);
 await drive.waitNode(hub);
 const originalAttack=(await read()).actor.atk;
 const trialAttack=await gear(['artifact_remove:'+feather.id,'weapon_equip:traveler:SW04'],'SW04');
 assert.ok(trialAttack>0&&trialAttack<originalAttack/4);
 await drive.accept(quest);
 await enter();
 await drive.walk(810);
 const initial=await read();
 assert.equal(initial.progression.level,200);
 assert.equal(initial.boss.maxhp,1060);
 const scenery=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'spiritspeakerField',file:'spiritspeaker-field-background-v1.png',state:'ready'});

 await at('FSP01',49,74);
 await at('FSP02',76,105);
 const ice=await capture('ice',/二つの氷色の筆跡/,['1','2']);
 const lock=await at('FSP03',64,83);
 const lanes=lock.boss.echoLanes;
 assert.equal(lanes.length,2);
 assert.equal(lock.boss.echoesVisible,true);
 const side=lanes[0].right<lock.boss.x?1:-1;
 await drive.walk(lock.boss.x+side*78);
 await face(lock.boss.x);
 const firstTell=await at('FSP03',130,140);
 assert.deepEqual(firstTell.boss.echoLanes,lanes);
 const echoes=await capture('echoes',/色彩の二影.*1\/2/,['1','2']);
 assert.ok(echoes.poses[0].opacity>echoes.poses[1].opacity);
 const first=await at('FSP03',161,187);
 assert.equal(first.actor.hp,lock.actor.hp);
 const hp=first.boss.hp;
 await page.locator('.skills button[data-action="normal"]').click();
 await page.waitForFunction(hp=>{
  const b=window.lab.frame.fieldBoss;
  return b?.echoesVisible&&b.hp<hp;
 },hp);
 const hit=await read();
 assert.ok(hit.boss.hp>0&&hit.boss.echoesVisible);
 await at('FSP03',217,226);
 const second=await capture('second',/色彩の二影.*2\/2/,['2']);
 assert.ok(second.poses[1].opacity>second.poses[0].opacity);
 const recovery=await at('FSP03',243,268);
 assert.equal(recovery.boss.recoveryTicks+recovery.boss.tick,384);
 assert.equal(recovery.boss.echoLanes,undefined);
 assert.equal(recovery.actor.hp,lock.actor.hp);
 console.log('Both echoes were visible and dodged, and a normal attack hit the body during the sequence.');

 const partial=await saveProgress();
 assert.equal(partial.fieldBosses[boss].hp,recovery.boss.hp);
 await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 assert.equal(await gear(['artifact_equip:'+feather.id,'weapon_equip:traveler:'+weapon],weapon),originalAttack);
 await enter();
 await drive.walk(520);
 const reload=await read();
 assert.deepEqual([reload.boss.form,reload.boss.hp],['idle',partial.fieldBosses[boss].hp]);
 await drive.walk(810);
 const opening=await at('FSP01',218,248);
 await drive.walk(opening.boss.x-73);
 await face(opening.boss.x);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:4800})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reload.progression.killXp,mora:defeated.mora-reload.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,420);
 await drive.count(quest,1);
 for(const id of [road,quarry,hub])await drive.cross(id);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[8600,560]);
 const saved=await saveProgress();
 assert.deepEqual(saved.weapons,input.weapons);
 assert.deepEqual(saved.loadout,input.loadout);
 assert.deepEqual(equipment(saved),equipment(input));
 const checkpoint=path.join(out,'complete.json');
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 fresh.on('pageerror',error=>errors.push(error.message));
 await importSave(fresh,checkpoint);
 const restored=await stored(fresh);
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-24090501'],input.endgame.bosses['boss-24090501']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reports=save=>Object.values(save.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reports(restored),reports(input)+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,originalAttack},scenery,
  echoSequence:{lanes,heroDamage:lock.actor.hp-recovery.actor.hp,bodyDamageDuringEchoes:hp-hit.boss.hp,
   hitAt:hit.boss.tick,recoveryTicks:144,hpAfterReload:reload.boss.hp},
  captures:{ice,echoes,second},reward,reportReward:{xp:8600,mora:560},fieldClears:1,
  reported:reports(restored),priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Spiritspeaker clear, quest report '+result.reported+' and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state.node,boss:state.boss,x:state.actor.x,hp:state.actor.hp,errors});
 throw error;
}finally{await browser.close()}
