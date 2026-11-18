import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='nod-moon-bloom',hub='nod-bloom-gate',trail='nod-bloom-trail',grove='nod-bloom-grove';
const prefix='evidence/nod-moon-bloom';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value,timeout=23000)=>page.waitForFunction(fn,value,{timeout});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=(n,timeout)=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n},timeout);
const ground=y=>wait(y=>{const a=window.lab.frame.actors[0];return a.ground&&a.y===y},y);
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

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
  try{await ground(y)}finally{await page.keyboard.up('Space')}
}

async function gate(x,node){
  await walk(x);
  await wait(node=>{const p=window.lab.frame.storyNearbyPortal;return p?.available&&p.to===node},node);
  await key('KeyF');
  await at(node);
}

async function inspect(x,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  if(n!==undefined)await count(n);
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

async function scenery(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function compare(){
  await walk(910);
  await wait(()=>window.lab.frame.actors.every(a=>a.walk===0));
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  const size=src=>png.draws.filter(d=>d.source===`nod-moon-bloom-${src}-source-v1.png`).map(d=>d.h).sort((a,b)=>a-b);
  assert.deepEqual(size('plants'),[38,82,120]);
  assert.deepEqual(size('wildlife'),[30,38]);
  await shot('view-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*12,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.66,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyBloom.decorated));
  await shot('view-light');
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
  await at(hub);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8906/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/nod-moon-bloom-fixture.json','utf8');
  const lua=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at('nod-town');
  await gate(371,hub);
  await questButton('受注','active');
  await inspect(270,1);
  await gate(1090,trail);
  const trailScene=await scenery();
  assert.deepEqual(trailScene,{key:'nodMoonWood',file:'nod-moon-wood-background-v1.png',state:'ready'});
  await walk(1485);
  await wait(node=>{const p=window.lab.frame.storyNearbyPortal;return p?.to===node&&!p.available},grove);
  await walk(560);
  await auto(true);
  await count(2,65000);
  await auto(false);
  await gate(1485,grove);
  const groveScene=await scenery();
  assert.deepEqual(groveScene,{key:'nodBloomGrove',file:'nod-moon-bloom-background-v1.png',state:'ready'});
  assert.ok(!(await frame()).storyBloom.opened);
  assert.equal((await frame()).total,0);
  await inspect(315,3);
  await jump(526,386);
  await inspect(668,4);
  await walk(721);
  await wait(()=>window.lab.frame.actors.every(a=>a.ground&&a.y===386));
  await shot('closed');
  await walk(464);
  await ground(480);
  await inspect(464,5);
  assert.ok((await frame()).storyBloom.nearSeats);
  await jump(526,386);
  await jump(874,290);
  await inspect(1018,6);
  assert.ok((await frame()).storyBloom.opened);
  await wait(()=>window.lab.frame.actors.every(a=>a.ground&&a.y===290));
  await inspect(1240,7);
  const commands=await compare();
  await gate(1352,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,lua.reportReward);
  await saveReload();
  await gate(794,grove);
  await ground(290);
  assert.ok((await frame()).storyBloom.decorated);
  await inspect(1240);
  await wait(()=>window.lab.frame.storyNotice?.includes('体力を回復しました'));
  await shot('revisit');
  assert.deepEqual(errors,[]);
  const proof={trailScene,groveScene,closedUntilCleared:true,peacefulGrove:true,lowerAndUpperJump:true,companionClimbed:true,
    openedFromUpperSeat:true,permanentDecoration:true,restAfterReload:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,bloom:f?.storyBloom,total:f?.total,auto:f?.auto};
  }),errors);
  throw error;
}finally{await browser.close()}
