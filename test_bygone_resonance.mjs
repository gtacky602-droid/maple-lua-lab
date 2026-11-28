import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {observeRuinAttacks} from './tools/browser_ruin_guardian_test.mjs';


const camp='bygone-camp',pier='bygone-waterway-pier',chamber='bygone-resonance-chamber';
const hall='bygone-inscribed-hall',gallery='bygone-listening-gallery',archive='bygone-bell-archive';
const first='bygone-stone-rubbings',second='bygone-lit-passage',third='bygone-sound-book';
const earned=process.argv.includes('--earned');
const prefix=earned?'work/earned-bygone-current/ruins':'evidence/bygone-resonance';
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

async function gate(x,node,waterway=false){
  await walk(x);
  await wait(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node,16000);
  await key('KeyF');
  if(waterway){
    await wait(()=>window.lab.frame.storyLift?.waterway);
    assert.match(await page.locator('#storyLiftText').textContent(),/水路を移動中/);
  }
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

async function defeatOne(x,y=480){
  if(y===480)await walk(x);else await jump(x,y);
  const before=await frame();
  await page.click('#auto');
  await wait(n=>window.lab.frame.kills>=n,before.kills+1,25000);
  await page.click('#auto');
  await wait(()=>!window.lab.frame.auto);
}

async function saveReload(){
  await page.click('#saveProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='bellgate-source-v1.png'&&d.h===152));
  await canvas.screenshot({path:prefix+'-boss-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await wait(()=>window.lab.frame.commands>7000);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.equal(light.t,png.t);
  assert.equal(standard.t,png.t);
  await canvas.screenshot({path:prefix+'-boss-light.png'});
  await mode.selectOption('sprite');
  await wait(()=>window.lab.frame.draws.some(d=>d.source==='bellgate-source-v1.png'));
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function progress(n){
  await wait(n=>window.lab.frame.storyResonance?.progress===n,n);
}

async function readPage(index,pattern){
  await key('KeyG');
  await wait(({index,pattern})=>{
    const f=window.lab.frame;
    return f.storyResonance?.page===index&&f.storyResonanceCue?.pattern===pattern
      &&document.querySelector('#resonanceStatus').textContent.includes(pattern);
  },{index,pattern});
}

try{
  await page.addInitScript(()=>{
    const start=OscillatorNode.prototype.start;
    window.tones=[];
    OscillatorNode.prototype.start=function(...args){
      window.tones.push(this.frequency.value);
      return start.apply(this,args);
    };
  });
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8868/');
  await wait(()=>window.lab?.frame);
  const source=earned?'work/earned-bygone-current/ruins-ready.json':'work/bygone-resonance-fixture.json';
  const fixture=await fs.readFile(source,'utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(camp);
  if(earned)assert.equal((await frame()).progression.level,200);
  await quest(first,'受注','active');
  await gate(831,pier);
  await gate(821,chamber,true);
  await interact(317,first,1);
  assert.deepEqual(await page.evaluate(()=>window.tones),[]);
  await jump(782,388);
  await wait(()=>window.lab.frame.storyResonance?.pattern==='✧');
  await page.click('#airflowSound');
  await wait(()=>document.querySelector('#airflowSound').getAttribute('aria-pressed')==='true');
  await interact(782,first,2);
  assert.equal((await frame()).storyResonanceCue,undefined);
  assert.deepEqual(await page.evaluate(()=>window.tones),[]);
  await interact(1190,first,3);
  await interact(1462,first,4);
  const repairedTones=await page.evaluate(()=>window.tones);
  assert.deepEqual(repairedTones,[330,494,392,523,587]);
  await gate(1605,camp);
  await quest(first,'報告','complete');
  console.log('Waterway, silent stone and restored chime verified');

  await quest(second,'受注','active');
  await gate(1152,hall);
  await walk(299);
  await wait(()=>document.querySelector('#resonanceStatus').textContent.includes('≈ → ◇ → ✧'));
  await page.click('#airflowSound');
  await wait(()=>document.querySelector('#airflowSound').getAttribute('aria-pressed')==='false');
  await interact(1305,second,0);
  await progress(1);
  await row(second).getByRole('button',{name:'この依頼を追跡',exact:true}).click();
  await page.locator('#trackedQuestMap').click();
  const nextStone=page.locator('#atlasQuestPoint');
  await nextStone.waitFor();
  assert.equal(await nextStone.innerText(),'次の共鳴石「◇」を見る');
  const [map]=await Promise.all([page.waitForEvent('popup'),nextStone.click()]);
  try{
    const picker=map.getByLabel('操作場所');
    await picker.waitFor();
    assert.equal(await picker.locator('option:checked').innerText(),'共鳴石 ◇（次に点灯）');
    assert.ok((await picker.locator('option').allTextContents()).includes('共鳴石 ≈（点灯済み）'));
    await map.waitForFunction(()=>window.mapArt?.ready && window.mapArt.camera===65);
  }finally{await map.close()}
  await page.bringToFront();
  await page.keyboard.press('Escape');
  await jump(960,393);
  await interact(960,second,0);
  await progress(0);
  await wait(()=>window.lab.frame.storyNotice?.includes('やり直せます'));
  assert.ok(!(await frame()).platforms.some(p=>p.resonanceBridge));
  await interact(1305,second,0);
  await progress(1);
  await interact(545,second,0);
  await progress(2);
  await jump(960,393);
  await interact(960,second,1);
  assert.deepEqual(await page.evaluate(()=>window.tones),repairedTones);
  await saveReload();
  await nodeIs(camp);
  await gate(1152,hall);
  assert.ok((await frame()).platforms.some(p=>p.resonanceBridge));
  await jump(1510,393);
  await gate(1581,gallery);
  await interact(403,second,2);
  await jump(848,391);
  await interact(848,second,3);
  await gate(55,camp);
  await quest(second,'報告','complete');
  console.log('Muted order puzzle, saved bridge and marked viewing route verified');

  await quest(third,'受注','active');
  await gate(1265,gallery);
  await gate(1390,archive);
  if(earned){
    const ally=page.locator('#allyFire');
    if((await ally.getAttribute('aria-pressed'))!=='true')await ally.click();
  }
  await walk(859);
  const ready=await frame();
  assert.equal(ready.fieldBoss.id,'original-bellgate');
  if(!earned)assert.equal(ready.imprintGrowth.total,0);
  const background=await page.evaluate(async()=>{
    const {sceneryStatus,backgroundReady}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(background,{key:'bygoneBellArchive',file:'bygone-resonance-background-v1.png',state:'ready'});
  await wait(()=>Object.values(window.lab.frame.fieldBoss?.zones??{}).some(zone=>!zone.active));
  const commands=await compare();
  const battle=await observeRuinAttacks(page,['BG01','BG02']);
  await defeatOne(865);
  await count(third,1);
  assert.equal((await frame()).progression.killXp,ready.progression.killXp);
  await jump(1402,386);
  await interact(1402,third,2);
  await gate(1715,gallery);
  await gate(55,camp);
  await interact(689,third,3);
  const before=await frame();
  await quest(third,'報告','complete');
  const after=await frame();
  const firstReport=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(firstReport,[2297237,660060,7]);
  await saveReload();
  await nodeIs(camp);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'))
    .endgame.bosses['original-bellgate'].clears),1);
  await walk(689);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='音の絵本を開く');
  await page.click('#airflowSound');
  await wait(()=>document.querySelector('#airflowSound').getAttribute('aria-pressed')==='true');
  for(const [index,pattern] of [[1,'≈'],[2,'◇'],[3,'✧']])await readPage(index,pattern);
  assert.match(await page.locator('#resonanceStatus').textContent(),/向きを戻した星/);
  const bookTones=await page.evaluate(()=>window.tones);
  assert.deepEqual(bookTones,[330,494,294,392,523,587]);
  await page.locator('.game').screenshot({path:prefix+'-book.png'});
  assert.deepEqual(errors,[]);
  const proof={threeQuests:true,waterway:true,reversedSilent:true,repairedTones,wrongOrderResets:true,
    mutedOrder:true,bridgeAfterReload:true,firstReport,bookAfterReload:true,bookTones,background,commands,battle,bossClearSaved:true,errors};
  if(earned)Object.assign(proof,{source,level:resumed.progression.level,reported:[first,second,third]});
  const proofPath=earned?'evidence/earned-bygone-resonance-browser.json':prefix+'-browser.json';
  await fs.writeFile(proofPath,JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[0],kills:f?.kills,
      portal:f?.storyNearbyPortal,notice:f?.storyNotice,resonance:f?.storyResonance,boss:f?.fieldBoss};
  }),errors);
  throw error;
}finally{await browser.close()}
