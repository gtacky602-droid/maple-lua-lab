import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const chart=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const harbor='liyue-harbor';
const cases=[
 {id:'snowline',level:44,path:['liyue-wp-34','sites-dragonspine-south-foothill','mond-wp-6599'],unvisited:['dragonspine-camp']},
 {id:'tunnel',level:64,path:['liyue-wp-28732','sites-corridor-chasm-border','sum-wp-28704'],unvisited:['chasm-camp','sumeru-hub']},
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 const proof=[];
 for(const {id,level,path,unvisited} of cases){
  const [start,leg,destination]=path;
  const region=chart.regions.find(row=>row.points.some(point=>point.id===destination)).id;
  await page.locator('#importSave').setInputFiles(`work/subregion-checkpoints/${id}-ready.json`);
  await drive.waitNode(harbor);
  await page.waitForFunction(level=>window.lab.frame.progression.level===level,level);
  await drive.warp(start);
  await page.evaluate(()=>document.activeElement.blur());
  await page.keyboard.press('KeyM');
  await atlas.waitFor();
  await page.locator('#atlasRegion').selectOption(region);
  await page.locator('#atlasField').selectOption(destination);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,destination);
  const route=await page.evaluate(()=>window.lab.frame.worldMap.guide);
  assert.equal(route.status,'ready');
  assert.deepEqual(route.stops.map(stop=>stop.id),[leg,destination]);
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  for(const stop of [leg,destination,leg,start,leg,destination])await drive.cross(stop);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(({destination,unvisited})=>{
   const data=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
   return data?.story?.node===destination&&unvisited.every(hub=>!data.story.visited[hub]);
  },{destination,unvisited});
  await page.locator('#loadProgress').click();
  await drive.waitNode(harbor);
  assert.ok(await page.evaluate(id=>window.lab.frame.story.visited[id],destination));
  proof.push({level,path,unvisited,roundTrip:true,restoredAt:harbor});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/subregion-checkpoints-browser.json',JSON.stringify({cases:proof,errors},null,2)+'\n');
 console.log('Chrome round trips and return to Liyue Harbor passed for both approaches.');
}catch(error){
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame?.story?.node,gate:window.lab?.frame?.storyNearbyPortal,
  map:window.lab?.frame?.worldMap?.guide,save:document.querySelector('#saveStatus')?.textContent,
 })));
 throw error;
}finally{
 await browser.close();
}
