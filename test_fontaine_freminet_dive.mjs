import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='fontaine-hub',water='fon-toy-shallows',quest='fon-freminet-dive';
const prefix='evidence/fon-freminet-dive';
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

async function move(axis,goal){
 const f=await frame(),old=f.actors[f.active-1][axis],positive=goal>old;
 if(Math.abs(old-goal)<8)return;
 const code=axis==='x'?(positive?'KeyD':'KeyA'):(positive?'KeyS':'KeyW');
 await held(code,()=>wait(({axis,goal,positive})=>{
  const f=window.lab.frame,p=f.actors[f.active-1][axis];
  return positive?p>=goal-6:p<=goal+6;
 },{axis,goal,positive}));
}
async function travel(x,y){
 if(y!==undefined)await move('y',y);
 await move('x',x);
}

async function gate(x,node,y){
 await travel(x,y);
 await wait(node=>{
  const p=window.lab.frame.storyNearbyPortal;
  return p?.to===node&&p.available;
 },node);
 await key('KeyF');
 await at(node);
}

async function collect(x,label,y){
 await travel(x,y);
 await wait(label=>window.lab.frame.storyNearbyMilestone?.label===label,label);
 await key('KeyG');
}

const questButton=name=>page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();

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

async function compareWater(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.ok(png.draws.some(d=>d.source==='fon-freminet-dive-props-source-v1.png'));
 assert.ok(!png.draws.some(d=>d.source==='emilie-idle-source-v2.png'));
 await shot('shallows-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('shallows-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  assert.deepEqual(f.storyToyDive,png.storyToyDive);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8925/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile('work/fon-freminet-dive-fixture.json','utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 assert.equal((await frame()).active,2);
 await questButton('受注');
 await count(0);
 await collect(477,'フレミネと玩具を点検する');
 await count(1);
 await gate(484,water);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(background,{key:'fontaineToyShallows',file:'fon-freminet-dive-shallows-background-v1.png',state:'ready'});
 assert.equal((await frame()).active,1);
 assert.equal(await page.locator('#a2').isHidden(),true);
 await collect(291,'泡の向きを確かめる',216);
 await count(2);
 await collect(525,'岩の陰の流れを調べる',368);
 await count(3);
 await collect(715,'玩具が止まった場所を調べる',261);
 await count(4);
 await travel(743,261);
 await held('KeyD',async()=>{
  await wait(()=>window.lab.frame.storyToyDive?.pushed);
  const stop=(await frame()).t+.55;
  await wait(t=>window.lab.frame.t>=t,stop);
 });
 assert.ok((await frame()).actors[0].x<=761);
 const calls=await compareWater();

 await page.setViewportSize({width:390,height:844});
 const up=page.locator('[data-hold="up"]');
 await up.waitFor();
 assert.equal(await page.locator('[data-land][data-hold="attack"]').isHidden(),true);
 await up.scrollIntoViewIfNeeded();
 const box=await up.boundingBox();
 const startY=(await frame()).actors[0].y;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 try{await wait(y=>window.lab.frame.actors[0].y<y-20,startY)}
 finally{await page.mouse.up()}
 await page.setViewportSize({width:1280,height:960});
 await page.locator('#diveReset').click();
 await wait(()=>window.lab.frame.storyNotice.includes('回収灯へ戻り'));

 await collect(961,'泡の列に目印を置く',379);
 await count(5);
 assert.equal((await frame()).storyToyDive.marker,'泡の列');
 await reload();
 assert.equal((await frame()).active,2);
 assert.equal((await frame()).companion.id,'emilie');
 await gate(484,water);
 await wait(()=>window.lab.frame.storyToyDive?.toy?.arrived===true);
 assert.equal((await frame()).storyToyDive.marker,'泡の列');
 await travel(1250,386);
 await collect(1354,'玩具の帰還を見届ける',304);
 await count(6);
 await gate(1547,hub,250);
 assert.equal((await frame()).active,2);
 assert.equal(await page.locator('#a2').isVisible(),true);
 await questButton('報告');
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 await collect(477,'展示の潜航玩具を見る');
 await wait(()=>window.lab.frame.storyDiveExhibit?.message.includes('次は'));
 await shot('toy-exhibit');
 await gate(484,water);
 await collect(1454,'浅瀬を眺める',177);
 await wait(()=>window.lab.frame.storyToyDive?.message.includes('見晴らし'));
 await shot('free-look');
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-web.json',JSON.stringify({
  quest,background,pushBackAndSidePass:true,touchMovesVertically:true,checkpointResumesOriginalParty:true,
  markerSavedAndToyReturned:true,postQuestExhibitAndLookout:true,calls,errors
 },null,2)+'\n');
 console.log(quest,calls);
}catch(error){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,state:f?.story?.quests?.['fon-freminet-dive'],view:f?.storyToyDive,
   near:f?.storyNearbyMilestone,actor:f?.actors?.[f.active-1]};
 }));
 throw error;
}finally{
 await browser.close();
}
