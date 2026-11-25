import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='sumeru-hub',shop='sum-kaveh-workshop',observatory='sumeru-sky-observatory',room='sum-kaveh-reading-room';
const quest='sum-kaveh-model',prefix='evidence/sum-kaveh-room';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),board=page.locator('#readingModel'),errors=[];
const confirm=page.locator('#readingModelConfirm'),picker=page.locator('#readingModelPart');
const stop=id=>page.locator(`[data-model-to="${id}"]`);
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:24000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
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
  const f=await frame(),player=f.actors[f.active-1],right=x>player.x;
  if(Math.abs(player.x-x)<8)return;
  await held(right?'KeyD':'KeyA',()=>wait(({x,right})=>{
    const f=window.lab.frame,player=f.actors[f.active-1];
    return right?player.x>=x-7:player.x<=x+7;
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

async function load(node=hub){
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

async function scene(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function movePawn(id){
  await stop(id).click();
  await wait(id=>window.lab.frame.storyKavehModel?.here.id===id,id);
}

async function choose(id){
  await picker.selectOption(id);
  await wait(id=>window.lab.frame.storyKavehModel?.selected===id,id);
}

async function compareRoom(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.storyKavehRoom.seat,'view');
  assert.equal(png.draws.filter(d=>d.source==='sum-kaveh-room-props-source-v1.png').length,4);
  await shot('room-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n,standard.commands);
  const light=await frame();
  assert.equal(light.draws.filter(d=>d.kind==='rect_runs').length,4);
  assert.equal(light.rectBatches.length,4);
  await shot('room-light');
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyKavehRoom,png.storyKavehRoom);
    assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  }
  await menu.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  const proofLua=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8919/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/sum-kaveh-room-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await load();
  await questButton('受注','active');
  await gate(702,shop);
  const workshop=await scene();
  assert.deepEqual(workshop,{key:'sumeruKavehWorkshop',file:'sum-kaveh-room-workshop-background-v1.png',state:'ready'});
  await collect(450,'閲覧室の模型を見せてもらう');
  await count(1);
  await collect(450,'模型を拡大して駒を動かす');
  await board.waitFor();
  const beforePawn=await frame();
  assert.equal(beforePawn.storyKavehModel.result.view,false);
  assert.equal(await stop('window').isDisabled(),true);
  assert.equal(await confirm.isDisabled(),true);
  await shot('blocked',board);
  await movePawn('shelves');
  await choose('low');
  const low=await frame();
  assert.equal(low.actors[low.active-1].x,beforePawn.actors[beforePawn.active-1].x);
  assert.equal(low.storyKavehModel.result.storage,4);
  assert.equal(low.storyKavehModel.result.view,true);
  assert.equal(await confirm.isDisabled(),true);
  await page.setViewportSize({width:390,height:844});
  const measure=await board.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  assert.equal(measure.width,measure.scroll);
  await page.setViewportSize({width:1280,height:960});
  await reload(hub);
  await gate(702,shop);
  await collect(450,'模型を拡大して駒を動かす');
  await wait(()=>window.lab.frame.storyKavehModel?.here.id==='shelves');
  assert.equal(await picker.inputValue(),'low');
  await choose('wall');
  await movePawn('window');
  await choose('inward');
  await movePawn('seat');
  await choose('view');
  assert.equal((await frame()).storyKavehModel.result.clear,false);
  assert.equal(await confirm.isDisabled(),true);
  await shot('clearance',board);
  await movePawn('window');
  await choose('outward');
  await wait(()=>window.lab.frame.storyKavehModel.result.ready);
  await picker.focus();
  await page.keyboard.press('Escape');
  await board.waitFor({state:'hidden'});
  await collect(450,'模型を拡大して駒を動かす');
  await wait(()=>window.lab.frame.storyKavehModel?.result.ready);
  await shot('layout',board);
  await confirm.click();
  await count(2);
  await board.waitFor({state:'hidden'});
  await gate(65,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,proofLua.reward);
  await gate(1282,observatory);
  await gate(1237,room);
  const reading=await scene();
  assert.deepEqual(reading,{key:'sumeruKavehRoom',file:'sum-kaveh-room-room-background-v1.png',state:'ready'});
  await walk(638);
  const commands=await compareRoom();
  await collect(1029,'森を望む窓を調べる');
  await wait(()=>window.lab.frame.storyNotice?.includes('外に開く窓'));
  await reload(observatory);
  await gate(1237,room);
  const end=await frame();
  assert.deepEqual([end.storyKavehRoom.shelf,end.storyKavehRoom.seat,end.storyKavehRoom.window,end.storyKavehRoom.storage],
    ['wall','view','outward',8]);
  assert.equal(end.mora,after.mora);
  assert.deepEqual(errors,[]);
  const proof={scenes:[workshop,reading],fourPawnStopsAndReachability:true,allThreePartsAffectTest:true,
    draftRestoredInBrowser:true,mobileModelFits:true,escapePreservesModel:true,
    acceptedAfterMainAndRoomRestored:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(quest=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,
      nearby:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,here:f?.storyKavehModel?.here,
      result:f?.storyKavehModel?.result,room:f?.storyKavehRoom,quest:f?.story?.quests[quest]};
  },quest));
  throw error;
}finally{
  await browser.close();
}
