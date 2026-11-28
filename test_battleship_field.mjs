import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.BATTLESHIP_EARNED_SAVE??'work/earned-duckle/complete.json';
const out=process.env.BATTLESHIP_OUTPUT??'work/earned-battleship';
const url=process.env.LAB_URL??'http://127.0.0.1:51368/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,road,arena]=['nod-town','nod-field','nod-battleship-depot'];
const boss='boss-23090101',quest='battleship-commission';
const sprite='battleship-field-poses-source-v1.png';
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

async function skill(id){
 const slot=page.getByLabel('枠1の1番目',{exact:true});
 if(!await slot.isVisible())await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await slot.selectOption(id);
 await page.locator('#applySlots').click();
 await page.waitForFunction(id=>window.lab.frame.loadout[0][0]===id,id);
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
 await skill('SK21');
 await drive.accept(quest);
 await enter();
 await drive.walk(824);
 const start=await read();
 assert.equal(start.progression.level,200);
 assert.equal(start.boss.maxhp,1170);
 const scenery=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'battleshipField',file:'battleship-field-background-v1.png',state:'ready'});

 await at('FBT02',75,100);
 const cannon=await capture('cannon',/冷却砲の二連射/,['1','2']);
 const natural=await at('FBT03',75,98);
 const lane=natural.boss.coolingLane;
 const board=natural.boss.coolingPlate;
 assert.equal(board.layers,5);
 assert.equal(natural.boss.thermal,undefined);
 assert.equal(natural.boss.hp,1170);
 const plate=await capture('plate',/冷却板 5／5/,['放出']);
 const side=Math.sign((board.left+board.right)/2-natural.boss.x);
 await drive.walk(natural.boss.x-side*139);
 const safe=await read();
 assert.ok(safe.actor.x+10<lane.left||safe.actor.x-10>lane.right);
 const beforeRelease=await at('FBT03',301,320);
 assert.equal(beforeRelease.boss.coolingPlate,undefined);
 assert.equal(beforeRelease.boss.coolingInterrupted,false);
 assert.deepEqual(beforeRelease.boss.coolingLane,lane);
 await at('FBT03',326,335);
 const release=await capture('release',/冷却放出・床の印から退避/,['放出']);
 const recovered=await at('FBT03',361,386);
 assert.equal(recovered.boss.tick+recovered.boss.recoveryTicks,504);
 assert.equal(recovered.actor.hp,safe.actor.hp);
 console.log('Natural release stayed on the announced lane; walking out avoided all damage.');

 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.move!=='FBT03');
 const next=await at('FBT03',66,93);
 const target=next.boss.coolingPlate;
 const center=(target.left+target.right)/2;
 const direction=Math.sign(center-next.boss.x);
 await drive.walk(center+direction*47);
 await face(center);
 const beforeFire=await read();
 assert.equal(beforeFire.boss.coolingPlate.layers,5);
 await page.keyboard.press('Digit1');
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.coolingPlate?.layers===3);
 const afterFire=await read();
 // All three hits of the skill fit in this interval. The board should chip only once.
 await page.waitForFunction(time=>window.lab.frame.t>=time+.40,afterFire.t);
 const afterCombo=await read();
 assert.equal(afterCombo.boss.coolingPlate.layers,3);
 assert.ok(afterCombo.boss.hp<beforeFire.boss.hp);
 const normalSteps=[];
 for(const remaining of [2,1,0]){
  await page.waitForFunction(()=>{
   const {actors:[actor],macro}=window.lab.frame;
   return !actor.lock&&!actor.cd?.normal&&!macro;
  });
  await page.locator('.skills button[data-action="normal"]').click();
  await page.waitForFunction(n=>{
   const b=window.lab.frame.fieldBoss;
   return n===0?b?.coolingInterrupted:b?.coolingPlate?.layers===n;
  },remaining,{timeout:1800});
  normalSteps.push((await read()).boss.tick);
 }
 const down=await read();
 assert.equal(down.boss.form,'down');
 assert.ok(down.boss.tick<=300&&down.boss.recoveryTicks>0&&down.boss.hp<1170);
 assert.deepEqual([down.mora,down.progression.killXp],[next.mora,next.progression.killXp]);
 await canvas.screenshot({path:path.join(out,'interrupted-png.png')});
 console.log('Fire chipped two layers once; three separate normal casts removed the remaining layers.');

 await page.waitForFunction(t=>window.lab.frame.t>=t+.40,down.t);
 const settled=await read();
 const partial=await saveProgress();
 assert.equal(partial.fieldBosses[boss].hp,settled.boss.hp);
 await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 assert.equal(await gear(['artifact_equip:'+feather.id,'weapon_equip:traveler:'+weapon],weapon),originalAttack);
 await skill(input.loadout[0][0]);
 await enter();
 await drive.walk(518);
 const reload=await read();
 assert.deepEqual([reload.boss.form,reload.boss.hp],['idle',partial.fieldBosses[boss].hp]);
 assert.equal(reload.boss.coolingPlate,undefined);
 await drive.walk(818);
 const ready=await at('FBT01',179,213);
 await drive.walk(ready.boss.x-70);
 await face(ready.boss.x);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:4800})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reload.progression.killXp,mora:defeated.mora-reload.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,455);
 await drive.count(quest,1);
 for(const id of [road,hub])await drive.cross(id);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[8800,590]);
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
 assert.deepEqual(restored.endgame.bosses['boss-24100101'],input.endgame.bosses['boss-24100101']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reports=save=>Object.values(save.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reports(restored),reports(input)+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,originalAttack},scenery,
  natural:{lane,initialLayers:5,heroDamage:safe.actor.hp-recovered.actor.hp,recoveryTicks:144},
  interruption:{afterFireLayers:3,afterThreeFireHits:afterCombo.boss.coolingPlate.layers,
   normalChipTicks:normalSteps,observedDownTick:down.boss.tick,hpAfterReload:reload.boss.hp},
  captures:{cannon,plate,release},reward,reportReward:{xp:8800,mora:590},fieldClears:1,
  reported:reports(restored),priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified Battleship clear, quest report '+result.reported+' and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state.node,boss:state.boss,x:state.actor.x,hp:state.actor.hp,errors});
 throw error;
}finally{await browser.close()}
