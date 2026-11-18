import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const town='nod-town',rest='nod-lull-wood',wood='nod-spruce-clearing',coast='nod-lantern-shore';
const inlet='nod-box-inlet',cave='nod-moon-cave-mouth',quest='nod-moon-crossroads';
const prefix='evidence/nod-moon-paths';
const selected=process.env.NOD_PATH||'wood';
assert.ok(['wood','coast'].includes(selected));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value,timeout=22000)=>page.waitForFunction(fn,value,{timeout});
const at=id=>wait(id=>window.lab?.frame?.story?.node===id,id);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n},45000);
const branch=(id,n)=>wait(({quest,id,n})=>window.lab.frame.story.quests[quest]?.pathProgress[id].count===n,{quest,id,n});
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),actor=f.actors[f.active-1],east=x>actor.x;
  if(Math.abs(actor.x-x)<8)return;
  const dir=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(dir);
  try{
    await wait(({x,east})=>{
      const f=window.lab.frame,actor=f.actors[f.active-1];
      return east?actor.x>=x-6:actor.x<=x+6;
    },{x,east});
  }finally{await page.keyboard.up(dir)}
}

async function jump(x,y){
  await walk(x);
  await canvas.click();
  await page.keyboard.down('Space');
  try{await wait(y=>{const actor=window.lab.frame.actors[0];return actor.ground&&actor.y===y},y)}
  finally{await page.keyboard.up('Space')}
}

async function down(y){
  await canvas.click();
  await page.keyboard.down('KeyS');
  try{await page.keyboard.press('Space')}finally{await page.keyboard.up('KeyS')}
  await wait(y=>{const actor=window.lab.frame.actors[0];return actor.ground&&actor.y===y},y);
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

async function backdrop(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function saveReload(){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused&&window.lab.frame.storyBoxGlimpse);
  const png=await frame();
  await screenshot('glimpse-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*15,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyBoxGlimpse.seconds===png.storyBoxGlimpse.seconds));
  await screenshot('glimpse-light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8899/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/nod-moon-paths-fixture.json','utf8');
  const luaProof=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  await questButton('受注','active');
  await inspect(686,1);
  let routeScene;
  if(selected==='wood'){
    await gate(458,rest);
    routeScene=await backdrop();
    assert.deepEqual(routeScene,{key:'nodMoonWood',file:'nod-moon-wood-background-v1.png',state:'ready'});
    assert.equal((await frame()).total,0);
    await inspect(478);
    await branch('wood',1);
    await gate(1328,wood);
    await walk(400);
    await screenshot('wood');
    await auto(true);
    await count(2);
    await auto(false);
    await gate(1526,inlet);
    assert.equal((await frame()).actors[0].y,480);
  }else{
    await gate(959,coast);
    routeScene=await backdrop();
    assert.equal(routeScene.key,'nodMoonShallows');
    await inspect(405);
    await branch('coast',1);
    const ore=(await frame()).inventory.upgradeOre;
    await jump(847,388);
    await inspect(847);
    await branch('coast',2);
    assert.equal((await frame()).inventory.upgradeOre,ore+luaProof.coastOre);
    await jump(1079,292);
    assert.equal((await frame()).draws.filter(draw=>draw.color==='#f7ca79').length,3);
    await screenshot('coast');
    await inspect(1400,2);
    await gate(1534,inlet);
    assert.equal((await frame()).actors[0].y,386);
    await down(480);
  }
  const resetBranch=selected==='wood'?'coast':'wood';
  assert.equal((await frame()).story.quests[quest].pathProgress[resetBranch].count,0);
  await inspect(470,3);
  await jump(801,386);
  await inspect(801,4);
  await wait(()=>window.lab.frame.storyBoxGlimpse);
  const commands=selected==='wood'?await compare():undefined;
  await inspect(934,5);
  assert.ok((await frame()).platforms.some(p=>p.moonDeck));
  await gate(1674,cave);
  const caveScene=await backdrop();
  assert.deepEqual(caveScene,{key:'nodMoonCave',file:'nod-moon-cave-background-v1.png',state:'ready'});
  const ore=(await frame()).inventory.upgradeOre;
  await inspect(549,6);
  assert.equal((await frame()).inventory.upgradeOre,ore+luaProof.caveOre);
  if(selected==='wood'){
    await walk(690);
    await screenshot('cave');
  }
  await gate(1360,town);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,luaProof.reportReward);
  await saveReload();
  await gate(1258,cave);
  await gate(55,inlet);
  assert.ok((await frame()).platforms.some(p=>p.moonDeck));
  assert.equal((await frame()).story.quests[quest].pathProgress[resetBranch].count,0);
  assert.deepEqual(errors,[]);
  const proof={path:selected,otherPathUnused:true,glimpse:true,report:true,saveReloaded:true,
    bridgeRestored:true,routeScene,caveScene,reward,commands,errors};
  await fs.writeFile(prefix+'-'+selected+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,pathStatus:f?.storyPathStatus,total:f?.total,auto:f?.auto};
  }),errors);
  throw error;
}finally{await browser.close()}
