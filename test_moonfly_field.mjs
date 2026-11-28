import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.MOONFLY_EARNED_SAVE??'work/earned-nightmare/complete.json';
const out=process.env.MOONFLY_OUTPUT??'work/earned-moonfly';
const url=process.env.LAB_URL??'http://127.0.0.1:51372/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,road,arena]=['nod-town','nod-field','nod-moonfly-hollow'];
const boss='boss-26301101',quest='moonfly-commission',sprite='moonfly-field-poses-source-v1.png';
const equipment=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
const feather=equipment(input).find(item=>item.owner===1&&item.slot===2), weapon=input.weapons.equipped.traveler;
const reports=save=>Object.values(save.story.quests).filter(q=>q.status==='complete').length;
assert.ok(feather&&weapon&&!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(40000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const slot1=page.getByLabel('枠1の1番目',{exact:true});
const read=()=>page.evaluate(()=>{
 const {fieldBoss,actors:[actor],radiantCocoons,t,story,progression,mora,returns}=window.lab.frame;
 return {boss:fieldBoss,actor,mark:radiantCocoons?.find(m=>m.actor===1),t,node:story.node,progression,mora,returns};
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

async function skill(id){
 if(!await slot1.isVisible())await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
 await slot1.selectOption(id);
 await page.locator('#applySlots').click();
 await page.waitForFunction(skill=>window.lab.frame.loadout[0][0]===skill,id);
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

async function at(first,last=480){
 await page.waitForFunction(first=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FMF03'&&b.tick>=first;
 },first);
 const state=await read();
 assert.ok(state.boss.tick<last,'FMF03 reached tick '+state.boss.tick);
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

async function capture(name,number,element){
 await pause(true);
 const {t,boss:phase}=await read();
 assert.deepEqual([phase.wingWave.index,phase.wingWave.element],[number,element]);
 const label=await page.evaluate((number)=>window.lab.frame.draws.some(d=>d.kind==='text'&&d.text===number+' / 3'),number);
 assert.ok(label);
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
 return {label:phase.label,tick:phase.tick,form:phase.form,wave:phase.wingWave,profiles};
}

async function strike(previousHp,finish=false){
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp,previousHp,{timeout:2400});
  const hit=await read();
  assert.equal(hit.boss.form,'recover');
  if(finish)await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:6500});
  return hit;
 }finally{await page.keyboard.up('KeyJ')}
}

try{
 await importSave(page,source);
 await drive.waitNode(hub);
 const originalAttack=(await read()).actor.atk;
 const trialAttack=await gear(['artifact_remove:'+feather.id,'weapon_equip:traveler:SW04'],'SW04');
 assert.ok(trialAttack>0&&trialAttack<originalAttack/4);
 await skill('SK18');
 await drive.accept(quest);
 await enter();
 await drive.walk(845);
 const initial=await read();
 assert.deepEqual([initial.progression.level,initial.boss.maxhp,initial.boss.draftMoves],[200,1050,undefined]);
 const scenery=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'moonflyField',file:'moonfly-field-background-v1.png',state:'ready'});

 const locked=await at(62,115);
 const wave=locked.boss.wingWave;
 const side=Math.sign((wave.left+wave.right)/2-locked.boss.x);
 const outside=locked.boss.x-side*68;
 await drive.walk(outside);
 assert.ok(side>0?(await read()).actor.x+10<wave.left:(await read()).actor.x-10>wave.right);
 await at(132,168);
 const grass=await capture('grass',1,'dendro');
 await at(216,240);
 const flame=await capture('flame',2,'pyro');
 await at(300,316);
 const release=await capture('release',3,'pyro');
 const recovery=await at(336,372);
 assert.equal(recovery.actor.hp,locked.actor.hp);
 assert.equal(recovery.mark,undefined);
 await face(recovery.boss.x);
 const counter=await strike(recovery.boss.hp);
 await drive.cross(road);
 await drive.cross(hub);
 const partial=await saveProgress();
 assert.ok(partial.fieldBosses[boss].hp>0&&partial.fieldBosses[boss].hp<=counter.boss.hp);
 await fs.writeFile(path.join(out,'mid-fight.json'),JSON.stringify(partial,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開'));
 await drive.waitNode(hub);
 const finishAttack=await gear(['weapon_equip:traveler:'+weapon],weapon);
 await enter();
 await drive.walk(505);
 const reload=await read();
 assert.equal(reload.boss.hp,partial.fieldBosses[boss].hp);
 assert.equal(reload.boss.form,'idle');
 await drive.walk(844);

 const warning=await at(62,116);
 await drive.walk((warning.boss.wingWave.left+warning.boss.wingWave.right)/2);
 await page.waitForFunction(()=>window.lab.frame.radiantCocoons?.some(mark=>mark.actor===1&&mark.bound));
 const bound=await read();
 assert.ok(bound.mark.remaining>2.6&&bound.boss.wingWave.index===1);
 assert.match(bound.boss.label,/回復で解除/);
 await canvas.screenshot({path:path.join(out,'bound-png.png')});
 await page.keyboard.press('Digit1');
 await page.waitForFunction(hp=>{
  const f=window.lab.frame;
  return f.actors[0].hp>hp&&!f.radiantCocoons?.some(mark=>mark.actor===1);
 },bound.actor.hp);
 const healed=await read();
 assert.ok(healed.boss.tick<312&&healed.actor.hp<healed.actor.maxhp);
 await canvas.screenshot({path:path.join(out,'healed-png.png')});

 const settle=await at(336,392);
 await drive.walk(settle.boss.x-75);
 await face(settle.boss.x);
 await strike(settle.boss.hp,true);
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-reload.progression.killXp,mora:defeated.mora-reload.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,485);
 await drive.count(quest,1);
 for(const id of [road,hub])await drive.cross(id);
 await skill(input.loadout[0][0]);
 assert.equal(await gear(['artifact_equip:'+feather.id],weapon),originalAttack);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[9400,650]);
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
 assert.deepEqual(restored.endgame.bosses['boss-22150101'],input.endgame.bosses['boss-22150101']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.equal(reports(restored),reports(input)+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,gear:{trialAttack,finishAttack,originalAttack},scenery,
  evasion:{heroDamage:locked.actor.hp-recovery.actor.hp,waves:[grass.wave,flame.wave,release.wave],
   counterDamage:recovery.boss.hp-partial.fieldBosses[boss].hp,hpAfterReload:reload.boss.hp},
  cocoon:{boundTick:bound.boss.tick,clearedTick:healed.boss.tick,before:bound.actor.hp,
   after:healed.actor.hp,maxHp:healed.actor.maxhp,clearedByPartialHeal:true},
  captures:{grass,flame,release},reward,reportReward:{xp:9400,mora:650},fieldClears:1,
  reported:reports(restored),priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified Moonfly clear, quest report '+result.reported+' and six pixel-identical transfers.');
}catch(error){
 const state=await read().catch(()=>null);
 const status=await page.locator('#status').textContent().catch(()=>null);
 console.error({node:state?.node,boss:state?.boss,x:state?.actor.x,y:state?.actor.y,hp:state?.actor.hp,status,errors});
 throw error;
}finally{await browser.close()}
