import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='fontaine-hub',watch='fontaine-stage-watch',wing='fontaine-scenery-booth';
const runway='fontaine-grand-stage-approach',arena='fontaine-grand-stage',quest='fontaine-grand-finale';
const prefix='evidence/fontaine-finale';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg,timeout=16000)=>page.waitForFunction(fn,arg,{timeout});
const nodeIs=node=>wait(id=>window.lab?.frame?.story?.node===id,node);
const count=(n,timeout)=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n},timeout);
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});
const cue=phase=>wait(phase=>window.lab.frame.storyTheaterPerformance?.phase===phase,phase);

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

async function scene(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function choose(text){
  await wait(()=>window.lab.frame.storyAirflow);
  await key('KeyG');
  await wait(text=>window.lab.frame.storyAirflow?.selection===text,text);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='grand-finale-source-v1.png'&&d.h===167));
  await screenshot('boss-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.fieldBoss.hp===png.fieldBoss.hp));
  await screenshot('boss-light');
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

async function auto(on){
  if((await frame()).auto===on)return;
  await page.locator('#auto').click();
  await wait(on=>window.lab.frame.auto===on,on);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8875/');
  await wait(()=>window.lab?.frame);
  const raw=await fs.readFile('work/fontaine-finale-fixture.json','utf8');
  const luaProof=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  await page.locator('#loadProgress').click();
  await nodeIs(hub);
  await questButton('受注','active');
  await gate(1171,watch);
  await walk(424);
  assert.ok((await frame()).draws.some(d=>d.kind==='text'&&d.text==='エミリエ'));
  await inspect(424,1);
  await gate(1157,wing);
  await walk(700);
  await choose('波板を立てて作業床を守る');
  await choose('床板を伸ばして上段を広げる');
  await page.locator('#airflowCommit').click();
  await count(2);
  await saveReload(watch);
  await gate(1157,wing);
  await gate(1310,runway);
  assert.equal((await frame()).storyStageLayout,'deck');
  await jump(570,391);
  await walk(972);await key('KeyJ');
  await walk(1350);
  await canvas.click();
  await page.keyboard.down('ArrowDown');
  try{await page.keyboard.press('Space')}
  finally{await page.keyboard.up('ArrowDown')}
  await wait(()=>window.lab.frame.actors[0].ground&&window.lab.frame.actors[0].y===480);
  await key('KeyJ');await auto(true);
  await count(3);
  await auto(false);
  await gate(1719,arena);
  const stageScene=await scene();
  assert.deepEqual(stageScene,{key:'fontaineGrandStage',file:'fontaine-grand-stage-background-v1.png',state:'ready'});
  await walk(858);
  await wait(()=>window.lab.frame.fieldBoss?.label==='外装の駆動部');
  const commands=await compare();
  await walk(910);
  const beforeClear=(await frame()).progression.questXp;
  await auto(true);
  await count(4,35000);
  await auto(false);
  await wait(xp=>window.lab.frame.progression.questXp===xp,beforeClear+luaProof.firstClearExp);
  assert.equal((await frame()).fieldBoss,undefined);
  await inspect(1176,5);
  await wait(()=>window.lab.frame.draws.filter(d=>d.color==='#d995a3').length>=5);
  await screenshot('shutdown');
  await jump(1447,390);
  await key('KeyG');
  await cue('wait');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.includes('まだ合図の前'));
  await count(5);
  await cue('cue');
  await key('KeyG');
  await count(6);
  await cue('performed');
  await gate(1602,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,luaProof.reward);
  await saveReload(hub);
  await gate(1320,arena);
  await jump(1447,390);
  await cue('performed');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.startsWith('主舞台の記録'));
  assert.equal((await frame()).fieldBoss,undefined);
  await screenshot('show');
  assert.deepEqual(errors,[]);
  const proof={evacuation:true,deckAfterReload:true,twoGuardLevels:true,scene:stageScene,commands,
    firstClearExp:luaProof.firstClearExp,shutdownConfetti:true,earlyCueRejected:true,performance:true,
    performanceAfterReload:true,noBossAfterShow:true,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],scene:f?.storyTheaterPerformance,fieldBoss:f?.fieldBoss,
      notice:f?.storyNotice,portal:f?.storyNearbyPortal,milestone:f?.storyNearbyMilestone,
      quest:f?.story.quests['fontaine-grand-finale'],platforms:f?.platforms};
  }),errors);
  throw error;
}finally{await browser.close()}
