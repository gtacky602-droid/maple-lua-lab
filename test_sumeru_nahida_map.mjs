import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='sumeru-hub',stop='sumeru-observation-stop',glade='sum-nahida-dew-glade';
const quest='sum-nahida-map',prefix='evidence/sum-nahida-map';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),map=page.locator('#discoveryMap'),errors=[];
const confirm=page.locator('#discoveryMapConfirm');
const pick=id=>page.locator(`[data-discovery-pick="${id}"]`);
const method=id=>page.locator(`[data-discovery-method="${id}"]`);
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:22000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const shot=(name,locator=page.locator('.game'))=>locator.screenshot({path:prefix+'-'+name+'.png'});

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

async function questButton(name,status){
 await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
 await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
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

async function choose(id,way){
 await pick(id).click();
 await method(id).selectOption(way);
 await wait(({id,way})=>window.lab.frame.storyDiscoveryMap.cards.find(card=>card.id===id).method===way,{id,way});
}

async function compareGlade(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.equal(png.draws.filter(d=>d.source==='sum-nahida-map-props-source-v1.png').length,1);
 await shot('glade-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('glade-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  assert.equal(f.actors[f.active-1].y,394);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8920/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile('work/sum-nahida-map-fixture.json','utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 await questButton('受注','active');
 await collect(950,'ナヒーダに発見の話を聞く');
 await collect(950,'絵地図を開く');
 await map.waitFor();
 assert.equal(await pick('sky').isDisabled(),true);
 assert.equal(await pick('dew').isDisabled(),true);
 await choose('leaf','panel');
 await choose('branches','sound');
 assert.equal(await confirm.isDisabled(),true);
 await page.setViewportSize({width:390,height:844});
 await wait(()=>matchMedia('(max-width:850px)').matches);
 const width=await map.evaluate(el=>[el.clientWidth,el.scrollWidth]);
 assert.equal(width[0],width[1]);
 await page.setViewportSize({width:1280,height:960});
 await reload();
 await collect(950,'絵地図を開く');
 await wait(()=>!!window.lab.frame.storyDiscoveryMap);
 await map.waitFor();
 assert.equal(await method('leaf').inputValue(),'panel');
 assert.equal(await method('branches').inputValue(),'sound');
 await method('branches').focus();
 await page.keyboard.press('Escape');
 await map.waitFor({state:'hidden'});
 await wait(()=>!window.lab.frame.storyDiscoveryMap);

 await gate(1162,stop);
 await gate(983,glade);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(background,{key:'sumeruNahidaGlade',file:'sum-nahida-map-glade-background-v1.png',state:'ready'});
 await walk(620);
 assert.equal((await frame()).storyNearbyMilestone,undefined);
 await held('Space',()=>wait(()=>{
  const f=window.lab.frame,a=f.actors[f.active-1];
  return a.y===394&&a.ground;
 }));
 await collect(620,'葉の上の朝露を調べる');
 await wait(quest=>window.lab.frame.story.quests[quest]?.discoveryDew===true,quest);
 const calls=await compareGlade();

 await gate(57,stop);
 await gate(55,hub);
 await collect(950,'絵地図を開く');
 await choose('dew','gleam');
 assert.equal(await pick('roots').isDisabled(),true);
 assert.equal(await confirm.isEnabled(),true);
 await shot('draft',map);
 await confirm.click();
 await map.waitFor({state:'hidden'});
 await questButton('報告','complete');
 await collect(950,'広場に掲示した絵地図を読む');
 await map.getByRole('heading',{name:'広場の絵地図'}).waitFor();
 const entries=await map.locator('strong').allTextContents();
 assert.deepEqual(entries,['葉の橋','枝間水路','大きな朝露']);
 assert.equal(await map.locator('select').count(),0);
 await shot('posted',map);
 await reload();
 await collect(950,'広場に掲示した絵地図を読む');
 assert.deepEqual(await map.locator('strong').allTextContents(),entries);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-web.json',JSON.stringify({
  quest,background,checked:{reloadedDraft:true,optionalGlade:true,lockedFourthCard:true,postedAfterReload:true,mobileWidth:390},
  entries,calls,errors
 },null,2)+'\n');
 console.log(quest,calls);
}catch(error){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,actor:f?.actors?.[f.active-1]?.x,paused:f?.paused,
   open:!!f?.storyDiscoveryMap,focus:document.activeElement?.outerHTML.slice(0,160),
   status:document.querySelector('#status')?.textContent};
 }));
 throw error;
}finally{
 await browser.close();
}
