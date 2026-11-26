import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';





const outer='fontaine-hub',book='simulanka-book-room',hub='simulanka-hub';
const valley='simulanka-fold-valley',lantern='simulanka-lantern-perch';
const first='simulanka-open-page',second='simulanka-folded-road',prefix='evidence/simulanka-folds';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,param,timeout=12000)=>page.waitForFunction(fn,param,{timeout});
const nodeIs=node=>wait(id=>window.lab.frame.story.node===id,node);
const row=id=>page.locator(`[data-quest="${id}"]`);

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1];
  if(Math.abs(x-a.x)<7)return;
  const east=x>a.x,dir=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(dir);
  try{
    await wait(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{await page.keyboard.up(dir)}
}

async function jump(x,y){
  await walk(x);
  await canvas.click();
  await page.keyboard.down('Space');
  try{
    await wait(y=>window.lab.frame.actors[0].y===y&&window.lab.frame.actors[0].ground,y);
  }finally{await page.keyboard.up('Space')}
}

async function gate(x,node){
  await walk(x);
  await wait(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node,16000);
  await key('KeyF');
  await nodeIs(node);
}

async function count(id,n){
  await wait(({id,n})=>window.lab.frame.story.quests[id]?.count===n,{id,n});
}

async function interact(x,id,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  await count(id,n);
}

async function quest(id,label,status){
  await row(id).getByRole('button',{name:label,exact:true}).click();
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function saveReload(){
  await page.click('#saveProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
}

async function background(){
  return page.evaluate(async()=>{
    const {sceneryStatus,backgroundReady}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function report(id,reward){
  const before=await frame();
  await quest(id,'報告','complete');
  const after=await frame();
  const received=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(received,reward);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='paper-lantern-source-v1.png'&&d.h===96));
  await page.locator('.game').screenshot({path:prefix+'-lantern-png.png'});
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await page.locator('.game').screenshot({path:prefix+'-lantern-light.png'});
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function crossTo(x,y){
  const start=(await frame()).actors[0].x;
  const right=x>start,dir=right?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down('Space');
  try{
    if(Math.abs(x-start)>6){
      await page.keyboard.down(dir);
      try{await wait(({x,right})=>right?window.lab.frame.actors[0].x>=x-5:window.lab.frame.actors[0].x<=x+5,{x,right});}
      finally{await page.keyboard.up(dir)}
    }
    await wait(y=>window.lab.frame.actors[0].ground&&window.lab.frame.actors[0].y===y,y);
  }finally{await page.keyboard.up('Space')}
}

async function fold(choice){
  await key('KeyG');
  await wait(choice=>window.lab.frame.storyPaper?.choice===choice,choice);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8871/');
  await wait(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/simulanka-folds-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(outer);
  assert.ok(!(await frame()).storyGraph.nodes.some(n=>n.hiddenGroup==='simulanka'));
  await walk(1050);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label.startsWith('不思議な絵本'));
  await key('KeyG');
  await wait(()=>window.lab.frame.story.discovered.simulanka);
  await gate(1138,book);
  await quest(first,'受注','active');
  await interact(321,first,1);
  await walk(497);
  await wait(()=>window.lab.frame.storyPaper?.choice==='表・描かれた道');
  await page.click('#paperConfirm');
  await wait(()=>window.lab.frame.storyNotice?.includes('まだ絵'));
  await fold('裏・立ち上がった道');
  assert.ok((await frame()).platforms.some(p=>p.paperPreview));
  await fold('表・描かれた道');
  assert.ok(!(await frame()).platforms.some(p=>p.paperFold));
  await fold('裏・立ち上がった道');
  await page.locator('.game').screenshot({path:prefix+'-page.png'});
  await page.click('#paperConfirm');
  await count(first,2);
  await saveReload();
  await nodeIs(book);
  assert.ok((await frame()).platforms.some(p=>p.paperFold&&!p.paperPreview));
  await walk(625);
  await crossTo(641,389);
  await gate(1350,hub);
  await interact(655,first,3);
  await interact(313,first,4);
  await gate(313,book);
  assert.equal((await frame()).actors[0].y,389);
  await report(first,[25500,790,2]);
  await page.getByRole('button',{name:'拠点へ：シムランカ・入口広場',exact:true}).click();
  await nodeIs(hub);
  console.log('Two page faces and persisted crossing verified');

  await quest(second,'受注','active');
  await gate(1197,valley);
  const scene=await background();
  assert.deepEqual(scene,{key:'paperValley',file:'paper-valley-background-v1.png',state:'ready'});
  await walk(235);await fold('一枚の長橋');
  await page.click('#paperConfirm');
  await wait(()=>window.lab.frame.storyNotice?.includes('低い橋だけ'));
  await walk(622);
  await crossTo(651,464);
  await walk(1290);
  await canvas.click();
  await page.keyboard.down('KeyD');
  try{await wait(()=>window.lab.frame.storyNotice?.includes('手前の足場に戻りました'));}
  finally{await page.keyboard.up('KeyD')}
  assert.equal((await frame()).returns,0);
  await saveReload();
  await nodeIs(hub);
  await gate(1197,valley);
  assert.equal((await frame()).platforms.length,2);
  await walk(235);await fold('一枚の長橋');await fold('小さな階段');
  await walk(398);await fold('低い継ぎ板');await fold('短い橋');
  await page.locator('[data-quest="'+second+'"]').getByRole('button',{name:'この依頼を追跡',exact:true}).click();
  await page.locator('#trackedQuestMap').click();
  const link=page.locator('#atlasQuestPoint');
  await link.waitFor();
  assert.equal(await link.innerText(),'現在の折り方と足場を見る');
  const [preview]=await Promise.all([page.waitForEvent('popup'),link.click()]);
  try{
    const station=preview.getByLabel('操作場所'),form=preview.getByLabel('紙の形');
    await station.waitFor();
    assert.equal(await station.locator('option:checked').textContent(),'中央の板');
    assert.equal(await form.locator('option:checked').textContent(),'短い橋');
    await station.selectOption({index:0});
    assert.equal(await form.locator('option:checked').textContent(),'小さな階段');
    await station.selectOption({index:2});
    assert.equal(await form.inputValue(),'0');
    await form.selectOption('3');
    await preview.getByRole('button',{name:'できる足場を見る'}).click();
  }finally{await preview.close()}
  await page.bringToFront();
  await page.keyboard.press('Escape');
  assert.deepEqual((await frame()).storyFoldRoute.forms,[2,2,0]);
  await walk(556);await fold('斜めに落ちる板');await fold('高すぎる棚');await fold('遮蔽付きの踏み台');
  await page.click('#paperConfirm');
  await count(second,1);
  await saveReload();
  await nodeIs(hub);
  await gate(1197,valley);
  const rebuilt=(await frame()).platforms.filter(p=>p.paperFold&&!p.paperPreview);
  assert.equal(rebuilt.length,5);
  await walk(642);
  for(const [x,y] of [[680,422],[757,361],[889,310]])await crossTo(x,y);
  await walk(1261);
  await crossTo(1280,281);
  await walk(1339);
  await page.locator('.game').screenshot({path:prefix+'-crossing.png'});
  await crossTo(1496,270);
  await page.click('#auto');
  await count(second,2);
  await page.click('#auto');
  await wait(()=>!window.lab.frame.auto);
  await gate(1860,lantern);
  console.log('Long bridge rejected, safe fall, three folds, and ordinary jump crossing verified');

  await jump(507,390);
  await interact(507,second,3);
  await walk(718);
  await wait(()=>window.lab.frame.actors[0].ground);
  const commands=await compare();
  await walk(996);
  await fold('折り紙の鳥');
  await fold('折り紙の小舟');
  await fold('折り紙の灯り');
  await fold('折り紙の鳥');
  await fold('折り紙の小舟');
  await page.click('#paperConfirm');
  await count(second,4);
  assert.equal((await frame()).story.quests[second].paperSouvenir,'boat');
  await gate(1280,hub);
  await interact(905,second,5);
  await report(second,[33400,1060,3]);
  await saveReload();
  await nodeIs(hub);
  await walk(905);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='置いた折り紙飾りを確かめる');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.startsWith('折り紙の小舟'));
  await walk(845);
  await canvas.screenshot({path:prefix+'-souvenir.png'});
  await gate(1030,lantern);
  assert.deepEqual(errors,[]);
  const proof={bookDiscovery:true,frontBack:true,pageAfterReload:true,wrongBridgeFailed:true,safeReturn:true,
    lockedFoldsAfterReload:true,normalJumpAcross:true,guardsAndChest:true,souvenir:'boat',readbackAfterReload:true,
    twoWayShortcut:true,scene,commands,firstReport:[25500,790,2],secondReport:[33400,1060,3],errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,t:f?.t,actor:f?.actors[0],quests:f?.story.quests,paper:f?.storyPaper,
      portal:f?.storyNearbyPortal,notice:f?.storyNotice,platforms:f?.platforms};
  }),errors);
  throw error;
}finally{await browser.close()}
