import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.CRYO_CUBE_EARNED_SAVE||'work/earned-pyro/complete.json';
const out=process.env.CRYO_CUBE_OUTPUT||'work/earned-cryo-cube';
const url=process.env.LAB_URL||'http://127.0.0.1:51354/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const route=['dragonspine-camp','dragonspine-depth','cryo-hypostasis-field-basin'];
const boss='boss-20040501',quest='cryo-hypostasis-commission';
assert.ok(!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const label=page.locator('#fieldBossLabel');
const read=()=>page.evaluate(()=>{
 const {t,fieldBoss,actors:[actor],mora,progression,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,mora,progression,returns,holdAllyFire,node:story.node};
});

async function at(move,min){
 const state=await page.waitForFunction(([move,min])=>{
  const {fieldBoss:b,actors:[a]}=window.lab.frame;
  if(b?.move===move&&b.tick>=min)return {boss:b,actor:a,label:document.querySelector('#fieldBossLabel').textContent};
 },[move,min]);
 return state.jsonValue();
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(name,expectedLabel){
 await pause(true);
 const {t,fieldBoss:pose}=await read();
 assert.match(await label.textContent(),expectedLabel);
 if(pose.fallPoints){
  const markers=await page.evaluate(()=>{
   const f=window.lab.frame;
   return f.draws.filter(d=>d.kind==='text'&&d.color==='#ffdfa6').map(d=>[d.text,d.x+f.camera]);
  });
  assert.deepEqual(markers.map(row=>row[0]),['1','2','3']);
  assert.ok(markers.every((row,i)=>Math.abs(row[1]-pose.fallPoints[i])<.001));
 }
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.ok(packed.raster===raw.raster,name+' '+profile+' packed pixels differ');
  assert.equal(raw.snapshot.t,t);
  assert.equal(packed.snapshot.t,t);
  assert.ok(packed.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount&&packed.gzipBytes<raw.gzipBytes);
  profiles[profile]={legacyDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
   legacyGzip:raw.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await pause(false);
 return {label:pose.label,tick:pose.tick,recoveryTicks:pose.recoveryTicks,profiles};
}

async function walkIntoGap(target){
 return page.evaluate(target=>new Promise((resolve,reject)=>{
  const deadline=performance.now()+7500;
  let held='';
  function key(type,code){
   window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  }
  function observe(){
   const {actors:[a],fieldBoss:b}=window.lab.frame;
   const dx=target-a.x;
   if(performance.now()>deadline){
    if(held)key('keyup',held);
    reject(new Error('Could not reach the space between two fall warnings.'));
    return;
   }
   const direction=Math.abs(dx)<=5?'':dx>0?'KeyD':'KeyA';
   if(held!==direction){
    if(held)key('keyup',held);
    if(direction)key('keydown',direction);
    held=direction;
   }
   if(!direction&&!a.walk){
    resolve({x:a.x,tick:b.tick,target});
    return;
   }
   requestAnimationFrame(observe);
  }
  requestAnimationFrame(observe);
 }),target);
}

try{
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(source);
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 await drive.waitNode('liyue-harbor');
 await drive.warp(route[0]);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of route.slice(1))await drive.cross(node);
 await drive.walk(738);
 const before=await read();
 const locked=(await at('FHC01',54)).boss.destinationX;
 assert.ok(Number.isFinite(locked));
 const wheel=await capture('wheel',/氷輪の直走・走路から離れるか跳び越す/);
 await drive.walk(locked-108);
 const outOfLane=await at('FHC01',105);
 assert.equal(outOfLane.boss.destinationX,locked);
 assert.ok(outOfLane.actor.x<locked-60);
 const wheelEnd=await at('FHC01',144);
 assert.equal(wheelEnd.boss.x,locked);
 assert.equal(wheelEnd.actor.hp,outOfLane.actor.hp);
 const clap=await at('FHC02',90);
 assert.match(clap.label,/両掌の範囲から離れる/);
 assert.ok(Math.abs(clap.boss.x-clap.actor.x)>63);
 assert.equal((await at('FHC02',103)).actor.hp,clap.actor.hp);

 const fallStart=await at('FHC03',48);
 const fallPoints=fallStart.boss.fallPoints;
 assert.equal(fallPoints.length,3);
 const sorted=[...fallPoints].sort((a,b)=>a-b);
 const edge=fallStart.boss.x>sorted[1]?2:0;
 const gap=await walkIntoGap((sorted[1]+sorted[edge])/2);
 assert.ok(gap.tick<101);
 assert.ok(Math.min(...fallPoints.map(x=>Math.abs(x-gap.x)))>32);
 const fall=await capture('fall',/三本の落氷 1\/3・床の番号を避ける/);
 const falls=[];
 for(const [i,t] of [108,144,180].entries()){
  const active=await at('FHC03',t);
  assert.match(active.label,new RegExp((i+1)+'/3・床の番号を避ける'));
  assert.equal(active.actor.hp,fallStart.actor.hp);
  assert.deepEqual(active.boss.fallPoints,fallPoints);
  falls.push({index:i+1,tick:active.boss.tick,hp:active.actor.hp});
 }
 const opening=await at('FHC03',198);
 assert.equal(opening.boss.tick+opening.boss.recoveryTicks,252);
 assert.equal(opening.actor.hp,fallStart.actor.hp);
 const recovery=await capture('recovery',/低い核を攻撃.*反撃できる時間/);
 const dx=opening.boss.x-opening.actor.x;
 assert.ok(Math.abs(dx)<125);
 if(dx*opening.actor.dir<0){
  const key=dx>0?'KeyD':'KeyA';
  await page.keyboard.down(key);
  try{await page.waitForFunction(sign=>window.lab.frame.actors[0].dir===sign,Math.sign(dx))}
  finally{await page.keyboard.up(key)}
 }
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:1800});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-before.progression.killXp,mora:defeated.mora-before.mora};
 assert.deepEqual(reward,{xp:35,mora:145});
 console.log('Fixed wheel endpoint and all three falling positions verified with no damage.');

 await drive.count(quest,1);
 for(const node of route.slice(0,-1).reverse())await drive.cross(node);
 const reportXp=(await read()).progression.questXp;
 await drive.report(quest);
 assert.equal((await read()).progression.questXp-reportXp,1500);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const checkpoint=path.join(out,'complete.json');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 await fresh.goto(url);
 await fresh.waitForFunction(()=>window.lab?.frame);
 await fresh.locator('#importSave').setInputFiles(checkpoint);
 await fresh.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-26020201'],input.endgame.bosses['boss-26020201']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,wheel:{locked,actual:wheelEnd.boss.x,player:outOfLane.actor.x,damage:outOfLane.actor.hp-wheelEnd.actor.hp},
  fall:{points:fallPoints,gap,falls,damage:fallStart.actor.hp-opening.actor.hp},
  captures:{wheel,fall,recovery},reward,fieldClears:restored.endgame.bosses[boss].clears,
  commission:restored.story.quests[quest].status,reported:Object.values(restored.story.quests).filter(q=>q.status==='complete').length,
  priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 const f=await read();
 console.error({node:f?.node,field:f?.fieldBoss,x:f?.actor.x,hp:f?.actor.hp,errors});
 throw error;
}finally{await browser.close()}
