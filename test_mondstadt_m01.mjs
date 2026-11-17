import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(12000);
const quest=page.locator('[data-quest="amber-join"]');
const canvas=page.locator('#game');
const frame=()=>page.evaluate(()=>window.lab.frame);
const count=async()=>(await frame()).story.quests['amber-join'].count;
const recovered=async()=>Object.keys((await frame()).story.quests['amber-join'].recovered);
const gate=name=>page.getByRole('button',{name:'門：'+name+' Lv1',exact:true});
const current=()=>page.evaluate(()=>window.lab.frame.actors[window.lab.frame.active-1]);

async function focusPlayfield(){
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
}

async function walk(x,{attack=false}={}){
 const actor=await current();
 if(Math.abs(actor.x-x)<10)return;
 await focusPlayfield();
 const east=actor.x<x,key=east?'KeyD':'KeyA';
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

async function fightUntil(needed,timeout=2500){
 await focusPlayfield();
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(n=>window.lab.frame.story.quests['amber-join'].count>=n,needed,{timeout});
  return true;
 }catch(error){
  if(error.name!=='TimeoutError')throw error;
  return false;
 }finally{await page.keyboard.up('KeyJ')}
}

async function collect(id){
 await page.waitForFunction(id=>window.lab.frame.storyNearbyCargo?.id===id,id);
 const button=page.locator('#nearbyCargoGo');
 assert.equal(await button.isVisible(),true);
 if(id==='toolbox')await button.click();
 else await page.keyboard.press('KeyG');
 await page.waitForFunction(id=>window.lab.frame.story.quests['amber-join'].recovered[id],id);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 assert.match(await quest.innerText(),/配達は、スライム待ち！.*アンバー/s);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.filter({hasText:'進行中'}).waitFor();
 await walk(1330);
 await gate('モンド・南の街道').click();
 await page.waitForFunction(()=>window.lab.frame.story.node==='mond-road');
 assert.equal(await page.locator('#nearbyCargo').isVisible(),false);
 await walk(465,{attack:true});
 await focusPlayfield();
 await page.keyboard.press('KeyK');
 for(const x of [500,835,1080]){
  if(await count()===3)break;
  await walk(x,{attack:true});
  if(await fightUntil(3))break;
 }
 assert.equal(await count(),3);
 assert.match(await page.locator('#trackedQuestText').innerText(),/荷物を回収/);

 await walk(335);
 await collect('basket');
 await walk(650);
 assert.equal((await current()).y,480);
 assert.equal(await page.locator('#nearbyCargo').isVisible(),false);
 await focusPlayfield();
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(()=>window.lab.frame.actors[window.lab.frame.active-1].y===390);
 }finally{await page.keyboard.up('Space')}
 await page.waitForFunction(()=>window.lab.frame.storyNearbyCargo?.id==='toolbox');
 await page.locator('.game').screenshot({path:'evidence/mondstadt-m01-cargo.png'});
 await collect('toolbox');
 await walk(975);
 await collect('crate');
 assert.equal((await recovered()).length,3);
 await page.waitForFunction(()=>document.querySelector('#trackedQuestText').textContent.includes('赤い布'));

 await walk(1165,{attack:true});
 assert.ok(await fightUntil(4,7500));
 await page.waitForSelector('[data-quest="amber-join"][data-status="ready"]');
 assert.equal(await quest.getByRole('button',{name:'報告',exact:true}).isEnabled(),false);
 await walk(104);
 await gate('モンド・城門広場').click();
 await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town');
 const before=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="amber-join"][data-status="complete"]');
 const reported=await frame();
 assert.equal(reported.mora-before.mora,100);
 assert.equal(reported.progression.questXp-before.progression.questXp,1000);
 assert.equal(reported.storyJoined.amber,true);
 assert.match(await quest.innerText(),/アンバー加入済み/);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.storyJoined.amber);
 assert.deepEqual((await frame()).story.quests['amber-join'].recovered,{basket:true,toolbox:true,crate:true});
 assert.equal((await frame()).mora,reported.mora);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-m01-browser.json',JSON.stringify({
  errors,protectedCargoBeforeCombat:true,usedJump:true,cargoRecovery:['keyboard G','nearby button'],
  actualCombat:true,finishedAtTown:true,amberJoined:true,reward:{mora:100,xp:1000},saveRestored:true,mobileWidth:true
 },null,2)+'\n');
 console.log('Mondstadt M01: moving, actual combat, jumping, cargo, report, and save passed');
}finally{await browser.close()}
