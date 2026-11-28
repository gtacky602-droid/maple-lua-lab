import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const town='nod-town',mouth='nod-moon-cave-mouth',arena='nod-moon-crab-arena',vault='nod-moon-vault';
const quest='nod-moon-vault-quest',checkpoint=process.env.LAB_MOON_VAULT_CHECKPOINT;
const prefix=process.env.LAB_MOON_VAULT_OUTPUT||'evidence/nod-moon-vault';
const choice=process.env.LAB_MOON_VAULT_CHOICE||'flower';
assert.ok(['flower','feather'].includes(choice));
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

async function holdAllyFire(on){
  if(Boolean((await frame()).holdAllyFire)===on)return;
  await page.locator('#allyFire').click();
  await wait(on=>Boolean(window.lab.frame.holdAllyFire)===on,on);
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
  const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
  return saved;
}

async function cue(text){
  await wait(text=>document.querySelector('#fieldBossLabel').textContent.includes(text),text);
}

async function breakShell(){
  for(let i=0;i<14;i++){
    const boss=(await frame()).fieldBoss;
    if(boss.cracked)return;
    await walk(boss.x-77);
    await walk((await frame()).fieldBoss.x-45);
    await wait(()=>!window.lab.frame.actors[0].cd.normal);
    await canvas.click();
    await page.keyboard.down('KeyJ');
    try{await wait(()=>window.lab.frame.actors[0].cd.normal>0)}
    finally{await page.keyboard.up('KeyJ')}
  }
  assert.ok((await frame()).fieldBoss?.cracked,'ordinary attacks broke the shell');
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8901/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile(checkpoint||'work/nod-moon-vault-fixture.json','utf8');
  const input=JSON.parse(seed);
  const luaProof=JSON.parse(await fs.readFile('evidence/nod-moon-vault-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  await questButton('受注','active');
  await holdAllyFire(true);
  await gate(1258,mouth);
  await inspect(1080,1);
  await gate(1260,arena);
  await walk(730);
  await cue('正面のハサミまで');
  assert.ok((await frame()).draws.some(d=>d.source==='moon-crab-source-v1.png'));
  await screenshot('claw');
  await wait(()=>{const b=window.lab.frame.fieldBoss;return b?.move==='box'&&b.tick<18});
  const aimed=await frame(),box=aimed.fieldBoss.lane,actor=aimed.actors[aimed.active-1];
  const escape=actor.x<(box.left+box.right)/2?'KeyA':'KeyD';
  await page.keyboard.down(escape);
  try{
    await wait(()=>{const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
      return a.x<b.lane.left-16||a.x>b.lane.right+16});
  }finally{await page.keyboard.up(escape)}
  await cue('箱の落下の後・反撃の隙');
  const dodged=await frame();
  assert.equal(dodged.actors[aimed.active-1].hp,actor.hp);
  assert.deepEqual([dodged.fieldBoss.lane.left,dodged.fieldBoss.lane.right],[box.left,box.right]);
  const beforeClear=(await frame()).progression.questXp;
  await screenshot('box');
  let crackedHp;
  if(checkpoint){
    await breakShell();
    await key('KeyP');
    await wait(()=>window.lab.frame.paused);
    const broken=(await frame()).fieldBoss;
    assert.ok(broken.cracked&&broken.hp>0&&broken.hp<=broken.maxhp/2,JSON.stringify(broken));
    const mid=JSON.parse(await saveReload());
    crackedHp=mid.fieldBosses['original-moon-crab'].hp;
    assert.equal(crackedHp,broken.hp,'the checkpoint records the same HP as the battle');
    await holdAllyFire(true);
    await gate(1258,mouth);
    await gate(1260,arena);
    await walk(520);
    const restored=(await frame()).fieldBoss;
    assert.ok(restored.cracked);
    assert.equal(restored.hp,crackedHp);
    await walk(730);
  }else{
    await holdAllyFire(false);
    await auto(true);
    await wait(()=>window.lab.frame.fieldBoss?.cracked,null,45000);
    await auto(false);
  }
  await cue('反射光 1/3 まで');
  const commands=await compare();
  await holdAllyFire(false);
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
  await walk(730);
  const comparison=page.locator('#storyArtifactChoices');
  await comparison.waitFor();
  const compared=await comparison.locator('li').allTextContents();
  assert.match(compared[0],/剣闘士の羽.*主能力 ATK.*報酬/);
  assert.match(compared[1],/劇団の花.*主能力 HP.*報酬/);
  assert.equal((await frame()).story.quests[quest].count,3);
  await page.setViewportSize({width:390,height:844});
  await comparison.screenshot({path:prefix+'-reward-preview-mobile.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1280,height:940});
  const choiceX=choice==='flower'?803:657;
  const atCache=await frame();
  let sale;
  if(atCache.storyArtifactChoices.full){
    await inspect(choiceX);
    await wait(()=>window.lab.frame.storyNotice?.includes('バッグ満杯'));
    const blocked=await frame();
    assert.equal(blocked.story.quests[quest].count,3);
    assert.deepEqual([blocked.inventory.upgradeOre,blocked.mora],[atCache.inventory.upgradeOre,atCache.mora]);
    await gate(1430,town);
    const inventory=(await frame()).inventory.items;
    const item=inventory.filter(i=>!i.owner&&!i.locked&&!i.enhance)
      .sort((a,b)=>a.itemLv*a.rarity-b.itemLv*b.rarity||a.id-b.id)[0];
    assert.ok(item,'the test copy has unequipped gear to sell');
    const guide=page.getByText('聖遺物バッグ・5部位装備',{exact:true});
    if(!await guide.evaluate(summary=>summary.parentElement.open))await guide.click();
    const row=page.locator('#inventoryRows > div').filter({hasText:new RegExp('^#'+item.id+' ')});
    const mora=(await frame()).mora;
    await row.getByRole('button',{name:/売却/}).click();
    await wait(id=>!window.lab.frame.inventory.items.some(i=>i.id===id),item.id);
    sale={id:item.id,itemLv:item.itemLv,rarity:item.rarity,mora:(await frame()).mora-mora};
    await gate(1258,mouth);
    await gate(1260,arena);
    await gate(1731,vault);
  }
  const before=(await frame());
  await inspect(choiceX,4);
  await comparison.waitFor({state:'hidden'});
  const after=await frame();
  assert.equal(after.story.quests[quest].storyChoice,choice);
  assert.equal(after.inventory.upgradeOre-before.inventory.upgradeOre,luaProof.supplies);
  assert.equal(after.mora-before.mora,luaProof.cacheMora);
  const previousIds=new Set(before.inventory.items.map(item=>item.id));
  const [chosen,...extra]=after.inventory.items.filter(item=>!previousIds.has(item.id));
  const details=choice==='flower'?[1,'troupe','hp_crit']:[2,'gladiator','atk_crit'];
  assert.deepEqual(extra,[]);
  assert.deepEqual([chosen.slot,chosen.setId,chosen.subpair],details);
  assert.deepEqual([chosen.rarity,chosen.itemLv],[4,140]);
  await walk(952);
  await screenshot('cache');
  await gate(1430,town);
  await questButton('報告','complete');
  assert.equal((await frame()).progression.questXp-after.progression.questXp,luaProof.reportXp);
  const completed=await saveReload(),saved=JSON.parse(completed);
  const restored=await frame();
  assert.equal(restored.story.quests[quest].storyChoice,choice);
  assert.equal(restored.companion.id,after.companion.id);
  assert.ok(saved.inventory.items.some(item=>item.id===chosen.id&&item.setId===chosen.setId));
  for(const item of input.inventory.items){
    if(item.id!==sale?.id)assert.ok(saved.inventory.items.some(held=>held.id===item.id),item.id);
  }
  const preserved=Object.entries(input.story.quests).filter(([,state])=>state.status==='complete');
  for(const [id,state] of preserved)assert.deepEqual(saved.story.quests[id],state,id);
  if(checkpoint)await fs.writeFile(prefix+'-complete.json',completed+'\n');
  await gate(1258,mouth);
  await gate(1260,arena);
  await walk(805);
  await wait(()=>window.lab.frame.fieldBoss?.generation>=2,null,95000);
  assert.equal((await frame()).story.quests[quest].count,4);
  assert.deepEqual(errors,[]);
  const proof={clawAndBox:true,boxDodged:true,reflection:true,crackedHp,chapterXp:luaProof.firstChapterXp,commands,vaultScene,
    clearAndReport:true,chosen:choice,artifactsAndSupplies:true,rewardAfterReload:true,
    cacheOre:luaProof.supplies,cacheMora:luaProof.cacheMora,fullBagRecovery:sale,
    sourceSha256:createHash('sha256').update(seed).digest('hex'),startLevel:input.progression.level,
    reportedLevel:restored.progression.level,priorCompleted:preserved.length,
    rewardPreview:{rowCount:compared.length,mobileWidth:390,noClaimWhileComparing:true},
    repeatGeneration:true,reportXp:luaProof.reportXp,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,boss:f?.fieldBoss,auto:f?.auto,
      status:document.querySelector('#status')?.textContent};
  }),errors);
  await page.screenshot({path:prefix+'-failure.png'});
  throw error;
}finally{await browser.close()}
