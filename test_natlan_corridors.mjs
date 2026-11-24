import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const atlasData=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const [checkpoint,source,border,entrance]=['sumeru-hub','sum-wp-36696','sites-west-desert-border','natlan-entry'];
const destinationRegion=atlasData.regions.find(region=>region.points.some(point=>point.id===entrance)).id;
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
 await page.locator('#importSave').setInputFiles(`work/natlan-corridors/${border}.json`);
 await drive.waitNode(checkpoint);
 await drive.warp(source);
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption(destinationRegion);
 await page.locator('#atlasField').selectOption(entrance);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,entrance);
 const planned=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(planned.status,'ready');
 assert.deepEqual(planned.stops.map(stop=>stop.id),[border,entrance]);
 await atlas.screenshot({path:'evidence/natlan-desert-border-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await drive.cross(border);
 await drive.cross(entrance);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(id=>{
  const save=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  return save?.story?.node===id&&!save.story.visited['fontaine-hub'];
 },entrance);
 await page.locator('#loadProgress').click();
 await drive.waitNode(checkpoint);
 assert.ok(await page.evaluate(id=>window.lab.frame.story.visited[id],entrance));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-corridors-browser.json',JSON.stringify({
  crossed:[source,border,entrance],visitedFontaine:false,savedAt:entrance,restoredAt:checkpoint,errors
 },null,2)+'\n');
 console.log('Natlan desert border route and browser restore to Sumeru passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,map:window.lab?.frame?.worldMap?.guide,
  gate:window.lab?.frame?.storyNearbyPortal,save:document.querySelector('#saveStatus')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
