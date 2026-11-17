import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const id='liyue-market-delivery';
const row=page.locator('[data-quest="liyue-market-delivery"]');
const beidou=page.locator('[data-quest="beidou-join"]');
const canvas=page.locator('#game');
const frame=()=>page.evaluate(()=>window.lab.frame);
const shop=page.locator('#storyDelivery');

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
async function through(target){
 await page.waitForFunction(target=>{
  const portal=window.lab.frame.storyNearbyPortal;
  return portal?.to===target&&portal.available;
 },target);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(target=>window.lab.frame.story.node===target,target);
}
async function deliver(label,n){
 await shop.getByRole('button',{name:'荷札「'+label+'」を渡す',exact:true}).click();
 await page.waitForFunction(({id,n})=>window.lab.frame.story.quests[id].count===n,{id,n});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/liyue-m01-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.story.node==='liyue-harbor');
 await page.waitForSelector('[data-quest="beidou-join"][data-status="locked"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForSelector('[data-quest="beidou-join"][data-status="unaccepted"]');
 await row.getByRole('button',{name:'この依頼を追跡',exact:true}).click();

 await walk(245);
 await shop.getByRole('button',{name:'荷札「器」を渡す',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#storyDeliveryResult').textContent.includes('もう一度'));
 assert.equal((await frame()).story.quests[id].count,0);
 await deliver('鍋',1);
 assert.deepEqual((await frame()).storyShopStock,{pot:true,vessel:false,wheel:false});
 await walk(615);
 await deliver('器',2);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 assert.deepEqual((await frame()).storyShopStock,{pot:true,vessel:true,wheel:false});

 await walk(400);
 await through('liyue-loading-yard');
 await walk(432,true);
 await focus();
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(id=>window.lab.frame.story.quests[id].delivery.guardCleared,id);
 }finally{await page.keyboard.up('KeyJ')}
 await walk(735);
 await focus();
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(()=>window.lab.frame.storyNearbyParcel?.name==='車輪の荷箱');
 }finally{await page.keyboard.up('Space')}
 await page.keyboard.press('KeyG');
 await page.waitForFunction(id=>window.lab.frame.story.quests[id].delivery.recovered,id);
 await walk(106);
 await through('liyue-harbor');
 await walk(1050);
 await shop.getByRole('button',{name:'荷札「車輪」を渡す'}).waitFor();
 await page.locator('.game').screenshot({path:'evidence/liyue-m01-delivery.png'});
 await deliver('車輪',3);
 await page.waitForSelector('[data-quest="liyue-market-delivery"][data-status="ready"]');
 assert.deepEqual((await frame()).storyShopStock,{pot:true,vessel:true,wheel:true});
 assert.equal(await page.locator('#storyDeliveryResult').isVisible(),false);

 const before=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="liyue-market-delivery"][data-status="complete"]');
 const paid=await frame();
 assert.match(await row.innerText(),/石切り場/);
 assert.equal(paid.mora-before.mora,300);
 assert.equal(paid.progression.questXp-before.progression.questXp,2200);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 assert.equal((await frame()).story.quests[id].status,'complete');
 assert.deepEqual((await frame()).storyShopStock,{pot:true,vessel:true,wheel:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-m01-browser.json',JSON.stringify({
  errors,wrongLabelRejected:true,delivered:['鍋','器','車輪'],guardedJumpCache:true,
  stockedThreeStalls:true,partialSave:true,beidouQuestOpensOnAcceptance:true,
  report:{xp:2200,mora:300},completeSave:true,mobileWidth:true
 },null,2)+'\n');
 console.log('Liyue M01 browser matching labels, guarded crate, report and reload passed');
}finally{await browser.close()}
