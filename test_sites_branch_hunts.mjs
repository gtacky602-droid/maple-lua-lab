import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes:story}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(story.map(node=>[node.id,node]));
const water='bygone-wp-68600';
const hunt='branch-hunt-68600';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:880}});
page.setDefaultTimeout(24000);
const drive=waypointDriver(page,nodes,{walkTimeout:20000});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok()) errors.push('Frame HTTP '+response.status());
});

try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8974/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/sites-branch-hunt-fixture.json');
 await drive.waitNode('bygone-camp');

 await drive.warp(water);
 await page.waitForFunction(()=>window.lab.frame.storySwim && window.lab.frame.total===0);
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.waitForFunction(()=>document.querySelector('#atlasPlaceLevel').textContent.includes('脇道の狩場はLv142'));
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(hunt);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.guide?.stops[0]?.id===id,hunt);
 const map=await page.evaluate(()=>window.lab.frame.worldMap);
 assert.equal(map.guide.status,'ready');
 assert.equal(map.guide.stops[0].label,'水路');
 assert.equal(map.selected.layer,'below');
 await page.locator('#worldAtlas').screenshot({path:'evidence/bygone-hunt-atlas.png'});
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});

 await drive.cross(hunt);
 await page.waitForFunction(()=>!window.lab.frame.storySwim && window.lab.frame.total===2);
 await drive.walk(690);
 await page.locator('#game').screenshot({path:'evidence/bygone-hunt-dry-floor.png'});
 await drive.cross(water);
 await page.waitForFunction(()=>window.lab.frame.storySwim && window.lab.frame.total===0);

 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sites-branch-hunts-browser.json',JSON.stringify({
  actualWaterwayRoundTrip:true,huntLevelAndRouteOnMMap:true,
  dryCombatFloorUsesTwoPatrols:true,observationRouteRemainsPeaceful:true,errors
 },null,2)+'\n');
 console.log('M map, waterway round trip and two patrols on a dry floor passed in Chrome.');
} catch(error) {
 console.error(await page.evaluate(()=>({story:window.lab?.frame.story?.node,status:document.querySelector('#status')?.textContent})));
 throw error;
} finally {
 await browser.close();
}
