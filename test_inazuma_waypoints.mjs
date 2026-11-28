import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8964';
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
 await walk(step.x-42);
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

async function atlasRoute(target){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(target=>window.lab.frame.worldMap?.selected?.id===target,target);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 for(const stop of guide.stops)await cross(stop.id,stop.gateX);
 return guide.stops.map(stop=>stop.id);
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(process.env.LAB_INAZUMA_WAYPOINT_SAVE??'work/inazuma-waypoint-browser-save.json');
 await waitNode('inazuma-town');
 assert.equal(await choices.locator('option[value="enkan-wp-21593"]').count(),0);
 await accept(seirai);
 await itinerary(seirai);
 await follow('inazuma-road','inazuma-port');
 await accept(floor);
 await cross('inazuma-road');
 await itinerary(floor);
 await follow('watatsumi-landing','ina-wp-15942','enkanomiya-camp');
 await accept(beacons);
 await follow('enkanomiya-depth','enkan-wp-21573','enkan-wp-21574','enkan-wp-21576');
 const west=nodes['enkan-wp-21576'].exits.find(e=>e.to==='enkan-wp-21593');
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
 await page.locator('#game').screenshot({path:'evidence/enkan-waypoint-beacon-unlit.png'});
 await inspect(beaconSteps[1],beacons,2);
 await seenColor('#fff2ba');
 await page.locator('#game').screenshot({path:'evidence/enkan-waypoint-beacon-lit.png'});
 await warp('enkan-wp-21576');
 await cross('enkan-wp-21593');
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
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/inazuma-waypoint-browser.json',JSON.stringify({
  journeys,groups,southRoute,lockedBeforeCentralBeacon:true,lastBeaconStaysLitAfterReload:true,
  reported:[seirai,floor,beacons],pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed Seirai ferry, undersea lift, Watatsumi waterway, southern detour and three saved reports.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
