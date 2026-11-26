import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const [hub,host,arena]=['fontaine-hub','fon-wp-50065','ocean-judge-legend-pool'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

async function guideTo(target,screenshot){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('water');
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>[stop.id,stop.mode]),[[target,'swim']]);
 await page.locator('#atlasItineraryStops').getByText(/遊泳.*層の門（今の/).waitFor();
 if(screenshot)await atlas.screenshot({path:'evidence/fontaine-ocean-judge-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/fontaine-exploration-routes/lake.json');
 await drive.waitNode(hub);
 await drive.warp(host);
 await guideTo(arena,true);
 const gate=nodes[host].exits.find(edge=>edge.to===arena);
 await drive.walk(gate.x);
 await drive.changeHeight(gate.y-80);
 assert.equal(await page.evaluate(id=>window.lab.frame.storyNearbyPortal?.to===id,arena),false);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),host);
 await drive.cross(arena);
 await guideTo(host,false);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(id=>{
  const data=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  return data?.story?.node===id;
 },arena);
 await drive.cross(host);
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 assert.ok(await page.evaluate(id=>window.lab.frame.story.visited[id],arena));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/fontaine-exploration-routes-browser.json',JSON.stringify({
  route:[host,arena,host],bothDirectionsLabelledSwim:true,wrongDepthRejected:true,savedAt:arena,restoredAt:hub,errors
 },null,2)+'\n');
 console.log('Ocean circuit judge: swim directions, depth, return and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,gate:window.lab?.frame?.storyNearbyPortal,
  map:window.lab?.frame?.worldMap?.guide,save:document.querySelector('#saveStatus')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
