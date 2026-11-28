import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8966';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const quests=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const samples='fon-mapped-depth-samples',bygone='fon-mapped-bygone-current';
const lock='fon-mapped-north-lock',nostoi='fon-mapped-nostoi-record';
const north=process.argv.includes('--north-surveys');
const nostoiReplay=process.argv.includes('--nostoi');
const captures=process.env.LAB_FONTAINE_CAPTURES||(nostoiReplay?'work/earned-fontaine-nostoi':north?'work/earned-fontaine-surveys':'evidence');
await fs.mkdir(captures,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const d=waypointDriver(page,nodes);
const {walk,changeHeight,actor,cross,warp,count,waitNode,accept,report,choices,journeys}=d;
const diveHelp=page.locator('#fieldSwimHelp');
const follow=async(...nodes)=>{for(const id of nodes)await cross(id)};
let shore,render;
const depthPrompts=[];

async function atlasGuide(target){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 return guide.stops;
}

async function followAtlas(target){
 const stops=await atlasGuide(target);
 for(const stop of stops)await cross(stop.id,stop.gateX);
 return stops.map(stop=>stop.id);
}

async function verifyDepthPrompt(target,direction){
 await page.waitForFunction(({target,direction})=>{
  const cue=window.lab.frame.storySwimGate;
  return cue?.to===target&&cue.direction===direction;
 },{target,direction});
 const label=direction==='up'?'浮上':'潜水';
 const prompt=await diveHelp.textContent();
 assert.ok(prompt.endsWith('へは'+label));
 const current=await d.node();
 await page.keyboard.press('KeyF');
 assert.equal(await d.node(),current);
 if(north||nostoiReplay){
  await page.locator('.game').screenshot({path:join(captures,target+'-depth-'+direction+'.png')});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await diveHelp.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.setViewportSize({width:1200,height:960});
 }
 depthPrompts.push({from:current,target,direction,prompt});
}

async function shoreRoundTrip(){
 const dry='fon-wp-53849',wet='fon-wp-53864';
 const entry=nodes[dry].exits.find(e=>e.to===wet),exit=nodes[wet].exits.find(e=>e.to===dry);
 const dive=await atlasGuide(wet);
 assert.equal(dive.length,1);
 assert.deepEqual([dive[0].from,dive[0].mode,dive[0].label],[dry,'dive','潜水口']);
 assert.match(dive[0].hint,/門を通ると水中へ（中層）/);
 await cross(wet);
 await diveHelp.waitFor();
 assert.deepEqual([(await actor()).x,(await actor()).y],[entry.arrivalX,entry.arrivalY]);
 await walk(exit.x);
 await changeHeight(exit.y+95);
 assert.ok(Math.abs((await actor()).y-exit.y)>60);
 await verifyDepthPrompt(dry,'up');
 const land=await atlasGuide(dry);
 assert.equal(land.length,1);
 assert.deepEqual([land[0].from,land[0].mode,land[0].label],[wet,'land','上陸口']);
 assert.match(land[0].hint,/中層の門（今の位置から浮上）/);
 await page.evaluate(()=>document.activeElement.blur());
 assert.equal(await page.evaluate(target=>window.lab.frame.storyNearbyPortal?.to===target,dry),false);
 await page.keyboard.press('KeyF');
 await cross(dry);
 await diveHelp.waitFor({state:'hidden'});
 assert.deepEqual([(await actor()).x,(await actor()).y],[exit.arrivalX,exit.arrivalY]);
 assert.equal(await page.evaluate(()=>window.lab.frame.storySwimGate??null),null);
 await count(lock,4);
 return {dive:dive[0],land:land[0],wrongDepthRejected:true,northLockStepsUnchanged:true};
}

async function compareProfiles(){
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const canvas=page.locator('#game');
 const calls=()=>page.evaluate(()=>Number(document.querySelector('#draws').textContent.replaceAll(',','')));
 const before=await actor();
 const png=await calls();
 await canvas.screenshot({path:join(captures,'fontaine-waypoint-swim.png')});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(n=>Number(document.querySelector('#draws').textContent.replaceAll(',',''))>n,png);
 const standard=await calls();
 await page.selectOption('#renderMode','h32c16');
 await page.waitForFunction(n=>Number(document.querySelector('#draws').textContent.replaceAll(',',''))<n,standard);
 const light=await calls();
 await canvas.screenshot({path:join(captures,'fontaine-waypoint-swim-light.png')});
 const after=await actor();
 assert.deepEqual([before.x,before.y,before.hp],[after.x,after.y,after.hp]);
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(n=>Number(document.querySelector('#draws').textContent.replaceAll(',',''))===n,png);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {png,standard,light,frozen:true};
}

async function inspect(step,quest,index){
 await walk(step.x-33);
 await changeHeight(step.y);
 await page.keyboard.press('KeyG');
 await count(quest,index);
}

async function survey(id,approach){
 const {itinerary,hub}=quests[id];
 await accept(id);
 const route=approach?await followAtlas(approach):undefined;
 for(const [i,step] of itinerary.entries()){
  if(step.kind==='inspect'){
   await inspect(step,id,i+1);
   if(step.node==='fon-wp-50065')render=await compareProfiles();
   if(step.node==='bygone-wp-68605')await page.locator('#game').screenshot({path:join(captures,'bygone-waypoint-swim.png')});
   if(id===lock&&step.node==='fon-wp-53849')shore=await shoreRoundTrip();
  }else{
   assert.equal(await d.node(),step.from);
   if(step.node==='fon-wp-50065'){
    const gate=nodes[step.from].exits.find(e=>e.to===step.node);
    await walk(gate.x);
    assert.ok(Math.abs((await actor()).y-gate.y)>60);
    const approaching=await page.evaluate(()=>window.lab.frame.storyNearbyPortal?.to??null);
    assert.notEqual(approaching,step.node);
    await verifyDepthPrompt(step.node,'up');
    if(north){
     await changeHeight(gate.y-72);
     assert.ok(gate.y-(await actor()).y>=60);
     await verifyDepthPrompt(step.node,'down');
    }
    assert.equal(await diveHelp.isVisible(),true);
    assert.equal(await page.locator('#touchJump').isHidden(),true);
   }
   await cross(step.node);
   await count(id,i+1);
   assert.notEqual(await page.evaluate(()=>window.lab.frame.storySwimGate?.to),step.node);
  }
 }
 await warp(hub);
 assert.equal(await diveHelp.isHidden(),true);
 await report(id);
 console.log('Reported '+id);
 return route;
}

async function reloadAtCount(id,expected){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(([id,n])=>{
  const raw=localStorage.getItem('maple-lua-lab.checkpoint.v1');
  return raw&&JSON.parse(raw).story.quests[id]?.count===n;
 },[id,expected]);
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('fontaine-hub');
 await count(id,expected);
}

async function earnNostoi(){
 const quest=quests[nostoi],shelf=quest.itinerary.at(-1);
 const game=page.locator('.game');
 const frame=()=>page.evaluate(()=>window.lab.frame);
 assert.equal((await frame()).progression.level,96);
 assert.equal((await frame()).story.quests['knave-weekly-commission'].status,'complete');
 await accept(nostoi);
 const approach=await followAtlas(quest.itinerary[0].from);
 for(const [i,step] of quest.itinerary.slice(0,-1).entries()){
  assert.equal(await d.node(),step.from);
  if(i===2||i===4){
   const gate=nodes[step.from].exits.find(e=>e.to===step.node);
   await walk(gate.x);
   await changeHeight(gate.y+(i===2?-75:75));
   await verifyDepthPrompt(step.node,i===2?'down':'up');
  }
  const stops=await atlasGuide(step.node);
  assert.deepEqual(stops.map(s=>s.id),[step.node]);
  if(i===2)assert.match(stops[0].hint,/第一層から北室へ潜る水路/);
  await cross(step.node);
  await count(nostoi,i+1);
  if(i===2){
   await reloadAtCount(nostoi,3);
   await warp(step.node);
   await diveHelp.waitFor();
  }
 }
 await walk(shelf.x-24);
 await changeHeight(shelf.y+78);
 await page.waitForFunction(()=>window.lab.frame.storySwimInstrument?.direction==='up');
 const prompt=await diveHelp.textContent();
 assert.match(prompt,/棚の文字を記録するには浮上/);
 await game.screenshot({path:join(captures,'record-shelf-depth.png')});
 await page.keyboard.press('KeyG');
 await count(nostoi,5);
 assert.equal((await frame()).story.quests[nostoi].count,5);
 await changeHeight(shelf.y);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone?.label==='記録を取る');
 const palette=graph.waterInstruments.recordShelf;
 const hasProp=async part=>{
  const [,,w,h,color]=palette[part][0];
  return (await frame()).draws.some(d=>d.kind==='rect'&&d.w===w&&d.h===h&&d.color===color);
 };
 assert.ok(await hasProp('before'));
 const render=await compareProfiles();
 await inspect(shelf,nostoi,6);
 assert.ok(await hasProp('after')&&await hasProp('pending'));
 await game.screenshot({path:join(captures,'record-shelf-checked.png')});
 const back=await atlasGuide('fon-wp-68343');
 assert.match(back[0].hint,/記録棚から南室へ戻る水路/);
 await follow('fon-wp-68343','fon-wp-68342','fon-wp-68345','fon-wp-68341');
 assert.equal(await diveHelp.isHidden(),true);
 await warp(quest.hub);
 const before=await frame();
 await report(nostoi);
 const after=await frame();
 assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],[quest.xp,quest.mora]);
 await reloadAtCount(nostoi,6);
 assert.equal((await frame()).story.quests[nostoi].status,'complete');
 const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
 await fs.writeFile(join(captures,'nostoi-browser-save.json'),saved+'\n');
 await warp(shelf.node);
 assert.ok(await hasProp('reported'));
 assert.equal((await frame()).storySwimInstrument??null,null);
 await game.screenshot({path:join(captures,'record-shelf-reported.png')});
 assert.equal((await frame()).returns,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/earned-fontaine-nostoi-browser.json',JSON.stringify({
  level:96,approach,journeys,depthPrompts,shelfPrompt:prompt,restoredMidQuestAt:3,steps:6,
  report:{xp:quest.xp,mora:quest.mora},restoredShelfAndWarp:true,returns:0,render,pageErrors:errors
 },null,2)+'\n');
 console.log('Earned Lv96 Nostoi route passed in Chrome.');
}

