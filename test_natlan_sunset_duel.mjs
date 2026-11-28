import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub',meet='natlan-duel-entry',review='natlan-sunset-review';
const arena='natlan-sunset-arena',rostrum='natlan-sunset-rostrum',quest='natlan-sunset-duel';
const boss='original-river-racer';
const checkpoint=process.env.LAB_SUNSET_CHECKPOINT;
const prefix=process.env.LAB_SUNSET_OUTPUT||'evidence/natlan-sunset-duel';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const hud=page.locator('#storyDuelCue');
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
  const cue=await hud.innerText();
  assert.match(cue,/時間差の水柱を予告 あと\d\.\d秒.*番号のついた印から横へ離れる/);
  await screenshot('png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await screenshot('standard');
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyDuel.phase===png.storyDuel.phase));
  assert.ok([standard,light].every(f=>f.storyDuel.remaining===png.storyDuel.remaining));
  assert.equal(await hud.innerText(),cue);
  await screenshot('light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands,cue};
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
  const raw=await fs.readFile(checkpoint||'work/natlan-sunset-duel-fixture.json','utf8');
  const luaProof=JSON.parse(await fs.readFile('evidence/natlan-sunset-duel-lua.json','utf8'));
  const source=JSON.parse(raw);
  assert.equal(source.story.quests[quest],undefined);
  assert.equal(source.story.quests['natlan-two-trials'].status,'complete');
  const startLevel=source.progression.level;
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  await page.locator('#loadProgress').click();
  await nodeIs(hub);
  assert.equal((await frame()).progression.level,startLevel);
  await questButton('受注','active');
  await gate(1314,meet);
  await inspect(418,1);
  await gate(1240,review);
  await jump(801,390);
  await inspect(801,2);
  await gate(1412,arena);
  await wait(()=>window.lab.frame.storyDuel?.phase==='warning');
  assert.match(await hud.innerText(),/往復突進の予告 あと\d\.\d秒.*上段の岩棚へジャンプ/);
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
  assert.match(await hud.innerText(),/反撃の間 あと\d\.\d秒.*水走者が止まっている間に攻撃/);
  const beforeWin=(await frame()).progression.questXp;
  await walk(923);
  await auto(true);
  await count(3,40000);
  await auto(false);
  const won=await frame();
  assert.equal(won.progression.questXp-beforeWin,luaProof.firstClearExp);
  assert.equal(won.storyDuel,undefined);
  assert.ok(await hud.isHidden());
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
  const restored=await frame();
  assert.equal(restored.story.quests[quest].status,'complete');
  assert.equal(restored.progression.level,after.progression.level);
  assert.equal(restored.mora,after.mora);
  assert.equal(restored.inventory.upgradeOre,after.inventory.upgradeOre);
  if(checkpoint){
    const postReport=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
    assert.deepEqual(JSON.parse(postReport).story.quests['natlan-two-trials'],source.story.quests['natlan-two-trials']);
    await fs.writeFile(prefix+'-complete.json',postReport+'\n');
  }
  const savedClear=id=>page.evaluate(id=>{
    const save=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
    return save?.endgame?.bosses[id];
  },id);
  const firstClear=await savedClear(boss);
  assert.equal(firstClear.clears,1);
  assert.ok(firstClear.bestTicks>0);
  await gate(775,rostrum);
  await jump(853,390);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='夕映えの勝負の記録を読む');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.startsWith('夕映えの記録'));
  const restoredRecord=(await frame()).storyNotice;
  await gate(1421,hub);
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
  assert.equal(replayAfter.inventory.upgradeOre,replayBefore.inventory.upgradeOre);
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  assert.deepEqual(await savedClear(boss),firstClear);
  assert.deepEqual(errors,[]);
  const proof={firstRunAndReplay:true,warningsAndOpening:true,sameFrameComparison:true,
    moves:['SR01','SR02'],chargeMoved:true,lockedSplashMarks:marked,firstClearSaved:true,
    firstClearExp:luaProof.firstClearExp,recordAndReport:true,noRepeatReward:true,scene,commands,reward,
    sourceSha256:createHash('sha256').update(raw).digest('hex'),
    startLevel,reportedLevel:after.progression.level,restoredRecord,firstClear,errors};
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
