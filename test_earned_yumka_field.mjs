import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.YUMKA_EARNED_SAVE||'work/earned-qucusaur/complete.json';
const out=process.env.YUMKA_OUTPUT||'work/earned-yumka';
const url=process.env.LAB_URL||'http://127.0.0.1:51360/';
const rawSave=await fs.readFile(source),input=JSON.parse(rawSave);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,quarry,approach,arena]=['natlan-hub','natlan-quarry-road','natlan-field','yumka-field-ravine'];
const boss='boss-26220301',quest='yumka-commission',sprite='yumka-field-poses-source-v1.png';
assert.ok(!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const canvas=page.locator('#game'),quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');
const read=()=>page.evaluate(()=>{
 const {t,fieldBoss,actors:[actor],mora,progression,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,mora,progression,returns,holdAllyFire,node:story.node};
});

async function at(move,min,max=Infinity){
 const handle=await page.waitForFunction(([move,min,sprite])=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.move===move&&b.tick>=min){
   const flyingFruit=f.draws.find(d=>d.source===sprite&&d.h===30);
   return {boss:b,actor:f.actors[0],fruitY:flyingFruit?.y};
  }
 },[move,min,sprite]);
 const result=await handle.jsonValue();
 assert.ok(result.boss.tick<max,move+' passed expected timing: '+result.boss.tick);
 return result;
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function capture(name,expectedLabel,marks){
 await pause(true);
 const {t,fieldBoss:phase}=await read();
 assert.match(await page.locator('#fieldBossLabel').textContent(),expectedLabel);
 const actual=await page.evaluate(()=>{
  const f=window.lab.frame;
  return f.draws.filter(d=>d.kind==='text'&&d.color==='#fff0c3').map(d=>[d.text,d.x+f.camera,d.y]);
 });
 assert.equal(actual.length,marks.length);
 assert.ok(actual.every(([text,x,y],i)=>text===marks[i][0]&&Math.abs(x-marks[i][1])<.001&&y===501));
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
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
 await pause(false);
 return {label:phase.label,tick:phase.tick,marks:actual,recoveryTicks:phase.recoveryTicks,profiles};
}

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

async function stopInGap(target){
 return page.evaluate(target=>new Promise((resolve,reject)=>{
  let key;
  const deadline=performance.now()+4000;
  const input=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  function move(){
   const {actors:[a],fieldBoss:b}=window.lab.frame;
   const dx=target-a.x, next=Math.abs(dx)<=6?null:dx<0?'KeyA':'KeyD';
   if(performance.now()>deadline){
    if(key)input('keyup',key);
    reject(new Error('Could not stop between the two fruit markers'));
    return;
   }
   if(key!==next){
    if(key)input('keyup',key);
    if(next)input('keydown',next);
    key=next;
   }
   if(!key&&!a.walk)resolve({x:a.x,tick:b.tick});
   else requestAnimationFrame(move);
  }
  requestAnimationFrame(move);
 }),target);
}

try{
 await importSave(page,source);
 if(await drive.node()!==hub)await drive.warp(hub);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of [quarry,approach,arena])await drive.cross(node);
 await drive.walk(715);
 const before=await read();
 assert.equal(before.fieldBoss.maxhp,1035);
 assert.equal(before.progression.level,200);
 await at('FYM01',48,108);
 const jump=await at('FYM02',60,78);
 const destination=jump.boss.destinationX,side=Math.sign(jump.boss.x-destination);
 assert.ok(Number.isFinite(destination)&&side!==0);
 await drive.walk(destination+side*103);
 const flight=await at('FYM02',100,117);
 assert.ok(flight.boss.flying&&flight.boss.y<415&&Math.abs(flight.actor.x-destination)>70.4);
 const belly=await capture('belly',/腹落ち・着地点から離れる/,[['着地',destination]]);
 const land=await at('FYM02',122,132);
 assert.deepEqual([land.boss.x,land.boss.y,land.boss.destinationX],[destination,480,destination]);
 assert.equal(land.actor.hp,jump.actor.hp);
 const firstRecovery=await at('FYM02',168,185);
 assert.equal(firstRecovery.boss.tick+firstRecovery.boss.recoveryTicks,312);
 console.log('Yumkasaur landed on the locked marker; the belly drop did no damage.');

 const locked=await at('FYM03',54,71);
 const [first,second]=locked.boss.firePoints;
 assert.equal(Math.abs(first-second),88);
 const gap=await stopInGap((first+second)/2);
 assert.ok(gap.tick<120&&Math.min(Math.abs(first-gap.x),Math.abs(second-gap.x))>26.4);
 const throw1=await at('FYM03',106,122);
 assert.ok(throw1.fruitY<480&&!throw1.boss.summon);
 assert.equal(throw1.actor.hp,locked.actor.hp);
 const fruit=await capture('fruit',/炎の実 1\/2・床の番号から離れる/,[['1',first],['2',second]]);
 const hit1=await at('FYM03',129,138);
 assert.equal(hit1.actor.hp,locked.actor.hp);
 const throw2=await at('FYM03',162,175);
 assert.ok(throw2.fruitY<480&&!throw2.boss.summon);
 assert.deepEqual(throw2.boss.firePoints,[first,second]);
 const hit2=await at('FYM03',183,192);
 assert.equal(hit2.actor.hp,locked.actor.hp);
 assert.match(hit2.boss.label,/炎の実 2\/2/);
 const open=await at('FYM03',204,231);
 assert.equal(open.boss.tick+open.boss.recoveryTicks,312);
 const recovery=await capture('recovery',/前脚をつく・反撃.*反撃できる時間/,[]);
 console.log('Both fruit impacts missed the gap between the numbered warnings.');

 await drive.walk(open.boss.x+Math.sign(gap.x-open.boss.x)*69);
 const ready=await read();
 assert.ok(ready.fieldBoss.recoveryTicks>0);
 assert.ok((ready.fieldBoss.x-ready.actor.x)*ready.actor.dir>0&&Math.abs(ready.fieldBoss.x-ready.actor.x)<117);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:1600})}
 finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.ok(defeated.t-ready.t<=ready.fieldBoss.recoveryTicks/60+.05);
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-before.progression.killXp,mora:defeated.mora-before.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,370);
 await drive.count(quest,1);
 for(const node of [approach,quarry,hub])await drive.cross(node);
 const pre=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-pre.progression.questXp,post.mora-pre.mora],[7400,470]);
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
 assert.deepEqual(restored.endgame.bosses['boss-26230301'],input.endgame.bosses['boss-26230301']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reported=Object.values(restored.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,Object.values(input.story.quests).filter(q=>q.status==='complete').length+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(rawSave).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,belly:{locked:destination,landed:land.boss.x,airborneY:flight.boss.y,
   playerDamage:jump.actor.hp-land.actor.hp,recoveryTicks:firstRecovery.boss.recoveryTicks},
  fruit:{points:[first,second],gap,firstFlightY:throw1.fruitY,secondFlightY:throw2.fruitY,
   impacts:[hit1.boss.tick,hit2.boss.tick],playerDamage:locked.actor.hp-hit2.actor.hp},
  captures:{belly,fruit,recovery},reward,fieldClears:restored.endgame.bosses[boss].clears,
  reported,priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Yumkasaur clear, quest report '+reported+', and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state?.node,boss:state?.fieldBoss,x:state?.actor.x,hp:state?.actor.hp,errors});
 throw error;
}finally{await browser.close()}
