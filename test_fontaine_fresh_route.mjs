import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const proof=JSON.parse(await fs.readFile('evidence/fontaine-fresh-route.json','utf8'));
const path='work/fontaine-fresh-route/natlan-ready-save.json';
const saved=JSON.parse(await fs.readFile(path,'utf8'));
const start='fontaine-hub',canal='fontaine-field',entry='natlan-entry',hub='natlan-hub';
const firstQuest='natlan-ridge-flag';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const frame=()=>page.evaluate(()=>window.lab.frame);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(path);
 await drive.waitNode(start);
 const before=await frame();
 assert.equal(before.progression.level,100);
 assert.equal(before.progression.total,saved.progression.total);
 for(const id of proof.completedQuests) assert.equal(before.story.quests[id].status,'complete');
 const berylLoot=inventory=>inventory.ground
  .filter(drop=>drop.zone.startsWith('story:fontaine-beryl-'))
  .map(drop=>[drop.item.id,drop.zone]);
 const restoredLoot=berylLoot(saved.inventory);
 assert(restoredLoot.length>0);
 assert.deepEqual(berylLoot(before.inventory),restoredLoot);

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 const hunts=['fontaine-beryl-bank','fontaine-beryl-foothills'];
 await page.locator('#atlasLayer').selectOption('hunt');
 for(const id of hunts){
  await page.locator('#atlasField').selectOption(id);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
  assert.equal((await frame()).worldMap.guide.status,'ready');
 }
 await page.locator('#atlasLayer').selectOption('all');
 await page.locator('#atlasRegion').selectOption('region-06');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-06');
 await page.locator('#atlasField').selectOption(hub);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,hub);
 const {guide}=(await frame()).worldMap;
 const route=guide.stops.map(stop=>[stop.id,stop.mode]);
 assert.equal(guide.status,'ready');
 assert.deepEqual(route,[[canal,'walk'],[entry,'walk'],[hub,'walk']]);
 await atlas.screenshot({path:'evidence/fontaine-fresh-natlan-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await drive.cross(canal);
 await drive.cross(entry);
 await drive.cross(hub);
 const after=await frame();
 assert.equal(after.progression.level,100);
 const travelKillXp=after.progression.killXp-before.progression.killXp;
 assert(travelKillXp>=0);
 assert.equal(after.progression.total,before.progression.total+travelKillXp);
 assert.equal(after.progression.questXp,before.progression.questXp);
 for(const id of proof.completedQuests) assert.equal(after.story.quests[id].status,'complete');
 assert.deepEqual(berylLoot(after.inventory),restoredLoot);
 await drive.accept(firstQuest);
 assert.deepEqual(errors,[]);

 await fs.writeFile('evidence/fontaine-fresh-route-browser.json',JSON.stringify({
  importedLevel:before.progression.level,arrivalLevel:after.progression.level,route,
  completedQuests:proof.completedQuests,hunts,firstNatlanQuestAccepted:firstQuest,
  importedXp:before.progression.total,arrivalXp:after.progression.total,travelKillXp,
  retainedLootFromNewHunts:restoredLoot.length,errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv100 save, Natlan guide, entry and first quest.');
}finally {
 await browser.close();
}
