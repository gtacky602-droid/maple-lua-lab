import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const root=process.env.LAB_URL||'http://127.0.0.1:8769';
const qid='ayaka-join', port='inazuma-port', road='inazuma-road', town='inazuma-town';
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
                     await fs.readFile('work/inazuma-s01-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(port);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await reachTown();
 assert.equal(await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame).key;
 }),'inazumatown');
 await inspect(250,'桜並木を調べる');
 await progress(1);
 await walk(570);
 await land(340);
 await button('G：屋根越しの高台を調べる').click();
 await progress(2);
 await land(480,true);
 await inspect(1090,'海の坂を調べる');
 await progress(3);
 await inspect(790,'橋から港を眺める');
 const choices=page.locator('#storySightChoices');
 await choices.waitFor();
 assert.equal(await choices.getByRole('button').count(),4);
 const bridge=await frame();
 const ayaka=bridge.draws.find(d=>d.source?.startsWith('ayaka-idle-right'));
 const label=bridge.draws.find(d=>d.kind==='text'&&d.text==='綾華');
 assert.ok(ayaka&&ayaka.x===label?.x);
 await page.locator('.game').screenshot({path:'evidence/inazuma-s01-bridge.png'});
 await choices.getByRole('button',{name:'港を見渡す橋に印を付ける'}).click();
 await progress(4);
 await page.locator('#storyLanternNotes summary').click();
 assert.match(await page.locator('#storySightNote').textContent(),/港を見渡す橋/);
 assert.equal(await page.locator('#storyLanternEntry').isVisible(),false);
 await walk(110);
 await through(road);
 await walk(110,true);
 await through(port);
 assert.match(await quest.innerText(),/42,335EXP/);
 const before=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await quest.getByRole('button',{name:'綾華を同行に選ぶ',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.companion.id==='ayaka'&&window.lab.frame.starterEquipment?.useFlower);
 assert.equal((await frame()).actors[1].maxhp,150);
 assert.equal((await frame()).progression.questXp-before.progression.questXp,42335);
 assert.match(await page.locator('#starterEquipmentStatus').textContent(),/初期刀.*ATK \+1.*入門の花.*HP \+10/);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await current(port);
 await page.waitForFunction(()=>window.lab.frame.storyJoined?.ayaka&&window.lab.frame.starterEquipment?.useFlower);
 assert.equal((await frame()).storySightNote.id,'bridge');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/inazuma-s01-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, three_sights_and_rooftop_jump:true, bridge_and_notebook:true, reportXp:42335, dedicated_town_background:true,
  recruitment_starter_equipment_and_restore:true, viewport_390:true, errors
 },null,2)+'\n');
 console.log('Inazuma S01 Chrome sights, bridge, recruitment and starter gear passed');
}catch(error){
 console.error(await page.evaluate(qid=>({
  status:document.querySelector('#status')?.textContent,
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests[qid],
  nearby:window.lab?.frame.storyNearbySight??window.lab?.frame.storyNearbyPortal,
  actor:window.lab?.frame.actors[0],
 }),qid),errors);
 throw error;
}finally{await browser.close()}
