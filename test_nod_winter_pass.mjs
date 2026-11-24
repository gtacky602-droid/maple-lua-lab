import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const chart=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const regions=Object.fromEntries(chart.regions.flatMap(region=>region.points.map(point=>[point.id,region.id])));
const [town,frontier,entry,snow]=['nod-town','winter-frontier-switchback','snezhnaya-entry','snezhnaya-hub'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

async function checkGuide(target,stops,hint,screenshot){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption(regions[target]);
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),stops);
 await page.locator('#atlasItineraryStops').getByText(hint,{exact:false}).waitFor();
 if(screenshot)await atlas.screenshot({path:screenshot});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/nod-winter-pass/town.json');
 await drive.waitNode(town);
 await drive.cross(frontier);
 await checkGuide(snow,[entry,snow],'峠を越えて雪原へ','evidence/nod-winter-pass-atlas.png');
 await drive.cross(entry);
 assert.equal((await drive.actor()).y,380);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(id=>{
  const data=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  return data?.story?.node===id;
 },entry);
 await checkGuide(frontier,[frontier],'上段の入口');
 await drive.cross(frontier);
 await page.locator('#loadProgress').click();
 await drive.waitNode(town);
 assert.ok(await page.evaluate(id=>window.lab.frame.story.visited[id],entry));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/nod-winter-pass-browser.json',JSON.stringify({
  route:[town,frontier,entry,frontier],snowfieldGuide:[entry,snow],returnedThroughUpperGate:true,
  savedAt:entry,restoredAt:town,errors
 },null,2)+'\n');
 console.log('Winter pass: atlas, foot travel, return and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,gate:window.lab?.frame?.storyNearbyPortal,
  map:window.lab?.frame?.worldMap?.guide,save:document.querySelector('#saveStatus')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
