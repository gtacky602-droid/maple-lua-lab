import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.DUCKLE_EARNED_SAVE??'work/earned-spiritspeaker/final/complete.json';
const out=process.env.DUCKLE_OUTPUT??'work/earned-duckle';
const url=process.env.LAB_URL??'http://127.0.0.1:51367/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,road,arena]=['nod-town','nod-field','nod-duckle-workyard'];
const boss='boss-24100101',quest='knuckle-duckle-commission';
const sprite='knuckle-duckle-field-poses-source-v1.png';
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

async function capture(name,label){
 await pause(true);
 const {t,boss:phase}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),label);
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
 return {label:phase.label,tick:phase.tick,form:phase.form,summons:phase.summons,profiles};
}

try{
 await importSave(page,source);
 if(await drive.node()!==hub)await drive.warp(hub);
 const originalAttack=(await read()).actor.atk;
 const trialAttack=await gear(['artifact_remove:'+feather.id,'weapon_equip:traveler:SW04'],'SW04');
 assert.ok(trialAttack>0&&trialAttack<originalAttack/4);
 await drive.accept(quest);
 await enter();
 await drive.walk(742);
 const firstFight=await read();
 assert.equal(firstFight.progression.level,200);
 assert.equal(firstFight.boss.maxhp,1135);
 const scenery=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'duckleField',file:'knuckle-duckle-field-background-v1.png',state:'ready'});
 await at('FDK02',108,116);
 const jump=await capture('jump',/跳び込みハンマー/);
 assert.equal(jump.form,'airborne');
 const locked=await at('FDK03',64,76);
 const lane=locked.boss.repairSequence.lane;
 const spawned=await at('FDK03',78,93);
 const starts=spawned.boss.summons.map(unit=>unit.x);
 const side=Math.sign(starts[0]-spawned.boss.x);
 assert.equal(side,Math.sign(starts[1]-spawned.boss.x));
 assert.deepEqual(spawned.boss.summons.map(unit=>unit.hp),[16,16]);
 const hp=spawned.boss.hp;
 await at('FDK03',125,147);
 const repairs=await capture('repairs',/補修メカ 0／2/);
 assert.ok(repairs.summons.every((unit,i)=>Math.abs(unit.x-spawned.boss.x)<Math.abs(starts[i]-spawned.boss.x)));
 await drive.walk(spawned.boss.x-side*110);
 const safe=await read();
 assert.ok(safe.actor.x+10<lane.left||safe.actor.x-10>lane.right);
 const arrival=await at('FDK03',302,332);
 assert.equal(arrival.boss.summons,undefined);
 assert.equal(arrival.boss.hp,hp);
 assert.deepEqual(arrival.boss.repairSequence.lane,lane);
 await at('FDK03',342,351);
 const release=await capture('release',/放電・床の印から退避/);
 const recovered=await at('FDK03',384,409);
 assert.equal(recovered.boss.recoveryTicks+recovered.boss.tick,528);
 assert.equal(recovered.actor.hp,safe.actor.hp);
 console.log('Both mechas arrived without healing the boss; the fixed discharge was dodged.');

 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.move!=='FDK03');
 const next=await at('FDK03',77,100);
 const counters=await read();
 const units=next.boss.summons;
 assert.equal(units.length,2);
 const attackSide=Math.sign(units[0].x-next.boss.x);
 for(const id of units.map(unit=>unit.id).reverse()){
  const current=await read();
  const unit=current.boss.summons?.find(unit=>unit.id===id);
  if(!unit)continue;
  await drive.walk(unit.x+attackSide*56);
  const position=await read();
  const target=position.boss.summons?.find(unit=>unit.id===id);
  if(!target)continue;
  await face(target.x);
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(id=>{
    const b=window.lab.frame.fieldBoss;
    return b?.repairSequence?.interrupted||!b?.summons?.some(unit=>unit.id===id);
   },id,{timeout:2300});
  }finally{await page.keyboard.up('KeyJ')}
 }
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.repairSequence?.interrupted);
 const down=await read();
 assert.equal(down.boss.repairSequence.defeated,2);
 assert.equal(down.boss.form,'down');
 assert.ok(down.boss.tick<=305&&down.boss.recoveryTicks>0&&down.boss.hp>0);
 assert.deepEqual([down.mora,down.progression.killXp],[counters.mora,counters.progression.killXp]);
 await canvas.screenshot({path:path.join(out,'interrupted-png.png')});
 console.log('Normal attacks destroyed both repair units and interrupted the next discharge.');

 await drive.walk(down.boss.x+attackSide*74);
 await face(down.boss.x);
 await page.locator('.skills button[data-action="normal"]').click();
 await page.waitForFunction(hp=>{
  const b=window.lab.frame.fieldBoss;
  return b?.form==='down'&&b.hp<hp;
 },down.boss.hp);
 const hit=await read();
 await page.waitForFunction(t=>window.lab.frame.t>=t+.35,hit.t);
 const counter=await read();
 assert.equal(counter.boss.form,'down');
 const partial=await saveProgress();
 assert.equal(partial.fieldBosses[boss].hp,counter.boss.hp);
 assert.ok(counter.boss.hp>0&&counter.boss.hp<down.boss.hp);
 await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 assert.equal(await gear(['artifact_equip:'+feather.id,'weapon_equip:traveler:'+weapon],weapon),originalAttack);
 await enter();
 await drive.walk(518);
 const reload=await read();
 assert.deepEqual([reload.boss.form,reload.boss.hp],['idle',partial.fieldBosses[boss].hp]);
 await drive.walk(808);
 const ready=await at('FDK01',217,247);
 await drive.walk(ready.boss.x-70);
 await face(ready.boss.x);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:4800})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reload.progression.killXp,mora:defeated.mora-reload.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,445);
 await drive.count(quest,1);
 for(const id of [road,hub])await drive.cross(id);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[8500,570]);
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
 assert.deepEqual(restored.endgame.bosses['boss-25520101'],input.endgame.bosses['boss-25520101']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reports=save=>Object.values(save.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reports(restored),reports(input)+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,originalAttack},scenery,
  arrival:{starts,lane,hpBefore:hp,hpAfter:arrival.boss.hp,heroDamage:safe.actor.hp-recovered.actor.hp},
  interruption:{defeated:down.boss.repairSequence.defeated,tick:down.boss.tick,
   counterDamage:down.boss.hp-counter.boss.hp,hpAfterReload:reload.boss.hp},
  captures:{jump,repairs,release},reward,reportReward:{xp:8500,mora:570},fieldClears:1,
  reported:reports(restored),priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified Duckle clear, quest report '+result.reported+' and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state.node,boss:state.boss,x:state.actor.x,hp:state.actor.hp,errors});
 throw error;
}finally{await browser.close()}
