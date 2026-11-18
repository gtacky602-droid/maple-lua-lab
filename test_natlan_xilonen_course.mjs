import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub', workshop='natlan-xilonen-workshop', course='natlan-xilonen-course';
const quest='natlan-xilonen-springs', prefix='evidence/nat-xilonen-course';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg,timeout=25000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const button=name=>page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true});
const shot=(name,selector='.game')=>page.locator(selector).screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
 await canvas.click();
 await page.keyboard.press(code);
}

async function move(x){
 const f=await frame(), here=f.actors[f.active-1].x;
 if(Math.abs(here-x)<8)return;
 const right=x>here,code=right?'KeyD':'KeyA';
 await canvas.click();
 await page.keyboard.down(code);
 try{
  await wait(({x,right})=>{
   const f=window.lab.frame,p=f.actors[f.active-1].x;
   return right?p>=x-5:p<=x+5;
  },{x,right});
 }finally{await page.keyboard.up(code)}
}

async function collect(x,label){
 await move(x);
 await wait(label=>window.lab.frame.storyNearbyMilestone?.label===label,label);
 await key('KeyG');
}

async function gate(x,node){
 await move(x);
 await wait(id=>window.lab.frame.storyNearbyPortal?.to===id&&window.lab.frame.storyNearbyPortal.available,node);
 await key('KeyF');
 await at(node);
}

async function load(){
 await page.locator('#loadProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('保存した進行で町から再開しました'));
 await at(hub);
}

async function saveAndReload(){
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load();
}

async function background(key){
 const status=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.equal(status.key,key);
 assert.equal(status.state,'ready');
}

const label={'rise':'高い段差','roof':'低い天井','reach':'横に離れた足場'};
async function pick(section,type){
 await page.getByLabel(label[section],{exact:true}).selectOption(type);
 await wait(({section,type})=>window.lab.frame.storySpringCourse?.layout?.[section]===type,{section,type});
}

async function jump(section,x,retry=false){
 await move(x);
 await canvas.click();
 const f=await frame();
 const prior=f.storySpringCourse.retries;
 assert.equal(f.storySpringCourse.section,section);
 await page.keyboard.down('KeyD');
 try{
  await page.keyboard.press('Space');
  await wait(({section,prior,retry})=>{
   const current=window.lab.frame.storySpringCourse;
   return retry?current.retries>prior:current.section>section;
  },{section,prior,retry});
 }finally{await page.keyboard.up('KeyD')}
}

async function compare(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.ok(png.draws.filter(d=>d.source==='nat-xilonen-course-props-source-v1.png').length>=3);
 await shot('course-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('course-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.equal(f.camera,png.camera);
  assert.deepEqual(f.storySpringCourse,png.storySpringCourse);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8929/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile('work/nat-xilonen-course-fixture.json','utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 assert.equal((await frame()).story.quests['natlan-two-trials'].pathProgress.water.count,0);
 await button('受注').click();
 await count(0);
 await collect(244,'シロネンに試作品の話を聞く');
 await count(1);
 await gate(173,workshop);
 await background('natlanXilonenLab');
 await collect(235,'高い型を試す');
 await wait(()=>window.lab.frame.storySpringCourse?.phase==='sample');
 await key('Space');
 await wait(()=>window.lab.frame.storySpringCourse?.phase==='idle'&&window.lab.frame.storySpringCourse.samples?.high>100);
 await collect(442,'低い型を試す');
 await wait(()=>window.lab.frame.storySpringCourse?.phase==='sample');
 await page.setViewportSize({width:390,height:844});
 await page.locator('#springJump').click();
 await count(2);
 await page.setViewportSize({width:1280,height:960});
 assert.ok((await frame()).storySpringCourse.samples.low<80);
 await collect(650,'三つの踏み台を組み替える');
 const panel=page.locator('#springLayout'), confirm=page.locator('#springLayoutSave');
 await panel.waitFor();
 assert.ok(await confirm.isDisabled());
 await pick('rise','high');
 await pick('roof','high');
 await pick('reach','low');
 await shot('planner','#springLayout');
 await page.setViewportSize({width:390,height:844});
 const bounds=await panel.boundingBox();
 assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 await shot('mobile-planner','#springLayout');
 await page.setViewportSize({width:1280,height:960});
 await saveAndReload();
 await gate(173,workshop);
 await collect(650,'三つの踏み台を組み替える');
 await wait(()=>window.lab.frame.storySpringCourse?.layout?.roof==='high');
 await confirm.click();
 await count(3);
 await gate(936,course);
 await background('natlanXilonenCourse');
 await collect(139,'試走を始める');
 await wait(()=>window.lab.frame.storySpringCourse?.phase==='lap');
 await jump(1,246);
 await jump(2,665,true);
 assert.ok((await frame()).storySpringCourse.message.includes('緩衝材'));
 await key('KeyG');
 await wait(()=>window.lab.frame.storySpringCourse?.phase==='idle');
 await gate(56,workshop);
 await collect(650,'三つの踏み台を組み替える');
 await pick('roof','low');
 await confirm.click();
 await gate(936,course);
 await collect(139,'試走を始める');
 await wait(()=>window.lab.frame.storySpringCourse?.phase==='lap');
 await jump(1,246);
 const calls=await compare();
 await jump(2,665);
 await jump(3,1066);
 await move(1456);
 await count(4);
 const result=(await frame()).storySpringCourse.result;
 assert.ok(result?.best>0&&result?.retries===0);
 await shot('finish');
 await gate(1526,hub);
 await button('報告').click();
 await wait(id=>window.lab.frame.story.quests[id]?.status==='complete',quest);
 await saveAndReload();
 await gate(173,workshop);
 await gate(936,course);
 assert.equal((await frame()).storySpringCourse.best,result.best);
 await collect(139,'試走を始める');
 await wait(()=>window.lab.frame.storySpringCourse?.phase==='lap');
 await key('KeyG');
 await wait(()=>window.lab.frame.storySpringCourse?.phase==='idle');
 assert.deepEqual(errors,[]);
 const proof={acceptedWithOneMainBranch:true,samplingWithKeyboardAndTouch:true,draftReload:true,
  ceilingRecovery:true,configuredLapAndReport:true,bestAndReplayAfterReload:true,mobilePlanner:true,calls,errors};
 await fs.writeFile(prefix+'-web.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Xilonen browser playthrough passed',calls);
}catch(err){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,quest:f?.story?.quests['natlan-xilonen-springs'],camera:f?.camera,actors:f?.actors,
   milestone:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,spring:f?.storySpringCourse,paused:f?.paused};
 }));
 await page.screenshot({path:'work/nat-xilonen-course-failure.png'});
 throw err;
}finally{
 await browser.close();
}
