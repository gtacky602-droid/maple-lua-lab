import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {observeRuinAttacks} from './tools/browser_ruin_guardian_test.mjs';

const hub='sumeru-hub';
const [roots,bank,junction,rootPath,branch,stop,approach,terrace,observatory]=[
  'sumeru-river-roots','sumeru-river-bank','sumeru-canopy-junction','sumeru-root-slope',
  'sumeru-branch-run','sumeru-observation-stop','sumeru-observatory-approach',
  'sumeru-observatory-terrace','sumeru-sky-observatory'];
const [first,second,third]=['sumeru-leaf-crossing','sumeru-forest-levels','sumeru-observatory-map'];
const earnedFirst=process.argv.includes('--earned-first');
const prefix=earnedFirst?'work/earned-sumeru-opening-bosses/leaf-bridge':'evidence/sumeru-canopy';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,param,timeout=15000)=>page.waitForFunction(fn,param,{timeout});
const nodeIs=node=>wait(id=>window.lab.frame.story.node===id,node);

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
  const {actors,active}=await frame();
  if(actors[active-1].ground&&actors[active-1].y===y)return;
  await canvas.click();
  await page.keyboard.down('Space');
  try{
    await wait(y=>window.lab.frame.actors[0].y===y&&window.lab.frame.actors[0].ground,y);
  }finally{await page.keyboard.up('Space')}
}

