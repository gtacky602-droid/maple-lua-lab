import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='nod-treasure-appraisal',town='nod-town';
const workshop='nod-appraisal-workshop',yard='nod-appraisal-yard';
const checkpoint=process.env.LAB_APPRAISAL_CHECKPOINT;
const prefix=process.env.LAB_APPRAISAL_OUTPUT||'evidence/nod-appraisal';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value)=>page.waitForFunction(fn,value,{timeout:23000});
const at=id=>wait(id=>window.lab?.frame?.story?.node===id,id);
const count=n=>wait(({id,n})=>window.lab.frame.story.quests[id]?.count===n,{id:quest,n});
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});
const log=page.locator('#storyAppraisalLog'),rows=log.locator('li');

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1],east=x>a.x;
  if(Math.abs(a.x-x)<8)return;
  const direction=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(direction);
  try{
    await wait(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{await page.keyboard.up(direction)}
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
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id:quest,status});
}

async function measure(n){
  await inspect(430);
  await wait(n=>window.lab.frame.storyAppraisal.measured===n,n);
}

async function compare(){
  await walk(342);
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='nod-appraisal-equipment-source-v1.png')&&
    png.draws.some(d=>d.source==='nod-appraisal-parts-source-v1.png'));
  await screenshot('png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*12,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.66,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.storyAppraisal.measured===2));
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
  await at(workshop);
  return saved;
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8904/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile(checkpoint||'work/nod-appraisal-fixture.json','utf8');
  const input=JSON.parse(seed);
  const lua=JSON.parse(await fs.readFile('evidence/nod-appraisal-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  if(checkpoint){
    await at('nod-port');
    await gate(1380,'nod-field');
    await gate(1380,town);
  }else await at(town);
  await gate(286,workshop);
  const scenery=await page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scenery,{key:'nodAppraisal',file:'nod-appraisal-workshop-background-v1.png',state:'ready'});
  await questButton('受注','active');
  await inspect(430,1);
  assert.ok(await log.isHidden());
  await gate(1575,yard);
  await inspect(420);
  await wait(()=>window.lab.frame.storyAppraisal.collected===1);
  await inspect(825);
  await wait(()=>window.lab.frame.storyAppraisal.collected===2);
  await walk(1215);
  await canvas.click();
  await page.keyboard.down('Space');
  try{await wait(()=>{const a=window.lab.frame.actors[0];return a.ground&&a.y===382})}
  finally{await page.keyboard.up('Space')}
  await inspect(1215,2);
  await gate(62,workshop);
  await measure(1);
  await saveReload();
  assert.equal((await frame()).storyAppraisal.measured,1);
  await log.locator('summary').click();
  assert.equal(await rows.count(),1);
  assert.match(await rows.first().innerText(),/銅合金の歯車.*同じ大きさ/);
  await measure(2);
  assert.match((await frame()).storyAppraisal.message,/荷重には弱い/);
  assert.equal(await rows.count(),2);
  assert.match(await rows.nth(1).innerText(),/月形の飾り板.*荷重には弱い/);
  const commands=await compare();
  await measure(3);
  await count(3);
  await inspect(761);
  await wait(()=>window.lab.frame.storyAppraisal.item==='plate');
  await inspect(761);
  await wait(()=>window.lab.frame.storyNotice?.includes('薄すぎます'));
  assert.equal((await frame()).storyAppraisal.sorted,1);
  await saveReload();
  await log.locator('summary').click();
  assert.equal(await rows.count(),3);
  assert.match(await rows.first().innerText(),/仕分け済み/);
  assert.doesNotMatch(await rows.nth(1).innerText(),/仕分け済み/);
  assert.equal((await frame()).storyAppraisal.item,'plate');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await log.evaluate(panel=>panel.scrollWidth<=panel.clientWidth&&panel.getBoundingClientRect().right<=innerWidth));
  await log.screenshot({path:prefix+'-readings-mobile.png'});
  await page.setViewportSize({width:1280,height:960});
  await inspect(1224);
  await wait(()=>window.lab.frame.storyAppraisal.item==='stone');
  await inspect(991,4);
  assert.equal((await frame()).storyAppraisal.sorted,3);
  assert.match((await frame()).storyAppraisal.message,/右端で月形板の小灯り/);
  await inspect(1432,5);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora,
    after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,lua.reward);
  const completed=await saveReload(),saved=JSON.parse(completed);
  const prior=Object.entries(input.story.quests).filter(([,state])=>state.status==='complete');
  for(const [id,state] of prior)assert.deepEqual(saved.story.quests[id],state,id);
  for(const item of input.inventory.items)assert.ok(saved.inventory.items.some(i=>i.id===item.id),item.id);
  assert.equal((await frame()).companion.id,before.companion.id);
  if(checkpoint)await fs.writeFile(prefix+'-complete.json',completed+'\n');
  await inspect(1432);
  await wait(()=>window.lab.frame.storyNotice?.includes('持ち主が気に入っています'));
  await walk(1350);
  const finished=await frame();
  assert.ok(finished.storyAppraisal.lamp&&finished.draws.some(d=>
    d.source==='nod-appraisal-equipment-source-v1.png'&&d.h===68));
  await screenshot('lamp');
  await gate(1575,yard);
  assert.ok(await log.isHidden());
  assert.ok(!(await frame()).draws.some(d=>d.source==='nod-appraisal-parts-source-v1.png'));
  assert.deepEqual(errors,[]);
  const proof={scenery,upperPartJump:true,partialMeasurementReload:true,wrongTrayRetry:true,
    readingsAfterReload:{measured:3,sorted:1,mobileWidth:390},lampDirection:true,
    displayAfterReload:true,yardRevisit:true,commands,reward,
    sourceSha256:createHash('sha256').update(seed).digest('hex'),startLevel:input.progression.level,
    reportedLevel:saved.progression.level,priorCompleted:prior.length,inventoryKept:input.inventory.items.length,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,appraisal:f?.storyAppraisal};
  }),errors);
  await page.screenshot({path:prefix+'-failure.png'});
  throw error;
}finally{await browser.close()}
