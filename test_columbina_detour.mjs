import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const town='nod-town',coast='nod-workshop-coast',market='nod-night-stalls',bend='nod-detour-shore',rest='nod-far-sea-bench';
const quest='columbina-coast-detour',main='nod-first-treasure',prefix='evidence/columbina-detour';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value,timeout=23000)=>page.waitForFunction(fn,value,{timeout});
const at=id=>wait(id=>window.lab?.frame?.story?.node===id,id);
const count=(n,id=quest,ms)=>wait(({id,n})=>window.lab.frame.story.quests[id]?.count===n,{id,n},ms);
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1],east=x>a.x;
  if(Math.abs(a.x-x)<8)return;
  const dir=east?'KeyD':'KeyA';
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
  try{await wait(y=>{const a=window.lab.frame.actors[0];return a.ground&&a.y===y},y)}
  finally{await page.keyboard.up('Space')}
}

async function gate(x,node){
  await walk(x);
  await wait(node=>{const p=window.lab.frame.storyNearbyPortal;return p?.available&&p.to===node},node);
  await key('KeyF');
  await at(node);
}

async function inspect(x,n,id=quest){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  if(n!==undefined)await count(n,id);
}

async function questButton(name,status,id=quest){
  await page.locator(`[data-quest="${id}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function auto(on){
  if((await frame()).auto===on)return;
  await page.locator('#auto').click();
  await wait(on=>window.lab.frame.auto===on,on);
}

async function scene(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='coastal-gifts-source-v1.png')&&
    png.draws.some(d=>d.source==='columbina-idle-source-v3.png'));
  await screenshot('bench-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*12,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.66,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.coastDetourRest.gift===png.coastDetourRest.gift));
  await screenshot('bench-light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function saveReload(){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8903/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/columbina-detour-fixture.json','utf8');
  const lua=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  assert.ok(!(await frame()).storyGraph.quests.some(q=>q.id==='columbina-join'));
  await questButton('受注','active',main);
  await inspect(320,1,main);
  await gate(1160,coast);
  await page.waitForSelector(`[data-quest="${quest}"][data-status="locked"]`);
  await inspect(540,2,main);
  await questButton('受注','active');
  await inspect(579,1);
  await gate(913,market);
  const marketScene=await scene();
  assert.deepEqual(marketScene,{key:'nodNightStalls',file:'nod-night-stalls-background-v1.png',state:'ready'});
  await walk(674);
  const wares=(await frame()).draws.filter(d=>d.source==='coastal-gifts-source-v1.png');
  assert.equal(wares.length,3);
  assert.equal(new Set(wares.map(d=>d.box[0])).size,3);
  await screenshot('market');
  await inspect(717,2);
  assert.equal((await frame()).story.quests[quest].storyChoice,'chime');
  await gate(1370,bend);
  await walk(470);
  await auto(true);
  await count(3,quest,45000);
  await auto(false);
  await gate(1447,rest);
  const restScene=await scene();
  assert.deepEqual(restScene,{key:'nodFarSea',file:'nod-far-sea-background-v1.png',state:'ready'});
  await jump(777,386);
  await inspect(777,4);
  await wait(()=>window.lab.frame.storyResonanceCue?.pattern==='海辺の風鈴');
  const commands=await compare();
  await inspect(1116,5);
  await gate(1432,coast);
  const before=await frame();
  await questButton('報告','complete');
  const reported=await frame();
  const reward=[reported.progression.questXp-before.progression.questXp,reported.mora-before.mora];
  assert.deepEqual(reward,lua.reward);
  assert.equal(reported.story.quests[main].count,2);
  assert.ok(reported.storyJoined.columbina);
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name:'コロンビーナを同行に選ぶ'}).click();
  await wait(()=>window.lab.frame.companion?.id==='columbina'&&window.lab.frame.starterEquipment);
  const joined=await frame();
  assert.deepEqual([joined.actors[1].atk,joined.actors[1].maxhp],lua.identicalStarterStats);
  assert.equal(joined.actors.length,2);
  await saveReload();
  assert.equal((await frame()).companion.id,'columbina');
  await gate(1160,coast);
  await gate(1122,rest);
  await walk(962);
  assert.equal((await frame()).coastDetourRest.gift,'chime');
  assert.equal((await frame()).draws.filter(d=>d.source==='columbina-idle-source-v3.png').length,1);
  await screenshot('revisit');
  assert.deepEqual(errors,[]);
  const proof={afterFirstMeeting:true,threeVisibleWares:true,choice:'chime',fightAndRest:true,restCue:true,
    joinedAndStarter:true,reloadAndReturn:true,mainUnfinished:true,marketScene,restScene,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,rest:f?.coastDetourRest,auto:f?.auto};
  }),errors);
  throw error;
}finally{await browser.close()}
