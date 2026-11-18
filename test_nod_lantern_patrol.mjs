import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='nod-lantern-patrol',cabin='nod-patrol-cabin',shore='nod-patrol-shore';
const bend='nod-patrol-bend',post='nod-patrol-post',prefix='evidence/nod-lantern-patrol';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value,timeout=23000)=>page.waitForFunction(fn,value,{timeout});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=(n,timeout)=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n},timeout);
const ground=y=>wait(y=>{const a=window.lab.frame.actors[0];return a.ground&&a.y===y},y);
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

async function jump(x,y){
  await walk(x);
  await canvas.click();
  await page.keyboard.down('Space');
  try{await ground(y)}finally{await page.keyboard.up('Space')}
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

async function auto(on){
  if((await frame()).auto===on)return;
  await page.locator('#auto').click();
  await wait(on=>window.lab.frame.auto===on,on);
}

async function scenery(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function comparePaused(name,baseline){
  const png=await frame();
  assert.ok(png.paused);
  await shot(baseline);
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*12,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.66,standard.commands);
  const light=await frame();
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyPatrol,png.storyPatrol);
  }
  await shot(name+'-light');
  await menu.selectOption('sprite');
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function compareTea(){
  await walk(605);
  await wait(()=>window.lab.frame.actors.every(a=>a.walk===0));
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const f=await frame();
  assert.deepEqual(f.draws.filter(d=>d.source==='nod-lantern-patrol-props-source-v1.png').map(d=>d.h),[51,27]);
  const commands=await comparePaused('tea','tea-png');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return commands;
}

async function saveReload(){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(cabin);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8907/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/nod-lantern-patrol-fixture.json','utf8');
  const lua=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at('nod-town');
  await gate(550,cabin);
  const cabinScene=await scenery();
  assert.deepEqual(cabinScene,{key:'nodPatrolCabin',file:'nod-lantern-patrol-cabin-background-v1.png',state:'ready'});
  await questButton('受注','active');
  await inspect(318,1);
  await gate(1170,shore);
  const coastScene=await scenery();
  assert.deepEqual(coastScene,{key:'nodPatrolCoast',file:'nod-lantern-patrol-coast-background-v1.png',state:'ready'});
  await inspect(340,2);
  await jump(640,386);
  await inspect(1118,3);
  await walk(1390);
  await ground(480);
  await gate(1470,bend);
  await walk(746);
  await wait(()=>window.lab.frame.storyPatrol?.warning?.seconds>.48);
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const warning=await frame();
  assert.ok(warning.storyPatrol.warning&&warning.draws.some(d=>d.text==='投石の予兆'));
  const warningCommands=await comparePaused('warning','warning');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  await jump(651,386);
  await jump(905,290);
  await walk(1016);
  await canvas.click();
  await page.keyboard.down('KeyJ');
  try{await wait(()=>!window.lab.frame.storyPatrol.shooterAlive,undefined,32000)}
  finally{await page.keyboard.up('KeyJ')}
  await walk(1092);
  await wait(()=>window.lab.frame.actors.every(a=>a.walk===0&&a.lock===0));
  const looked=await frame();
  assert.ok(looked.storyPatrol.lookout&&looked.storyPatrol.ground===3);
  await shot('lookout');
  await walk(1351);
  await ground(480);
  await auto(true);
  await count(4,65000);
  await auto(false);
  await gate(1720,post);
  const ore=(await frame()).inventory.upgradeOre;
  await inspect(410,5);
  assert.equal((await frame()).inventory.upgradeOre-ore,lua.oneOreGrant);
  await gate(1019,cabin);
  await inspect(756,6);
  const commands=await compareTea();
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,lua.reportReward);
  await saveReload();
  await gate(987,post);
  await gate(1019,cabin);
  await inspect(756);
  await wait(()=>window.lab.frame.storyNotice?.includes('体力を回復しました'));
  assert.ok((await frame()).actors.every(a=>a.hp===a.maxhp));
  assert.deepEqual(errors,[]);
  const proof={cabinScene,coastScene,bothSignposts:true,warningShown:true,highBeforeGround:true,
    shortcutAfterReload:true,restAfterReload:true,commands,warningCommands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,patrol:f?.storyPatrol,auto:f?.auto};
  }),errors);
  throw error;
}finally{await browser.close()}
