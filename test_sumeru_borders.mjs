import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const chart=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const [camp,cliff,border,statue]=['chasm-camp','liyue-wp-28732','sites-corridor-chasm-border','sum-wp-28704'];
const region=chart.regions.find(row=>row.points.some(point=>point.id===statue)).id;
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
 await page.locator('#importSave').setInputFiles('work/sumeru-borders/chasm-start.json');
 await drive.waitNode(camp);
 await drive.warp(cliff);
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption(region);
 await page.locator('#atlasField').selectOption(statue);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,statue);
 const route=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(route.status,'ready');
 assert.deepEqual(route.stops.map(step=>step.id),[border,statue]);
 await atlas.screenshot({path:'evidence/sumeru-chasm-crossing-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await drive.cross(border);
 await drive.cross(statue);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(id=>{
  const data=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  return data?.story?.node===id&&!data.story.visited['sumeru-hub'];
 },statue);
 await page.locator('#loadProgress').click();
 await drive.waitNode(camp);
 assert.ok(await page.evaluate(id=>window.lab.frame.story.visited[id],statue));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sumeru-border-routes-browser.json',JSON.stringify({
  path:[cliff,border,statue],savedBeforeVisitingSumeruHub:true,savedAt:statue,restoredAt:camp,errors
 },null,2)+'\n');
 console.log('Chasm to Sumeru: marked route and browser checkpoint passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,gate:window.lab?.frame?.storyNearbyPortal,
  map:window.lab?.frame?.worldMap?.guide,save:document.querySelector('#saveStatus')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
