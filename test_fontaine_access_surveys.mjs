import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const chart=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const cases=[
 ['fon-hidden-lab-access','deianeira-legend-lab'],
 ['fon-beryl-thermal-vents','iron-viscount-legend-pool'],
];
const earned=process.argv.includes('--earned');
const work='work/earned-fontaine-access';
const source='work/earned-fontaine-waterworks/waterworks-complete.json';
if(earned)await fs.mkdir(work,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const errors=[];
const frame=()=>page.evaluate(()=>window.lab.frame);
const atlas=page.locator('#worldAtlas');
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

async function routeTo(destination,screenshot){
 const region=chart.regions.find(row=>row.points.some(point=>point.id===destination)).id;
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption(region);
 await page.locator('#atlasField').selectOption(destination);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,destination);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 if(screenshot)await atlas.screenshot({path:work+'/'+screenshot+'.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 return guide;
}

async function travelTo(target){
 const route=await routeTo(target);
 assert.ok(['here','ready'].includes(route.status),JSON.stringify(route));
 for(const stop of route.stops)await drive.cross(stop.id,stop.gateX);
}

async function saveReload(id,count){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(({id,count})=>{
  const progress=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'))?.story.quests[id];
  return count==null?progress?.status==='complete':progress?.count===count;
 },{id,count});
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開'));
 await drive.waitNode('fontaine-hub');
}

async function compareInstruments(){
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame(),canvas=page.locator('#game'),mode=page.locator('#renderMode');
 await canvas.screenshot({path:work+'/thermal-gallery-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame();
 await canvas.screenshot({path:work+'/thermal-gallery-light.png'});
 assert.deepEqual([standard.t,light.t],[png.t,png.t]);
 await mode.selectOption('sprite');
 await page.waitForFunction(n=>window.lab.frame.commands===n,png.commands);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function entrance(quest,arena,reportMissing){
 const route=await routeTo(arena,quest.id+'-'+(reportMissing?'before':'after'));
 const stop=route.stops.at(-1);
 assert.equal(route.status,'blocked');
 assert.equal(stop.id,arena);
 assert.equal(stop.reason,'必要Lv100');
 if(reportMissing)assert.match(stop.questReason,/報告/);
 else assert.equal(stop.questReason,undefined);
 if(await drive.node()!==stop.from)await travelTo(stop.from);
 const gate=nodes[stop.from].exits.find(edge=>edge.to===arena);
 await drive.walk(gate.x);
 await drive.changeHeight(gate.y??480);
 await page.waitForFunction(arena=>window.lab.frame.storyNearbyPortal?.to===arena,arena);
 const nearby=(await frame()).storyNearbyPortal;
 assert.equal(nearby.reason,'必要レベル 100');
 assert.equal(nearby.questReason,stop.questReason);
 assert.equal(nearby.available,false);
 const text=await page.locator('#nearbyPortalText').textContent();
 assert.equal(text.includes('報告'),reportMissing);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),stop.from);
 return {from:stop.from,reason:stop.reason,questReason:stop.questReason??null};
}

async function earnedPlay(id,arena){
 const quest=graph.quests.find(q=>q.id===id);
 const depths=[];
 let compression;
 await drive.accept(id);
 for(const [index,step] of quest.itinerary.entries()){
  const origin=step.from??step.node;
  if(await drive.node()!==origin)await travelTo(origin);
  if(step.kind==='arrive')await drive.cross(step.node);
  else{
   await drive.walk(step.x);
   if(nodes[origin].swim){
    const offset=step.y>=360?-72:78;
    const direction=offset>0?'up':'down';
    await drive.changeHeight(step.y+offset);
    await page.waitForFunction(({objective,direction})=>{
     const hint=window.lab.frame.storySwimInstrument;
     return hint?.objective===objective&&hint.direction===direction;
    },{objective:step.objective,direction});
    await page.keyboard.press('KeyG');
    await drive.count(id,index);
    depths.push({instrument:step.waterInstrument,direction});
   }
   await drive.changeHeight(step.y);
   await page.waitForFunction(action=>window.lab.frame.storyNearbyMilestone?.label===action,step.action);
   if(step.waterInstrument==='current')compression=await compareInstruments();
   await page.keyboard.press('KeyG');
  }
  await drive.count(id,index+1);
  if(index===1){
   await saveReload(id,2);
   await drive.count(id,2);
  }
 }
 const gateBefore=await entrance(quest,arena,true);
 await drive.warp(quest.hub);
 const before=await frame();
 await drive.report(id);
 const after=await frame();
 assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],[quest.xp,quest.mora]);
 await saveReload(id);
 const gateAfter=await entrance(quest,arena,false);
 await drive.warp(quest.hub);
 console.log('Reported and restored '+id);
 return {steps:quest.goal,depths,gateBefore,gateAfter,restoredReport:true,compression,
  payoutXp:quest.xp,payoutMora:quest.mora};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9069/');
 await page.waitForFunction(()=>window.lab?.frame);
 const result={};
 if(earned){
  await page.locator('#importSave').setInputFiles(source);
  await drive.waitNode('fontaine-hub');
  assert.equal((await frame()).progression.level,94);
  for(const [id,arena] of cases)result[id]=await earnedPlay(id,arena);
 }else for(const [id,arena] of cases){
  const quest=graph.quests.find(q=>q.id===id);
  const first=quest.itinerary[0],anchor=first.from??first.node;
  await page.locator('#importSave').setInputFiles(`work/${id}-ready.json`);
  await drive.waitNode(quest.hub);
  await drive.count(id,0);
  await drive.warp(anchor);
  for(const [index,step] of quest.itinerary.entries()){
   if(step.kind==='arrive')await drive.cross(step.node);
   else{
    await drive.walk(step.x);
    await drive.changeHeight(step.y);
    await page.keyboard.press('KeyG');
   }
   await drive.count(id,index+1);
  }
  const locked=await routeTo(arena);
  assert.equal(locked.status,'blocked');
  assert.match(locked.reason,/報告/);

  await drive.warp(quest.hub);
  const before=await frame();
  await drive.report(id);
  const after=await frame();
  assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],[quest.xp,quest.mora]);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(id=>{
   const checkpoint=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
   return checkpoint?.story.quests[id]?.status==='complete';
  },id);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開'));
  await drive.warp(anchor);
  const guide=await routeTo(arena);
  assert.equal(guide.status,'ready');
  for(const stop of guide.stops)await drive.cross(stop.id);
  assert.equal(await drive.node(),arena);
  await drive.cross(guide.stops.at(-1).from);
  result[id]={steps:quest.goal,arena,requiredReport:true,openedAfterReload:true,payoutXp:quest.xp,payoutMora:quest.mora};
 }
 assert.deepEqual(errors,[]);
 const proof=earned?'evidence/earned-fontaine-access-surveys-browser.json':'evidence/fontaine-access-surveys-browser.json';
 await fs.writeFile(proof,JSON.stringify({cases:result,errors,...(earned?{source,level:94}: {})},null,2)+'\n');
 console.log('Both Fontaine surveys, depths, reports and arena conditions passed in Chrome.');
}catch(error){
 console.error(await page.evaluate(()=>({
  state:window.lab?.frame?.story?.node,gate:window.lab?.frame?.storyNearbyPortal,
  guide:window.lab?.frame?.worldMap?.guide,save:document.querySelector('#saveStatus')?.textContent,
 })));
 throw error;
}finally{
 await browser.close();
}
