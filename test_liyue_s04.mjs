import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const qid='liyue-stone-marks', port='liyue-harbor', river='liyue-river-trail';
const cliff='liyue-cliff-planks', post='liyue-quarry-post', overlook='liyue-craftsmen-overlook';
const quest=page.locator(`[data-quest="${qid}"]`), canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const frame=()=>page.evaluate(()=>window.lab.frame);
const current=id=>page.waitForFunction(id=>window.lab?.frame.story.node===id,id);
const progress=n=>page.waitForFunction(({qid,n})=>window.lab.frame.story.quests[qid]?.count===n,{qid,n});
const sequence=n=>page.waitForFunction(({qid,n})=>window.lab.frame.story.quests[qid]?.stone.sequence===n,{qid,n});
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
                     await fs.readFile('work/liyue-s04-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(port);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await walk(955);
 await through(river);
 await walk(1250,true);
 await button('G：川沿いの壁の彫り跡を調べる').click();
 await progress(1);
 await walk(110,true);
 await through(port);
 await walk(490);
 await jump(350);
 await through(cliff);
 await walk(520,true);
 await jump(395);
 await jump(305);
 await walk(905);
 await page.keyboard.press('KeyG');
 await progress(2);
 await walk(110);
 await through(port);
 await walk(1165);
 await through(post);
 await walk(420);
 await button('G：詰所の石畳の印を調べる').click();
 await progress(3);
 await walk(540);
 await jump(391);
 await jump(305);
 await walk(690);
 await through(overlook);
 assert.equal((await frame()).total,0);
 await walk(446);
 await jump(397);
 await button('G：職人の壁画を調べる').click();
 await button('切り出す').click();
 await sequence(1);
 await button('組み立てる').click();
 await sequence(0);
 assert.match(await page.locator('#storyStoneNotice').innerText(),/やり直せます/);
 await button('切り出す').click();
 await sequence(1);
 await button('運ぶ').click();
 await sequence(2);
 await page.locator('.game').screenshot({path:'evidence/liyue-s04-mural.png'});
 await button('組み立てる').click();
 await progress(4);
 await walk(550);
 await jump(312);
 await walk(820);
 await jump(231);
 await walk(980);
 await button('G：展望所の建物模型を回収する').click();
 await progress(5);
 await walk(110);
 await through(post);
 await walk(1660);
 await through(port);
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
 await walk(295);
 assert.match(await page.locator('#storyStoneText').innerText(),/職人の模型展示/);
 await page.locator('.game').screenshot({path:'evidence/liyue-s04-exhibit.png'});
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 assert.equal((await frame()).story.quests[qid].status,'complete');
 await walk(335);
 await button('G：職人の模型展示を調べる').waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-s04-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, all_three_marks:true, wrong_sequence_retry:true,
  fixed_platform_model_recovery:true, report_and_exhibit:true, exhibit_after_restore:true,
  viewport_390:true, errors
 },null,2)+'\n');
 console.log('Liyue S04 Chrome marks, mural, model, exhibit and restore passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  status:document.querySelector('#status')?.textContent,
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests['liyue-stone-marks'],
  actor:window.lab?.frame.actors[0],
 })),errors);
 throw error;
}finally{await browser.close()}
