import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const qid='beidou-join', harbor='liyue-harbor', wharf='liyue-crux-wharf';
const quest=page.locator(`[data-quest="${qid}"]`);
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);

const frame=()=>page.evaluate(()=>window.lab.frame);
const current=id=>page.waitForFunction(id=>window.lab?.frame.story.node===id,id);
const progress=n=>page.waitForFunction(n=>window.lab.frame.story.quests['beidou-join']?.count===n,n);
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
async function through(id){
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.keyboard.press('KeyF');
 await current(id);
}
async function fight(wait){
 await page.keyboard.down('KeyJ');
 try{await wait()}finally{await page.keyboard.up('KeyJ')}
}
async function recover(x,label,n){
 await walk(x);
 const collect=button('G：'+label+'を回収');
 await fight(()=>collect.waitFor());
 await collect.click();
 await progress(n);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/liyue-s01-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(harbor);
 assert.equal(await quest.getAttribute('data-status'),'locked');
 await page.locator('[data-quest="liyue-market-delivery"]').getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await walk(570);
 await through(wharf);
 await walk(315);
 await button('桟橋の樽 ｜ 先に魔物を退ける').click();
 await progress(0);
 await recover(315,'桟橋の樽',1);
 await recover(690,'岩場の木箱',2);
 await walk(960);
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(()=>{
   const f=window.lab.frame;
   return f.actors[f.active-1].y===382;
  });
 }finally{await page.keyboard.up('Space')}
 await recover(975,'足場の帆布',3);
 assert.match(await page.locator('#storyElite').innerText(),/桟橋を塞ぐヒルチャール/);
 await walk(755);
 await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.text==='北斗'));
 await canvas.screenshot({path:'evidence/liyue-s01-beidou.png'});
 const during=await frame();
 assert.equal(during.actors.length,2);
 assert.equal(during.companion.id,'amber');
 await walk(250,true);
 await fight(()=>progress(4));
 await walk(70);
 await through(harbor);
 const before=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
 const reported=await frame();
 assert.equal(reported.storyJoined.beidou,true);
 assert.equal(reported.companion.id,'amber');
 assert.equal(reported.mora-before.mora,150);
 assert.equal(reported.progression.questXp-before.progression.questXp,3825);
 await button('北斗を同行に選ぶ').click();
 await button('北斗が同行中').waitFor();
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 assert.equal((await frame()).companion.id,'beidou');
 await walk(570);
 await through(wharf);
 assert.equal((await frame()).total,0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-s01-browser.json',JSON.stringify({
  browser:'Chrome', early_acceptance:true, guarded_cargo_with_keyboard_and_buttons:true,
  npc_scene_without_party_change:true, report_and_explicit_selection:true,
  joined_and_selected_after_restore:true, safe_revisit:true, viewport_390:true, errors
 },null,2)+'\n');
 console.log('Liyue S01 Chrome playthrough, party selection and save restore passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  status:document.querySelector('#status')?.textContent,
  current:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests['beidou-join'],
 })),errors);
 throw error;
}finally{await browser.close()}
