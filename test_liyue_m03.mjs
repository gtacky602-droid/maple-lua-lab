import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const qid='liyue-market-opening';
const room='liyue-quarry-storage';
const harbor='liyue-harbor';
const quest=page.locator(`[data-quest="${qid}"]`);
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);

const frame=()=>page.evaluate(()=>window.lab.frame);
const progress=n=>page.waitForFunction(({qid,n})=>window.lab.frame.story.quests[qid]?.count===n,{qid,n});
const current=id=>page.waitForFunction(id=>window.lab?.frame.story.node===id,id);
const atHeight=y=>page.waitForFunction(y=>{
 const f=window.lab.frame;
 return f.actors[f.active-1].y===y;
},y);
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
async function checkAtlasTarget(key,id,visible){
 await page.keyboard.press('KeyM');
 await page.locator('#atlasQuestFocus').click();
 const target=page.locator('#atlasQuestObjectives a[href*="'+key+'='+id+'"]');
 await target.waitFor();
 assert.equal(await target.getAttribute('href'),await page.locator('#atlasQuestPoint').getAttribute('href'));
 const [preview]=await Promise.all([page.waitForEvent('popup'),target.click()]);
 try{
  await preview.waitForFunction(({node,total})=>window.mapArt?.ready && window.mapArt.node===node && window.mapArt.shownCount===total,{node:room,total:visible});
  if(key==='subject')assert.equal(await preview.locator('#liveSubject').inputValue(),id);
  else assert.equal(await preview.locator('#surveyPointNote').getAttribute('data-worksite'),id);
  if(id==='market-switch')await preview.locator('#rect').screenshot({path:'evidence/liyue-quarry-atlas-dispatch.png'});
 }finally{await preview.close()}
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
}
async function jump(y){
 await page.keyboard.down('Space');
 try{await atHeight(y)}finally{await page.keyboard.up('Space')}
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
                     await fs.readFile('work/liyue-m03-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(harbor);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await walk(1165);
 assert.equal(await page.locator('#storyMarket').isHidden(),true);
 await canvas.screenshot({path:'evidence/liyue-m03-market-before.png'});
 await through('liyue-quarry-post');
 await walk(1370);
 await jump(389);
 await jump(305);
 await walk(1490);
 await through(room);
 await checkAtlasTarget('worksite','cart-latch',2);
 await walk(490,true);
 await jump(397);
 await jump(312);
 await walk(658);
 await page.getByRole('button',{name:'G：荷車の留め具を外す'}).click();
 await page.waitForFunction(()=>window.lab.frame.storyRailTransit?.release);
 await page.locator('#trackedQuestText').filter({hasText:'荷車が分岐へ移動中'}).waitFor({timeout:3500});
 await progress(1);
 assert.match(await page.locator('#storyElite').innerText(),/石切り場の番人/);
 await checkAtlasTarget('subject','liyue-quarry-storage-keeper',1);
 await walk(1070);
 await atHeight(480);
 const beforeVictory=await frame();
 await walk(1250,true);
 await page.keyboard.down('KeyJ');
 try{await progress(2)}finally{await page.keyboard.up('KeyJ')}
 assert.match(await page.locator('#storyChapterReward').innerText(),/73,057 EXP/);
 assert.equal((await frame()).progression.questXp-beforeVictory.progression.questXp,73057);
 await checkAtlasTarget('worksite','market-switch',0);
 await walk(1030);
 const ready=await frame();
 const lever=ready.draws.find(d=>d.color==='#f2c85c' && d.w===10 && d.h===9);
 assert.ok(lever,'yellow switch handle beside the parked cart');
 assert.equal(lever.x+ready.camera,976);
 await canvas.screenshot({path:'evidence/liyue-quarry-switch-ready.png'});
 await page.keyboard.press('KeyG');
 await page.waitForFunction(()=>window.lab.frame.storyRailTransit?.release===false);
 assert.match(await page.locator('#storyMarket').innerText(),/荷車が港へ移動中/);
 await page.locator('#trackedQuestText').filter({hasText:'荷車が港へ移動中'}).waitFor({timeout:3500});
 const dispatched=await frame();
 assert.ok(dispatched.draws.some(d=>d.color==='#a67a59' && d.w===10 && d.x+dispatched.camera===998));
 await progress(3);
 await walk(1690);
 await through(harbor);
 assert.match(await page.locator('#storyMarket').innerText(),/山海の大市 開催中/);
 await canvas.screenshot({path:'evidence/liyue-m03-market-after.png'});
 const paidBefore=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
 const paid=await frame();
 assert.equal(paid.mora-paidBefore.mora,500);
 assert.equal(paid.progression.questXp-paidBefore.progression.questXp,67646);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 assert.equal((await frame()).storyMarketOpen,true);
 await walk(1270);
 await through(room);
 assert.equal((await frame()).total,0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-m03-browser.json',JSON.stringify({
  browser:'Chrome', controls:'ordinary keyboard and HUD buttons', checkpoint:'M02 completion fixture',
  keeper_hp_hud:true, first_clear_xp:73057, animated_cart_and_dispatch:true, market_visible:true,
  report_and_restore:true, safe_revisit:true, viewport_390:true, errors
 },null,2)+'\n');
 console.log('Liyue M03 Chrome playthrough and save restore passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  status:document.querySelector('#status')?.textContent,
  save:document.querySelector('#saveStatus')?.textContent,
  node:window.lab?.frame.story.node,
  actor:window.lab?.frame.actors[0],
 })),errors);
 throw error;
}finally{await browser.close()}
