import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub',summit='natlan-flag-summit',steps='natlan-high-trial-steps';
const high='natlan-high-trial-field',river='natlan-river-float-run',turn='natlan-river-turn-basin';
const meet='natlan-duel-entry',quest='natlan-two-trials';
const earned=process.argv.includes('--earned');
const work='work/earned-natlan-two-trials';
const prefix=process.env.LAB_TRIAL_EVIDENCE??(earned?work+'/trial':'evidence/natlan-two-trials');
if(earned)await fs.mkdir(work,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg,timeout=18000)=>page.waitForFunction(fn,arg,{timeout});
const nodeIs=node=>wait(id=>window.lab?.frame?.story?.node===id,node);
const record=async()=>(await frame()).story.quests[quest];
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),actor=f.actors[f.active-1];
  if(Math.abs(x-actor.x)<7)return;
  const east=x>actor.x,dir=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(dir);
  try{
    await wait(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{await page.keyboard.up(dir)}
}

async function grounded(y){
  await wait(y=>window.lab.frame.actors[0].ground&&window.lab.frame.actors[0].y===y,y);
}

async function jump(x,y,moving=false){
  if(!moving)await walk(x);
  await canvas.click();
  await page.keyboard.down('Space');
  try{
    if(moving){
      await page.keyboard.down('KeyD');
      try{await wait(x=>window.lab.frame.actors[0].x>=x-5,x);}
      finally{await page.keyboard.up('KeyD')}
    }
    await grounded(y);
  }finally{await page.keyboard.up('Space')}
}

async function gate(x,node){
  await walk(x);
  await wait(id=>{
    const p=window.lab.frame.storyNearbyPortal;
    return p?.available&&p.to===id;
  },node);
  await key('KeyF');
  await nodeIs(node);
}

const count=(n,path)=>wait(({quest,n,path})=>{
  const state=window.lab.frame.story.quests[quest];
  return (path?state?.pathProgress[path]?.count:state?.count)===n;
},{quest,n,path});

async function inspect(x,n,path){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  await count(n,path);
}

async function questButton(name,status){
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
}

async function saveReload(node){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await nodeIs(node);
}

async function auto(on){
  if((await frame()).auto===on)return;
  await page.locator('#auto').click();
  await wait(on=>window.lab.frame.auto===on,on);
}

async function highGuard(id){
  await key('KeyJ');
  await auto(true);
  try{
    await wait(({quest,id})=>{
      const high=window.lab.frame.story.quests[quest]?.pathProgress.high;
      return high?.count>=3||high?.sweep?.[id];
    },{quest,id});
  }finally{await auto(false)}
}

function scene(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame(),position=png.storyRiverDecks[0].x;
  const raft=png.draws.find(d=>d.source==='natlan-trial-raft-source-v1.png');
  assert.equal(raft?.h,20);
  assert.ok(Math.abs(raft.w-png.storyRiverDecks[0].w)<2);
  await screenshot('raft-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyRiverDecks[0].x===position));
  assert.deepEqual(light.storyRiverBoarding,png.storyRiverBoarding);
  await screenshot('raft-light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8893/');
  await wait(()=>window.lab?.frame);
  const raw=await fs.readFile(earned?'work/earned-natlan-flag/ledges-browser-complete.json':'work/natlan-two-trials-fixture.json','utf8');
  const {reward:expectedReward}=JSON.parse(await fs.readFile('evidence/natlan-two-trials-lua.json','utf8'));
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  await page.locator('#loadProgress').click();
  await nodeIs(hub);
  const start=await frame();
  if(earned){
   assert.equal(start.progression.level,101);
   assert.equal(start.story.quests['natlan-ridge-flag'].status,'complete');
  }
  await questButton('受注','active');
  await gate(1227,summit);
  await jump(795,390);
  await inspect(795,1);
  await walk(1292);
  await wait(()=>window.lab.frame.storyNearbyPortal?.to==='natlan-duel-entry');
  assert.equal((await frame()).storyNearbyPortal.available,false);
  await walk(1055);
  await canvas.click();await page.keyboard.down('ArrowDown');
  try{await page.keyboard.press('Space');}
  finally{await page.keyboard.up('ArrowDown')}
  await grounded(480);
  await gate(1055,river);
  const riverside=await scene();
  assert.deepEqual(riverside,{key:'natlanRiverTrial',file:'natlan-riverside-trial-background-v1.png',state:'ready'});
  await inspect(252,1,'water');
  const initialHealth=(await frame()).actors[0].hp;
  await walk(452);
  await wait(()=>window.lab.frame.storyNotice?.includes('近い岸'));
  assert.equal((await frame()).actors[0].hp,initialHealth);
  await walk(388);
  await wait(()=>window.lab.frame.storyRiverBoarding?.phase==='wait');
  assert.match(await page.locator('#storyForest').textContent(),/この岸に着くまで[\d.]+秒/);
  if(earned)await screenshot('wait-for-raft');
  await wait(()=>{const p=window.lab.frame.storyRiverDecks?.[0];return p?.x===340&&p.dockSeconds>1.25;});
  assert.equal((await frame()).storyRiverBoarding.phase,'board');
  assert.match(await page.locator('#storyForest').textContent(),/ジャンプで乗れます。出発まで[\d.]+秒/);
  await jump(388,430);
  const onDeck=(await frame()).actors[0].x;
  await wait(x=>window.lab.frame.actors[0].x>x+120&&window.lab.frame.actors[0].ground,onDeck);
  assert.match(await page.locator('#storyForest').textContent(),/右岸に着くまで[\d.]+秒/);
  const commands=await compare();
  await wait(()=>window.lab.frame.storyRiverDecks[0].x===914);
  assert.equal((await frame()).storyRiverBoarding.phase,'landed');
  await jump(1105,480,true);
  await auto(true);await count(2,'water');await auto(false);
  await gate(1610,turn);
  await walk(396);
  await jump(478,411,true);
  await jump(646,390,true);
  await walk(852);await grounded(411);
  await wait(()=>{const p=window.lab.frame.storyRiverDecks?.[0];return p?.direction===1&&p.x>785&&p.x<805;});
  await walk(906);await grounded(435);
  await wait(()=>window.lab.frame.storyRiverDecks[0].x===1070);
  await jump(1240,480,true);
  await auto(true);await count(3,'water');await auto(false);
  await walk(1480);
  await key('KeyG');
  await count(4,'water');
  await wait(()=>window.lab.frame.draws.some(d=>d.text==='向きが変わる間'));
  await screenshot('turn');
  assert.equal((await record()).count,1);
  await saveReload(summit);
  assert.equal((await record()).pathProgress.water.count,4);
  await wait(()=>document.querySelector('#storyForest').textContent.includes('水辺 通過'));
  console.log('Both river crossings and saved water branch verified');

  await jump(969,390);
  await gate(969,steps);
  await jump(522,391);await inspect(522,1,'high');
  await jump(900,302);await inspect(1044,2,'high');
  await gate(1420,high);
  await walk(303);await highGuard('natlan-high-mark-1');
  if(earned){
   assert.equal((await record()).pathProgress.high.count,2);
   await saveReload(summit);
   assert.equal((await record()).pathProgress.water.count,4);
   assert.equal((await record()).pathProgress.high.sweep['natlan-high-mark-1'],true);
   await jump(969,390);await gate(969,steps);
   await jump(522,391);await jump(900,302);
   await gate(1420,high);
  }
  await jump(577,390);await highGuard('natlan-high-mark-2');
  await jump(715,300);await walk(938);await highGuard('natlan-high-mark-3');
  await count(3,'high');
  await walk(1534);await grounded(390);
  await inspect(1534,4,'high');await count(2);
  await gate(1728,summit);
  await gate(1292,meet);
  await inspect(431,3);
  await jump(847,390);
  await inspect(847,4);
  await screenshot('match-card');
  await gate(1437,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,expectedReward);
  await saveReload(hub);
  if(earned){
   assert.equal((await frame()).progression.level,103);
   assert.equal((await record()).status,'complete');
   assert.equal((await frame()).returns,0);
   const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
   await fs.writeFile(work+'/two-trials-browser-complete.json',saved+'\n');
  }
  await gate(1314,meet);
  await jump(847,390);
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.includes('旅人 対 ムアラニ'));
  assert.deepEqual(errors,[]);
  const proof={waterThenHigh:true,realMovingDeck:true,bankRescue:true,rockRouteBoardsFinalRaft:true,
    waterSavedBeforeHigh:true,highStepsAndThreeGuards:true,threeMarksAndMatchCard:true,
    shortcutAndReadback:true,riverside,commands,reward,boardingHud:true,
    ...(earned?{levels:[start.progression.level,after.progression.level],restoredHighSweep:true}:{}),errors};
  await fs.writeFile(earned?'evidence/earned-natlan-two-trials-browser.json':prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,river:f?.storyRiverDecks,quest:f?.story.quests['natlan-two-trials']};
  }),errors);
  throw error;
}finally{await browser.close()}
