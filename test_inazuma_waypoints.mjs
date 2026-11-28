import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8964';
const earned=process.argv.includes('--earned');
const output=earned?'work/earned-inazuma-sumeru':'evidence';
const town='inazuma-town',camp='enkanomiya-camp';
const entry='sumeru-entry',hub='sumeru-hub';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const seirai='ina-mapped-seirai-ferry',floor='ina-mapped-undersea-floor',beacons='ina-mapped-enkan-beacons';
const quests=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const errors=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
page.on('pageerror',e=>errors.push(e.message));
const d=waypointDriver(page,nodes);
const {walk,cross,warp,count,waitNode,accept,report,choices,journeys}=d;
const follow=async(...places)=>{for(const place of places)await cross(place)};

async function inspect(step,quest,index){
 await walk(step.x);
 await page.waitForFunction(action=>window.lab.frame.storyNearbyMilestone?.label===action,step.action);
 await page.keyboard.press('KeyG');
 await count(quest,index);
}

async function itinerary(id){
 for(const [i,step] of quests[id].itinerary.entries()){
  if(step.kind==='arrive'){
   await cross(step.node);
   await count(id,i+1);
  }else await inspect(step,id,i+1);
 }
 await warp(quests[id].hub);
 await report(id);
}

async function atlasGuide(target,region){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 if(region){
  await page.locator('#atlasRegion').selectOption(region);
  await page.waitForFunction(region=>window.lab.frame.worldMap?.region===region,region);
 }
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(target=>window.lab.frame.worldMap?.selected?.id===target,target);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 return guide;
}

async function atlasRoute(target){
 const guide=await atlasGuide(target);
 assert.equal(guide.status,'ready');
 for(const stop of guide.stops)await cross(stop.id,stop.gateX);
 return guide.stops.map(stop=>stop.id);
}

async function importCheckpoint(file,node,level){
 await page.locator('#importSave').setInputFiles(file);
 await waitNode(node);
 if(level!==undefined)await page.waitForFunction(level=>window.lab.frame.progression.level===level,level);
}

async function blockedSumeru(level){
 const guide=await atlasGuide(hub,'region-04');
 assert.equal(guide.status,'blocked');
 assert.equal(guide.requiredLevel,60);
 assert.equal(guide.stops[0].id,entry);
 await walk(1380);
 await page.waitForFunction(id=>{
  const g=window.lab.frame.storyNearbyPortal;
  return g?.to===id&&!g.available&&g.level===60;
 },entry);
 assert.equal(await page.locator('#nearbyPortalGo').isDisabled(),true);
 await page.keyboard.press('KeyF');
 assert.equal(await d.node(),town);
 return level;
}

