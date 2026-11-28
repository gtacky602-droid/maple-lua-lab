import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.HERRA_EARNED_SAVE??'work/earned-battleship/complete.json';
const out=process.env.HERRA_OUTPUT??'work/earned-herra';
const url=process.env.LAB_URL??'http://127.0.0.1:51369/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,road,arena]=['nod-town','nod-field','nod-herra-terrace'];
const boss='boss-20081001',quest='frostnight-herra-commission';
const sprite='frostnight-herra-field-poses-source-v1.png';
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
 for(const id of [road,arena])await drive.cross(id);
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

async function capture(name,label,marks){
 await pause(true);
 const {t,boss:phase}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),label);
 const labels=await page.evaluate(()=>window.lab.frame.draws.filter(d=>d.kind==='text'&&d.y===500).map(d=>d.text));
 assert.deepEqual(labels,marks);
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
 return {label:phase.label,tick:phase.tick,form:phase.form,marks:labels,profiles};
}

try{
 await importSave(page,source);
 await drive.waitNode(hub);
 const originalAttack=(await read()).actor.atk;
 const trialAttack=await gear(['artifact_remove:'+feather.id,'weapon_equip:traveler:SW04'],'SW04');
 assert.ok(trialAttack>0&&trialAttack<originalAttack/4);
 await drive.accept(quest);
 await enter();
 await drive.walk(828);
 const initial=await read();
 assert.equal(initial.progression.level,200);
 assert.equal(initial.boss.maxhp,1200);
 const scenery=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'herraField',file:'frostnight-herra-field-background-v1.png',state:'ready'});

 const locked=await at('FHR02',60,93);
 const dive=locked.boss.lockedDive;
 assert.ok(dive.left<dive.center&&dive.right>dive.center);
 await drive.walk(dive.right+36);
 const landingSafe=await read();
 assert.ok(landingSafe.actor.x-10>dive.right);
 const air=await at('FHR02',113,123);
 assert.equal(air.boss.form,'airborne');
 const phase=(air.boss.tick-96)/36;
 assert.ok(Math.abs(air.boss.x-(dive.origin+(dive.center-dive.origin)*phase))<.001);
 assert.ok(Math.abs(air.boss.y-(480-4*phase*(1-phase)*1.48*88))<.001);
 const diveArt=await capture('dive',/飛翔からの着地/,['着地']);
 const landed=await at('FHR02',134,142);
 assert.equal(landed.boss.x,dive.center);
 assert.equal(landed.boss.y,480);
 assert.equal(landed.actor.hp,landingSafe.actor.hp);

 const shadow=await at('FHR03',63,89);
 assert.equal(shadow.boss.gloom,undefined);
 const lane=shadow.boss.lockedWave;
 assert.equal(shadow.boss.form,'shadow');
 await drive.walk((lane.left+lane.right)/2);
 const ready=await at('FHR03',164,172);
 assert.ok(ready.actor.x>lane.left&&ready.actor.x<lane.right&&ready.actor.ground);
 let above,first,afterFirst;
 await page.keyboard.down('Space');
 try{
  above=await at('FHR03',185,193);
  assert.ok(above.actor.x>lane.left&&above.actor.x<lane.right);
  assert.ok(above.actor.y<480-.72*88);
  first=await capture('first',/薄闇の二連波・一波目/,['1']);
  afterFirst=await at('FHR03',200,217);
 }
 finally{await page.keyboard.up('Space')}
 assert.equal(afterFirst.actor.hp,ready.actor.hp);

 await drive.walk(lane.right+48);
 const outside=await at('FHR03',273,281);
 assert.ok(outside.actor.x-10>lane.right);
 assert.deepEqual(outside.boss.lockedWave,lane);
 const second=await capture('second',/薄闇の二連波・二波目/,['2']);
 const returned=await at('FHR03',325,353);
 assert.equal(returned.boss.tick+returned.boss.recoveryTicks,468);
 assert.equal(returned.actor.hp,ready.actor.hp);
 assert.equal(returned.boss.form,'recover');
 console.log('The dive landed on its mark. A jump and a sidestep avoided the two waves.');

 await drive.walk(returned.boss.x+Math.sign(returned.actor.x-returned.boss.x)*72);
 await face(returned.boss.x);
 await page.locator('.skills button[data-action="normal"]').click();
 await page.waitForFunction(hp=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FHR03'&&b.recoveryTicks>0&&b.hp<hp;
 },returned.boss.hp);
 const hit=await read();
 await page.waitForFunction(t=>window.lab.frame.t>=t+.36,hit.t);
 const settled=await read();
 assert.equal(settled.boss.form,'recover');
 const partial=await saveProgress();
 assert.equal(partial.fieldBosses[boss].hp,settled.boss.hp);
 await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 assert.equal(await gear(['artifact_equip:'+feather.id,'weapon_equip:traveler:'+weapon],weapon),originalAttack);
 await enter();
 await drive.walk(518);
 const reload=await read();
 assert.deepEqual([reload.boss.form,reload.boss.hp],['idle',partial.fieldBosses[boss].hp]);
 assert.equal(reload.boss.lockedWave,undefined);
 await drive.walk(826);
 const opening=await at('FHR01',216,249);
 await drive.walk(opening.boss.x-72);
 await face(opening.boss.x);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:4800})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reload.progression.killXp,mora:defeated.mora-reload.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,465);
 await drive.count(quest,1);
 for(const id of [road,hub])await drive.cross(id);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[9000,610]);
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
 assert.deepEqual(restored.endgame.bosses['boss-23090101'],input.endgame.bosses['boss-23090101']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reports=save=>Object.values(save.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reports(restored),reports(input)+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,originalAttack},scenery,
  dive:{...dive,airTicks:36,heroDamage:landingSafe.actor.hp-landed.actor.hp},
  waves:{lane,firstHeroY:above.actor.y,secondHeroX:outside.actor.x,heroDamage:ready.actor.hp-returned.actor.hp,
   recoveryTicks:144,counterDamage:returned.boss.hp-settled.boss.hp,hpAfterReload:reload.boss.hp},
  captures:{dive:diveArt,first,second},reward,reportReward:{xp:9000,mora:610},fieldClears:1,
  reported:reports(restored),priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified Frostnight Herra clear, quest report '+result.reported+' and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state.node,boss:state.boss,x:state.actor.x,y:state.actor.y,hp:state.actor.hp,errors});
 throw error;
}finally{await browser.close()}
