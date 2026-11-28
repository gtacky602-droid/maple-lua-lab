import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.GEO_EARNED_SAVE||'work/earned-electro/complete.json';
const out=process.env.GEO_OUTPUT||'work/earned-geo';
const url=process.env.LAB_URL||'http://127.0.0.1:51350/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const route=['liyue-harbor','liyue-field','liyue-wp-52','liyue-wp-53','geo-approach','geo-field-court'];
const boss='boss-20040301',quest='geo-commission';
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
 const {t,fieldBoss,actors:[actor],kills,mora,returns,progression,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actor,kills,mora,returns,progression,holdAllyFire,node:story.node};
});
const waitMove=(move,min)=>page.waitForFunction(([move,min])=>{
 const b=window.lab.frame.fieldBoss;
 return b?.move===move&&b.tick>=min;
},[move,min]);

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function gear(actions,attack){
 await page.evaluate(actions=>actions.forEach(action=>window.lab.action(action)),actions);
 await page.waitForFunction(attack=>window.lab.frame.actors[0].atk===attack,attack);
}

async function capture(name,expectedLabel){
 await pause(true);
 const {t,fieldBoss:pose}=await read();
 assert.match(await label.textContent(),expectedLabel);
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const raw=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.ok(packed.raster===raw.raster,name+' '+profile+' packed Canvas pixels differ');
  assert.equal(raw.snapshot.t,t);
  assert.equal(packed.snapshot.t,t);
  assert.ok(packed.snapshot.fieldBoss.drawCount<raw.snapshot.fieldBoss.drawCount&&packed.gzipBytes<raw.gzipBytes);
  profiles[profile]={legacyDraws:raw.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
   legacyGzip:raw.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await pause(false);
 return {label:pose.label,tick:pose.tick,profiles};
}

async function jumpOverShock(){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const deadline=performance.now()+12000;
  let start,air;
  const key=type=>window.dispatchEvent(new KeyboardEvent(type,{code:'Space',bubbles:true,cancelable:true}));
  function observe(){
   const {fieldBoss:b,actors:[actor]}=window.lab.frame;
   if(performance.now()>deadline){
    if(start)key('keyup');
    reject(new Error('Timed out during pillar shock'));
    return;
   }
   if(b?.move==='FG03'){
    if(!start&&b.tick>=132){
     start={tick:b.tick,hp:actor.hp,ground:actor.ground};
     key('keydown');
    }
    if(start&&!air&&b.tick>=150)air={tick:b.tick,height:480-actor.y,label:b.label};
    if(air&&b.tick>=163){
     key('keyup');
     resolve({startTick:start.tick,startedGrounded:start.ground,damage:start.hp-actor.hp,...air});
     return;
    }
   }
   requestAnimationFrame(observe);
  }
  requestAnimationFrame(observe);
 }));
}

async function strike(expected,condition){
 await page.waitForFunction(()=>!(window.lab.frame.actors[0].cd.normal>0));
 await page.keyboard.down('KeyJ');
 try{
  const seen=await page.waitForFunction(([expected,condition])=>{
   const b=window.lab.frame.fieldBoss;
   if(b?.label?.startsWith(expected)&&(!condition||b.hp<condition)){
    return {label:b.label,tick:b.tick,hp:b.hp};
   }
  },[expected,condition],{timeout:2200});
  return await seen.jsonValue();
 }finally{await page.keyboard.up('KeyJ')}
}

function equipment(checkpoint){
 return checkpoint.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
}

