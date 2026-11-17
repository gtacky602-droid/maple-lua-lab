import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const qid='liyue-harbor-meal', harbor='liyue-harbor', river='liyue-river-trail';
const cliff='liyue-cliff-planks', field='liyue-field';
const quest=page.locator(`[data-quest="${qid}"]`), canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const frame=()=>page.evaluate(()=>window.lab.frame);
const current=id=>page.waitForFunction(id=>window.lab?.frame.story.node===id,id);
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
async function jump(y){
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(y=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return a.ground&&a.y===y;
  },y);
 }finally{await page.keyboard.up('Space')}
}
async function through(id){
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.keyboard.press('KeyF');
 await current(id);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/liyue-s02-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(harbor);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await walk(955);
 await through(river);
 await walk(365,true);
 await button('G：川魚を集める').click();
 await progress(1);
 await walk(110);
 await through(harbor);
 await walk(490);
 await jump(350);
 await through(cliff);
 await walk(510,true);
 await jump(395);
 await jump(305);
 await walk(560);
 await page.keyboard.press('KeyG');
 await progress(2);
 await walk(110);
 await through(harbor);
 await walk(1380);
 await through(field);
 await walk(270);
 await button('G：木陰のキノコを集める').click();
 await progress(3);
 await walk(110);
 await through(harbor);
 await walk(245);
 assert.match(await page.locator('#storyCookingText').innerText(),/片手で食べられる/);
 await button('ピリ辛').click();
 await progress(4);
 assert.match(await page.locator('#storyCookingText').innerText(),/ピリ辛の山海包みができました/);
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
 await page.waitForFunction(()=>window.lab.frame.storyCooking?.stock===1);
 await page.locator('.game').screenshot({path:'evidence/liyue-s02-stall.png'});
 const cash=(await frame()).mora;
 await button('購入（45モラ）').click();
 await page.waitForFunction(()=>window.lab.frame.storyCooking?.stock===2);
 assert.equal((await frame()).mora,cash-45);
 await walk(955);
 await through(river);
 assert.equal(await button('購入（45モラ）').count(),0);
 assert.ok(await button('食べる').isDisabled());
 assert.equal((await frame()).storyCooking.stock,2);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 assert.equal((await frame()).storyCooking.meal,'ピリ辛の山海包み');
 assert.equal((await frame()).storyCooking.stock,2);
 assert.equal((await frame()).story.node,harbor);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-s02-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, all_three_ingredients:true, stall_choice:'spicy',
  report_and_buy:true, full_hp_blocks_consumption:true, stock_available_on_the_road:true,
  save_restore:true, viewport_390:true, errors
 },null,2)+'\n');
 console.log('Liyue S02 Chrome gathering, recipe choice, purchase and save passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  status:document.querySelector('#status')?.textContent,
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests['liyue-harbor-meal'],
  cooking:window.lab?.frame.storyCooking,
 })),errors);
 throw error;
}finally{await browser.close()}
