import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes:fields}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(fields.map(node=>[node.id,node]));
const hub='frostmoon-camp',hall='frost-ancient-moon-console',trial='frost-commander-first-wave';
const quest='frost-commander-console-test';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:920}});
const drive=waypointDriver(page,nodes,{walkTimeout:25000});
const map=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(30000);

async function openMap(){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await map.waitFor();
}

async function selectField(target){
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 return page.evaluate(()=>window.lab.frame.worldMap.guide);
}

async function closeMap(){
 await page.keyboard.press('Escape');
 await map.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9084/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-frostmoon-first-checkpoint.json');
 await drive.waitNode(hub);
 await page.waitForFunction(()=>window.lab.frame.progression?.level===200);
 await openMap();
 const approach=await selectField(trial);
 assert.equal(approach.status,'ready');
 await closeMap();
 for(const leg of approach.stops)await drive.cross(leg.id,leg.gateX);
 await openMap();
 const locked=map.locator('#atlasRoutes').getByRole('button',{name:/右側の門・第一試験を終えて装置へ/});
 assert.match(await locked.textContent(),/2体とも倒してください/);
 const retreat=await selectField(hall);
 assert.equal(retreat.stops[0].gateX,94);
 assert.match(retreat.stops[0].hint,/左側の門/);
 await closeMap();

 await drive.walk(810);
 await page.locator('#auto').click();
 await drive.count(quest,2);
 await page.locator('#auto').click();
 await page.waitForFunction(()=>!window.lab.frame.auto);
 await drive.walk(1390);
 await openMap();
 const exit=await selectField(hall);
 assert.equal(exit.stops[0].gateX,1460);
 assert.match(exit.stops[0].hint,/右側の門・第一試験を終えて装置へ/);
 await map.locator('#atlasItineraryStops button').filter({hasText:'右側の門'}).waitFor();
 await map.screenshot({path:'evidence/earned-frostmoon-right-exit.png'});
 await closeMap();
 await drive.cross(hall,exit.stops[0].gateX);
 assert.deepEqual(await page.evaluate(()=>[window.lab.frame.actors[0].x,window.lab.frame.actors[0].y]),[548,480]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(quest=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')).story.quests[quest].count===2,quest);
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 await drive.count(quest,2);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/earned-frostmoon-exits-browser.json',JSON.stringify({
  approach,retreat,exit,twoCommandersDefeated:true,trialProgressRestored:true,errors,
 },null,2)+'\n');
 console.log('Chrome: Frostmoon recommends the open left gate, then the closer right gate after the trial.');
}catch(error){
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame.story?.node,player:window.lab?.frame.actors?.[0]?.x,
  portal:window.lab?.frame.storyNearbyPortal,map:window.lab?.frame.worldMap?.selected?.id,
 })));
 throw error;
}finally{
 await browser.close();
}
