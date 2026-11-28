import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.SERPENT_EARNED_SAVE||'work/earned-suanni/final/complete.json';
const out=process.env.SERPENT_OUTPUT||'work/earned-ruin-serpent';
const url=process.env.LAB_URL||'http://127.0.0.1:51358/';
const rawSave=await fs.readFile(source),input=JSON.parse(rawSave);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const hub='chasm-camp',route=['chasm-depth','chasm-wp-25264','ruin-serpent-field-pit'];
const boss='boss-24010401',quest='ruin-serpent-commission';
const sprite='ruin-serpent-field-poses-source-v1.png';
assert.ok(!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(22000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const read=()=>page.evaluate(()=>{
 const {t,fieldBoss,actors:[actor],mora,progression,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,mora,progression,returns,holdAllyFire,node:story.node};
});

async function at(move,min,max=Infinity){
 const frame=await page.waitForFunction(([move,min,source])=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.move===move&&b.tick>=min)return {boss:b,actor:f.actors[0],
   visible:f.draws.some(draw=>draw.source===source)};
 },[move,min,sprite]);
 const result=await frame.jsonValue();
 assert.ok(result.boss.tick<max,move+' passed expected timing: '+result.boss.tick);
 return result;
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(name,expectedLabel,markerXs){
 await pause(true);
 const {t,fieldBoss:phase}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),expectedLabel);
 const marks=await page.evaluate(()=>{
  const f=window.lab.frame;
  return f.draws.filter(d=>d.kind==='text'&&d.color==='#ffd286').map(d=>[d.text,d.x+f.camera,d.y]);
 });
 assert.deepEqual(marks.map(([label])=>label),name==='bombs'?['1','2','3']:name==='recovery'?[]:['出現']);
 assert.ok(marks.every(([,x,y],i)=>Math.abs(x-markerXs[i])<.001&&y===501));
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 if(name!=='hidden'){
  for(const profile of ['h48c32','h32c16']){
   const raw=await captureRectTransfer(page,profile,false,async()=>{
    await quality.selectOption(profile);
    await pack.uncheck();
   });
   const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
   assert.equal(packed.raster,raw.raster,name+' '+profile+' changed packed pixels');
   assert.equal(raw.snapshot.t,t);
   assert.equal(packed.snapshot.t,t);
   assert.ok(packed.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount&&packed.gzipBytes<raw.gzipBytes);
   profiles[profile]={legacyDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
    legacyGzip:raw.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
   await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
  }
  await quality.selectOption('sprite');
 }
 await pause(false);
 return {label:phase.label,tick:phase.tick,marks,recoveryTicks:phase.recoveryTicks,profiles};
}

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

async function stopBetweenPoints(target){
 return page.evaluate(target=>new Promise((resolve,reject)=>{
  const until=performance.now()+3500;
  let held;
  const input=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  function observe(){
   const {actors:[a],fieldBoss:b}=window.lab.frame;
   const dx=target-a.x, key=Math.abs(dx)<=6?null:dx<0?'KeyA':'KeyD';
   if(performance.now()>until){
    if(held)input('keyup',held);
    reject(new Error('Could not stop between two bomb markers'));
    return;
   }
   if(held!==key){
    if(held)input('keyup',held);
    if(key)input('keydown',key);
    held=key;
   }
   if(!key&&!a.walk)resolve({x:a.x,tick:b.tick});
   else requestAnimationFrame(observe);
  }
  requestAnimationFrame(observe);
 }),target);
}

