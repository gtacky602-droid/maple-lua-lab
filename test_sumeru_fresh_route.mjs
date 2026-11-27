import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const proof=JSON.parse(await fs.readFile('evidence/sumeru-fresh-route.json','utf8'));
const path='work/sumeru-fresh-route/fontaine-ready-save.json';
const saved=JSON.parse(await fs.readFile(path,'utf8'));
const start='sumeru-hub',rainforest='sumeru-field',entry='fontaine-entry',hub='fontaine-hub';
const firstQuest='fontaine-moon-parcel';
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
 assert.equal(before.progression.level,80);
 assert.equal(before.progression.total,saved.progression.total);
 for(const id of proof.completedQuests) assert.equal(before.story.quests[id].status,'complete');

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 const hunts=['sumeru-entry','sumeru-field','sum-kaveh-timberyard',
  'sumeru-north-forest-floor','sumeru-north-bank-terraces'];
 await page.locator('#atlasLayer').selectOption('hunt');
 for(const id of hunts){
  await page.locator('#atlasField').selectOption(id);
  await page.waitForFunction(id=>{
   const map=window.lab.frame.worldMap;
   return map?.layer==='hunt'&&map.selected?.id===id&&map.selected.huntKind==='field';
  },id);
  assert.equal((await frame()).worldMap.guide.status,'ready');
 }
 await page.locator('#atlasLayer').selectOption('all');
 await page.locator('#atlasRegion').selectOption('region-05');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-05');
 await page.locator('#atlasField').selectOption(hub);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,hub);
 const {guide}=(await frame()).worldMap;
 const route=guide.stops.map(stop=>[stop.id,stop.mode]);
 assert.equal(guide.status,'ready');
 assert.deepEqual(route,[[rainforest,'walk'],[entry,'walk'],[hub,'walk']]);
 await atlas.screenshot({path:'evidence/sumeru-fresh-fontaine-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await drive.cross(rainforest);
 await drive.cross(entry);
 await drive.cross(hub);
 const after=await frame();
 assert.equal(after.progression.level,80);
 const travelKillXp=after.progression.killXp-before.progression.killXp;
 assert(travelKillXp>=0);
 assert.equal(after.progression.total,before.progression.total+travelKillXp);
 assert.equal(after.progression.questXp,before.progression.questXp);
 for(const id of proof.completedQuests) assert.equal(after.story.quests[id].status,'complete');
 await drive.accept(firstQuest);
 assert.deepEqual(errors,[]);

 await fs.writeFile('evidence/sumeru-fresh-route-browser.json',JSON.stringify({
  importedLevel:before.progression.level,arrivalLevel:after.progression.level,route,
  completedQuests:proof.completedQuests,hunts,firstFontaineQuestAccepted:firstQuest,
  importedXp:before.progression.total,arrivalXp:after.progression.total,travelKillXp,errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv80 save, Fontaine guide, entry and first quest.');
}finally {
 await browser.close();
}
