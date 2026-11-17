import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const qid='liyue-caravan-search';
const quest=page.locator('[data-quest="liyue-caravan-search"]');
const canvas=page.locator('#game');
const frame=()=>page.evaluate(()=>window.lab.frame);
const current=id=>page.waitForFunction(id=>window.lab.frame.story.node===id,id);
async function focus(){
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
}
async function walk(x,attack=false){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await focus();
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
async function through(id){
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.keyboard.press('KeyF');
 await current(id);
}
const progress=n=>page.waitForFunction(n=>window.lab.frame.story.quests['liyue-caravan-search'].count===n,n);

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/liyue-m02-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current('liyue-harbor');
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await walk(955);
 await through('liyue-river-trail');
 await walk(680,true);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyClue?.id==='cart-ruts');
 await page.keyboard.press('KeyG');
 await progress(1);
 await walk(1655,true);
 await through('liyue-quarry-post');
 await walk(385);
 const talk=page.getByRole('button',{name:'G：詰所の商隊と話す',exact:true});
 await talk.click();
 await progress(2);
 assert.equal((await frame()).story.quests[qid].inspected.caravan,true);
 await walk(870,true);
 await focus();
 await page.keyboard.down('KeyJ');
 try{
  await progress(3);
 }finally{await page.keyboard.up('KeyJ')}
 await page.waitForSelector('[data-quest="liyue-caravan-search"][data-status="ready"]');
 assert.equal(await quest.getByRole('button',{name:'報告',exact:true}).isEnabled(),false);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['liyuequarry','ready']);
 await walk(1655);
 assert.match(await page.locator('#nearbyPortalGo').innerText(),/昇降台に乗る/);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.lab.frame.storyLift?.seconds===2);
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 assert.match(await page.locator('#storyLiftText').innerText(),/昇降台で移動中.*港の広場/);
 assert.ok((await frame()).actors.every(actor=>actor.walk===0));
 await page.waitForFunction(()=>!document.querySelector('#trackedQuestText').textContent.includes('次の門'));
 await page.locator('.game').screenshot({path:'evidence/liyue-m02-lift.png'});
 await page.keyboard.press('KeyP');
 await current('liyue-harbor');
 const before=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="liyue-caravan-search"][data-status="complete"]');
 assert.match(await quest.innerText(),/奥の扉/);
 const paid=await frame();
 assert.equal(paid.mora-before.mora,380);
 assert.equal(paid.progression.questXp-before.progression.questXp,3000);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 assert.equal((await frame()).story.quests[qid].status,'complete');
 await walk(1165);
 await through('liyue-quarry-post');
 assert.equal((await frame()).total,0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-m02-browser.json',JSON.stringify({errors,riverTrail:true,
  caravanTalk:true,namedGuard:true,liftPanelAndPause:true,savedSafeReturn:true,
  reward:{xp:3000,mora:380},mobileWidth:true,background},null,2)+'\n');
 console.log('Liyue M02 browser clue, caravan, combat, lift, report and reload passed');
}finally{await browser.close()}
