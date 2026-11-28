import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.QUCUSAUR_EARNED_SAVE||'work/earned-ruin-serpent/complete.json';
const out=process.env.QUCUSAUR_OUTPUT||'work/earned-qucusaur';
const url=process.env.LAB_URL||'http://127.0.0.1:51359/';
const rawSave=await fs.readFile(source),input=JSON.parse(rawSave);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const [hub,approach,arena]=['natlan-hub','natlan-field','qucusaur-field-cavern'];
const quarry='natlan-quarry-road';
const boss='boss-26230301',quest='qucusaur-commission';
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
 const {t,fieldBoss,actors:[actor],mora,progression,kills,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,mora,progression,kills,returns,holdAllyFire,node:story.node};
});

async function at(move,min,max=Infinity){
 const frame=await page.waitForFunction(([move,min])=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.move===move&&b.tick>=min)return {boss:b,actor:f.actors[0]};
 },[move,min]);
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
  return f.draws.filter(d=>d.kind==='text'&&d.color==='#ffebbc').map(d=>[d.text,d.x+f.camera,d.y]);
 });
 assert.deepEqual(marks.map(([label])=>label),markerXs.map((_,i)=>String(i+1)));
 assert.ok(marks.every(([,x,y],i)=>Math.abs(x-markerXs[i])<.001&&y===501));
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
 return {label:phase.label,tick:phase.tick,marks,recoveryTicks:phase.recoveryTicks,profiles};
}

