import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes:list}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(list.map(node=>[node.id,node]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
page.setDefaultTimeout(25000);
const drive=waypointDriver(page,nodes,{walkTimeout:20000});
const atlas=page.locator('#worldAtlas');
const errors=[];
const source='enkan-wp-21577';
const reef='enkan-wp-21593';
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok()) errors.push('Frame HTTP '+response.status());
});

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8974/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/sites-atlas-phase-fixture.json');
 await drive.waitNode('enkanomiya-camp');
 await drive.warp(source);

 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasField').selectOption(reef);
 await page.waitForFunction(reef=>window.lab.frame.worldMap?.selected?.id===reef,reef);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>[stop.id, stop.label]),[[reef,'位相門']]);
 assert.equal(await page.locator('#atlasItinerary').getAttribute('open'),'');
 await atlas.getByRole('button',{name:/外礁灯.*位相門/}).first().waitFor();
 const frozen=await page.evaluate(()=>window.lab.frame.t);
 await atlas.screenshot({path:'evidence/atlas-enkan-phase.png'});
 assert.equal(await page.evaluate(()=>window.lab.frame.t),frozen);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await drive.cross(reef);
 await drive.cross(source);
 assert.equal((await drive.actor()).y,366);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sites-atlas-connections-browser.json',JSON.stringify({
  actualRaisedPhaseGateRoundTrip:true,atlasShowsAuthorizedGate:true,atlasPausesSimulation:true,
  returnElevation:366,errors
 },null,2)+'\n');
 console.log('Chrome verified M map itinerary and both phase-gate directions.');
}catch(error){
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame.story?.node, active:window.lab?.frame.actors[0],
  map:window.lab?.frame.worldMap?.selected, portal:window.lab?.frame.storyNearbyPortal,
  status:document.querySelector('#status')?.textContent
 })));
 throw error;
}finally{
 await browser.close();
}
