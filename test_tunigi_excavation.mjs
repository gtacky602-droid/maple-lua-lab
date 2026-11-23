import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {observeRuinAttacks} from './tools/browser_ruin_guardian_test.mjs';

const camp='tunigi-camp',shelf='tunigi-vent-shelf',shop='tunigi-baffle-workshop';
const shelter='tunigi-return-shelter',passage='tunigi-elite-passage',vault='tunigi-fragment-vault';
const first='tunigi-vent-record',second='tunigi-return-design',third='tunigi-fragment-return';
const prefix='evidence/tunigi-excavation';
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

async function gate(x,node,viaLift=false){
  await walk(x);
  await wait(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node,16000);
  await key('KeyF');
  if(viaLift)await wait(()=>window.lab.frame.storyLift?.remaining>0);
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

async function defeatOne(x,y=480,goal){
  if(y===480)await walk(x);else await jump(x,y);
  const before=await frame();
  const target=goal??before.kills+1;
  if(before.kills>=target)return;
  await page.click('#auto');
  await wait(n=>window.lab.frame.kills>=n,target,25000);
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

async function tone(expected){
  const before=(await frame()).storyAirflowCue?.id;
  await key('KeyG');
  await wait(({expected,before})=>{
    const f=window.lab.frame,cue=f.storyAirflowCue;
    return cue?.id!==before&&cue?.pattern===expected&&document.querySelector('#airflowStatus').textContent.includes(expected);
  },{expected,before});
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='wind-ring-source-v1.png'&&d.h===139));
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
  await wait(()=>window.lab.frame.draws.some(d=>d.source==='wind-ring-source-v1.png'));
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
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
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8867/');
  await wait(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/tunigi-excavation-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(camp);
  await quest(first,'受注','active');
  await gate(925,shelf);
  const sentries=(await frame()).kills;
  await defeatOne(286,480,sentries+1);
  await defeatOne(742,390,sentries+2);
  await defeatOne(1180,480,sentries+3);
  await count(first,1);
  await walk(449);
  await wait(()=>window.lab.frame.storyAirflow?.target==='○');
  await tone('□');
  assert.deepEqual(await page.evaluate(()=>window.tones),[]);
  await page.click('#airflowSound');
  await wait(()=>document.querySelector('#airflowSound').getAttribute('aria-pressed')==='true');
  await tone('○');
  await count(first,2);
  const tones=await page.evaluate(()=>window.tones);
  assert.deepEqual(tones,[392]);
  await page.click('#airflowSound');
  await jump(876,390);
  await tone('○');
  await tone('□');
  await tone('△');
  await count(first,3);
  await walk(1440);
  await tone('□');
  await count(first,4);
  assert.deepEqual(await page.evaluate(()=>window.tones),tones);
  await gate(55,camp);
  await quest(first,'報告','complete');
  console.log('Three vents and muted/opt-in audio verified');

  await quest(second,'受注','active');
  await gate(1095,shop);
  await walk(410);
  const candidates=[];
  for(const x of [545,820,1120]){
    await key('KeyG');
    await wait(x=>window.lab.frame.platforms.some(p=>p.preview&&p.x===x),x);
    candidates.push(x);
    if(x===545){
      await page.click('#airflowCommit');
      await wait(()=>window.lab.frame.storyNotice?.includes('両方で'));
      await count(second,0);
    }
  }
  await page.click('#airflowCommit');
  await count(second,1);
  assert.equal((await frame()).platforms.filter(p=>p.airflowDeck&&p.preview).length,0);
  await jump(1240,393);
  await gate(1325,shelter,true);
  assert.equal((await frame()).actors[0].y,387);
  await interact(565,second,2);
  await gate(655,shop,true);
  assert.equal((await frame()).actors[0].y,393);
  assert.equal((await frame()).platforms.find(p=>p.airflowDeck).x,1120);
  await gate(1325,shelter,true);
  await interact(879,second,3);
  await gate(55,camp);
  await quest(second,'報告','complete');
  console.log('Deck placements and lift round-trip verified');

  await quest(third,'受注','active');
  await gate(1240,shelter);
  await gate(1220,passage);
  const elites=(await frame()).kills;
  await defeatOne(392,480,elites+1);
  await defeatOne(908,390,elites+2);
  await count(third,1);
  await gate(1530,vault);
  await walk(864);
  const ready=await frame();
  assert.equal(ready.fieldBoss.id,'original-wind-ring');
  assert.equal(ready.imprintGrowth.total,0);
  const background=await page.evaluate(async()=>{
    const {sceneryStatus,backgroundReady}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(background,{key:'tunigiExcavation',file:'tunigi-excavation-background-v1.png',state:'ready'});
  await wait(()=>Object.values(window.lab.frame.fieldBoss?.zones??{}).some(zone=>!zone.active));
  const commands=await compare();
  const battle=await observeRuinAttacks(page,['WR01','WR02']);
  await defeatOne(866);
  await count(third,2);
  assert.equal((await frame()).progression.killXp,ready.progression.killXp);
  await walk(55);
  await wait(()=>window.lab.frame.storyNearbyPortal?.reason.includes('崩れた壁'));
  await key('KeyF');
  await nodeIs(vault);
  await interact(1425,third,3);
  await gate(1630,shelter);
  await gate(55,camp);
  await interact(665,third,4);
  const before=await frame();
  await quest(third,'報告','complete');
  const after=await frame();
  const firstReport=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(firstReport,[364882,461918,6]);
  await saveReload();
  await nodeIs(camp);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'))
    .endgame.bosses['original-wind-ring'].clears),1);
  await walk(665);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='展示された記録片を読む');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.includes('東の退路'));
  assert.deepEqual(errors,[]);
  const proof={threeQuests:true,tones,candidates,roundTrip:true,gateCollapse:true,
    firstReport,preparedExit:true,readableAfterReload:true,background,commands,battle,bossClearSaved:true,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[0],kills:f?.kills,auto:f?.auto,
      notice:f?.storyNotice,portal:f?.storyNearbyPortal,airflow:f?.storyAirflow,boss:f?.fieldBoss};
  }),errors);
  throw error;
}finally{await browser.close()}
