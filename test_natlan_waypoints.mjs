import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8967';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const quests=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const mountain='nat-mapped-mountain-layers',sky='nat-mapped-sky-lift';
const valley='nat-mapped-valley-trail',ochka='nat-mapped-ochka-supplies',resort='nat-mapped-resort-canal';
const hub='natlan-hub',rocky='natlan-field',port='natlan-port',ship='natlan-voyage',dock='ochkanatlan-dock';
const captures=process.env.LAB_NATLAN_CAPTURES||'evidence';
await fs.mkdir(captures,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const d=waypointDriver(page,nodes);
const {actor,walk,changeHeight,cross,warp,accept,report,count,choices,journeys,waitNode}=d;
const follow=async(...ids)=>{for(const id of ids)await cross(id)};
let returnLift;

async function atlasGuide(target,{region,screenshot}={}){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 if(region){
  await page.locator('#atlasRegion').selectOption(region);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.region===id,region);
 }
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 if(screenshot)await page.locator('#worldAtlas').screenshot({path:join(captures,screenshot)});
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 return guide.stops;
}

async function followAtlas(target){
 const stops=await atlasGuide(target);
 for(const stop of stops)await cross(stop.id,stop.gateX);
 return stops.map(stop=>stop.id);
}

async function importCheckpoint(file,location){
 const level=JSON.parse(await fs.readFile(file,'utf8')).progression.level;
 await page.locator('#importSave').setInputFiles(file);
 await page.waitForFunction(()=>{
  const input=document.querySelector('#importSave');
  return !input.disabled&&!input.value&&document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存しました');
 });
 await waitNode(location);
 await page.waitForFunction(lv=>window.lab.frame.progression.level===lv,level);
 return level;
}

async function survey(id){
 const {hub,itinerary}=quests[id];
 for(const [i,step] of itinerary.entries()){
  if(step.kind==='arrive'){
   assert.equal(await d.node(),step.from);
   if(step.from==='nat-wp-96376'&&step.node==='nat-wp-96375'){
    assert.equal((await actor()).y,480);
    const stops=await atlasGuide(step.node,{screenshot:'natlan-waypoint-sky-atlas.png'});
    assert.equal(stops.length,1);
    assert.equal(stops[0].mode,'lift');
    assert.match(stops[0].hint,/中段の足場を経由して上段へ/);
    assert.match(stops[0].hint,/中央の昇降台へ下りる/);
    returnLift=stops[0];
    await walk(760);
    await changeHeight(390);
    assert.equal((await actor()).y,390);
   }
   await cross(step.node);
   if(step.from==='nat-wp-96375'&&step.node==='nat-wp-96376'){
    assert.equal((await actor()).y,300);
    await page.locator('#game').screenshot({path:join(captures,'natlan-waypoint-sky-lift.png')});
   }
  }else{
   await walk(step.x);
   await page.keyboard.press('KeyG');
  }
  await count(id,i+1);
 }
 await warp(hub);
 await report(id);
 console.log('Reported '+id);
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 const entryLevel=await importCheckpoint('work/natlan-waypoint-entry-browser-save.json',hub);
 const quarryOut=await followAtlas(rocky);
 const quarryBack=await followAtlas(hub);
 assert.deepEqual(quarryOut,['natlan-quarry-road',rocky]);
 assert.deepEqual(quarryBack,['natlan-quarry-road',hub]);
 await importCheckpoint('work/natlan-waypoint-port-browser-save.json',hub);
 await accept(valley);
 const valleyApproach=await followAtlas(quests[valley].itinerary[0].from);
 await survey(valley);
 await follow('natlan-quarry-road',rocky,port,ship);
 const shipGate=nodes[ship].exits.find(e=>e.to===dock);
 await walk(shipGate.x);
 await page.waitForFunction(([target,start])=>{
  const {storyNearbyPortal:gate,voyage}=window.lab.frame;
  return gate?.to===target&&gate.ferryStop&&!gate.available&&voyage?.elapsed<start;
 },[dock,shipGate.windowStart]);
 assert.equal(await page.locator('#nearbyPortalGo').isDisabled(),true);
 const dockingGuide=await atlasGuide(dock,{region:'branch-07'});
 assert.equal(dockingGuide.length,1);
 assert.equal(dockingGuide[0].stopWindow.phase,'waiting');
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.lab.frame.storyNotice==='寄港時間外');
 await cross(dock);
 await accept(ochka);
 await survey(ochka);
 await cross(ship);
 const resumed=await page.evaluate(()=>window.lab.frame.voyage.elapsed);
 assert.ok(resumed>=shipGate.windowEnd);
 await follow(port,'nat-resort-pier');
 await accept(resort);
 await survey(resort);
 await importCheckpoint('work/natlan-waypoint-browser-save.json','nat-mountain-camp');
 assert.equal(await choices.locator('option[value="nat-wp-84121"]').count(),0);
 await accept(mountain);
 await follow('nat-wp-84104','nat-wp-84105','nat-wp-84106','nat-wp-84108');
 await survey(mountain);
 await warp('nat-wp-84108');
 await follow('nat-wp-84109','nat-wp-84110','nat-sky-camp');
 await accept(sky);
 await follow('nat-wp-96366','nat-wp-96367','nat-wp-96373','nat-wp-96375');
 await survey(sky);
 const groups=await choices.locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));
 for(const label of ['古の聖山','古の聖山・別階層','空の神殿'])assert.ok(groups.includes(label));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('nat-sky-camp');
 const reported=[valley,ochka,resort,mountain,sky];
 for(const id of reported)await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 await warp('nat-wp-84121');
 assert.deepEqual(errors,[]);
 await fs.writeFile(join(captures,'natlan-waypoint-browser.json'),JSON.stringify({
  journeys,groups,reported,entryLevel,quarryRoutes:{out:quarryOut,back:quarryBack},valleyApproach,
  ship:{window:[shipGate.windowStart,shipGate.windowEnd],earlyDisembarkRejected:true,
   initialMapWindow:dockingGuide[0].stopWindow,resumed},returnLift,
  movingLiftInBothDirections:true,twoJumpLanding:[480,390,300],
  restoredAndWarpedToLowerLayer:true,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed the quarry, timed ship, five reports, Sky Temple lift and saved lower-layer warp.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 console.error('Last browser state:',await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,notice:f?.storyNotice,gate:f?.storyNearbyPortal,ride:f?.storyLift,
          status:document.querySelector('#status')?.textContent};
 }));
 throw error;
}finally{await browser.close()}