try{
 await importSave(page,source);
 if(await drive.node()!=='liyue-harbor')await drive.warp('liyue-harbor');
 for(const node of ['liyue-field',hub])await drive.cross(node);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of route)await drive.cross(node);
 await drive.walk(675);
 const before=await read();
 assert.equal(before.fieldBoss.maxhp,900);
 assert.equal(before.progression.level,200);
 const roll=await at('FRS01',50,81);
 const flank=Math.sign(roll.actor.x-roll.boss.x);
 assert.ok(flank);
 await drive.walk(roll.boss.x+flank*201);
 assert.equal((await at('FRS01',134,156)).actor.hp,roll.actor.hp);
 await drive.walk(roll.boss.x+flank*94);
 const locked=await at('FRS02',54,75);
 const destination=locked.boss.emergeX;
 assert.ok(Number.isFinite(destination)&&Math.abs(locked.boss.x-destination)<=1.6*88);
 const hidden=await at('FRS02',79,96);
 assert.ok(hidden.boss.underground&&!hidden.visible);
 assert.ok(Math.abs(hidden.boss.x-hidden.actor.x)<125);
 const hiding=await capture('hidden',/潜行中・地面の印から離れる/,[destination]);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.actors[0].cd.normal>0,null,{timeout:500});
 }finally{await page.keyboard.up('KeyJ')}
 const attempted=await at('FRS02',95,113);
 assert.equal(attempted.boss.hp,before.fieldBoss.hp);
 assert.ok(attempted.boss.underground&&!attempted.visible);
 await drive.walk(destination+flank*99);
 const emerging=await at('FRS02',118,133);
 assert.equal(emerging.boss.x,destination);
 assert.ok(emerging.visible&&!emerging.boss.underground);
 const emerge=await capture('emerge',/掘り上げ予告・印から離れる/,[destination]);
 const surfaced=await at('FRS02',150,167);
 assert.equal(surfaced.actor.hp,locked.actor.hp);
 const openHead=await at('FRS02',168,188);
 assert.equal(openHead.boss.tick+openHead.boss.recoveryTicks,312);
 const recovery=await capture('recovery',/地表に停止・頭に攻撃.*反撃できる時間/,[]);
 console.log('Verified the hidden swing, fixed emergence and zero damage from the drill.');

 const warning=await at('FRS03',48,72);
 const points=warning.boss.bombPoints;
 assert.equal(points.length,3);
 const sorted=[...points].sort((a,b)=>a-b);
 const edge=warning.boss.x>sorted[1]?2:0;
 const gap=await stopBetweenPoints((sorted[edge]+sorted[1])/2);
 assert.ok(gap.tick<106&&Math.min(...points.map(x=>Math.abs(x-gap.x)))>29);
 await at('FRS03',83,101);
 const bombs=await capture('bombs',/三点の掘削弾 1\/3/ ,points);
 const impacts=[];
 for(const [i,tick] of [108,150,192].entries()){
  const hit=await at('FRS03',tick,tick+6);
  assert.match(hit.boss.label,new RegExp((i+1)+'/3・床の番号'));
  assert.deepEqual(hit.boss.bombPoints,points);
  assert.equal(hit.actor.hp,warning.actor.hp);
  impacts.push({tick:hit.boss.tick,hp:hit.actor.hp});
 }
 assert.equal((await at('FRS03',210,231)).actor.hp,warning.actor.hp);
 const toe=await read(), direction=Math.sign(toe.fieldBoss.x-toe.actor.x);
 if(direction&&direction!==toe.actor.dir){
  const key=direction>0?'KeyD':'KeyA';
  await page.keyboard.down(key);
  try{await page.waitForFunction(dir=>window.lab.frame.actors[0].dir===dir,direction)}
  finally{await page.keyboard.up(key)}
 }
 const ready=await read();
 assert.ok(ready.fieldBoss.recoveryTicks>0);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:2000});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-before.progression.killXp,mora:defeated.mora-before.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,150);
 await drive.count(quest,1);
 for(const node of [...route.slice(0,-1).reverse(),hub])await drive.cross(node);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[4000,300]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const checkpoint=path.join(out,'complete.json');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 fresh.on('pageerror',error=>errors.push(error.message));
 await importSave(fresh,checkpoint);
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-26190101'],input.endgame.bosses['boss-26190101']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reported=Object.values(restored.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,Object.values(input.story.quests).filter(q=>q.status==='complete').length+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(rawSave).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,burrow:{locked:destination,actual:emerging.boss.x,hiddenAttackDamage:before.fieldBoss.hp-attempted.boss.hp,
   playerDamage:locked.actor.hp-surfaced.actor.hp},
  bombs:{points,impacts,gap,playerDamage:warning.actor.hp-(impacts.at(-1).hp)},
  clearAttack:{remainingAtStart:ready.fieldBoss.recoveryTicks,elapsedSeconds:defeated.t-ready.t},
  captures:{hidden:hiding,emerge,bombs,recovery},reward,fieldClears:restored.endgame.bosses[boss].clears,
  reported,priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Serpent clear, quest report '+reported+', and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state?.node,boss:state?.fieldBoss,actor:state?.actor,errors});
 throw error;
}finally{await browser.close()}
