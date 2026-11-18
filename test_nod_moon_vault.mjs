import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const town='nod-town',mouth='nod-moon-cave-mouth',arena='nod-moon-crab-arena',vault='nod-moon-vault';
const quest='nod-moon-vault-quest',prefix='evidence/nod-moon-vault';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value,timeout=23000)=>page.waitForFunction(fn,value,{timeout});
const at=id=>wait(id=>window.lab?.frame?.story?.node===id,id);
const count=(n,timeout)=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n},timeout);
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

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

async function auto(on){
  if((await frame()).auto===on)return;
  await page.locator('#auto').click();
  await wait(on=>window.lab.frame.auto===on,on);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='moon-crab-cracked-source-v1.png'));
  assert.equal(png.fieldBoss.move,'reflection');
  await screenshot('cracked-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*12,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.fieldBoss.tick===png.fieldBoss.tick));
  await screenshot('cracked-light');
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
  await at(town);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8901/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/nod-moon-vault-fixture.json','utf8');
  const luaProof=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  await questButton('受注','active');
  await gate(1258,mouth);
  await inspect(1080,1);
  await gate(1260,arena);
  await walk(730);
  await wait(()=>window.lab.frame.fieldBoss?.move==='claw');
  assert.ok((await frame()).draws.some(d=>d.source==='moon-crab-source-v1.png'));
  await screenshot('claw');
  await wait(()=>window.lab.frame.fieldBoss?.move==='box');
  await screenshot('box');
  const beforeClear=(await frame()).progression.questXp;
  await auto(true);
  await wait(()=>window.lab.frame.fieldBoss?.cracked,null,45000);
  await auto(false);
  await wait(()=>window.lab.frame.fieldBoss?.move==='reflection');
  const commands=await compare();
  await auto(true);
  await count(2,60000);
  await auto(false);
  assert.equal((await frame()).progression.questXp-beforeClear,luaProof.firstChapterXp);
  await gate(1731,vault);
  const vaultScene=await page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(vaultScene,{key:'nodMoonVault',file:'nod-moon-vault-background-v1.png',state:'ready'});
  await inspect(416,3);
  const before=(await frame());
  await inspect(803,4);
  const after=await frame();
  assert.equal(after.story.quests[quest].storyChoice,'flower');
  assert.equal(after.inventory.upgradeOre-before.inventory.upgradeOre,luaProof.supplies);
  assert.equal(after.mora-before.mora,luaProof.cacheMora);
  const chosen=after.inventory.items.find(item=>item.slot===1&&item.itemLv===140&&item.setId==='troupe');
  assert.ok(chosen&&chosen.rarity===4&&chosen.subpair==='hp_crit');
  await walk(952);
  await screenshot('cache');
  await gate(1430,town);
  await questButton('報告','complete');
  assert.equal((await frame()).progression.questXp-after.progression.questXp,luaProof.reportXp);
  await saveReload();
  assert.equal((await frame()).story.quests[quest].storyChoice,'flower');
  await gate(1258,mouth);
  await gate(1260,arena);
  await walk(805);
  await wait(()=>window.lab.frame.fieldBoss?.generation>=2,null,95000);
  assert.equal((await frame()).story.quests[quest].count,4);
  assert.deepEqual(errors,[]);
  const proof={clawAndBox:true,reflection:true,chapterXp:luaProof.firstChapterXp,commands,vaultScene,
    clearAndReport:true,chosen:'flower',artifactsAndSupplies:true,rewardAfterReload:true,
    repeatGeneration:true,reportXp:luaProof.reportXp,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,boss:f?.fieldBoss,auto:f?.auto};
  }),errors);
  throw error;
}finally{await browser.close()}
