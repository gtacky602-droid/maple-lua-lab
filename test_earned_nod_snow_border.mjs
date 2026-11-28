import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const [checkpoint, output] = process.argv.slice(2);
assert.ok(checkpoint && output, 'Pass the patrol checkpoint and the Lua replay output directory');
const graph = JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const map = JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes = Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const regions = Object.fromEntries(map.regions.flatMap(r=>r.points.map(p=>[p.id,r.id])));
const [cabin, town, statue, north, spruce, pass, entry, snow] = [
 'nod-patrol-cabin','nod-town','nod-wp-88128','nod-wp-88145','nod-north-spruce-shelves',
 'winter-frontier-switchback','snezhnaya-entry','snezhnaya-hub',
];
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280,height:960}});
const drive = waypointDriver(page,nodes,{walkTimeout:23000});
const atlas = page.locator('#worldAtlas'), game = page.locator('#game');
const errors = [];
page.on('pageerror',error=>errors.push(error.message));
const frame = ()=>page.evaluate(()=>window.lab.frame);

async function openGuide(target){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption(regions[target]);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.region===id,regions[target]);
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 return (await frame()).worldMap.guide;
}

async function closeGuide(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function exportFrame(name, mode, previous){
 const selector=page.locator('#renderMode');
 await selector.selectOption(mode);
 if(previous)await page.waitForFunction(({mode,previous})=>{
  const count=window.lab.frame.commands;
  return mode==='rect'?count>previous*5:count<previous*.7;
 },{mode,previous});
 const view=await frame();
 await game.screenshot({path:`${output}/${name}.png`});
 return view;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(checkpoint);
 await drive.waitNode(cabin);
 await drive.cross(town);
 const approach=await openGuide(spruce);
 assert.equal(approach.status,'ready');
 assert.deepEqual(approach.stops.map(s=>s.id),[statue,north,spruce]);
 await page.locator('#atlasItineraryStops').getByText('門の真下からジャンプ',{exact:false}).waitFor();
 await atlas.screenshot({path:`${output}/town-guide.png`});
 await closeGuide();
 for(const id of [statue,north,spruce])await drive.cross(id);
 assert.equal((await frame()).total,32);
 await drive.walk(410);
 const before=(await frame()).kills;
 await page.locator('#auto').click();
 await page.waitForFunction(kills=>window.lab.frame.kills>kills,before);
 await page.locator('#auto').click();
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await exportFrame('spruce-png','sprite');
 const standard=await exportFrame('spruce-standard','rect',png.commands);
 const light=await exportFrame('spruce-light','h32c16',standard.commands);
 for(const view of [standard,light]){
  assert.equal(view.t,png.t);
  assert.equal(view.kills,png.kills);
  assert.equal(view.camera,png.camera);
 }
 await page.locator('#renderMode').selectOption('sprite');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);

 await page.locator('#importSave').setInputFiles(`${output}/snow-ready-save.json`);
 await drive.waitNode(town);
 assert.equal((await frame()).progression.level,140);
 await drive.cross(pass);
 const border=await openGuide(snow);
 assert.equal(border.status,'ready');
 assert.deepEqual(border.stops.map(s=>s.id),[entry,snow]);
 await page.locator('#atlasItineraryStops').getByText('峠を越えて雪原へ',{exact:false}).waitFor();
 await atlas.screenshot({path:`${output}/border-guide.png`});
 await closeGuide();
 await drive.cross(entry);
 assert.equal((await drive.actor()).y,380);
 await drive.changeHeight(480);
 const reverse=await openGuide(pass);
 assert.equal(reverse.status,'ready');
 await page.locator('#atlasItineraryStops').getByText('雪原の左にある低い足場へ',{exact:false}).waitFor();
 await closeGuide();
 await drive.cross(pass);
 await drive.cross(entry);
 await drive.cross(snow);
 const pending=page.locator('[data-quest="white-pass-ticket"][data-status="locked"]');
 await pending.waitFor();
 assert.match(await pending.textContent(),/Lv141/);
 await drive.cross('snezhnaya-field');
 await drive.cross('white-pass-cut');
 assert.equal((await frame()).total,28);
 assert.deepEqual(errors,[]);
 const record={journeys:drive.journeys,townHint:approach.stops[0].hint,border: border.stops,
  reverseHint:reverse.stops[0].hint,upperLandingY:380,arrivedLevel:140,ticketLevel:141,
  firstHunt:'white-pass-cut',firstHuntEnemies:28,
  renderCommands:{png:png.commands,standard:standard.commands,light:light.commands},errors};
 await fs.writeFile(`${output}/browser.json`,JSON.stringify(record,null,2)+'\n');
 console.log(record);
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,map:window.lab?.frame?.worldMap?.guide,
  actor:window.lab?.frame?.actors[0],gate:window.lab?.frame?.storyNearbyPortal})),errors);
 throw error;
}finally{await browser.close()}
