import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const qid='liyue-hauling-shortcut', port='liyue-harbor', field='liyue-field', post='liyue-quarry-post';
const road='liyue-cart-road', lift='liyue-cart-lift';
const quest=page.locator(`[data-quest="${qid}"]`), canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const frame=()=>page.evaluate(()=>window.lab.frame);
const current=id=>page.waitForFunction(id=>window.lab?.frame.story.node===id,id);
const progress=n=>page.waitForFunction(({qid,n})=>window.lab.frame.story.quests[qid]?.count===n,{qid,n});
const button=name=>page.getByRole('button',{name,exact:true});

async function held(key,until){
 await page.keyboard.down(key);
 try{await until()}finally{await page.keyboard.up(key)}
}
async function walk(x){
 const f=await frame(),east=f.actors[f.active-1].x<x;
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
 await held(east?'KeyD':'KeyA',()=>page.waitForFunction(({x,east})=>{
  const f=window.lab.frame,a=f.actors[f.active-1];
  return east?a.x>=x-7:a.x<=x+7;
 },{x,east}));
}
const onFloor=y=>page.waitForFunction(y=>{
 const f=window.lab.frame,a=f.actors[f.active-1];
 return a.ground&&a.y===y;
},y);
const jump=y=>held('Space',()=>onFloor(y));
async function through(id,onRide){
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.keyboard.press('KeyF');
 if(onRide)await onRide();
 await current(id);
}
async function save(){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 return page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
}
async function load(raw){
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 await current(port);
 const expected=JSON.parse(raw).story.quests[qid]??null;
 await page.waitForFunction(({qid,expected})=>{
  const state=window.lab.frame.story.quests[qid];
  return state?.status===expected?.status&&state?.count===expected?.count&&state?.construction?.plan===expected?.construction?.plan;
 },{qid,expected});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await load(await fs.readFile('work/liyue-s05-fixture.json','utf8'));
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await walk(558);
 await jump(350);
 await walk(570);
 await held('Space',async()=>{
  await held('KeyD',()=>page.waitForFunction(()=>{
   const f=window.lab.frame;
   return f.actors[f.active-1].x>=760;
  }));
  await onFloor(300);
 });
 await walk(855);
 await page.keyboard.press('KeyG');
 await progress(1);
 await walk(1300);
 await button('G：平らな遠回りを調べる').click();
 await progress(2);
 await walk(1165);
 await through(post);
 await walk(1535);
 await button('G：古い荷揚げ用の昇降台を調べる').click();
 await progress(3);
 await walk(1670);
 await through(port);
 const surveyed=await save();

 for(const [plan,label,id,x,other,otherX,farX] of [
  ['ground','地上路を整備する',road,170,lift,840,1320],
  ['lift','昇降台を修理する',lift,840,road,170,1110],
 ]){
  await load(surveyed);
  await walk(875);
  await button(label).click();
  await progress(4);
  assert.equal((await frame()).story.quests[qid].construction.plan,plan);
  if(plan==='lift'){
   await walk(1165);
   await through(post);
   await walk(1535);
  }else await walk(170);
  await button('G：作業場所を片付ける').click();
  await progress(5);
  await button('G：資材を職人に渡す').click();
  await progress(6);
  if(plan==='lift'){
   await walk(1670);
   await through(port);
  }
  await quest.getByRole('button',{name:'報告',exact:true}).click();
  await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
  const done=await save();
  await load(done);
  await walk(otherX);
  const wrong=(await frame()).storyNearbyPortal;
  assert.equal(wrong.to,other);
  assert.equal(wrong.available,false);
  await walk(x);
  await through(id,plan==='lift'?async()=>{
   await page.waitForFunction(()=>window.lab.frame.storyLift?.seconds===1.8);
   assert.match(await page.locator('#storyLiftText').innerText(),/昇降台で移動中/);
  }:null);
  await page.waitForFunction(plan=>{
   const cart=window.lab.frame.storyHaulCart;
   return cart?.route===plan&&(plan==='ground'?cart.x>320&&cart.x<725:cart.x>260);
  },plan);
  await page.locator('.game').screenshot({path:`evidence/liyue-s05-${plan}.png`});
  await walk(plan==='ground'?870:535);
  await through(field);
  await held('KeyJ',()=>walk(farX));
  await through(id);
  if(plan==='lift'){
   await walk(180);
   await jump(350);
  }else await walk(110);
  await through(port);
 }
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-s05-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, all_surveys:true, ground_and_lift_there_and_back:true,
  both_routes_built_and_restored_via_ui:true, only_chosen_route_opens:true,
  lift_progress_visible:true, viewport_390:true, errors
 },null,2)+'\n');
 console.log('Liyue S05 Chrome surveys, both construction choices and both shortcut round trips passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  status:document.querySelector('#status')?.textContent,
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests['liyue-hauling-shortcut'],
  actor:window.lab?.frame.actors[0],
 })),errors);
 throw error;
}finally{await browser.close()}
