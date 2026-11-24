import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const {nodes:entries}=await read('content/story-graph.json');
const nodes=Object.fromEntries(entries.map(node=>[node.id,node]));
const {regions}=await read('content/world-atlas.json');
const regionByNode=Object.fromEntries(regions.flatMap(region=>region.points.map(point=>[point.id,region.id])));
const {nodes:spawns}=await read('content/enemy-spawns.json');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:920}});
const errors=[];
const drive=waypointDriver(page,nodes,{walkTimeout:25000});
const atlas=page.locator('#worldAtlas');
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(30000);

async function load(file, level, hub){
 await page.locator('#importSave').setInputFiles(file);
 await drive.waitNode(hub);
 await page.waitForFunction(level=>window.lab.frame.progression?.level===level,level);
}

async function selectMap(target){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 const region=regionByNode[target];
 if(await page.locator('#atlasRegion').inputValue()!==region){
  await page.locator('#atlasRegion').selectOption(region);
  await page.waitForFunction(region=>window.lab.frame.worldMap?.region===region,region);
 }
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 return page.evaluate(()=>window.lab.frame.worldMap.guide);
}

async function closeMap(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9084/');
 await page.waitForFunction(()=>window.lab?.frame);
 const arena='sites-gaa-04-side-arena', path='sites-gaa-04';
 await load('work/earned-golden-atlas-checkpoint.json',200,'golden-hub');
 const entrance=await selectMap(arena);
 assert.equal(entrance.status,'ready');
 assert.match(entrance.stops.at(-1).hint,/横穴の任意戦へ/);
 await closeMap();
 for(const leg of entrance.stops)await drive.cross(leg.id);
 await page.waitForFunction(()=>window.lab.frame.total===1);
 const previous=await page.evaluate(()=>window.lab.frame.kills);
 await drive.walk(spawns[arena][0].x-300);
 await page.locator('#auto').click();
 await page.waitForFunction(before=>window.lab.frame.kills>before,previous,{timeout:20000});
 await page.locator('#auto').click();
 await page.waitForFunction(()=>!window.lab.frame.auto);
 const back=await selectMap(path);
 assert.deepEqual(back.stops.map(stop=>stop.id),[path]);
 assert.match(back.stops[0].hint,/危機の島の登り道へ戻る/);
 await atlas.locator('#atlasItineraryStops button').filter({hasText:'危機の島の登り道へ戻る'}).waitFor();
 await atlas.screenshot({path:'evidence/earned-atlas-golden-return.png'});
 await closeMap();
 await drive.cross(path);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')).story.visited[id],arena);
 await page.locator('#loadProgress').click();
 await drive.waitNode('golden-hub');
 await page.waitForFunction(id=>window.lab.frame.story.visited[id]&&
  window.lab.frame.story.quests['golden-trace-shadows']?.status==='complete',arena);

 const port='mond-wp-95801';
 await load('work/cap-fresh-route-draft/lv165-save.json',165,'white-pass-station');
 await drive.warp('mond-town');
 const locked=await selectMap(port);
 assert.equal(locked.status,'blocked');
 assert.equal(locked.reason,'必要Lv168');
 await closeMap();
 assert.deepEqual(errors,[]);
 const proof={golden:{entrance,back,guardianDefeated:true,visitsSaved:true},port:{level:165,locked},errors};
 await fs.writeFile('evidence/earned-atlas-routes-browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Chrome: Golden guardian and labeled return, plus the earned Lv165 port restriction.');
}catch(error){
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame.story?.node,actor:window.lab?.frame.actors?.[0]?.x,
  portal:window.lab?.frame.storyNearbyPortal,map:window.lab?.frame.worldMap?.selected?.id,
 })));
 throw error;
}finally{
 await browser.close();
}
