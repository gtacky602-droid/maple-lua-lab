import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const root=process.env.LAB_URL||'http://127.0.0.1:8769';
const qid='mond-rest-stop', town='mond-town', road='mond-road', site='mond-roadside-rest';
const sprite='noelle-rest-poses-source-v1.png';
const canvas=page.locator('#game'), quest=page.locator(`[data-quest="${qid}"]`);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const frame=()=>page.evaluate(()=>window.lab.frame);
const current=id=>page.waitForFunction(id=>window.lab.frame.story.node===id,id);
const progress=n=>page.waitForFunction(({qid,n})=>window.lab.frame.story.quests[qid]?.count===n,{qid,n});
const button=name=>page.getByRole('button',{name,exact:true});

async function walk(x,attack=false){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
 if(attack)await page.keyboard.down('KeyJ');
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-7:a.x<=x+7;
  },{x,east});
 }finally{
  await page.keyboard.up(key);
  if(attack)await page.keyboard.up('KeyJ');
 }
}

async function gate(id,available=true){
 await page.waitForFunction(({id,available})=>{
  const near=window.lab.frame.storyNearbyPortal;
  return near?.to===id&&near.available===available;
 },{id,available});
}

async function through(id){
 await gate(id);
 await page.keyboard.press('KeyF');
 await current(id);
}

async function reachRest(){
 await walk(1380);
 await through(road);
 await walk(550,true);
 await through(site);
}

async function defeat(x,id){
 await walk(x,true);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(({qid,id})=>window.lab.frame.story.quests[qid]?.rest.defeated[id],{qid,id});
 }finally{await page.keyboard.up('KeyJ')}
}

async function inspect(x,label){
 await walk(x);
 await button('G：'+label).click();
}

async function land(y,drop=false){
 await canvas.click();
 if(drop)await page.keyboard.down('KeyS');
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(y=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return a.ground&&a.y===y;
  },y);
 }finally{
  await page.keyboard.up('Space');
  if(drop)await page.keyboard.up('KeyS');
 }
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/mondstadt-s01-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(town);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await reachRest();
 assert.equal(await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame).key;
 }),'mondrest');
 await defeat(315,'mond-rest-slime');
 await defeat(755,'mond-rest-hilichurl');
 await progress(1);
 await walk(745);
 await canvas.screenshot({path:'evidence/mondstadt-s01-before.png'});
 const standing=(await frame()).draws.find(d=>d.source===sprite);
 assert.equal(standing?.h,88);
 await walk(515);
 await land(392);
 await button('G：ベンチ用の板を拾う').click();
 await progress(2);
 await land(480,true);
 await inspect(750,'落ち葉を掃除する');
 await progress(3);
 await inspect(925,'ノエルに声をかける');
 await progress(4);
 await inspect(1050,'ノエルの椅子を置く');
 await progress(5);
 const seated=(await frame()).draws.find(d=>d.source===sprite);
 assert.ok(seated?.h<standing.h&&seated.box[0]>standing.box[0]);
 await inspect(990,'お茶を飲んで休む');
 await page.waitForFunction(()=>document.querySelector('#storyForest').textContent.includes('お茶'));
 await walk(860);
 await canvas.screenshot({path:'evidence/mondstadt-s01-after.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(sprite=>!window.lab.frame.draws.some(d=>d.source===sprite),sprite);
 const standard=(await frame()).commands;
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(standard=>window.lab.frame.commands<standard,standard);
 const light=(await frame()).commands;
 await canvas.screenshot({path:'evidence/mondstadt-s01-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await walk(110);
 await through(road);
 await walk(110,true);
 await through(town);
 assert.match(await quest.innerText(),/26EXP \/ 120モラ/);
 const before=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(qid=>window.lab.frame.story.quests[qid].status==='complete',qid);
 const after=await frame();
 assert.equal(after.progression.questXp-before.progression.questXp,26);
 assert.equal(after.mora-before.mora,120);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await current(town);
 await reachRest();
 assert.equal((await frame()).storyRest.ready,true);
 assert.equal((await frame()).total,0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-s01-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, platform_jump_and_guards:true, quest_and_room_restore:true,
  dedicated_temporary_background:true, standing_and_seated_png:true,
  same_scene_commands:{standard,light}, report:{xp:26,mora:120},viewport_390:true,errors
 },null,2)+'\n');
 console.log('Mondstadt S01 Chrome route, chair, PNG/rectangle comparison, report and restore passed');
}catch(error){
 console.error(await page.evaluate(qid=>({
  status:document.querySelector('#status')?.textContent,
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests[qid],
  nearby:window.lab?.frame.storyNearbyRest??window.lab?.frame.storyNearbyPortal,
  actor:window.lab?.frame.actors[0],
 }),qid),errors);
 throw error;
}finally{await browser.close()}
