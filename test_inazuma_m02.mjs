import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const root=process.env.LAB_URL||'http://127.0.0.1:8769';
const qid='inazuma-torii-maze', port='inazuma-port', road='inazuma-road', town='inazuma-town';
const clearing='inazuma-lantern-clearing', prints='inazuma-torii-footprints', statues='inazuma-torii-statues';
const water='inazuma-torii-reflections', fight='inazuma-torii-thicket', shore='inazuma-forest-shore';
const canvas=page.locator('#game'), quest=page.locator('[data-quest="inazuma-torii-maze"]');
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

async function defeat(x,id){
 await walk(x,true);
 await canvas.click();
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(({qid,id})=>window.lab.frame.story.quests[qid]?.forest.defeated[id],{qid,id});
 }finally{
  await page.keyboard.up('KeyJ');
 }
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/inazuma-m02-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(port);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await reachTown();
 await walk(1080);
 await through(clearing);
 await walk(1020);
 await through(prints);
 await walk(1240);
 await gate(statues);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.lab.frame.storyForest?.looped && window.lab.frame.actors[0].x<250);
 await current(prints);
 await walk(1240);
 await gate(statues,false);
 await inspect(245,'綾華にヒントを聞く');
 await page.waitForFunction(()=>window.lab.frame.storyForest?.message.includes('足跡'));
 await inspect(855,'右の岩のそばを調べる');
 await page.waitForFunction(()=>window.lab.frame.storyForest?.message.includes('葉の印はありません'));
 await progress(0);
 await inspect(485,'左の岩のそばを調べる');
 await progress(1);
 await walk(1240);
 await through(statues);
 await inspect(855,'右の石像を調べる');
 await progress(2);
 await walk(1240);
 await through(water);
 await walk(445);
 await button('G：左の水たまりを調べる').waitFor();
 await page.locator('.game').screenshot({path:'evidence/inazuma-m02-forest.png'});
 await button('G：左の水たまりを調べる').click();
 await progress(3);
 await walk(1240);
 await through(fight);
 await defeat(420,'inazuma-thicket-1');
 await defeat(785,'inazuma-thicket-2');
 await defeat(1130,'inazuma-thicket-3');
 await progress(4);
 await inspect(1280,'化け狸と話す');
 await progress(5);
 assert.equal((await frame()).storyLanternNote.challenge,true);
 await walk(1510);
 await through(shore);
 await walk(1240);
 await through(town);
 await walk(110);
 await through(road);
 await walk(110,true);
 await through(port);
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="inazuma-torii-maze"][data-status="complete"]');
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await current(port);
 assert.equal((await frame()).storyLanternNote.challenge,true);
 await reachTown();
 await walk(940);
 await through(shore);
 await walk(110);
 await through(fight);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/inazuma-m02-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, one_time_return:true, three_clues_and_retry:true,
  forest_combat_and_guest:true, port_report_and_restore:true, coastal_shortcut:true, viewport_390:true, errors
 },null,2)+'\n');
 console.log('Inazuma M02 Chrome maze, combat, report and coastal shortcut passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests['inazuma-torii-maze'],
  forest:window.lab?.frame.storyForest,
  near:window.lab?.frame.storyNearbyForest ?? window.lab?.frame.storyNearbyPortal,
  actor:window.lab?.frame.actors[0],
 })),errors);
 throw error;
}finally{await browser.close()}
