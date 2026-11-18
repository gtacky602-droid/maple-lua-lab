import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='nod-moon-rumor',town='nod-town',quay='nod-rumor-quay',ledge='nod-rumor-ledge';
const prefix='evidence/nod-moon-rumor';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value)=>page.waitForFunction(fn,value,{timeout:23000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1],east=x>a.x;
  if(Math.abs(a.x-x)<8)return;
  const dir=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(dir);
  try{
    await wait(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{await page.keyboard.up(dir)}
}

async function gate(x,node){
  await walk(x);
  await wait(node=>{const p=window.lab.frame.storyNearbyPortal;return p?.available&&p.to===node},node);
  await key('KeyF');
  await at(node);
}

async function inspect(x,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  if(n!==undefined)await count(n);
}

async function questButton(name,status){
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
}

async function scenery(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function light(on){
  await page.locator('#reflectionLight').click();
  await wait(on=>window.lab.frame.storyReflection?.lit===on,on);
}

async function compare(){
  await walk(562);
  await walk(644);
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  for(const name of ['witnesses','boards']){
    assert.equal(png.draws.filter(d=>d.source===`nod-rumor-${name}-source-v1.png`).length,3);
  }
  assert.match(png.storyRumor.message,/光る石 → 月のような石 → 月から取った石/);
  await shot('png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*12,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.66,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyRumor.heard===3));
  await shot('light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function saveReload(){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(quay);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8905/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/nod-moon-rumor-fixture.json','utf8');
  const lua=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  await gate(1039,quay);
  const quayScene=await scenery();
  assert.deepEqual(quayScene,{key:'nodNightStalls',file:'nod-night-stalls-background-v1.png',state:'ready'});
  await questButton('受注','active');
  await inspect(242,1);
  await inspect(510,2);
  await wait(()=>window.lab.frame.storyNotice?.includes('小石'));
  await inspect(738,3);
  await wait(()=>window.lab.frame.storyNotice?.includes('月みたいな石'));
  await saveReload();
  assert.equal((await frame()).storyRumor.heard,2);
  await inspect(963,4);
  await wait(()=>window.lab.frame.storyNotice?.includes('月から取った石'));
  const commands=await compare();
  await gate(1470,ledge);
  const ledgeScene=await scenery();
  assert.deepEqual(ledgeScene,{key:'nodMoonShallows',file:'nod-moon-shallows-background-v1.png',state:'ready'});
  await walk(426);
  await key('KeyG');
  await wait(()=>window.lab.frame.storyReflection?.orientation==='波打ち際');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyReflection?.orientation==='現物の石');
  const confirm=page.getByRole('button',{name:'照合する',exact:true});
  await confirm.click();
  await wait(()=>window.lab.frame.storyNotice?.includes('見比べてください'));
  await count(4);
  await light(false);
  assert.ok((await frame()).draws.some(d=>d.text==='現物の石'&&Number.isFinite(d.y)));
  assert.match(await page.locator('#reflectionImage').textContent(),/消灯時　灰色の石/);
  await shot('stone-dark');
  await light(true);
  assert.match(await page.locator('#reflectionImage').textContent(),/小さな月のように光る/);
  await shot('stone-light');
  await confirm.click();
  await count(5);
  assert.ok((await frame()).storyReflection.replay);
  await gate(62,quay);
  await inspect(1252,6);
  assert.equal((await frame()).story.quests[quest].storyChoice,'one-flash');
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,lua.firstReportReward);
  await saveReload();
  await inspect(242);
  await wait(()=>window.lab.frame.storyNotice?.includes('冒険談『波止場のひと光り』'));
  assert.equal((await frame()).storyRumor.published,'波止場のひと光り');
  await walk(175);
  await shot('posted');
  await gate(1470,ledge);
  await walk(470);
  await wait(()=>window.lab.frame.storyReflection?.replay);
  await light(false);
  await light(true);
  await confirm.click();
  await wait(()=>window.lab.frame.storyNotice?.includes('照射を再現しました'));
  await count(6);
  assert.deepEqual(errors,[]);
  const proof={quayScene,ledgeScene,witnessesReloaded:true,rejectedBeforeComparison:true,
    comparisonReplay:true,published:'波止場のひと光り',commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,rumor:f?.storyRumor,reflection:f?.storyReflection};
  }),errors);
  throw error;
}finally{await browser.close()}
