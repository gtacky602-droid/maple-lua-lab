import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub', trail='natlan-kinich-hunt', field='natlan-field';
const quest='natlan-kinich-ambush', prefix='evidence/nat-kinich-ambush';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg,timeout=24000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const questRow=()=>page.locator(`[data-quest="${quest}"]`);
const button=name=>questRow().getByRole('button',{name,exact:true});
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
 await canvas.click();
 await page.keyboard.press(code);
}

async function move(x){
 const f=await frame();
 const here=f.actors[f.active-1].x;
 if(Math.abs(here-x)<8)return;
 const right=x>here,code=right?'KeyD':'KeyA';
 await canvas.click();
 await page.keyboard.down(code);
 try{
  await wait(({x,right})=>{
   const f=window.lab.frame,p=f.actors[f.active-1].x;
   return right?p>=x-5:p<=x+5;
  },{x,right});
 }finally{await page.keyboard.up(code)}
}

async function collect(x,label){
 await move(x);
 await wait(label=>window.lab.frame.storyNearbyMilestone?.label===label,label);
 await key('KeyG');
}

async function gate(x,node){
 await move(x);
 await wait(id=>window.lab.frame.storyNearbyPortal?.to===id&&window.lab.frame.storyNearbyPortal.available,node);
 await key('KeyF');
 await at(node);
}

async function load(seed){
 if(seed)await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await page.locator('#loadProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('保存した進行で町から再開しました'));
 await at(hub);
}

async function begin(seed){
 await load(seed);
 await button('受注').click();
 await collect(392,'キィニチに狩りの話を聞く');
 await count(1);
 await gate(405,trail);
}

async function compare(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.ok(png.draws.some(d=>d.source==='fanged-beast-idle-source-v1.png'));
 assert.ok(png.draws.some(d=>d.source==='nat-kinich-ambush-props-source-v1.png'));
 await shot('trail-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('trail-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.equal(f.camera,png.camera);
  assert.deepEqual(f.storyKinichHunt,png.storyKinichHunt);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

async function fight(x){
 await move(x-45);
 await canvas.click();
 await page.keyboard.down('KeyJ');
 try{
  // Stay near the patrol anchor. On the direct route the beast leaves and comes back.
  await wait(q=>window.lab.frame.story.quests[q]?.count===2,quest,36000);
 }finally{await page.keyboard.up('KeyJ')}
}

async function report(dialogue){
 await gate(60,hub);
 await button('報告').click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await questRow().filter({hasText:dialogue}).waitFor();
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8928/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile('work/nat-kinich-ambush-fixture.json','utf8');
 await begin(seed);
 assert.deepEqual(await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 }),{key:'natlanKinichHunt',file:'nat-kinich-ambush-trail-background-v1.png',state:'ready'});
 await collect(314,'足跡を調べる');
 await collect(425,'折れた枝を調べる');
 await collect(606,'狭い坂道で待ち伏せする');
 await wait(()=>window.lab.frame.storyKinichHunt?.site==='slope');
 await page.locator('#saveProgress').click();
 await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load();
 await gate(405,trail);
 assert.equal((await frame()).storyKinichHunt.site,'slope');
 await move(653);
 await wait(()=>window.lab.frame.storyKinichHunt?.phase==='turn');
 await wait(()=>window.lab.frame.storyKinichHunt?.phase==='engaged');
 const calls=await compare();
 await fight(710);
 assert.equal((await frame()).storyKinichHunt.outcome,'slope');
 await report('狭い坂に進路を絞れた');
 await gate(405,trail);
 assert.equal((await frame()).total,0);
 await gate(2550,field);
 await gate(925,trail);
 assert.equal((await frame()).total,0);

 await begin(seed);
 await fight(876);
 assert.equal((await frame()).storyKinichHunt.outcome,'direct');
 await report('正面から止められるなら');

 await begin(seed);
 await collect(425,'折れた枝を調べる');
 await collect(314,'足跡を調べる');
 await move(1822);
 assert.equal((await frame()).storyNearbyMilestone,undefined);
 await canvas.click();
 await page.keyboard.down('Space');
 try{
  await wait(()=>window.lab.frame.actors[0].y===367&&
   window.lab.frame.storyNearbyMilestone?.label==='上下の岩棚で待ち伏せする');
 }finally{await page.keyboard.up('Space')}
 await key('KeyG');
 await wait(()=>window.lab.frame.storyKinichHunt?.site==='ledges');
 await shot('ledge');
 await page.setViewportSize({width:390,height:844});
 await page.locator('#game').scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 const proof={slopeAfterReload:true,directWithoutClues:true,actualJumpToLedge:true,
   differentDialogue:true,shortcutBothWays:true,mobileFits:true,calls,errors};
 await fs.writeFile(prefix+'-web.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Kinich browser playthrough passed',calls);
}catch(err){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,quest:f?.story?.quests['natlan-kinich-ambush'],camera:f?.camera,actors:f?.actors,
   milestone:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,hunt:f?.storyKinichHunt,paused:f?.paused};
 }));
 await page.screenshot({path:'work/nat-kinich-ambush-failure.png'});
 throw err;
}finally{
 await browser.close();
}
