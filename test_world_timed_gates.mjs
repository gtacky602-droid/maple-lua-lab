import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const frame=()=>page.evaluate(()=>window.lab.frame);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

async function load(origin){
 await page.locator('#importSave').setInputFiles(`work/world-timed-gates/${origin}.json`);
 await drive.waitNode(origin);
}

async function openMap(target){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
}

async function closeMap(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function roundTrip(origin,target,kind,seconds,screenshot){
 await openMap(target);
 await page.locator('#atlasItineraryStops').getByText(`移動に${seconds}秒`,{exact:false}).waitFor();
 await closeMap();
 await drive.walk(nodes[origin].exits.find(edge=>edge.to===target).x);
 await page.waitForFunction(id=>window.lab.frame.storyNearbyPortal?.to===id&&
  window.lab.frame.storyNearbyPortal.available,target);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(kind=>window.lab.frame.storyLift?.[kind],kind);
 await openMap(target);
 assert.equal((await frame()).story.node,origin);
 await page.getByText('この地点へ移動中',{exact:true}).waitFor();
 await page.getByText('地図を閉じると移動を再開します。',{exact:true}).waitFor();
 const remaining=(await frame()).storyLift.remaining;
 if(screenshot)await atlas.screenshot({path:screenshot});
 assert.equal((await frame()).storyLift.remaining,remaining);
 await closeMap();
 await drive.waitNode(target);
 assert.equal((await frame()).storyLift,undefined);
 await drive.cross(origin);
 return {origin,target,kind,seconds,atlasPausesTransfer:true,returned:true};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 await load('golden-hub');
 const boat=await roundTrip('golden-hub','sites-gaa-03','boat',3.6,'evidence/world-timed-boat-atlas.png');
 console.log('Golden Apple shuttle and arrival state passed.');
 await load('bygone-camp');
 await drive.cross('bygone-waterway-pier');
 const waterway=await roundTrip('bygone-waterway-pier','bygone-resonance-chamber','waterway',1.6);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/world-timed-gates-browser.json',JSON.stringify({boat,waterway,errors},null,2)+'\n');
 console.log('Bygone Sea waterway and return passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,lift:window.lab?.frame?.storyLift,
  gate:window.lab?.frame?.storyNearbyPortal,map:window.lab?.frame?.worldMap?.guide})));
 throw error;
}finally{
 await browser.close();
}
