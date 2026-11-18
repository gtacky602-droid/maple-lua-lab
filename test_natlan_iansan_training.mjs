import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub', course='natlan-iansan-training';
const quest='natlan-iansan-self-test', prefix='evidence/nat-iansan-training';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg,timeout=26000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const button=name=>page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true});
const shot=(name,selector='.game')=>page.locator(selector).screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
 await canvas.click();
 await page.keyboard.press(code);
}

async function held(code,predicate,arg){
 await canvas.click();
 await page.keyboard.down(code);
 try{await wait(predicate,arg)}finally{await page.keyboard.up(code)}
}

async function move(x){
 const f=await frame(), here=f.actors[f.active-1].x;
 if(Math.abs(here-x)<8)return;
 const right=x>here;
 await held(right?'KeyD':'KeyA',({right,x})=>{
  const f=window.lab.frame, p=f.actors[f.active-1].x;
  return right?p>=x-5:p<=x+5;
 },{right,x});
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

async function compare(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.ok(png.draws.filter(d=>d.source==='nat-iansan-training-props-source-v1.png').length>=3);
 assert.equal(png.storyIansan.remaining,3);
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
  assert.deepEqual(f.storyIansan,png.storyIansan);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

async function reachMarker(){
 await move(419);
 await held('Space',()=>window.lab.frame.storyIansan?.marker);
}

async function targets(){
 for(const [x,left] of [[659,2],[720,1],[778,0]]){
  if((await frame()).storyIansan.remaining<=left)continue;
  await move(x);
  await held('KeyJ',n=>window.lab.frame.storyIansan?.remaining<=n,left);
 }
}

async function finish(newCount){
 await held('KeyD',({quest,newCount})=>window.lab.frame.story.quests[quest].count===newCount
    &&window.lab.frame.storyIansan?.panel,{quest,newCount});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8930/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile('work/nat-iansan-training-fixture.json','utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 await button('受注').click();
 await count(0);
 await collect(715,'イアンサに訓練の話を聞く');
 await count(1);
 await gate(724,course);
 assert.deepEqual(await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 }),{key:'natlanIansanTraining',file:'nat-iansan-training-course-background-v1.png',state:'ready'});
 await collect(155,'最初の一周を始める');
 await wait(()=>window.lab.frame.storyIansan?.remaining===3);
 const initial=await frame();
 await reachMarker();
 await move(550);
 const calls=await compare();
 await targets();
 await move(1112);
 await wait(()=>window.lab.frame.storyIansan?.hits>0);
 await collect(1231,'水場で回復する');
 await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='水場は利用済み');
 await finish(2);
 const first=(await frame()).storyIansan;
 assert.ok(first.baseline.hits>0);
 assert.equal(first.suggestion.id,'recovery');
 assert.equal((await frame()).kills,initial.kills);
 assert.equal((await frame()).mora,initial.mora);
 assert.equal(await page.locator('#iansanChoices .selected').count(),1);
 await shot('baseline','#iansanReview');
 await page.getByRole('button',{name:'的をまとめて攻撃する',exact:true}).click();
 await count(3);
 await saveAndReload();
 await gate(724,course);
 await collect(155,'もう一周する');
 await wait(t=>window.lab.frame.storyIansan?.ticks>=t,first.baseline.ticks+25);
 await reachMarker();
 await targets();
 await finish(4);
 const both=(await frame()).storyIansan;
 assert.ok(both.retest.ticks>both.baseline.ticks);
 assert.equal(both.focus,'group');
 await page.locator('#iansanReview').waitFor();
 assert.equal(await page.locator('#iansanResults thead th').count(),3);
 assert.equal(await page.locator('#iansanResults tbody tr').count(),5);
 await shot('comparison','#iansanReview');
 await page.setViewportSize({width:390,height:844});
 const bounds=await page.locator('#iansanReview').boundingBox();
 assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 assert.ok(await page.locator('#iansanResults').evaluate(table=>table.scrollWidth<=table.clientWidth));
 await shot('mobile','#iansanReview');
 await page.setViewportSize({width:1280,height:960});
 await page.keyboard.press('Escape');
 await page.locator('#iansanReview').waitFor({state:'hidden'});
 await gate(56,hub);
 await button('報告').click();
 await wait(id=>window.lab.frame.story.quests[id]?.status==='complete',quest);
 await saveAndReload();
 await gate(724,course);
 await collect(155,'記録台を見る');
 await wait(()=>window.lab.frame.storyIansan?.panel);
 assert.deepEqual((await frame()).storyIansan.retest,both.retest);
 await page.getByRole('button',{name:'記録を残してもう一周する',exact:true}).click();
 await wait(()=>window.lab.frame.storyIansan?.remaining===3);
 await key('KeyG');
 await wait(()=>!window.lab.frame.storyIansan?.running);
 assert.deepEqual(errors,[]);
 const proof={ordinaryTargetsAndUpperMarker:true,actualHitAndWaterStop:true,oneRecommendation:true,
  focusAndLogsAfterReload:true,slowerRetestReported:true,mobileTableFits:true,replayAfterReport:true,calls,errors};
 await fs.writeFile(prefix+'-web.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Iansan browser playthrough passed',calls);
}catch(err){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,quest:f?.story?.quests['natlan-iansan-self-test'],camera:f?.camera,actors:f?.actors,
   milestone:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,practice:f?.storyIansan,paused:f?.paused};
 }));
 console.error('Page errors',errors);
 await page.screenshot({path:'work/nat-iansan-training-failure.png'});
 throw err;
}finally{
 await browser.close();
}
