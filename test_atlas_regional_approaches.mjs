import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const load=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const {nodes:list}=await load('content/story-graph.json');
const nodes=Object.fromEntries(list.map(node=>[node.id,node]));
const {regions}=await load('content/world-atlas.json');
const regionByStage=Object.fromEntries(regions.flatMap(region=>region.points.map(point=>[point.id,region.id])));
const {sites_only_route_review:plan}=await load('design/world/atlas-route-plan.json');
const {regional_approaches:approaches}=plan.find(row=>row.fields.includes('map37:96380')&&row.fields.includes('teyvat:95801'));
const base=process.env.LAB_URL||'http://127.0.0.1:9068/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});

async function run({field,stages}){
 const origin=stages[0], errors=[];
 const context=await browser.newContext({viewport:{width:1280,height:940}});
 const page=await context.newPage();
 const drive=waypointDriver(page,nodes);
 const map=page.locator('#worldAtlas');
 page.setDefaultTimeout(20000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{
  if(response.url().endsWith('/api/frame')&&!response.ok())errors.push('Frame HTTP '+response.status());
 });
 try{
  await page.goto(base);
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles(`work/atlas-regional-${origin}.json`);
  const hub=nodes[origin].checkpoint;
  await drive.waitNode(hub);
  if(hub!==origin)await drive.warp(origin);
  const itineraries=[];
  for(const path of [stages,[...stages].reverse()]){
   const destination=path.at(-1), region=regionByStage[destination];
   await page.keyboard.press('KeyM');
   await map.waitFor();
   if(await page.locator('#atlasRegion').inputValue()!==region){
    await page.locator('#atlasRegion').selectOption(region);
    await page.waitForFunction(region=>window.lab.frame.worldMap?.region===region,region);
   }
   await page.locator('#atlasField').selectOption(destination);
   await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,destination);
   if(destination===stages.at(-1)){
    const panel=map.locator('#atlasApproachGate');
    const [preview]=await Promise.all([page.waitForEvent('popup'),panel.locator('a').click()]);
    const choice=preview.locator('#gatePreview select option:checked');
    await preview.waitForFunction(to=>document.querySelector('#gatePreview select option:checked')?.dataset.to===to,stages[1]);
    assert.equal(await choice.getAttribute('data-to'),stages[1]);
    await preview.close();
    await panel.getByRole('button').click();
    await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,origin);
    if(await page.locator('#atlasRegion').inputValue()!==region)await page.locator('#atlasRegion').selectOption(region);
    await page.locator('#atlasField').selectOption(destination);
    await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,destination);
   }
   const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
   assert.equal(guide.status,'ready');
   assert.deepEqual(guide.stops.map(stop=>stop.id),path.slice(1));
   const testHint=field==='map37:96380'&&destination===origin?'南東の小島へ上がる昇降機':
     field==='teyvat:95801'&&destination!==origin?'上段の入口':null;
   if(testHint){
    await map.locator('#atlasItineraryStops button').filter({hasText:testHint}).waitFor();
    const name=field==='map37:96380'?'sky-return':'port-upper-gate';
    await map.screenshot({path:`evidence/atlas-regional-${name}.png`});
   }
   await page.keyboard.press('Escape');
   await map.waitFor({state:'hidden'});
   for(const stop of guide.stops)await drive.cross(stop.id);
   itineraries.push(guide.stops);
  }
  assert.equal(await drive.node(),origin);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(stages=>{
   const saved=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
   return stages.every(stage=>saved?.story?.visited?.[stage]===true);
  },stages);
  assert.deepEqual(errors,[]);
  return {field,itineraries,journeys:drive.journeys,savedVisits:true,entrancePreviewAndFocus:true,errors};
 }catch(error){
  console.error(origin,await page.evaluate(()=>({
   position:window.lab?.frame.actors?.[0],node:window.lab?.frame.story?.node,
   map:window.lab?.frame.worldMap?.selected?.id,portal:window.lab?.frame.storyNearbyPortal
  })));
  throw error;
 }finally{
  await context.close();
 }
}

try{
 const regionalApproaches=await Promise.all(approaches.map(run));
 const directedCrossings=regionalApproaches.reduce((sum,route)=>sum+route.journeys.length,0);
 assert.equal(directedCrossings,16);
 await fs.writeFile('evidence/atlas-regional-approaches-browser.json',
  JSON.stringify({directedCrossings,regionalApproaches},null,2)+'\n');
 console.log('Atlas Chrome: followed both regional itineraries and saved the visits.');
}finally{
 await browser.close();
}
