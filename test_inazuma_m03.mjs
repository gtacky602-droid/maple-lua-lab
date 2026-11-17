import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const root=process.env.LAB_URL||'http://127.0.0.1:8769';
const qid='inazuma-lantern-contest', port='inazuma-port', road='inazuma-road', town='inazuma-town';
const shore='inazuma-forest-shore', cave='inazuma-sea-cave', cape='inazuma-shiomi-cape';
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

async function reachTown(){
 await walk(1380);
 await through(road);
 await walk(1380,true);
 await through(town);
}

async function inspect(x,label){
 await walk(x);
 await button('G：'+label).click();
}


const phase=stage=>page.waitForFunction(stage=>window.lab.frame.storyContest?.stage===stage,stage);
async function reachCave(){
 await reachTown();
 await walk(940);
 await through(shore);
 await walk(850);
 await through(cave);
}

async function fight(next){
 await walk(716,true);
 await canvas.click();
 await page.keyboard.down('KeyJ');
 try{await phase(next)}finally{await page.keyboard.up('KeyJ')}
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/inazuma-m03-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(port);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await reachCave();
 await walk(1320);
 await gate(cape,false);
 assert.ok((await frame()).draws.some(d=>d.color==='#243b35' && d.h===90));
 await inspect(440,'親分に勝負を申し込む');
 await phase(1);
 await fight(2);
 await inspect(760,'中央の灯籠を調べる');
 await page.waitForFunction(()=>window.lab.frame.storyContest?.message.includes('紙吹雪'));
 await progress(2);
 await walk(905);
 await page.locator('.game').screenshot({path:'evidence/inazuma-m03-reflection.png'});
 await inspect(960,'右の灯籠を調べる');
 await phase(3);
 const beforeVictory=await frame();
 await fight(4);
 assert.match(await page.locator('#storyChapterReward').innerText(),/335,632 EXP/);
 assert.equal((await frame()).progression.questXp-beforeVictory.progression.questXp,335632);
 assert.ok(!(await frame()).draws.some(d=>d.color==='#243b35' && d.h===90));
 await walk(1320);
 await through(cape);
 await inspect(675,'海と町の灯りを眺める');
 await progress(5);
 await page.waitForFunction(()=>document.querySelector('#trackedQuestText').textContent.includes('報告待ち 5/5'));
 await page.locator('.game').screenshot({path:'evidence/inazuma-m03-cape.png'});
 await walk(110);
 await through(cave);
 await walk(110);
 await through(shore);
 await walk(1240);
 await through(town);
 await walk(110);
 await through(road);
 await walk(110,true);
 await through(port);
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await current(port);
 await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
 await reachCave();
 await inspect(440,'親分に再戦を申し込む');
 await phase(1);
 assert.equal((await frame()).storyContest.replay,true);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/inazuma-m03-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, first_and_final_battle:true, reflection_retry:true, leaf_curtain_reveal:true,
  cape_visit:true, first_clear_xp:335632, report_and_restore:true, replay_entry:true, viewport_390:true, errors
 },null,2)+'\n');
 console.log('Inazuma M03 Chrome battles, reflection, cape, report and rematch entry passed');
}catch(error){
 console.error(await page.evaluate(qid=>({
  status:document.querySelector('#status')?.textContent,
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests[qid],
  contest:window.lab?.frame.storyContest,
  nearby:window.lab?.frame.storyNearbyContest??window.lab?.frame.storyNearbyPortal,
  actor:window.lab?.frame.actors[0],
 }),qid),errors);
 throw error;
}finally{await browser.close()}
