import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const town='nod-town',coast='nod-workshop-coast',shallows='nod-moon-shallows',rocks='nod-tide-rocks';
const quest='nod-first-treasure',checkpoint=process.env.LAB_SHALLOWS_CHECKPOINT;
const prefix=process.env.LAB_SHALLOWS_OUTPUT||'evidence/nod-shallows';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg,timeout=22000)=>page.waitForFunction(fn,arg,{timeout});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=(n,timeout)=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n},timeout);
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1],east=x>a.x;
  if(Math.abs(a.x-x)<7)return;
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

async function scene(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function crossBridge(east=true){
  const deck=(await frame()).platforms.find(p=>p.moonDeck);
  const x=east?deck.x-36:deck.x+deck.w+32;
  await walk(x);
  const here=await frame(),label=east?'右へジャンプ →':'← 左へジャンプ';
  assert.ok(here.draws.some(d=>d.text===label&&Math.abs(d.x+here.camera-x)<1));
  await canvas.click();
  await page.keyboard.down('Space');
  try{await walk(x+(east?147:-147))}finally{await page.keyboard.up('Space')}
  await wait(()=>{const f=window.lab.frame,a=f.actors[f.active-1];return a.ground&&a.y===447});
  await walk(890);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.platforms.some(p=>p.moonDeck));
  await screenshot('png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.actors[0].x===png.actors[0].x));
  await screenshot('light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function saveReload(){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
  return saved;
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8897/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile(checkpoint||'work/nod-shallows-fixture.json','utf8');
  const input=JSON.parse(seed);
  const luaProof=JSON.parse(await fs.readFile('evidence/nod-shallows-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  if(checkpoint){
    assert.equal(input.story.quests[quest].status,'active');
    await count(0);
  }else await questButton('受注','active');
  await inspect(checkpoint?972:625,1);
  const heard=(await frame()).story.quests[quest].storyChoice;
  assert.equal(heard,checkpoint?'traveler':'merchant');
  await gate(1160,coast);
  await inspect(540,2);
  await gate(1350,shallows);
  const art=await scene();
  assert.deepEqual(art,{key:'nodMoonShallows',file:'nod-moon-shallows-background-v1.png',state:'ready'});
  await inspect(500);
  await wait(()=>window.lab.frame.storyReflection?.orientation==='波打ち際');
  await inspect(500);
  await wait(()=>window.lab.frame.storyReflection?.orientation==='岩壁');
  await screenshot('mirror');
  await saveReload();
  await gate(1160,coast);
  await gate(1350,shallows);
  await walk(500);
  await wait(()=>window.lab.frame.storyReflection?.orientation==='岩壁');
  assert.ok(!(await frame()).draws.some(d=>d.text==='右へジャンプ →'));
  await canvas.click();
  await page.keyboard.down('KeyD');
  try{await wait(()=>window.lab.frame.storyNotice?.includes('手前の岸へ戻りました'))}
  finally{await page.keyboard.up('KeyD')}
  assert.equal((await frame()).story.quests[quest].count,2);
  await inspect(500,3);
  await crossBridge();
  await wait(()=>{const a=window.lab.frame.actors[1];return a.x>650&&a.ground&&a.y===447});
  const commands=await compare();
  await walk(1186);
  await wait(()=>{const f=window.lab.frame,a=f.actors[f.active-1];return a.ground&&a.y===480});
  await crossBridge(false);
  await gate(1554,rocks);
  await walk(545);
  await auto(true);
  await count(4,45000);
  await auto(false);
  const beforeChest=(await frame()).inventory.upgradeOre;
  await inspect(1337,5);
  assert.equal((await frame()).inventory.upgradeOre-beforeChest,luaProof.chestOre);
  await screenshot('chest');
  await gate(1506,town);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,luaProof.reward);
  const complete=await saveReload(),saved=JSON.parse(complete);
  const preserved=Object.entries(input.story.quests).filter(([,state])=>state.status==='complete');
  for(const [id,state] of preserved)assert.deepEqual(saved.story.quests[id],state,id);
  if(checkpoint)await fs.writeFile(prefix+'-complete.json',complete+'\n');
  const restored=await frame();
  assert.equal(restored.story.quests[quest].status,'complete');
  assert.equal(restored.story.quests[quest].storyChoice,heard);
  assert.equal(restored.companion.id,after.companion.id);
  await gate(1160,coast);
  await gate(1350,shallows);
  await crossBridge();
  await gate(1554,rocks);
  await walk(1337);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='貯蔵所の札を読む');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.startsWith('貯蔵所の札'));
  assert.equal((await frame()).inventory.upgradeOre,restored.inventory.upgradeOre);
  assert.deepEqual(errors,[]);
  const proof={heard,orientationAfterReload:true,normalJumpCrossing:true,companionCrossing:true,
    fallRescue:true,bothBankMarkers:true,battleAndChest:true,chestOre:luaProof.chestOre,readbackAfterReport:true,
    sameFrameComparison:true,sourceSha256:createHash('sha256').update(seed).digest('hex'),
    startLevel:input.progression.level,reportedLevel:restored.progression.level,priorCompleted:preserved.length,
    reward,art,commands,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,mirror:f?.storyReflection,
      portal:f?.storyNearbyPortal,milestone:f?.storyNearbyMilestone,platforms:f?.platforms,auto:f?.auto};
  }),errors);
  await page.screenshot({path:prefix+'-failure.png'});
  throw error;
}finally{await browser.close()}