async function surveyCatalog(){
 if(north)assert.equal(await page.evaluate(()=>window.lab.frame.progression.level),92);
 await survey(samples);
 const lockRoute=await survey(lock,'fon-wp-53867');
 const reported=[samples,lock];
 if(!north){
  await survey(nostoi,'nostoi-castle-approach');
  await follow('nostoi-castle-approach','fon-wp-68341','fon-wp-68345',
               'bygone-wp-68599','bygone-wp-68600','bygone-camp');
  await survey(bygone);
  reported.push(nostoi,bygone);
 }
 const labels=await choices.locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));
 const expectedLabels=north?['フォンテーヌ湖・水中']:['フォンテーヌ湖・水中','ノストイ地区・水中','往日の海・水中'];
 for(const label of expectedLabels)assert.ok(labels.includes(label));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode(north?'fontaine-hub':'bygone-camp');
 for(const id of reported){
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }
 await warp('fon-wp-50065');
 const a=await actor(),pin=nodes['fon-wp-50065'].waypoint;
 assert.deepEqual([a.x,a.y],[pin.x,pin.y]);
 assert.equal(await diveHelp.isVisible(),true);
 await warp('fontaine-hub');
 assert.equal(await diveHelp.isHidden(),true);
 assert.deepEqual(errors,[]);
 assert.ok(shore&&render);
 if(north){
  assert.equal(await page.evaluate(()=>window.lab.frame.returns),0);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 const reportFile=north?'evidence/earned-fontaine-surveys-browser.json':join(captures,'fontaine-waypoint-browser.json');
 await fs.writeFile(reportFile,JSON.stringify({
  journeys,labels,reported,lockRoute,shore,render,depthPrompts,
  differentDepthRejection:true,reloadAndWarp:true,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed '+reported.length+' reports, depth prompts, diving and landing, and the saved underwater warp.');
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 const source=nostoiReplay?'work/earned-fontaine-nostoi/level96-ready.json':
  north?'work/earned-fontaine-surveys/surveys-ready.json':'work/fontaine-waypoint-browser-save.json';
 await page.locator('#importSave').setInputFiles(source);
 await waitNode('fontaine-hub');
 if(nostoiReplay)await earnNostoi();
 else await surveyCatalog();
}catch(error){
 console.error('Last completed crossings:',journeys);
 console.error('Last browser state:',await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,notice:f?.storyNotice,gate:f?.storyNearbyPortal,ride:f?.storyLift,
          status:document.querySelector('#status')?.textContent};
 }));
 throw error;
}finally{await browser.close()}
