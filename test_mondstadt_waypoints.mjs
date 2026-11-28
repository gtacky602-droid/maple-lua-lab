import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8962';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const quests=Object.fromEntries(graph.quests.map(quest=>[quest.id,quest]));
const atlas=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const regions=Object.fromEntries(atlas.regions.flatMap(region=>region.points.map(point=>[point.id,region.id])));
const captures=process.env.LAB_MOND_CAPTURES||'evidence';
await fs.mkdir(captures,{recursive:true});
const errors=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const p=await browser.newPage({viewport:{width:1200,height:960}});
p.on('pageerror',e=>errors.push(e.message));
const {node,actor,journeys,walk,changeHeight,cross,warp,count,waitNode,accept,report,choices,waypointCount}=waypointDriver(p,nodes);
const lake='mond-mapped-lakeside',snow='mond-mapped-snowline',islet='mond-mapped-islet';
const island='mond-wp-95799',underport='mond-wp-95803',dock='mond-wp-95797',camp='dornman-camp';

async function importCheckpoint(file,location){
 await p.locator('#importSave').setInputFiles(file);
 await p.waitForFunction(()=>{
  const input=document.querySelector('#importSave');
  return !input.disabled&&!input.value&&document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存しました');
 });
 await waitNode(location);
}

async function atlasGuide(target,screenshot){
 await p.evaluate(()=>document.activeElement.blur());
 await p.keyboard.press('KeyM');
 await p.locator('#worldAtlas').waitFor();
 const region=regions[target];
 if(await p.locator('#atlasRegion').inputValue()!==region){
  await p.locator('#atlasRegion').selectOption(region);
  await p.waitForFunction(id=>window.lab.frame.worldMap?.region===id,region);
 }
 await p.locator('#atlasField').selectOption(target);
 await p.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 const guide=await p.evaluate(()=>window.lab.frame.worldMap.guide);
 if(screenshot){
  await p.locator('#atlasItineraryStops').getByText(/港の下層へ続く連絡坑道/).first().waitFor();
  await p.locator('#worldAtlas').screenshot({path:join(captures,screenshot)});
 }
 await p.locator('#atlasClose').click();
 await p.waitForFunction(()=>!window.lab.frame.worldMap);
 return guide;
}

async function followAtlas(target){
 const guide=await atlasGuide(target);
 assert.equal(guide.status,'ready');
 for(const stop of guide.stops)await cross(stop.id,stop.gateX);
 return guide.stops.map(stop=>stop.id);
}

const visitedCount=()=>choices.locator('optgroup option').count();

try{
 await p.goto(base);
 await p.waitForFunction(()=>window.lab?.frame);
 await importCheckpoint('work/mondstadt-waypoint-browser-save.json','mond-town');
 const pinCount=await p.evaluate(()=>window.lab.frame.storyGraph.nodes.filter(n=>n.waypoint).length);
 const initial=await visitedCount();
 assert.ok((await waypointCount.textContent()).endsWith(` ${initial} / ${pinCount}`));
 assert.equal(await choices.locator('option[value="mond-wp-12"]').count(),0);
 await accept(lake);
 for(const [i,id] of ['mond-road','mond-wp-13','mond-wp-7','mond-wp-12'].entries()){
  await cross(id);
  await count(lake,i+1);
 }
 await walk(675);
 await p.keyboard.press('KeyG');
 await count(lake,5);
 const pin=await p.evaluate(()=>window.lab.frame.storyWaypoint);
 assert.equal(pin.id,'teyvat:12');
 assert.equal(pin.kind,'statue');
 await walk(800);
 await p.locator('#game').screenshot({path:join(captures,'mondstadt-waypoint-travel.png')});
 await cross('mond-wp-8');
 await cross('mond-wp-12');
 assert.equal((await actor()).y,370);
 await warp('mond-town');
 await report(lake);
 console.log('Reported '+lake);

 await followAtlas('dragonspine-camp');
 await accept(snow);
 const snowApproaches=[];
 for(const [i,step] of quests[snow].itinerary.entries()){
  if(step.kind==='arrive'){
   if(await node()!==step.from){
    const stops=await followAtlas(step.from);
    await count(snow,i);
    snowApproaches.push({quest:snow,before_step:i+1,stops});
   }
   await cross(step.node);
  }else{
   await walk(step.x);
   await changeHeight(step.y);
   await p.keyboard.press('KeyG');
  }
  await count(snow,i+1);
 }
 await warp('dragonspine-camp');
 await report(snow);
 console.log('Reported '+snow);

 await warp('mond-road');
 await cross(camp);
 await accept(islet);
 await cross(dock);
 await count(islet,1);
 await cross(island);
 await count(islet,2);
 await walk(675);
 await p.keyboard.press('KeyG');
 await count(islet,3);
 const tunnel=await atlasGuide(underport,'mondstadt-port-tunnel-atlas.png');
 assert.equal(tunnel.status,'ready');
 assert.deepEqual(tunnel.stops.map(s=>[s.id,s.mode,s.hint]),[[underport,'walk','港の下層へ続く連絡坑道']]);
 await cross(underport);
 await cross('mond-wp-95798');
 await cross(underport);
 await cross(island);
 await count(islet,3);
 await cross(dock);
 await count(islet,4);
 await warp(camp);
 await report(islet);
 console.log('Reported '+islet);
 const reached=await visitedCount();
 await p.locator('#saveProgress').click();
 await p.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await p.reload();
 await p.waitForFunction(()=>window.lab?.frame);
 await p.locator('#loadProgress').click();
 const reported=[lake,snow,islet];
 await p.waitForFunction(ids=>ids.every(id=>window.lab.frame.story?.quests[id]?.status==='complete'),reported);
 assert.equal(await visitedCount(),reached);
 await p.setViewportSize({width:390,height:844});
 const fits=await choices.evaluate(el=>el.clientWidth<=el.parentElement.clientWidth);
 assert.equal(fits,true);
 await p.setViewportSize({width:1200,height:960});
 await importCheckpoint('work/mondstadt-port-entry-browser-save.json',camp);
 await cross(dock);
 await cross(island);
 await walk(nodes[island].exits.find(e=>e.to===underport).x);
 await p.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&!gate.available&&gate.level===169;
 },underport);
 assert.equal(await p.locator('#nearbyPortalGo').isDisabled(),true);
 const blocked=await atlasGuide(underport);
 assert.equal(blocked.status,'blocked');
 assert.equal(blocked.requiredLevel,169);
 const blockedAt=await p.evaluate(()=>window.lab.frame.progression.level);
 assert.deepEqual(errors,[]);
 await fs.writeFile(join(captures,'mondstadt-waypoint-browser.json'),JSON.stringify({
  journeys,journal:reported,snowApproaches,portTunnel:tunnel.stops[0],blockedAt,requiredLevel:blocked.requiredLevel,
  restored:true,pin,visitedCount:reached,mobileSelectorFits:true,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed three reports, the snowline detour, port tunnel and lift, level gate and save reload.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
