import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const [station,mine,cap]=['white-pass-station','dawn-vein-mine','dawn-crystal-field'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

async function load(fixture,visited){
 await page.locator('#importSave').setInputFiles(`work/snez-endgame-access/${fixture}.json`);
 await drive.waitNode(station);
 await page.waitForFunction(([id,visited])=>Boolean(window.lab.frame.story.visited[id])===visited,[cap,visited]);
}

async function selectOnMap(target,state,screenshot){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 await page.locator('#atlasPlaceLevel').getByText(state,{exact:false}).waitFor();
 if(screenshot)await atlas.screenshot({path:screenshot});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 await load('unvisited',false);
 for(const id of [mine,cap]) assert.equal(await drive.choices.locator(`option[value="${id}"]`).count(),0);
 await selectOnMap(cap,'未訪問');
 await load('visited',true);
 await selectOnMap(cap,'ワープ登録済み','evidence/snez-endgame-warp-atlas.png');
 for(const id of [mine,cap]){
  await drive.warp(id);
  assert.equal((await drive.actor()).y,480);
  await drive.warp(station);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/snez-endgame-access-browser.json',JSON.stringify({
  unvisitedWaypointsAbsent:[mine,cap],savedWaypointsUsable:[mine,cap],
  atlasShowsRegistration:true,restoredAt:station,errors
 },null,2)+'\n');
 console.log('Snezhnaya endgame waypoints: unvisited UI, saved registration, trips and returns passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,map:window.lab?.frame?.worldMap?.selected,
  save:document.querySelector('#saveStatus')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
