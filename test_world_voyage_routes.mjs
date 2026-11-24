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
const hud=page.locator('#storyLiftText');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

const train='white-pass-coach', snowTown='snezhnaya-hub', station='white-pass-station';
const trolley='veluriyam-trolley-out', plaza='veluriyam-hub', stop='veluriyam-petal-stop';
const frame=()=>page.evaluate(()=>window.lab.frame);

async function load(vehicle,source){
 await page.locator('#importSave').setInputFiles(`work/world-voyage-routes/${vehicle}.json`);
 await drive.waitNode(source);
}

async function openMap(target){
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(target=>window.lab.frame.worldMap?.selected?.id===target,target);
}

async function closeMap(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 await load(train,snowTown);
 await drive.cross(train);
 await page.locator('#storyPanel').getByText(/到着まで.*列車で移動中/).waitFor();
 assert.match(await hud.textContent(),/列車で移動中.*雪原の終着駅/);
 await page.locator('.game').screenshot({path:'evidence/world-voyage-train.png'});
 await page.locator('#saveProgress').click();
 await page.waitForFunction(train=>{
  const saved=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  return saved?.story?.node===train;
 },train);
 await page.locator('#loadProgress').click();
 await drive.waitNode(snowTown);
 assert.equal((await frame()).voyage,undefined);
 assert.equal((await frame()).story.quests['white-pass-ticket'].status,'complete');
 await drive.cross(train);
 await drive.waitNode(station);
 assert.equal((await frame()).voyage,undefined);
 console.log('White Rainbow Pass train HUD, save and restore, and automatic arrival passed.');

 await load(trolley,plaza);
 await drive.cross(trolley);
 await openMap(stop);
 await page.locator('#atlasItineraryStops').getByText(/出発から1\.8〜6\.3秒の間に途中下車/).waitFor();
 const paused=(await frame()).voyage.seconds;
 await atlas.screenshot({path:'evidence/world-voyage-trolley-atlas.png'});
 assert.equal((await frame()).voyage.seconds,paused);
 await closeMap();
 await page.getByRole('button',{name:'F：途中下車する',exact:true}).waitFor();
 await drive.cross(stop);
 await openMap(trolley);
 await page.locator('#atlasItineraryStops').getByText(/乗り直してから2秒で到着/).waitFor();
 await closeMap();
 await drive.cross(trolley);
 const reboarded=(await frame()).voyage;
 assert.ok(reboarded.seconds>0&&reboarded.seconds<=2.001&&!reboarded.stopover);
 await drive.waitNode(nodes[trolley].voyage.destination);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/world-voyage-routes-browser.json',JSON.stringify({
  train:{stage:train,correctLabelInHudAndStoryPanel:true,restoredAt:snowTown,arrivedAt:station},
  trolley:{stage:trolley,atlasPausesVoyage:true,window:[1.8,6.3],stoppedAt:stop,reboardSeconds:2,arrivedAt:nodes[trolley].voyage.destination},
  errors
 },null,2)+'\n');
 console.log('Veluriyam trolley timed stop, atlas instructions, reboarding and arrival passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,
  voyage:window.lab?.frame?.voyage,gate:window.lab?.frame?.storyNearbyPortal,
  selection:window.lab?.frame?.worldMap?.selected?.id,save:document.querySelector('#saveStatus')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
