import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='fontaine-hub',room='fontaine-rehearsal-room',arena='fontaine-grand-stage';
const earned=process.argv.includes('--earned');
const quest='fon-furina-cues',prefix=earned?'work/earned-fontaine-seahorse/furina':'evidence/fon-furina-cues';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),panel=page.locator('#furinaRehearsal'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:24000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});
const cue=id=>panel.locator(`[data-rehearsal-cue="${id}"]`);
const phase=id=>wait(id=>window.lab.frame.storyFurinaFinale?.phase===id,id);

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

async function compareRehearsal(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.equal(png.draws.filter(d=>d.source==='fon-furina-cues-props-source-v1.png').length,3);
 await shot('rehearsal-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('rehearsal-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  assert.deepEqual(f.storyFurinaRehearsal,png.storyFurinaRehearsal);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8922/');
 await wait(()=>window.lab?.frame);
 const source=earned?'work/earned-fontaine-emperor/emperor-complete.json':'work/fon-furina-cues-fixture.json';
 const seed=await fs.readFile(source,'utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load(hub);
 await questButton('受注');
 await count(0);
 await gate(1240,room);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(background,{key:'fontaineRehearsal',file:'fontaine-rehearsal-background-v1.png',state:'ready'});
 await collect(245,'フリーナと舞台係に話を聞く');
 await count(1);
 await collect(454,'装置を一つずつ試す');
 await panel.waitFor();
 assert.equal(await cue('lamp').isDisabled(),true);
 await cue('curtain').click();
 await wait(()=>window.lab.frame.storyFurinaRehearsal?.cue==='lamp');
 await cue('lamp').click();
 await wait(()=>window.lab.frame.storyFurinaRehearsal?.cue==='wave');
 await cue('wave').click();
 await count(2);
 await panel.waitFor({state:'hidden'});
 assert.match((await frame()).storyNotice,/一拍待って/);
 await reload(room);

 await collect(454,'一拍置く稽古を始める');
 await wait(()=>window.lab.frame.storyFurinaRehearsal?.open);
 await panel.waitFor();
 await cue('pair').click();
 await wait(()=>window.lab.frame.storyFurinaRehearsal?.message.includes('一拍待ち'));
 assert.equal((await frame()).storyFurinaRehearsal.curtain,false);
 await wait(()=>window.lab.frame.storyFurinaRehearsal?.ready);
 await page.setViewportSize({width:390,height:844});
 const width=await panel.evaluate(el=>[el.clientWidth,el.scrollWidth]);
 assert.equal(width[0],width[1]);
 await page.setViewportSize({width:1280,height:960});
 await key('KeyG');
 await wait(()=>window.lab.frame.storyFurinaRehearsal?.cue==='wave');
 const paired=(await frame()).storyFurinaRehearsal;
 assert.equal(paired.curtain,true);
 assert.equal(paired.light,true);
 assert.equal(paired.wave,false);
 await wait(()=>window.lab.frame.storyFurinaRehearsal?.ready);
 await cue('wave').click();
 await count(3);
 await panel.waitFor({state:'hidden'});
 await walk(595);
 const calls=await compareRehearsal();
 await collect(245,'拍手を受け取る');
 await count(4);
 await gate(1264,hub);
 await questButton('報告');
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);

 if(earned){
  await reload(hub);
  const restored=await frame();
  assert.equal(restored.story.quests[quest].cycles,1);
  assert.equal(restored.story.quests['emperor-commission'].status,'complete');
  assert.deepEqual(errors,[]);
  await fs.writeFile('evidence/earned-fontaine-furina-browser.json',JSON.stringify({
   quest,source,background,completedWithTextCues:true,earlyCueRetried:true,
   savedFirstRehearsal:true,restoredReport:true,level:restored.progression.level,mobileWidth:390,calls,errors
  },null,2)+'\n');
 }else{

 await gate(1320,arena);
 await walk(1325);
 await held('Space',()=>wait(()=>{
  const f=window.lab.frame,a=f.actors[f.active-1];
  return a.y===390&&a.ground;
 }));
 await collect(1325,'稽古の演出でもう一度上演する');
 await phase('quiet');
 assert.equal((await frame()).storyFurinaFinale.light,false);
 assert.equal((await frame()).storyNearbyMilestone,undefined);
 await shot('encore-quiet');
 await phase('bow');
 assert.equal((await frame()).storyFurinaFinale.wave,true);
 assert.match(await page.locator('#storyForest').textContent(),/舞台係へ拍手/);
 await shot('encore-bow');
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-web.json',JSON.stringify({
  quest,background,completedWithTextCues:true,earlyCueRetried:true,
  savedFirstRehearsal:true,mobileWidth:390,addedAfterMainAndReplayed:true,calls,errors
 },null,2)+'\n');
 }
 console.log(quest,calls);
}catch(error){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,state:f?.story?.quests?.['fon-furina-cues'],
   rehearsal:f?.storyFurinaRehearsal,finale:f?.storyFurinaFinale,near:f?.storyNearbyMilestone};
 }));
 throw error;
}finally{
 await browser.close();
}