const lockedFerryLevels=[];
let voyage;

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await importCheckpoint(earned?output+'/surveys-ready.json':
  process.env.LAB_INAZUMA_WAYPOINT_SAVE??'work/inazuma-waypoint-browser-save.json',town,earned?54:undefined);
 if(earned)lockedFerryLevels.push(await blockedSumeru(54));
 assert.equal(await choices.locator('option[value="enkan-wp-21593"]').count(),0);
 await accept(seirai);
 await itinerary(seirai);
 await follow('inazuma-road','inazuma-port');
 await accept(floor);
 await cross('inazuma-road');
 await itinerary(floor);
 await follow('watatsumi-landing','ina-wp-15942',camp);
 if(earned){
  await importCheckpoint(output+'/beacons-ready.json',camp,57);
  for(const id of [seirai,floor])await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }
 await accept(beacons);
 await follow('enkanomiya-depth','enkan-wp-21573','enkan-wp-21574','enkan-wp-21576');
 const west=nodes['enkan-wp-21576'].exits.find(e=>e.to==='enkan-wp-21593');
 const lockedFloat=await atlasGuide(west.to,'branch-03');
 assert.equal(lockedFloat.status,'blocked');
 assert.equal(lockedFloat.stops[0].label,'浮石');
 await walk(west.x);
 await page.waitForFunction(()=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to==='enkan-wp-21593'&&!gate.available&&gate.reason;
 });
 const lockedReason=await page.evaluate(()=>window.lab.frame.storyNearbyPortal.reason);
 assert.equal(await page.locator('#nearbyPortalGo').isDisabled(),true);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(reason=>window.lab.frame.storyNotice===reason,lockedReason);
 assert.equal(await d.node(),'enkan-wp-21576');
 await follow('enkan-wp-21579','enkan-wp-21580');
 await count(beacons,1);
 const beaconSteps=quests[beacons].itinerary;
 await walk(beaconSteps[1].x-42);
 const seenColor=color=>page.waitForFunction(c=>window.lab.frame.draws.some(item=>item.color===c),color);
 await seenColor('#61788e');
 await page.locator('#game').screenshot({path:output+'/enkan-waypoint-beacon-unlit.png'});
 await inspect(beaconSteps[1],beacons,2);
 await seenColor('#fff2ba');
 await page.locator('#game').screenshot({path:output+'/enkan-waypoint-beacon-lit.png'});
 await warp('enkan-wp-21576');
 const unlockedFloat=await atlasGuide(west.to,'branch-03');
 assert.equal(unlockedFloat.status,'ready');
 assert.equal(unlockedFloat.stops[0].label,'浮石');
 assert.match(unlockedFloat.stops[0].hint,/3\.2秒/);
 await walk(west.x);
 await page.waitForFunction(to=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===to&&gate.available&&gate.floatingStone;
 },west.to);
 assert.match(await page.locator('#nearbyPortalGo').innerText(),/F：浮石に乗る/);
 if(earned){
  await page.keyboard.press('KeyF');
  await page.waitForFunction(()=>window.lab.frame.storyLift?.floatingStone&&
   window.lab.frame.draws.some(draw=>draw.color==='#80f0df'&&draw.w===10));
  assert.match(await page.locator('#storyLiftText').innerText(),/浮石で移動中/);
  await page.locator('#game').screenshot({path:output+'/enkan-floating-stone.png'});
  await waitNode(west.to);
  journeys.push(['enkan-wp-21576',west.to,'floatingStone']);
 }else await cross(west.to);
 await inspect(beaconSteps[2],beacons,3);
 await warp('enkan-wp-21580');
 await follow('enkan-wp-21581','enkan-wp-21590','enkan-wp-21588','enkan-wp-21594');
 await inspect(beaconSteps[3],beacons,4);
 await warp('enkan-wp-21580');
 const southRoute=await atlasRoute('enkan-wp-21592');
 assert.ok(!southRoute.includes('enkan-wp-21583')&&southRoute.at(-1)==='enkan-wp-21592');
 await inspect(beaconSteps[4],beacons,5);
 await warp('enkanomiya-camp');
 await report(beacons);
 const groups=await choices.locator('optgroup').evaluateAll(items=>items.map(g=>g.label));
 for(const label of ['鳴神島・離島','海祇島','セイライ島','淵下宮'])assert.ok(groups.includes(label));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('enkanomiya-camp');
 for(const id of [seirai,floor,beacons]){
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }
 await warp('enkan-wp-21592');
 await seenColor('#fff2ba');
 if(earned){
  await importCheckpoint(output+'/lv59-locked.json',town,59);
  lockedFerryLevels.push(await blockedSumeru(59));
  await importCheckpoint(output+'/boat-ready.json',town,60);
  const guide=await atlasGuide(hub,'region-04');
  assert.equal(guide.status,'ready');
  assert.deepEqual(guide.stops.map(stop=>[stop.id,stop.mode]),[[entry,'boat'],[hub,'walk']]);
  assert.match(guide.stops[0].hint,/4\.8秒/);
  for(const stop of guide.stops)await cross(stop.id,stop.gateX);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await waitNode(hub);
  const f=await page.evaluate(()=>window.lab.frame);
  assert.equal(f.progression.level,60);
  assert.equal(f.returns,0);
  for(const id of ['maguu-commission','array-commission','thunder-commission','pyro-hypostasis-commission',
   'hydro-hypostasis-commission','wolflord-commission','bathysmal-commission',seirai,floor,beacons]){
   assert.equal(f.story.quests[id].status,'complete',id);
  }
  await cross(entry);
  await cross(town);
  voyage={lockedFerryLevels,requiredLevel:60,seconds:4.8,arrivalRestoredAt:hub,roundTrip:true};
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(earned?'evidence/earned-inazuma-sumeru-browser.json':'evidence/inazuma-waypoint-browser.json',JSON.stringify({
  journeys,groups,southRoute,lockedBeforeCentralBeacon:true,lastBeaconStaysLitAfterReload:true,
  reported:[seirai,floor,beacons],...earned&&{browser:'Chrome',floatingStone:{mapLabel:unlockedFloat.stops[0].label,
   seconds:3.2,rendered:true},voyage},pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed Seirai ferry, undersea lift, Watatsumi waterway, southern detour and three saved reports.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
