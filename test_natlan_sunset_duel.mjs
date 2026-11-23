import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub',meet='natlan-duel-entry',review='natlan-sunset-review';
const arena='natlan-sunset-arena',rostrum='natlan-sunset-rostrum',quest='natlan-sunset-duel';
const boss='original-river-racer';
const prefix='evidence/natlan-sunset-duel';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg,timeout=18000)=>page.waitForFunction(fn,arg,{timeout});
const nodeIs=node=>wait(id=>window.lab?.frame?.story?.node===id,node);
const count=(n,timeout)=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n},timeout);
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

async function jump(x,y){
  await walk(x);
  await canvas.click();
  await page.keyboard.down('Space');
  try{
    await wait(y=>window.lab.frame.actors[0].ground&&window.lab.frame.actors[0].y===y,y);
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

async function inspect(x,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  await count(n);
}

async function questButton(name,status){
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
}

async function auto(on){
  if((await frame()).auto===on)return;
  await page.locator('#auto').click();
  await wait(on=>window.lab.frame.auto===on,on);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='river-racer-source-v1.png'&&d.h===103));
  await screenshot('png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyDuel.phase===png.storyDuel.phase));
  await screenshot('light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
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

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8894/');
  await wait(()=>window.lab?.frame);
  const raw=await fs.readFile('work/natlan-sunset-duel-fixture.json','utf8');
  const luaProof=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  await page.locator('#loadProgress').click();
  await nodeIs(hub);
  await questButton('受注','active');
  await gate(1314,meet);
  await inspect(418,1);
  await gate(1240,review);
  await jump(801,390);
  await inspect(801,2);
  await gate(1412,arena);
  await wait(()=>window.lab.frame.storyDuel?.phase==='warning');
  const scene=await page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scene,{key:'natlanSunset',file:'natlan-sunset-arena-background-v1.png',state:'ready'});
  await wait(()=>window.lab.frame.storyDuel?.phase==='out');
  const charge=await frame();
  assert.equal(charge.storyDuel.move,'SR01');
  await wait(x=>{
    const duel=window.lab.frame.storyDuel;
    return duel?.phase==='out'&&Math.abs(duel.x-x)>30;
  },charge.storyDuel.x);
  await walk(848);
  await wait(()=>window.lab.frame.storyDuel?.phase==='splashWarning'&&window.lab.frame.storyDuel.marks?.length===2);
  const marked=(await frame()).storyDuel.marks.map(mark=>mark.x);
  const commands=await compare();
  await wait(()=>window.lab.frame.storyDuel?.phase==='splash'&&window.lab.frame.storyDuel.marks?.[1]?.state==='active');
  assert.deepEqual((await frame()).storyDuel.marks.map(mark=>mark.x),marked);
  await wait(()=>window.lab.frame.storyDuel?.phase==='splashOpening');
  const beforeWin=(await frame()).progression.questXp;
  await walk(923);
  await auto(true);
  await count(3,40000);
  await auto(false);
  const won=await frame();
  assert.equal(won.progression.questXp-beforeWin,luaProof.firstClearExp);
  assert.equal(won.storyDuel,undefined);
  await inspect(1408,4);
  await gate(1560,rostrum);
  await jump(853,390);
  await inspect(853,5);
  await screenshot('record');
  await gate(1421,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,luaProof.reward);
  await saveReload(hub);
  const savedClear=id=>page.evaluate(id=>{
    const save=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
    return save?.endgame?.bosses[id];
  },id);
  const firstClear=await savedClear(boss);
  assert.equal(firstClear.clears,1);
  assert.ok(firstClear.bestTicks>0);
  await gate(965,arena);
  assert.equal((await frame()).fieldBoss,undefined);
  await walk(322);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='模擬戦をもう一度始める');
  const replayBefore=await frame();
  await key('KeyG');
  await wait(()=>window.lab.frame.storyDuel?.replay);
  await walk(923);
  await auto(true);
  await wait(()=>window.lab.frame.storyNotice?.startsWith('練習の勝負が終わりました'),null,40000);
  await auto(false);
  const replayAfter=await frame();
  assert.equal(replayAfter.progression.questXp,replayBefore.progression.questXp);
  assert.equal(replayAfter.progression.killXp,replayBefore.progression.killXp);
  assert.equal(replayAfter.mora,replayBefore.mora);
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  assert.deepEqual(await savedClear(boss),firstClear);
  assert.deepEqual(errors,[]);
  const proof={firstRunAndReplay:true,warningsAndOpening:true,sameFrameComparison:true,
    moves:['SR01','SR02'],chargeMoved:true,lockedSplashMarks:marked,firstClearSaved:true,
    firstClearExp:luaProof.firstClearExp,recordAndReport:true,noRepeatReward:true,scene,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],duel:f?.storyDuel,field:f?.fieldBoss,
      notice:f?.storyNotice,portal:f?.storyNearbyPortal,milestone:f?.storyNearbyMilestone};
  }),errors);
  throw error;
}finally{await browser.close()}
