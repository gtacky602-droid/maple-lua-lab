import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.ELECTRO_EARNED_SAVE||'work/earned-cryo/complete.json';
const out=process.env.ELECTRO_OUTPUT||'work/earned-electro';
const url=process.env.LAB_URL||'http://127.0.0.1:51349/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const route=['mond-town','mond-road','electro-approach','electro-field-shelf'];
const boss='boss-20040101',quest='electro-commission';
const errors=[];
assert.ok(!input.endgame.bosses[boss]&&!input.story.quests[quest]);
await fs.mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(24000);
page.on('pageerror',error=>errors.push(error.message));
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const read=()=>page.evaluate(()=>{
 const {t,fieldBoss,actors,mora,progression,returns,holdAllyFire,story}=window.lab.frame;
 return {t,fieldBoss,actors,mora,progression,returns,holdAllyFire,node:story.node};
});
const label=page.locator('#fieldBossLabel'),canvas=page.locator('#game');
const quality=page.locator('#renderMode'),pack=page.locator('#packRectArt');

async function at(move,min){
 const state=await page.waitForFunction(([move,min])=>{
  const {fieldBoss,progression,mora}=window.lab.frame;
  if(fieldBoss?.move===move&&fieldBoss.tick>=min)return {fieldBoss,progression,mora};
 },[move,min]);
 return state.jsonValue();
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function jumpAt(move,begin,sample,end){
 const result=await page.evaluate(({move,begin,sample,end})=>new Promise((resolve,reject)=>{
  const deadline=performance.now()+20000;
  let first,air;
  const send=type=>window.dispatchEvent(new KeyboardEvent(type,{code:'Space',bubbles:true,cancelable:true}));
  function observe(){
   const {fieldBoss:b,actors:[actor]}=window.lab.frame;
   if(performance.now()>deadline){
    if(first)send('keyup');
    reject(new Error('Timed out waiting for '+move+' at '+begin));
    return;
   }
   if(b?.move===move){
    if(!first&&b.tick>=begin){
     first={tick:b.tick,hp:actor.hp,ground:actor.ground};
     send('keydown');
    }
    if(first&&!air&&b.tick>=sample)air={tick:b.tick,height:480-actor.y,ground:actor.ground};
    if(air&&b.tick>=end){
     send('keyup');
     resolve({startTick:first.tick,sampleTick:air.tick,height:air.height,damage:first.hp-actor.hp,
      startedGrounded:first.ground,clearedInAir:!air.ground});
     return;
    }
   }
   requestAnimationFrame(observe);
  }
  requestAnimationFrame(observe);
 }),{move,begin,sample,end});
 assert.ok(result.startTick<=begin+7&&result.sampleTick<=sample+7,JSON.stringify(result));
 assert.ok(result.startedGrounded&&result.clearedInAir,JSON.stringify(result));
 assert.equal(result.damage,0,JSON.stringify(result));
 return result;
}

async function capture(name,expectedLabel){
 await pause(true);
 const {t,fieldBoss:pose}=await read();
 assert.match(await label.textContent(),expectedLabel);
 await canvas.screenshot({path:path.join(out,name+'-png.png')});
 const profiles={};
 for(const profile of ['h48c32','h32c16']){
  const plain=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const batched=await captureRectTransfer(page,profile,true,()=>pack.check());
  assert.ok(batched.raster===plain.raster,name+' '+profile+' packed Canvas pixels differ');
  assert.equal(plain.snapshot.t,t);
  assert.equal(batched.snapshot.t,t);
  assert.ok(batched.snapshot.fieldBoss.drawCount<plain.snapshot.fieldBoss.drawCount);
  assert.ok(batched.gzipBytes<plain.gzipBytes);
  profiles[profile]={legacyDraws:plain.snapshot.fieldBoss.drawCount,packedDraws:batched.snapshot.fieldBoss.drawCount,
   legacyGzip:plain.gzipBytes,packedGzip:batched.gzipBytes,identicalPixels:true};
  await canvas.screenshot({path:path.join(out,name+'-'+profile+'.png')});
 }
 await quality.selectOption('sprite');
 await pause(false);
 return {move:pose.move,tick:pose.tick,label:pose.label,profiles};
}

try{
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(source);
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 await drive.waitNode(route[0]);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of route.slice(1))await drive.cross(node);
 await drive.walk(746);
 await page.evaluate(()=>document.activeElement.blur());
 const combo=[];
 let palm;
 for(const [start,sample,end,name] of [[62,79,85,'グー'],[122,139,145,'チョキ'],[189,205,217,'パー']]){
  if(name==='パー'){
   await at('FE01',161);
   palm=await capture('palm',/パー 3\/3/);
  }
  combo.push({shape:name,...await jumpAt('FE01',start,sample,end)});
 }
 const drillStart=await at('FE02',39);
 const drill=await capture('drill',/走路から離れるかジャンプ/);
 const drillJump=await jumpAt('FE02',79,96,109);
 const drillEnd=await at('FE02',121);
 const drillDistance=Math.abs(drillEnd.fieldBoss.x-drillStart.fieldBoss.x);
 assert.ok(Math.abs(drillDistance-193.6)<0.01);
 const firstWarning=await at('FE03',45);
 assert.match(firstWarning.fieldBoss.label,/1発目をジャンプで回避/);
 const wave1=await jumpAt('FE03',77,96,109);
 await at('FE03',131);
 const wave=await capture('wave',/2発目をジャンプで回避/);
 const wave2=await jumpAt('FE03',149,168,181);
 assert.ok(wave1.height>39.6&&wave2.height>39.6);
 console.log('All three combo jumps, the drill and both low-wave jumps passed.');

 await page.keyboard.down('KeyA');
 try{
  await page.waitForFunction(()=>window.lab.frame.actors[0].dir===-1);
 }finally{await page.keyboard.up('KeyA')}
 const opening=await at('FE03',210);
 assert.ok(opening.fieldBoss.recovering);
 assert.match(opening.fieldBoss.label,/足元の核に攻撃（あと1.0秒）/);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='respawn',null,{timeout:3500});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 assert.equal(defeated.returns,0);
 assert.equal(defeated.fieldBoss.hp,0);
 const reward={xp:defeated.progression.killXp-opening.progression.killXp,mora:defeated.mora-opening.mora};
 assert.deepEqual(reward,{xp:38,mora:140}); // Lv200 earns 3% of the level-appropriate 1250 EXP.
 await drive.count(quest,1);
 for(const node of route.slice(0,-1).reverse())await drive.cross(node);
 const questXp=(await read()).progression.questXp;
 await drive.report(quest);
 assert.equal((await read()).progression.questXp-questXp,1500);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 const checkpoint=path.join(out,'complete.json');
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 await fresh.goto(url);
 await fresh.waitForFunction(()=>window.lab?.frame);
 await fresh.locator('#importSave').setInputFiles(checkpoint);
 await fresh.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.endgame.bosses[boss].clears,1);
 for(const id of ['boss-26020101','boss-20040201'])assert.deepEqual(restored.endgame.bosses[id],input.endgame.bosses[id]);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,combo,drill:{movement:drillDistance,jump:drillJump},waves:[wave1,wave2],
  recovery:{move:opening.fieldBoss.move,tick:opening.fieldBoss.tick,label:opening.fieldBoss.label},
  captures:{palm,drill,wave},reward,fieldClears:restored.endgame.bosses[boss].clears,commission:restored.story.quests[quest].status,
  reported:Object.values(restored.story.quests).filter(q=>q.status==='complete').length,
  priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 const f=await read();
 console.error({node:f?.node,boss:f?.fieldBoss,actor:f?.actors[0]&&{x:f.actors[0].x,y:f.actors[0].y,hp:f.actors[0].hp},errors});
 throw error;
}finally{await browser.close()}
