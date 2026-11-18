import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='fontaine-hub',loft='fontaine-moon-fly-loft',wings='fontaine-stage-wings';
const catwalk='fontaine-lift-catwalk',floor='fontaine-understage-workfloor';
const store='fontaine-parcel-storeroom',rehearsal='fontaine-rehearsal-room',quest='fontaine-understage-crew';
const prefix='evidence/fontaine-understage';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:16000});
const nodeIs=node=>wait(id=>window.lab?.frame?.story?.node===id,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
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

async function crossWave(){
  await walk(620);
  await canvas.click();
  await page.keyboard.down('Space');
  try{
    await page.keyboard.down('KeyD');
    try{await wait(()=>window.lab.frame.actors[0].x>=750);}
    finally{await page.keyboard.up('KeyD')}
    await wait(()=>window.lab.frame.actors[0].ground&&window.lab.frame.actors[0].y===390);
  }finally{await page.keyboard.up('Space')}
}

async function gate(x,node,ride=false){
  await walk(x);
  await wait(id=>{
    const p=window.lab.frame.storyNearbyPortal;
    return p?.available&&p.to===id;
  },node);
  await key('KeyF');
  if(ride)await wait(()=>window.lab.frame.storyLift?.seconds===1.74&&
    window.lab.frame.actors[0].y>340&&window.lab.frame.actors[0].y<430);
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
  await wait(()=>window.lab.frame.storyAirflow);
  await key('KeyG');
  await wait(text=>window.lab.frame.storyAirflow?.selection===text,text);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='stage-wave-source-v1.png'&&d.h===94));
  await screenshot('wave-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyTheaterWave.raised));
  await screenshot('wave-light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function saveReload(node){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await nodeIs(node);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8874/');
  await wait(()=>window.lab?.frame);
  const raw=await fs.readFile('work/fontaine-understage-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  await page.locator('#loadProgress').click();
  await nodeIs(hub);
  await questButton('受注','active');
  await gate(995,loft);
  await gate(1110,wings);
  assert.ok((await frame()).draws.some(d=>d.source==='stage-wave-source-v1.png'));
  await inspect(366,1);
  await wait(()=>!window.lab.frame.draws.some(d=>d.source==='stage-wave-source-v1.png'));
  await inspect(866,2);
  await jump(868,400);
  await jump(1057,321);
  await screenshot('stairs');
  await gate(1428,catwalk);
  await jump(524,390);
  await jump(524,300);
  await gate(525,floor,true);
  await gate(525,catwalk,true);
  await gate(525,floor,true);
  const floorScene=await scene();
  assert.deepEqual(floorScene,{key:'fontaineUnderstage',file:'fontaine-understage-background-v1.png',state:'ready'});
  await walk(552);
  const pre=(await frame()).actors[0].hp;
  await wait(hp=>window.lab.frame.actors[0].hp<hp,pre);
  await choose('板を寝かせる');
  await page.locator('#airflowCommit').click();
  await wait(()=>window.lab.frame.storyNotice?.includes('飛び道具を止められません'));
  await count(2);
  await choose('板を立てる');
  await page.locator('#airflowCommit').click();
  await count(3);
  await wait(()=>window.lab.frame.storyTheaterWave?.raised);
  const protectedHP=(await frame()).actors[0].hp;
  await wait(()=>window.lab.frame.projectiles?.some(p=>p.x<751&&p.x>708));
  const commands=await compare();
  await wait(()=>!window.lab.frame.projectiles?.length);
  assert.equal((await frame()).actors[0].hp,protectedHP);
  console.log('Curtain, normal jumps, lift round trip, and projectile cover verified');
  await crossWave();
  await walk(930);await key('KeyJ');
  await walk(1327);await key('KeyJ');
  if(!(await frame()).auto)await page.locator('#auto').click();
  await count(4);
  if((await frame()).auto)await page.locator('#auto').click();
  await gate(1590,store);
  await inspect(292,5);
  await inspect(534,6);
  await saveReload(store);
  await jump(833,390);
  await inspect(833,7);
  await walk(1008);
  await choose('受領の前に盗まれた');
  await page.locator('#airflowCommit').click();
  await wait(()=>window.lab.frame.storyNotice?.includes('受領の署名'));
  await count(7);
  await choose('旧劇場宛てとして受け取った');
  await page.locator('#airflowCommit').click();
  await count(8);
  await inspect(1162,9);
  await gate(1247,rehearsal);
  const rehearsalScene=await scene();
  assert.deepEqual(rehearsalScene,{key:'fontaineRehearsal',file:'fontaine-rehearsal-background-v1.png',state:'ready'});
  await inspect(764,10);
  await gate(1264,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,JSON.parse(await fs.readFile(prefix+'-lua.json','utf8')).reward);
  await saveReload(hub);
  await gate(1240,rehearsal);
  await walk(764);
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.startsWith('稽古場の記録'));
  await screenshot('rehearsal');
  assert.deepEqual(errors,[]);
  const proof={normalStairs:true,liftRoundTrip:true,realProjectilesAndCover:true,incorrectChoicesRejected:true,
    storeCheckpoint:true,threeRecordsAndReroute:true,shortcutAndReadback:true,scenes:[floorScene,rehearsalScene],
    commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],wave:f?.storyTheaterWave,lift:f?.storyLift,
      notice:f?.storyNotice,portal:f?.storyNearbyPortal,milestone:f?.storyNearbyMilestone,
      platforms:f?.platforms,projectiles:f?.projectiles};
  }),errors);
  throw error;
}finally{await browser.close()}