async function gate(x,node,ride=false){
  await walk(x);
  await wait(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node);
  await key('KeyF');
  if(ride){
    await wait(()=>window.lab.frame.storyLift?.seconds===1.55);
    assert.ok((await frame()).storyLift.remaining>0);
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
  await page.locator(`[data-quest="${id}"]`).getByRole('button',{name:label,exact:true}).click();
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function report(id,reward){
  const before=await frame();
  await quest(id,'報告','complete');
  const after=await frame();
  assert.deepEqual([after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre],reward);
}

async function saveReload(){
  await page.click('#saveProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await nodeIs(hub);
}

async function survey(id,screenshot){
  await wait(id=>window.lab.frame.storySurveyMap?.id===id,id);
  await page.locator('#surveyMap').waitFor({state:'visible'});
  const caption=await page.locator('#surveyMapCaption').textContent();
  assert.equal(caption,(await frame()).storySurveyMap.caption);
  if(screenshot)await page.locator('.game').screenshot({path:prefix+'-'+screenshot+'.png'});
}

async function background(){
  return page.evaluate(async()=>{
    const {sceneryStatus,backgroundReady}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function auto(on){
  if((await frame()).auto===on)return;
  await page.click('#auto');
  await wait(on=>window.lab.frame.auto===on,on);
}

async function battleNear(x){
  await walk(x);
  if((await frame()).auto)await auto(false);
  await key('KeyJ');
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='canopy-fungus-source-v1.png'&&d.h===149));
  await page.locator('.game').screenshot({path:prefix+'-fungus-png.png'});
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await page.locator('.game').screenshot({path:prefix+'-fungus-light.png'});
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function airflow(selection){
  await key('KeyG');
  await wait(choice=>window.lab.frame.storyAirflow?.selection===choice,selection);
}

async function run(){
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8872/');
  await wait(()=>window.lab?.frame);
  const fixture=await fs.readFile(earnedFirst?prefix+'-ready.json':'work/sumeru-canopy-fixture.json','utf8');
  const {rewards}=JSON.parse(await fs.readFile('evidence/sumeru-canopy-lua.json','utf8'));
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(hub);
  if(earnedFirst){
    const start=await frame();
    assert.equal(start.progression.level,60);
    assert.equal(start.story.quests['jadeplume-commission'].status,'complete');
  }
  await quest(first,'受注','active');
  await gate(875,roots);
  const river=await background();
  assert.deepEqual(river,{key:'sumeruRiverside',file:'sumeru-riverside-background-v1.png',state:'ready'});
  await interact(315,first,1);
  await jump(714,391);
  await survey('river-canopy','leaf');
  await interact(714,first,2);
  await interact(924,first,3);
  await saveReload();
  await gate(875,roots);
  assert.ok((await frame()).platforms.some(p=>p.leafBridge&&p.y===391&&!p.preview));
  await jump(714,391);
  await gate(1645,bank);
  await battleNear(332);
  await jump(778,390);
  await battleNear(778);
  await auto(true);
  await count(first,4);
  await auto(false);
  await interact(1350,first,5);
  await gate(1529,hub);
  await report(first,rewards[0]);
  console.log('Leaf bridge persists after reload, first quest reported');

  if(earnedFirst){
    await saveReload();
    const f=await frame();
    assert.equal(f.progression.level,62);
    assert.equal(f.story.quests[first].status,'complete');
    assert.equal(f.story.quests[first].cycles,1);
    assert.equal(f.story.quests['jadeplume-commission'].status,'complete');
    assert.equal(f.returns,0);
    assert.deepEqual(errors,[]);
    await fs.writeFile('evidence/earned-sumeru-leaf-crossing-browser.json',JSON.stringify({
      browser:'Chrome',startLevel:60,finishLevel:62,quest:first,objectives:5,
      reward:rewards[0],restoredLeafBridge:true,restoredReport:true,returns:f.returns
    },null,2)+'\n');
    return;
  }

  await quest(second,'受注','active');
  await gate(1026,junction);
  await interact(330,second,1);
  await jump(726,388);
  await airflow('葉だけ開く');
  await page.locator('#airflowCommit').click();
  await wait(()=>window.lab.frame.storyNotice?.includes('向きと羽根'));
  assert.equal((await frame()).story.quests[second].count,1);
  await airflow('羽根だけ回す');
  await airflow('葉を開き、羽根を回す');
  await page.locator('#airflowCommit').click();
  await count(second,2);
  await gate(1422,branch);
  await gate(55,junction);
  await gate(1550,rootPath);
  await jump(824,390);
  await interact(824,second,3);
  await gate(1450,stop);
  await gate(369,branch);
  await jump(653,302);
  await interact(653,second,4);
  await gate(1434,stop);
  await jump(823,390);
  await interact(823,second,5);
  await gate(239,junction,true);
  await gate(1007,stop,true);
  await gate(55,hub);
  await report(second,rewards[1]);
  console.log('Root and branch paths converge, lift round trip verified');

  await quest(third,'受注','active');
  await gate(1162,stop);
  await gate(1339,approach);
  await battleNear(277);
  await jump(771,390);
  await battleNear(771);
  await walk(1110);
  await jump(1372,391);
  await battleNear(1372);
  await auto(true);
  await count(third,1);
  await auto(false);
  await gate(1720,terrace);
  const canopy=await background();
  assert.deepEqual(canopy,{key:'sumeruCanopy',file:'sumeru-canopy-background-v1.png',state:'ready'});
  await walk(853);
  await wait(()=>Object.values(window.lab.frame.fieldBoss?.zones??{}).some(zone=>!zone.active));
  const commands=await compare();
  const battle=await observeRuinAttacks(page,['CF01','CF02']);
  await auto(true);
  await count(third,2);
  await auto(false);
  await jump(1525,390);
  await interact(1525,third,3);
  await gate(1744,observatory);
  await jump(826,391);
  await interact(826,third,4);
  await gate(55,hub);
  await report(third,rewards[2]);
  await saveReload();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'))
    .endgame.bosses['original-canopy-fungus'].clears),1);
  await gate(1282,observatory);
  await jump(826,391);
  await survey('sumeru-height-map','map');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.startsWith('観測所の地図'));
  assert.deepEqual(errors,[]);
  const proof={reloadedLeaf:true,walkedLeafBridge:true,wrongAdjustmentRejected:true,upperGate:true,
    bothRoutesConverge:true,liftRoundTrip:true,battle,bossClearSaved:true,readbackAfterReload:true,
    scenes:[river,canopy],commands,rewards,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}

try{
  await run();
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,t:f?.t,actor:f?.actors[0],quests:Object.fromEntries(
      Object.entries(f?.story.quests||{}).filter(([id])=>id.startsWith('sumeru'))),
      portal:f?.storyNearbyPortal,milestone:f?.storyNearbyMilestone,notice:f?.storyNotice,platforms:f?.platforms};
  }),errors);
  throw error;
}finally{await browser.close()}
