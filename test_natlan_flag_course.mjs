import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub',staging='natlan-flag-staging',slope='natlan-flag-slope',ledges='natlan-flag-ledges';
const cleft='natlan-flag-cleft',summit='natlan-flag-summit',quest='natlan-ridge-flag';
const prefix='evidence/natlan-flag-course';
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

async function gate(x,node){
  await walk(x);
  await wait(id=>{
    const p=window.lab.frame.storyNearbyPortal;
    return p?.available&&p.to===id;
  },node);
  await key('KeyF');
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

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='natlan-race-flag-source-v1.png'&&d.h===121));
  await screenshot('flag-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t));
  await screenshot('flag-light');
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

async function trialStamp(x,count){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='計測用の中継印を押す');
  await key('KeyG');
  await wait(n=>window.lab.frame.storyFlagStatus?.includes(`中継印 ${n} / 2`),count);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8876/');
  await wait(()=>window.lab?.frame);
  const raw=await fs.readFile('work/natlan-flag-course-fixture.json','utf8');
  const {reward:expectedReward}=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  await page.locator('#loadProgress').click();
  await nodeIs(hub);
  await questButton('受注','active');
  await gate(885,staging);
  await inspect(382,1);
  assert.ok(!(await frame()).storyFlagStatus.includes('計測'));
  await key('KeyM');
  await page.locator('#worldAtlas').waitFor();
  await wait(()=>window.lab.frame.worldMap?.region==='region-06');
  await page.selectOption('#atlasField',slope);
  await wait(id=>window.lab.frame.worldMap?.selected?.id===id,slope);
  assert.match(await page.locator('#atlasPlaceLevel').innerText(),/依頼の進行地点/);
  assert.equal((await frame()).worldMap.selected.entryEnemyCount,5);
  await page.locator('#atlasQuestObjectives a[href*="step=2"]').waitFor();
  await page.selectOption('#atlasField',ledges);
  await wait(id=>window.lab.frame.worldMap?.selected?.id===id,ledges);
  await page.locator('#atlasQuestObjectives a[href*="step=2"]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#worldAtlas').waitFor({state:'hidden'});
  await gate(1316,ledges);
  const ridgeScene=await scene();
  assert.deepEqual(ridgeScene,{key:'natlanRaceRidge',file:'natlan-race-ridge-background-v1.png',state:'ready'});
  await jump(353,390);
  await inspect(560,2);
  await saveReload(staging);
  await gate(1316,ledges);
  await jump(353,390);
  await jump(1008,302);
  await inspect(1170,3);
  await gate(1452,cleft);
  await walk(750);
  await key('KeyG');
  await wait(()=>window.lab.frame.storyFlagLowering?.progress>.22);
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  assert.ok(!(await frame()).platforms.some(p=>p.raceBridge));
  await screenshot('lowering');
  await key('KeyP');
  await count(4);
  assert.ok((await frame()).platforms.some(p=>p.raceBridge));
  await gate(1580,summit);
  const summitScene=await scene();
  assert.deepEqual(summitScene,{key:'natlanRaceSummit',file:'natlan-race-summit-background-v1.png',state:'ready'});
  await jump(1105,390);
  await wait(()=>window.lab.frame.storySurveyMap?.id==='natlan-two-flags');
  await page.locator('#surveyMap').waitFor({state:'visible'});
  await screenshot('view');
  await walk(1055);
  const commands=await compare();
  await inspect(1105,5);
  await gate(1526,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,expectedReward);
  console.log('Untimed climb, two relays, flag and report verified');

  await gate(885,staging);
  await walk(382);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='任意のタイム計測を始める');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyFlagStatus?.startsWith('計測中'));
  await gate(880,slope);
  await trialStamp(445,1);
  await jump(844,391);
  await trialStamp(1445,2);
  await gate(1756,cleft);
  await gate(1580,summit);
  await jump(1105,390);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='この周回の旗を取る');
  await key('KeyG');
  await wait(id=>window.lab.frame.story.quests[id]?.flagBestTicks>0,quest);
  const ticks=(await frame()).story.quests[quest].flagBestTicks;
  await saveReload(staging);
  assert.equal((await frame()).story.quests[quest].flagBestTicks,ticks);
  await gate(56,hub);
  await gate(1227,summit);
  await jump(1105,390);
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.startsWith('頂上の記録'));
  assert.deepEqual(errors,[]);
  const proof={bothRoutes:true,normalJumps:true,altMarkAfterReload:true,animatedBridge:true,firstRunUntimed:true,
    viewMap:true,bothRelayMapLinks:true,optionalTimeAndReload:true,shortcutAndReadback:true,ticks,reward,commands,scenes:[ridgeScene,summitScene],errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,flag:f?.storyFlagStatus,quest:f?.story.quests['natlan-ridge-flag'],platforms:f?.platforms};
  }),errors);
  throw error;
}finally{await browser.close()}
