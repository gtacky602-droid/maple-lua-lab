import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const run=JSON.parse(await fs.readFile('evidence/inazuma-fresh-route.json','utf8'));
const boardingSave='work/inazuma-fresh-route/boat-ready-save.json';
const boarding=JSON.parse(await fs.readFile(boardingSave,'utf8'));
const start='inazuma-town',entry='sumeru-entry',hub='sumeru-hub',nextQuest='sumeru-leaf-crossing';
const storyQuests=new Set(graph.quests.map(quest=>quest.id));
const completed=run.route.filter(row=>storyQuests.has(row.id)).map(row=>row.id);
const huntFields=['inazuma-road','inazuma-shore-hunt','inazuma-lantern-trail'];
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
 await page.locator('#importSave').setInputFiles(boardingSave);
 await drive.waitNode(start);
 const before=await frame();
 assert.equal(before.progression.level,60);
 assert.equal(before.progression.total,boarding.progression.total);
 assert(before.progression.total>=run.route.find(row=>row.id==='lv60').total);
 for(const id of completed) assert.equal(before.story.quests[id].status,'complete');

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption('region-03');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-03');
 await page.locator('#atlasLayer').selectOption('hunt');
 for(const id of huntFields){
  await page.locator('#atlasField').selectOption(id);
  await page.waitForFunction(node=>{
   const map=window.lab.frame.worldMap;
   return map?.layer==='hunt'&&map.selected?.id===node&&map.selected.huntKind==='field';
  },id);
  assert.equal((await frame()).worldMap.guide.status,'ready');
 }
 await page.locator('#atlasLayer').selectOption('all');
 await page.locator('#atlasRegion').selectOption('region-04');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-04');
 await page.locator('#atlasField').selectOption(hub);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,hub);
 const {guide}=(await frame()).worldMap;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>[stop.id,stop.mode]),[[entry,'boat'],[hub,'walk']]);
 await atlas.screenshot({path:'evidence/inazuma-fresh-boat-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await drive.cross(entry);
 await drive.cross(hub);
 const arrived=await frame();
 assert.equal(arrived.progression.level,60);
 assert.equal(arrived.progression.questXp,before.progression.questXp);
 const travelKillXp=arrived.progression.killXp-before.progression.killXp;
 assert(travelKillXp>=0);
 assert.equal(arrived.progression.total,before.progression.total+travelKillXp);
 for(const id of completed) assert.equal(arrived.story.quests[id].status,'complete');
 await page.locator(`[data-quest="${nextQuest}"]`).getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='active',nextQuest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/inazuma-fresh-route-browser.json',JSON.stringify({
  importedLevel:before.progression.level,completedQuests:completed,huntFields,
  route:guide.stops.map(stop=>[stop.id,stop.mode]),
  firstSumeruQuestAccepted:nextQuest,arrivalLevel:arrived.progression.level,
  importedXp:before.progression.total,totalXp:arrived.progression.total,travelKillXp,errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv60 save, boat guide, Sumeru arrival and first quest.');
}finally {
 await browser.close();
}
