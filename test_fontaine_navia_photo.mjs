import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='fontaine-hub',terrace='fon-photo-terrace',quest='fon-navia-photo',prefix='evidence/fon-navia-photo';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),panel=page.locator('#groupPhoto'),errors=[];
const confirm=page.locator('#groupPhotoConfirm');
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:24000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const shot=(name,locator=page.locator('.game'))=>locator.screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
 await canvas.click();
 await page.keyboard.press(code);
}

async function walk(x){
 const f=await frame(),actor=f.actors[f.active-1],right=x>actor.x;
 if(Math.abs(actor.x-x)<8)return;
 await canvas.click();
 const code=right?'KeyD':'KeyA';
 await page.keyboard.down(code);
 try{
  await wait(({x,right})=>{
   const f=window.lab.frame,actor=f.actors[f.active-1];
   return right?actor.x>=x-7:actor.x<=x+7;
  },{x,right});
 }finally{await page.keyboard.up(code)}
}

async function gate(x,node){
 await walk(x);
 await wait(node=>{
  const p=window.lab.frame.storyNearbyPortal;
  return p?.to===node&&p.available;
 },node);
 await key('KeyF');
 await at(node);
}

async function collect(x,label){
 await walk(x);
 await wait(label=>window.lab.frame.storyNearbyMilestone?.label===label,label);
 await key('KeyG');
}

const questButton=name=>page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();

async function load(){
 await page.locator('#loadProgress').click();
 await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 await at(hub);
}

async function reload(){
 await page.locator('#saveProgress').click();
 await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load();
}

async function compareTerrace(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.equal(png.draws.filter(d=>d.source==='fon-navia-people-props-source-v1.png').length,3);
 await shot('terrace-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('terrace-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8923/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile('work/fon-navia-photo-fixture.json','utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 await questButton('受注');
 await count(0);
 await gate(316,terrace);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(background,{key:'fontainePhotoTerrace',file:'fon-navia-photo-terrace-background-v1.png',state:'ready'});

 const errands=[
  [210,'ナヴィアに話を聞く'],[365,'荷受けの木箱を持つ'],[547,'荷置き場に箱を置く'],
  [720,'配達札を受け取りと配達に分ける'],[897,'カメラの台を支えて整備士を手伝う'],
 ];
 for(let i=0;i<errands.length;i++){
  await collect(...errands[i]);
  await count(i+1);
 }
 await collect(1066,'椅子と台を並べる');
 await panel.waitFor();
 assert.equal(await confirm.isDisabled(),true);
 await shot('occluded',panel);
 await page.locator('#groupPhotoSeat').selectOption('side');
 await wait(()=>window.lab.frame.storyNaviaPhoto?.ready);
 assert.equal(await confirm.isEnabled(),true);
 await reload();
 await gate(316,terrace);
 await collect(1066,'椅子と台を並べる');
 await panel.waitFor();
 assert.equal(await page.locator('#groupPhotoSeat').inputValue(),'side');
 await confirm.click();
 await count(6);
 await panel.waitFor({state:'hidden'});

 await collect(1066,'タイマーを巻く');
 await wait(()=>window.lab.frame.storyNaviaPhoto?.remaining>0);
 await wait(()=>window.lab.frame.storyNotice.includes('間に合いません'));
 await collect(1066,'タイマーを巻く');
 await wait(()=>window.lab.frame.storyNaviaPhoto?.remaining>0);
 await walk(1442);
 await count(7);
 const calls=await compareTerrace();
 await collect(1724,'二枚の写真を見比べる');
 await panel.getByRole('heading',{name:'掲示する写真を選ぶ'}).waitFor();
 assert.equal(await panel.locator('figure:visible').count(),2);
 await shot('selection',panel);
 await page.setViewportSize({width:390,height:844});
 const width=await panel.evaluate(el=>[el.clientWidth,el.scrollWidth]);
 assert.equal(width[0],width[1]);
 await page.setViewportSize({width:1280,height:960});
 await panel.getByRole('button',{name:'休憩写真を掲示する'}).click();
 await count(8);
 await gate(1843,hub);
 await questButton('報告');
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 await reload();
 await gate(316,terrace);
 await collect(1724,'掲示した集合写真を見る');
 await panel.getByRole('heading',{name:'水路の写真掲示板'}).waitFor();
 assert.equal(await panel.locator('figure:visible').count(),1);
 assert.equal(await panel.locator('figcaption:visible').textContent(),'菓子を囲む休憩写真');
 await shot('posted',panel);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-web.json',JSON.stringify({
  quest,background,positionAdjustedAndRestored:true,timerRetriedAndWalked:true,
  postedAfterReportAndReload:true,mobileWidth:390,calls,errors
 },null,2)+'\n');
 console.log(quest,calls);
}catch(error){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,state:f?.story?.quests?.['fon-navia-photo'],
   view:f?.storyNaviaPhoto,near:f?.storyNearbyMilestone};
 }));
 throw error;
}finally{
 await browser.close();
}
