import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='fontaine-hub',atelier='fon-emilie-atelier',shore='fon-emilie-scent-shore';
const earned=process.argv.includes('--earned');
const quest='fon-emilie-scent',prefix=earned?'work/earned-fontaine-tulpa/emilie':'evidence/fon-emilie-scent';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:24000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
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

function questButton(name){
 return page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
}

async function load(){
 await page.locator('#loadProgress').click();
 await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 await at(hub);
}

async function reload(){
 await page.locator('#saveProgress').click();
 await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load();
}

function scene(){
 return page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
}

async function compareAtelier(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.equal(png.storyEmilieScent.bottle,'花のやわらかさ');
 assert.equal(png.draws.filter(d=>d.source==='fon-emilie-scent-props-source-v1.png').length,2);
 await shot('atelier-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('atelier-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  assert.equal(f.storyEmilieScent.bottle,png.storyEmilieScent.bottle);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8921/');
 await wait(()=>window.lab?.frame);
 const source=earned?'work/earned-fontaine-generator/generator-complete.json':'work/fon-emilie-scent-fixture.json';
 const seed=await fs.readFile(source,'utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 if(earned)assert.equal((await frame()).progression.level,91);
 await questButton('受注');
 await count(0);
 await gate(403,atelier);
 const atelierBackground=await scene();
 assert.deepEqual(atelierBackground,{key:'fontaineScentAtelier',file:'fon-emilie-scent-atelier-background-v1.png',state:'ready'});
 await collect(456,'エミリエに依頼の話を聞く');
 await count(1);
 await gate(1275,shore);
 const shoreBackground=await scene();
 assert.deepEqual(shoreBackground,{key:'fontaineScentShore',file:'fon-emilie-scent-shore-background-v1.png',state:'ready'});
 assert.equal((await frame()).total,0);
 await collect(347,'淡紫の港花を摘む');
 await count(2);
 await walk(664);
 assert.equal((await frame()).storyNearbyMilestone,undefined);
 await held('Space',()=>wait(()=>{
  const f=window.lab.frame,a=f.actors[f.active-1];
  return a.y===394&&a.ground;
 }));
 await collect(664,'乾いた香り葉を拾う');
 await count(3);
 assert.equal((await frame()).total,1);
 await shot('shore');
 const kills=(await frame()).kills;
 await walk(1030);
 await held('KeyJ',()=>count(4));
 assert.equal((await frame()).kills,kills+1);
 await collect(1325,'岸に流れ着いた木片を拾う');
 await count(5);
 await gate(1490,atelier);
 await collect(456,'海の気配が強い試作品を試す');
 await count(6);
 await collect(1080,'依頼主に思い出を聞く');
 await count(7);
 await walk(800);
 await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='花のやわらかさを選ぶ');
 assert.match((await frame()).storyEmilieScent.message,/港花の甘さ/);
 assert.equal((await frame()).draws.filter(d=>d.source==='fon-emilie-scent-props-source-v1.png').length,4);
 await shot('recipes');
 await key('KeyG');
 await count(8);
 await collect(1080,'出来上がった香りを渡す');
 await count(9);
 await gate(56,hub);
 await questButton('報告');
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 await questButton('エミリエを同行に選ぶ');
 await wait(()=>window.lab.frame.companion?.id==='emilie'&&window.lab.frame.starterEquipment?.useFlower);
 assert.match(await page.locator('#starterEquipmentStatus').textContent(),/調香師の入門長柄/);
 await reload();
 assert.equal((await frame()).companion.id,'emilie');
 if(earned){
  const restored=await frame();
  assert.equal(restored.story.quests[quest].cycles,1);
  assert.equal(restored.story.quests['field-generator-commission'].status,'complete');
 }
 await gate(403,atelier);
 await collect(565,'記念小瓶を読む');
 await wait(()=>window.lab.frame.storyNotice?.startsWith('記念小瓶「花のやわらかさ」。'));
 const calls=await compareAtelier();
 assert.deepEqual(errors,[]);
 const report=earned?'evidence/earned-fontaine-emilie-browser.json':prefix+'-web.json';
 await fs.writeFile(report,JSON.stringify({
  quest,atelierBackground,shoreBackground,normalAttackBattle:true,assignedCompanion:'emilie',
  restoredBottle:'花のやわらかさ',calls,errors,...(earned?{source,restoredReport:true}:{})
 },null,2)+'\n');
 console.log(quest,calls);
}catch(error){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,state:f?.story?.quests?.['fon-emilie-scent'],total:f?.total,
   active:f?.actors?.[f.active-1],near:f?.storyNearbyMilestone};
 }));
 throw error;
}finally{
 await browser.close();
}