async function importSave(view,file){
 await view.goto(url);
 await view.waitForFunction(()=>window.lab?.frame);
 await view.locator('#importSave').setInputFiles(file);
 await view.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

async function face(x){
 const {actor}=await read(),dir=Math.sign(x-actor.x);
 if(!dir||dir===actor.dir)return;
 const key=dir>0?'KeyD':'KeyA';
 await page.keyboard.down(key);
 try{await page.waitForFunction(dir=>window.lab.frame.actors[0].dir===dir,dir)}
 finally{await page.keyboard.up(key)}
}

try{
 await importSave(page,source);
 if(await drive.node()!==hub)await drive.warp(hub);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 await drive.cross(quarry);
 await drive.cross(approach);
 await drive.cross(arena);
 await drive.walk(706);
 const before=await read();
 assert.equal(before.fieldBoss.maxhp,1020);
 assert.equal(before.progression.level,200);
 await at('FQT01',44,96);
 await at('FQT02',48,140);

 const firstFlight=await at('FQT03',78,106);
 const [first,second]=firstFlight.boss.divePoints;
 assert.equal(firstFlight.boss.summon.hp,14);
 assert.equal(firstFlight.boss.summon.x,first);
 assert.ok(Math.abs(first-second)>172);
 assert.ok(firstFlight.boss.y<400);
 const feather=await capture('feather',/羽根を壊すと飛行が止まる.*羽根が消えるまであと/,[first,second]);
 await drive.walk((first+second)/2);
 const incoming=await at('FQT03',205,216);
 assert.ok(!incoming.boss.summon&&!incoming.boss.flightInterrupted&&incoming.boss.y<480);
 assert.ok(Math.min(Math.abs(incoming.actor.x-first),Math.abs(incoming.actor.x-second))>74.8);
 const dive=await capture('dive',/降下 1\/2・番号の位置から離れる/,[first,second]);
 const landing1=await at('FQT03',220,232);
 assert.deepEqual([landing1.boss.x,landing1.boss.y],[first,480]);
 assert.equal(landing1.actor.hp,firstFlight.actor.hp);
 const landing2=await at('FQT03',300,312);
 assert.deepEqual([landing2.boss.x,landing2.boss.y],[second,480]);
 assert.equal(landing2.actor.hp,firstFlight.actor.hp);
 assert.match(landing2.boss.label,/降下 2\/2/);
 const natural=await at('FQT03',322,350);
 assert.equal(natural.boss.tick+natural.boss.recoveryTicks,466);
 assert.equal(natural.boss.form,'recover');
 console.log('Kept the feather intact and dodged both fixed landings.');

 await at('FQT01',44,96);
 await at('FQT02',48,140);
 const secondFlight=await at('FQT03',78,106);
 const target=secondFlight.boss.summon;
 assert.equal(target.hp,14);
 const side=Math.sign(target.x-secondFlight.boss.x)||-1;
 await drive.walk(target.x+side*49);
 await face(target.x);
 const preBreak=await read();
 assert.ok(preBreak.fieldBoss.tick<186&&preBreak.fieldBoss.summon.hp===14);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.flightInterrupted,null,{timeout:1300});
 }finally{await page.keyboard.up('KeyJ')}
 const falling=await read();
 assert.equal(falling.fieldBoss.form,'falling');
 assert.ok(falling.fieldBoss.tick<186&&!falling.fieldBoss.divePoints&&!falling.fieldBoss.summon);
 assert.equal(falling.fieldBoss.hp,preBreak.fieldBoss.hp);
 assert.deepEqual([falling.kills,falling.mora,falling.progression.killXp],
  [preBreak.kills,preBreak.mora,preBreak.progression.killXp]);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.form==='recover');
 const grounded=await read();
 assert.equal(grounded.fieldBoss.y,480);
 assert.equal(grounded.fieldBoss.x,secondFlight.boss.x);
 assert.ok(grounded.fieldBoss.recoveryTicks>=141&&grounded.fieldBoss.recoveryTicks<=144);
 assert.equal(grounded.actor.hp,preBreak.actor.hp);
 const recovery=await capture('recovery',/地上で翼を休める・反撃.*反撃できる時間/,[]);
 console.log('Broke the feather with a normal attack. Both dives disappeared and the boss grounded.');

 await drive.walk(grounded.fieldBoss.x+side*60);
 await face(grounded.fieldBoss.x);
 const ready=await read();
 assert.ok(ready.fieldBoss.recoveryTicks>0&&ready.fieldBoss.flightInterrupted);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:2100});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.ok(defeated.t-ready.t<=ready.fieldBoss.recoveryTicks/60+.05);
 assert.equal(defeated.returns,0);
 const reward={xp:defeated.progression.killXp-before.progression.killXp,mora:defeated.mora-before.mora};
 assert.ok(reward.xp>0);
 assert.equal(reward.mora,360);
 await drive.count(quest,1);
 await drive.cross(approach);
 await drive.cross(quarry);
 await drive.cross(hub);
 const preReport=await read();
 await drive.report(quest);
 const post=await read();
 assert.deepEqual([post.progression.questXp-preReport.progression.questXp,post.mora-preReport.mora],[7200,460]);
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
 assert.deepEqual(restored.endgame.bosses['boss-24010401'],input.endgame.bosses['boss-24010401']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 const reported=Object.values(restored.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,Object.values(input.story.quests).filter(q=>q.status==='complete').length+1);
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(rawSave).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,natural:{points:[first,second],actual:[landing1.boss.x,landing2.boss.x],
   playerDamage:firstFlight.actor.hp-landing2.actor.hp,recoveryTicks:natural.boss.recoveryTicks},
  interrupted:{featherHpBefore:target.hp,breakTick:falling.fieldBoss.tick,groundedTick:grounded.fieldBoss.tick,
   recoveryTicks:grounded.fieldBoss.recoveryTicks,clearedDivePoints:true,featherRewards:0,playerDamage:preBreak.actor.hp-grounded.actor.hp},
  captures:{feather,dive,recovery},reward,fieldClears:restored.endgame.bosses[boss].clears,
  reported,priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log('Verified earned Qucusaur clear, quest report '+reported+', and six pixel-identical transfers.');
}catch(error){
 const state=await read();
 console.error({node:state?.node,boss:state?.fieldBoss,x:state?.actor.x,hp:state?.actor.hp,errors});
 throw error;
}finally{await browser.close()}
