import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.NIGHTMARE_EARNED_SAVE??'work/earned-herra/complete.json';
const out=process.env.NIGHTMARE_OUTPUT??'work/earned-nightmare';
const url=process.env.LAB_URL??'http://127.0.0.1:51370/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,road,arena]=['nod-town','nod-field','nod-nightmare-shore'];
const boss='boss-22150101',quest='whisperer-nightmares-commission';
const sprite='whisperer-nightmares-field-poses-source-v1.png';
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
 const oldAtk=(await read()).actor.atk;
 await page.evaluate(actions=>actions.forEach(action=>window.lab.action(action)),actions);
 await page.waitForFunction(([id,oldAtk])=>window.lab.frame.weaponView?.traveler===id && window.lab.frame.actors[0].atk!==oldAtk,[weapon,oldAtk]);
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
 const labels=await page.evaluate(()=>window.lab.frame.draws.filter(d=>d.kind==='text'&&[500,520].includes(d.y)).map(d=>d.text));
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
 await drive.walk(840);
 const initial=await read();
 assert.equal(initial.progression.level,200);
 assert.equal(initial.boss.maxhp,1340);
 const scenery=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'nightmareField',file:'whisperer-nightmares-field-background-v1.png',state:'ready'});

 const rift=await at('FWN02',60,82);
 const fixed=rift.boss.fixedRift;
 assert.ok(fixed.left<fixed.center&&fixed.center<fixed.right);
 await drive.walk(fixed.right+47);
 const hidden=await at('FWN02',96,115);
 assert.equal(hidden.boss.underground,true);
 assert.ok(hidden.actor.x-10>fixed.right);
 assert.deepEqual(hidden.boss.fixedRift,fixed);
 const emerge=await at('FWN02',122,136);
 assert.equal(emerge.boss.underground,false);
 assert.equal(emerge.boss.x,fixed.center);
 const riftArt=await capture('emerge',/裂け目から出現/,['裂け目']);
 const afterRift=await at('FWN02',155,170);
 assert.equal(afterRift.actor.hp,hidden.actor.hp);

 const spawn=await at('FWN03',76,99);
 assert.equal(spawn.boss.darkShield,undefined);
 assert.deepEqual(spawn.boss.summons.map(unit=>unit.hp),[60,60]);
 const sequence=spawn.boss.fisherSequence;
 const side=Math.sign(sequence.fishers[0].x-spawn.boss.x);
 assert.ok(sequence.fishers.every(unit=>Math.sign(unit.x-spawn.boss.x)===side));
 await drive.walk(spawn.boss.x-side*112);
 const safe=await at('FWN03',142,155);
 assert.ok(safe.actor.x+10<sequence.lane.left||safe.actor.x-10>sequence.lane.right);
 await at('FWN03',158,163);
 const fishers=await capture('fishers',/闇の漁師 0／2/,['放出','1','2']);
 const second=await at('FWN03',231,247);
 assert.deepEqual(second.boss.fisherSequence.fishers,sequence.fishers);
 assert.equal(second.actor.hp,safe.actor.hp);
 const cutoff=await at('FWN03',302,318);
 assert.equal(cutoff.boss.summons,undefined);
 assert.equal(cutoff.boss.fisherSequence.defeated,0);
 assert.equal(cutoff.boss.fisherSequence.interrupted,false);
 await at('FWN03',326,335);
 const release=await capture('release',/深淵の放出/,['放出']);
 const recovery=await at('FWN03',363,387);
 assert.equal(recovery.boss.tick+recovery.boss.recoveryTicks,504);
 assert.equal(recovery.actor.hp,safe.actor.hp);
 console.log('The rift, both numbered strikes, and the release were avoided.');
 await drive.walk(recovery.boss.x-side*72);
 await face(recovery.boss.x);
 await page.locator('.skills button[data-action="normal"]').click();
 await page.waitForFunction(hp=>{
  const b=window.lab.frame.fieldBoss;
  return b?.form==='recover'&&b.hp<hp;
 },recovery.boss.hp);
 const hit=await read();
 await page.waitForFunction(t=>window.lab.frame.t>=t+.36,hit.t);
 const settled=await read();
 assert.equal(settled.boss.form,'recover');
 const partial=await saveProgress();
 assert.equal(partial.fieldBosses[boss].hp,settled.boss.hp);
 await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 const interruptionAttack=await gear(['weapon_equip:traveler:'+weapon],weapon);
 assert.ok(trialAttack<interruptionAttack&&interruptionAttack<originalAttack);
 await enter();
 await drive.walk(518);
 const reload=await read();
 assert.deepEqual([reload.boss.form,reload.boss.hp],['idle',partial.fieldBosses[boss].hp]);
 assert.equal(reload.boss.summons,undefined);
 await drive.walk(834);

 const next=await at('FWN03',77,102);
 const targets=next.boss.summons;
 assert.equal(targets.length,2);
 const targetSide=Math.sign(targets[0].x-next.boss.x);
 for(const [i,unit] of [...targets].reverse().entries()){
  const margin=i===0?45:88;
  await drive.walk(unit.x+targetSide*margin);
  await face(unit.x);
  const aim=await read();
  assert.ok(Math.abs(aim.actor.x-aim.boss.x)>130);
  assert.ok(Math.abs(aim.actor.x-unit.x)<125);
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(id=>{
    const b=window.lab.frame.fieldBoss;
    return b?.fisherSequence?.interrupted||!b?.summons?.some(unit=>unit.id===id);
   },unit.id,{timeout:2600});
  }finally{await page.keyboard.up('KeyJ')}
 }
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.fisherSequence?.interrupted);
 const down=await read();
 assert.equal(down.boss.form,'down');
 assert.equal(down.boss.fisherSequence.defeated,2);
 assert.ok(down.boss.tick<=300&&down.boss.recoveryTicks>0);
 assert.equal(down.boss.hp,next.boss.hp);
 assert.deepEqual([down.mora,down.progression.killXp],[next.mora,next.progression.killXp]);
 await canvas.screenshot({path:path.join(out,'interrupted-png.png')});

 await drive.walk(down.boss.x+targetSide*71);
 await face(down.boss.x);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp,next.boss.hp,{timeout:2400});
  assert.equal((await read()).boss.form,'down');
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:5000});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reload.progression.killXp,mora:defeated.mora-reload.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,475);
 await drive.count(quest,1);
 for(const id of [road,hub])await drive.cross(id);
 assert.equal(await gear(['artifact_equip:'+feather.id],weapon),originalAttack);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[9200,630]);
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
 assert.deepEqual(restored.endgame.bosses['boss-20081001'],input.endgame.bosses['boss-20081001']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reports=save=>Object.values(save.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reports(restored),reports(input)+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,interruptionAttack,originalAttack},scenery,
  rift:{...fixed,hiddenTicks:36,visibleWarningTicks:24,heroDamage:hidden.actor.hp-afterRift.actor.hp},
  natural:{lane:sequence.lane,fishers:sequence.fishers,heroDamage:safe.actor.hp-recovery.actor.hp,
   hpAfterReload:reload.boss.hp},
  interruption:{fromTick:down.boss.tick,defeatedFishers:2,unchangedBodyHp:down.boss.hp,noIndividualRewards:true},
  captures:{emerge:riftArt,fishers,release},reward,reportReward:{xp:9200,mora:630},fieldClears:1,
  reported:reports(restored),priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified Nightmare clear, quest report '+result.reported+' and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state.node,boss:state.boss,x:state.actor.x,y:state.actor.y,hp:state.actor.hp,errors});
 throw error;
}finally{await browser.close()}
