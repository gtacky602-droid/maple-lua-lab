import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub',staging='natlan-flag-staging',slope='natlan-flag-slope',ledges='natlan-flag-ledges';
const cleft='natlan-flag-cleft',summit='natlan-flag-summit',quest='natlan-ridge-flag';
const earned=process.argv.includes('--earned');
const work='work/earned-natlan-flag';
if(earned)await fs.mkdir(work,{recursive:true});
const output=process.env.LAB_FLAG_EVIDENCE??'evidence/natlan-flag-course';
let prefix=output;
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

async function startRoute(raw){
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),raw);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await nodeIs(hub);
  if(!earned)await questButton('受注','active');
  assert.equal((await frame()).progression.level,100);
  assert.equal((await frame()).story.quests[quest].status,'active');
  await count(0);
}

async function mapFor(target,expected){
  await key('KeyM');
  const map=page.locator('#worldAtlas');
  await map.waitFor();
  await wait(()=>window.lab.frame.worldMap?.region==='region-06');
  await page.selectOption('#atlasField',target);
  await wait(id=>window.lab.frame.worldMap?.selected?.id===id,target);
  if(expected){assert.match((await frame()).worldMap.guide.reason,expected);}
  await page.keyboard.press('Escape');
  await map.waitFor({state:'hidden'});
}

async function play(route,expectedReward){
  await gate(885,staging);
  if(earned)await mapFor(route,/案内板に近づいてG/);
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
  assert.match(await page.locator('#atlasPlaceLevel').innerText(),/依頼の進行地点/);
  assert.equal((await frame()).worldMap.selected.entryEnemyCount,1);
  await page.locator('#atlasQuestObjectives a[href*="step=2"]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#worldAtlas').waitFor({state:'hidden'});
  const rock=route===ledges;
  const entrance=rock?1316:880;
  await gate(entrance,route);
  const courseScene=await scene();
  assert.equal(courseScene.state,'ready');
  if(rock){
   assert.deepEqual(courseScene,{key:'natlanRaceRidge',file:'natlan-race-ridge-background-v1.png',state:'ready'});
   await jump(353,390);
  }
  await inspect(rock?560:445,2);
  await saveReload(staging);
  await gate(entrance,route);
  if(earned)await mapFor(cleft,/中継印を二つ/);
  if(rock)await jump(353,390);
  await jump(rock?1008:844,rock?302:391);
  await inspect(rock?1170:1445,3);
  await gate(rock?1452:1756,cleft);
  if(earned)await mapFor(summit,/足場が下りるまで/);
  assert.match((await frame()).storyFlagStatus,/カチーナのそばでG/);
  await walk(750);
  await key('KeyG');
  await wait(()=>window.lab.frame.storyFlagLowering?.progress>.22);
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  assert.ok(!(await frame()).platforms.some(p=>p.raceBridge));
  const remaining=(await frame()).storyFlagLowering.remaining;
  const timerText=await page.locator('#storyForest').textContent();
  assert.match(timerText,/足場を下ろすまで 残り[\d.]+秒/);
  await screenshot('lowering');
  assert.equal((await frame()).storyFlagLowering.remaining,remaining);
  await key('KeyP');
  await count(4);
  assert.ok((await frame()).platforms.some(p=>p.raceBridge));
  assert.match((await frame()).storyFlagStatus,/右へ渡って頂上へ/);
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
  assert.match((await frame()).storyFlagStatus,/集落に戻って報告/);
  await gate(1526,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,expectedReward);
  console.log(`Untimed ${route}, two relays, flag and report verified`);
  return {route,level:after.progression.level,reward,commands,timerText,scenes:[courseScene,summitScene]};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8876/');
  await wait(()=>window.lab?.frame);
  const raw=await fs.readFile(earned?'work/earned-fontaine-natlan/natlan-browser-start.json':'work/natlan-flag-course-fixture.json','utf8');
  const {reward:expectedReward}=JSON.parse(await fs.readFile('evidence/natlan-flag-course-lua.json','utf8'));
  if(earned){
   const results={};
   for(const [name,route] of [['slope',slope],['ledges',ledges]]){
    prefix=work+'/'+name;
    await startRoute(raw);
    results[name]=await play(route,expectedReward);
    await saveReload(hub);
    const f=await frame();
    assert.equal(f.progression.level,101);
    assert.equal(f.story.quests[quest].status,'complete');
    assert.equal(f.story.quests[quest].cycles,1);
    assert.equal(f.returns,0);
    assert.equal(f.story.quests[quest].flagBestTicks,undefined);
    const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
    await fs.writeFile(work+'/'+name+'-browser-complete.json',saved+'\n');
   }
   assert.deepEqual(errors,[]);
   await fs.writeFile('evidence/earned-natlan-flag-browser.json',JSON.stringify({results,reportRestore:true,errors},null,2)+'\n');
  }else{
  await startRoute(raw);
  const {reward,commands,scenes}=await play(ledges,expectedReward);

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
    viewMap:true,bothRelayMapLinks:true,optionalTimeAndReload:true,shortcutAndReadback:true,ticks,reward,commands,scenes,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
  }
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,flag:f?.storyFlagStatus,quest:f?.story.quests['natlan-ridge-flag'],platforms:f?.platforms};
  }),errors);
  throw error;
}finally{await browser.close()}