try{
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(source);
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 await drive.waitNode('mond-town');
 await drive.warp(route[0]);
 const originalAtk=(await read()).actor.atk;
 await gear(['artifact_remove:602','artifact_equip:1187','weapon_equip:traveler:SW04'],7);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of route.slice(1))await drive.cross(node);
 await drive.walk(773);
 await waitMove('FG03',44);
 const opened=await read();
 assert.ok(opened.fieldBoss.x-opened.actor.x<=86&&opened.actor.dir===1);
 const pillar=await capture('pillar',/近くで柱に攻撃 0\/3（震動まで[\d.]+秒）/);
 const skipped=await jumpOverShock();
 assert.ok(skipped.startedGrounded&&skipped.startTick<=139&&skipped.height>39.6);
 assert.match(skipped.label,/柱の周りをジャンプで回避/);
 assert.equal(skipped.damage,0);
 await waitMove('FG01',0);
 await waitMove('FG03',36);
 const before=await read();
 const strikes=[];
 for(const expected of ['近くで柱に攻撃 1/3','近くで柱に攻撃 2/3','柱破壊・核が静止']){
  strikes.push(await strike(expected,null));
 }
 const exposed=await capture('exposed',/柱破壊・核が静止（あと[\d.]+秒）/);
 const beforeHit=await read();
 assert.deepEqual([beforeHit.kills,beforeHit.mora,beforeHit.progression.killXp],[before.kills,before.mora,before.progression.killXp]);
 const hit=await strike('柱破壊・核が静止',beforeHit.fieldBoss.hp);
 assert.ok(beforeHit.fieldBoss.hp-hit.hp>0);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.label==='殻を組み直す');
 const hitAtExposure={hpBefore:beforeHit.fieldBoss.hp,hpAfter:hit.hp,label:hit.label};
 console.log('Boat, jumped intact pillar shock, three separate cracks and exposed core attack passed.');

 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>{
   const f=window.lab.frame;
   if(f.fieldBoss?.phase==='respawn')return true;
   const a=f.actors[0];
   if(!(a.cd.SK09>0)&&!(a.lock>0)&&!f.macro)window.lab.action('slot1');
  },null,{timeout:140000});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 const reward={xp:defeated.progression.killXp-before.progression.killXp,mora:defeated.mora-before.mora};
 assert.deepEqual(reward,{xp:177,mora:160});
 assert.equal(defeated.returns,0);
 assert.equal(defeated.fieldBoss.hp,0);
 await drive.count(quest,1);
 for(const node of route.slice(0,-1).reverse())await drive.cross(node);
 assert.deepEqual(drive.journeys.filter(leg=>leg[2]==='boat'),[
  ['liyue-wp-53','geo-approach','boat'],['geo-approach','liyue-wp-53','boat'],
 ]);
 const reportXp=(await read()).progression.questXp;
 await drive.report(quest);
 assert.equal((await read()).progression.questXp-reportXp,4000);
 await gear(['artifact_equip:10','artifact_equip:602','weapon_equip:traveler:SW07'],originalAtk);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const checkpoint=path.join(out,'complete.json');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.deepEqual(saved.weapons,input.weapons);
 assert.deepEqual(equipment(saved),equipment(input));
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 await fresh.goto(url);
 await fresh.waitForFunction(()=>window.lab?.frame);
 await fresh.locator('#importSave').setInputFiles(checkpoint);
 await fresh.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.story.node,route[0]);
 assert.equal(restored.endgame.bosses[boss].clears,1);
 for(const id of ['boss-20040201','boss-26020101','boss-20040101']){
  assert.deepEqual(restored.endgame.bosses[id],input.endgame.bosses[id]);
 }
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,trialAtk:7,restoredAtk:originalAtk,skipped,strikes,hitAtExposure,
  captures:{pillar,exposed},reward,fieldClears:restored.endgame.bosses[boss].clears,commission:restored.story.quests[quest].status,
  reported:Object.values(restored.story.quests).filter(q=>q.status==='complete').length,
  priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 const f=await read();
 console.error({node:f?.node,field:f?.fieldBoss,actor:f?.actor&&{x:f.actor.x,y:f.actor.y,hp:f.actor.hp,atk:f.actor.atk},errors});
 throw error;
}finally{await browser.close()}
