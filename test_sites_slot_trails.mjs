import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:910}});
page.setDefaultTimeout(25000);
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});
const drive=waypointDriver(page,nodes);

async function restore(file,node){
 await page.locator('#importSave').setInputFiles('work/'+file);
 await drive.waitNode(node);
}

async function board(id){
 const node=nodes[await drive.node()];
 const exit=node.exits.find(gate=>gate.to===id);
 assert.ok(exit);
 await drive.walk(exit.x);
 await drive.changeHeight(exit.y??480);
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.locator('#nearbyPortalGo').click();
 await drive.waitNode(id);
}

async function toggleMap(){
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
}
async function closeMap(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8973/');
 await page.waitForFunction(()=>window.lab?.frame);
 await restore('sites-slot-browser-fixture.json','golden-hub');
 await toggleMap();
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='hidden-01');
 await page.locator('#atlasField').selectOption('sites-gaa-03');
 await page.waitForFunction(()=>window.lab.frame.worldMap.selected?.id==='sites-gaa-03');
 const route=await page.evaluate(()=>window.lab.frame.worldMap.routes);
 assert.ok(route.some(r=>r.id==='golden-hub'&&r.label==='舟・寄港'));
 assert.ok(route.some(r=>r.id==='sites-gaa-04'&&r.label==='徒歩'));
 await atlas.screenshot({path:'evidence/sites-slot-islands.png'});
 await closeMap();
 await drive.cross('sites-gaa-03');
 await page.waitForFunction(()=>window.lab.frame.total===48);
 await page.locator('#game').screenshot({path:'evidence/sites-slot-dock.png'});
 await drive.cross('golden-hub');
 console.log('Golden Islands ferry, population and atlas passed.');

 await restore('sites-slot-rail-fixture.json','sites-sim-04');
 await drive.cross('sites-star-rail-out');
 await page.waitForFunction(()=>window.lab.frame.voyage?.kind==='trolley');
 await toggleMap();
 await page.waitForFunction(()=>window.lab.frame.worldMap.selected?.id==='sites-star-rail-out');
 assert.ok((await page.evaluate(()=>window.lab.frame.worldMap.routes))
  .some(r=>r.id==='sites-sim-05'&&r.label==='鉄道'));
 await closeMap();
 await drive.waitNode('sites-sim-05');
 console.log('Star rail arrived at the castle. Boarding the return service.');
 await board('sites-star-rail-in');
 await drive.waitNode('sites-sim-04');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sites-slot-trails-browser.json',JSON.stringify({
   goldenIslandMap:true,roundTripFerry:true,huntPopulation:48,trainDestinationShown:true,
   starRailRoundTrip:true,errors,
 },null,2)+'\n');
 console.log('Golden Islands ferry and spawn count, and Simulanka automatic round-trip rail passed.');
} catch(error) {
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,gate:f?.storyNearbyPortal,voyage:f?.voyage,map:f?.worldMap?.region,
   actor:f?.actors?.find(a=>a.id===f.active), status:document.querySelector('#status')?.textContent};
 }));
 throw error;
} finally {
 await browser.close();
}
