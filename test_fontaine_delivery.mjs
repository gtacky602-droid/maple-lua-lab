import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='fontaine-hub', counter='fontaine-parcel-counter', quay='fontaine-delivery-quay';
const hall='fontaine-old-scenery-door', loft='fontaine-moon-fly-loft', quest='fontaine-moon-parcel';
const prefix='evidence/fontaine-delivery';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:16000});
const nodeIs=node=>wait(id=>window.lab?.frame?.story?.node===id,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const cartPhase=phase=>wait(phase=>window.lab.frame.storyTheaterCart?.phase===phase,phase);
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),actor=f.actors[f.active-1];
  if(Math.abs(x-actor.x)<7)return;
  const east=x>actor.x,dir=east?'KeyD':'KeyA';
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
    await wait(y=>window.lab.frame.actors[0].ground&&window.lab.frame.actors[0].y===y,y);
  }finally{await page.keyboard.up('Space')}
}

async function gate(x,node){
  await walk(x);
  await wait(id=>{
    const portal=window.lab.frame.storyNearbyPortal;
    return portal?.available&&portal.to===id;
  },node);
  await key('KeyF');
  await nodeIs(node);
}

async function inspect(x,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  await count(n);
}

async function questButton(name,status){
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
}

async function scene(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function choose(text){
  await key('KeyG');
  await wait(text=>window.lab.frame.storyAirflow?.selection===text,text);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='parcel-meka-source-v1.png'&&d.h===94));
  await screenshot('cart-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyTheaterCart.x===png.storyTheaterCart.x));
  await screenshot('cart-light');
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
  await nodeIs(hub);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8873/');
  await wait(()=>window.lab?.frame);
  const raw=await fs.readFile('work/fontaine-delivery-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  await page.locator('#loadProgress').click();
  await nodeIs(hub);
  await questButton('受注','active');
  await gate(855,counter);
  await inspect(320,1);
  await gate(1180,quay);
  const quayScenery=await scene();
  assert.deepEqual(quayScenery,{key:'fontaineDelivery',file:'fontaine-delivery-quay-background-v1.png',state:'ready'});
  assert.ok(!(await frame()).storyPortals.some(p=>p.to===hall));
  await inspect(508,2);
  await inspect(900,3);
  await walk(1038);
  await choose('水路に沈んだ');
  await page.locator('#airflowCommit').click();
  await wait(()=>window.lab.frame.storyNotice?.includes('布は乾いています'));
  await count(3);
  await choose('今の倉庫へ運んだ');
  await choose('旧搬入口へ運んだ');
  await page.locator('#airflowCommit').click();
  await count(4);
  await walk(1178);
  await key('KeyG');
  await cartPhase('starting');
  await cartPhase('waitingForPlayer');
  await count(4);
  const commands=await compare();
  await walk(1410);
  await cartPhase('following');
  await walk(1634);
  await cartPhase('parked');
  await count(5);
  await gate(1820,hall);
  const loftScenery=await scene();
  assert.deepEqual(loftScenery,{key:'fontaineBackstage',file:'fontaine-backstage-background-v1.png',state:'ready'});
  await walk(400);await key('KeyJ');
  await jump(800,390);await key('KeyJ');
  await page.locator('#auto').click();
  await count(6);
  await page.locator('#auto').click();
  await gate(1510,loft);
  await jump(863,391);
  await inspect(863,7);
  await screenshot('moon');
  await gate(1300,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,JSON.parse(await fs.readFile(prefix+'-lua.json','utf8')).reward);
  await saveReload();
  await gate(995,loft);
  await jump(863,391);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='月飾りの搬送記録を読む');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.startsWith('搬送記録'));
  assert.deepEqual(errors,[]);
  const proof={receiptAndThreeClues:true,wrongLeadRejected:true,cartWaitsForPlayer:true,
    actualChaseOpensEntrance:true,twoGuards:true,moonFound:true,shortcutAndReadbackAfterReload:true,
    scenes:[quayScenery,loftScenery],commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],cart:f?.storyTheaterCart,notice:f?.storyNotice,
      milestone:f?.storyNearbyMilestone,portals:f?.storyPortals};
  }),errors);
  throw error;
}finally{await browser.close()}
