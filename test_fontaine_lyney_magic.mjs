import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='fontaine-hub',room='fontaine-rehearsal-room',stage='fontaine-grand-stage';
const wings='fon-magic-wings',seats='fon-magic-seats',quest='fon-lyney-magic';
const earned=process.argv.includes('--earned');
const work='work/earned-fontaine-acts';
const prefix=earned?work+'/lyney':'evidence/fon-lyney-magic';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:22000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const phase=id=>wait(id=>window.lab.frame.storyLyneyMagic?.phase===id,id);
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
 await canvas.click();
 await page.keyboard.press(code);
}

async function held(code,fn){
 await canvas.click();
 await page.keyboard.down(code);
 try{return await fn()}finally{await page.keyboard.up(code)}
}

async function walk(x){
 const f=await frame(),actor=f.actors[f.active-1],right=x>actor.x;
 if(Math.abs(actor.x-x)<8)return;
 await held(right?'KeyD':'KeyA',()=>wait(({x,right})=>{
  const f=window.lab.frame,actor=f.actors[f.active-1];
  return right?actor.x>=x-7:actor.x<=x+7;
 },{x,right}));
}

async function gate(x,node){
 await walk(x);
 await wait(node=>{
  const p=window.lab.frame.storyNearbyPortal;
  return p?.to===node&&p.available;
 },node);
 await key('KeyF');
 await at(node);
}

async function collect(x,label){
 await walk(x);
 await wait(label=>window.lab.frame.storyNearbyMilestone?.label===label,label);
 await key('KeyG');
}

const questButton=name=>page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();

async function load(node){
 await page.locator('#loadProgress').click();
 await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 await at(node);
}

async function reload(node){
 await page.locator('#saveProgress').click();
 await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load(node);
}

function background(){
 return page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
}

async function compareAudience(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.equal(png.storyLyneyMagic.phase,'reveal');
 assert.equal(png.draws.filter(d=>d.source==='fon-lyney-magic-props-source-v1.png').length,2);
 await shot('audience-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('audience-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  assert.deepEqual(f.storyLyneyMagic,png.storyLyneyMagic);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8924/');
 await wait(()=>window.lab?.frame);
 const source=earned?work+'/freminet-browser-complete.json':'work/fon-lyney-magic-fixture.json';
 const seed=await fs.readFile(source,'utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load(hub);
 if(earned)assert.equal((await frame()).progression.level,93);
 await questButton('受注');
 await count(0);
 await gate(1240,room);
 await gate(997,wings);
 const wingBackground=await background();
 assert.deepEqual(wingBackground,{key:'fontaineMagicWings',file:'fon-lyney-magic-wings-background-v1.png',state:'ready'});
 await collect(219,'リネとリネットに段取りを聞く');
 await count(1);
 await walk(553);
 assert.equal((await frame()).storyNearbyMilestone,undefined);
 await held('Space',()=>wait(()=>{
  const f=window.lab.frame,a=f.actors[f.active-1];
  return a.y===392&&a.ground;
 }));
 await collect(553,'上段から箱の通り道を調べる');
 await count(2);
 await gate(1555,seats);
 const seatsBackground=await background();
 assert.deepEqual(seatsBackground,{key:'fontaineMagicSeats',file:'fon-lyney-magic-seats-background-v1.png',state:'ready'});
 await collect(424,'客席から舞台を見渡す');
 await count(3);
 assert.equal((await frame()).storyLyneyMagic.cartVisible,false);
 await shot('audience-before');
 await gate(56,wings);
 await collect(819,'合図に合わせて箱を送る');
 await phase('wheel');
 await count(4);
 assert.match((await frame()).storyNotice,/ここで止めよう/);
 await shot('broken-wheel');
 await collect(1303,'逆光の影絵を使う');
 await count(5);
 await reload(room);
 await gate(997,wings);
 assert.equal((await frame()).storyLyneyMagic.variant,'light');
 await collect(1179,'新しい演目の合図を待つ');
 let cueRemaining;
 if(earned){
  await wait(()=>{
   const {storyLyneyMagic:magic}=window.lab.frame;
   if(magic?.phase!=='wait'||magic.cueRemaining<=0)return false;
   window.lab.action('pause');
   return true;
  });
  await wait(()=>window.lab.frame.paused);
  cueRemaining=(await frame()).storyLyneyMagic.cueRemaining;
  assert.ok(cueRemaining>0&&cueRemaining<=1);
  assert.match(await page.locator('#storyForest').textContent(),/合図まで \d+\.\d秒/);
  await shot('cue-wait');
  await key('KeyP');
 }else{
  await phase('wait');
 }
 await phase('cue');
 await collect(1179,'合図に合わせて逆光を切り替える');
 await phase('reveal');
 await count(6);
 await gate(1555,seats);
 await collect(424,'客席から演目を見る');
 await phase('reveal');
 assert.equal((await frame()).storyLyneyMagic.cartVisible,false);
 const calls=await compareAudience();
 await count(7);
 await gate(1216,hub);
 await questButton('報告');
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 await reload(hub);
 if(earned){
  assert.equal((await frame()).progression.level,94);
  const survey='fon-morte-sluice-survey';
  await page.locator('[data-quest="'+survey+'"]').getByRole('button',{name:'受注',exact:true}).click();
  await wait(id=>window.lab.frame.story.quests[id]?.status==='active',survey);
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  assert.equal(JSON.parse(saved).story.quests[survey].status,'active');
  await fs.writeFile(work+'/acts-browser-complete.json',saved+'\n');
 }
 await gate(1320,stage);
 await collect(1046,'主舞台の追加演目を見る');
 await phase('reveal');
 assert.equal((await frame()).storyLyneyMagic.role,'finale');
 await shot('chapter-encore');
 await phase('idle');
 assert.deepEqual(errors,[]);
 const evidence=earned?'evidence/earned-fontaine-lyney-browser.json':prefix+'-web.json';
 await fs.writeFile(evidence,JSON.stringify({
  quest,wingBackground,seatsBackground,upperAisleAndWheel:true,storedLightPlan:true,
  audienceShowAndChapterEncore:true,calls,errors,
  ...(earned?{source,startLevel:93,endLevel:94,plan:'逆光の影絵',cueRemaining,morteAccepted:true}: {})
 },null,2)+'\n');
 console.log(quest,calls);
}catch(error){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,state:f?.story?.quests?.['fon-lyney-magic'],view:f?.storyLyneyMagic,
   near:f?.storyNearbyMilestone,actor:f?.actors?.[f.active-1]?.x};
 }));
 throw error;
}finally{
 await browser.close();
}
