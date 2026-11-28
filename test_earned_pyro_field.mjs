import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source=process.env.PYRO_EARNED_SAVE||'work/earned-primo/complete.json';
const out=process.env.PYRO_OUTPUT||'work/earned-pyro';
const url=process.env.LAB_URL||'http://127.0.0.1:51353/';
const bytes=await fs.readFile(source),input=JSON.parse(bytes);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const route=['liyue-harbor','liyue-field','pyro-approach','pyro-field-grotto'];
const boss='boss-26020201',quest='pyro-commission';
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
  if(b?.move===move&&b.tick>=min)return {boss:b,actor:a};
 },[move,min]);
 return state.jsonValue();
}

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
 return {label:pose.label,tick:pose.tick,downTicks:pose.downTicks,coreHits:pose.coreHits,profiles};
}

async function jumpOverFlame(){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const deadline=performance.now()+12000;
  let start,air;
  const key=type=>window.dispatchEvent(new KeyboardEvent(type,{code:'Space',bubbles:true,cancelable:true}));
  function observe(){
   const {fieldBoss:b,actors:[actor]}=window.lab.frame;
   if(performance.now()>deadline){
    if(start)key('keyup');
    reject(new Error('Timed out during the traveling flame'));
    return;
   }
   if(b?.move==='FP01'){
    if(!start&&b.tick>=88){
     start={tick:b.tick,hp:actor.hp,ground:actor.ground,distance:b.x-actor.x};
     key('keydown');
    }
    if(start&&!air&&b.tick>=110)air={tick:b.tick,height:480-actor.y,label:b.label};
    if(air&&b.tick>=126){
     key('keyup');
     resolve({startTick:start.tick,startedGrounded:start.ground,distance:start.distance,
      damage:start.hp-actor.hp,...air});
     return;
    }
   }
   requestAnimationFrame(observe);
  }
  requestAnimationFrame(observe);
 }));
}

async function strike(expectedCore){
 await page.waitForFunction(()=>!(window.lab.frame.actors[0].cd.normal>0));
 const before=await read();
 await page.keyboard.down('KeyJ');
 try{
  const state=await page.waitForFunction(([hp,expected])=>{
   const {fieldBoss:b,actors:[a]}=window.lab.frame;
   if(b?.hp<hp&&b.coreHits===expected){
    return {hp:b.hp,coreHits:b.coreHits,tick:b.tick,downTicks:b.downTicks,
     distance:b.x-a.x,grounded:a.ground,label:b.label};
   }
  },[before.fieldBoss.hp,expectedCore],{timeout:1800});
  return {...await state.jsonValue(),hpBefore:before.fieldBoss.hp};
 }finally{await page.keyboard.up('KeyJ')}
}

const equipment=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);

try{
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(source);
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 await drive.waitNode(route[0]);
 const originalAtk=(await read()).actor.atk;
 await gear(['artifact_remove:602','artifact_equip:1187','weapon_equip:traveler:SW04'],7);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 for(const node of route.slice(1))await drive.cross(node);
 await drive.walk(655);
 const start=await read();
 await at('FP01',52);
 const warning=await capture('warning',/首落としと火走り・低い炎を跳び越す/);
 const jump=await jumpOverFlame();
 assert.ok(jump.startedGrounded&&jump.startTick<=95&&jump.distance>151&&jump.distance<250&&jump.height>33);
 assert.equal(jump.damage,0);
 assert.match(jump.label,/火走り・低い炎を跳び越す/);

 await drive.walk(737);
 await at('FP01',180);
 const distant=await strike(3);
 assert.ok(distant.distance>94&&distant.distance<125&&distant.grounded);
 await at('FP03',0);
 await drive.walk(774);
 await at('FP01',10);
 const roots=[];
 for(const left of [2,1,0])roots.push(await strike(left));
 assert.ok(roots.every(hit=>hit.distance<=94&&hit.grounded));
 assert.equal(roots[2].downTicks,0);
 assert.match(roots[2].label,/火走りが消えるとダウン/);
 await at('FP01',108);
 const pending=await capture('pending',/核を破壊・火走りが消えるとダウン/);
 assert.ok(pending.tick>=96&&pending.tick<156&&pending.downTicks===0);

 const firstDown=await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  if(b?.downTicks>0)return b.downTicks;
 });
 assert.ok(await firstDown.jsonValue()>=234);
 const down=await capture('down',/核を破壊・ダウン（あと[\d.]+秒）/);
 const duringDown=await strike(0);
 assert.ok(duringDown.downTicks>0);
 console.log('Jumped the low flame, hit the body from outside root range, and confirmed a delayed four-second stun.');

 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>{
   const f=window.lab.frame;
   if(f.fieldBoss?.phase==='respawn')return true;
   const a=f.actors[0];
   if(!(a.cd.SK09>0)&&!(a.lock>0)&&!f.macro)window.lab.action('slot1');
  },null,{timeout:125000});
 }finally{await page.keyboard.up('KeyJ')}
 const defeated=await read();
 const reward={xp:defeated.progression.killXp-start.progression.killXp,mora:defeated.mora-start.mora};
 assert.deepEqual(reward,{xp:147,mora:150});
 assert.equal(defeated.returns,0);
 assert.equal(defeated.fieldBoss.hp,0);
 await drive.count(quest,1);
 for(const node of route.slice(0,-1).reverse())await drive.cross(node);
 const reportXp=(await read()).progression.questXp;
 await drive.report(quest);
 assert.equal((await read()).progression.questXp-reportXp,4000);
 await gear(['artifact_equip:10','artifact_equip:602','weapon_equip:traveler:SW07'],originalAtk);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.deepEqual(saved.weapons,input.weapons);
 assert.deepEqual(equipment(saved),equipment(input));
 const checkpoint=path.join(out,'complete.json');
 await fs.writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n');
 const fresh=await browser.newPage();
 await fresh.goto(url);
 await fresh.waitForFunction(()=>window.lab?.frame);
 await fresh.locator('#importSave').setInputFiles(checkpoint);
 await fresh.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
 const restored=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(restored.endgame.bosses['boss-26050101'],input.endgame.bosses['boss-26050101']);
 assert.deepEqual(restored.endgame.weekly,input.endgame.weekly);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.deepEqual(errors,[]);
 const result={inputSha256:createHash('sha256').update(bytes).digest('hex'),level:defeated.progression.level,
  journeys:drive.journeys,trialAtk:7,restoredAtk:originalAtk,jump,distant,roots,duringDown,
  captures:{warning,pending,down},reward,fieldClears:restored.endgame.bosses[boss].clears,
  commission:restored.story.quests[quest].status,reported:Object.values(restored.story.quests).filter(q=>q.status==='complete').length,
  priorWeeklyRecordsPreserved:true,returns:defeated.returns,errors};
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 const f=await read();
 console.error({node:f?.node,field:f?.fieldBoss,actor:f?.actor&&{x:f.actor.x,y:f.actor.y,hp:f.actor.hp,atk:f.actor.atk},errors});
 throw error;
}finally{await browser.close()}
