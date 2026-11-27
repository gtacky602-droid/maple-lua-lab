import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const data=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(data.nodes.map(node=>[node.id,node]));
const progress=JSON.parse(await fs.readFile('evidence/liyue-fresh-route.json','utf8'));
const hub='liyue-harbor', ship='liyue-ferry', destination='inazuma-port';
const quests=progress.route.filter(row=>data.quests.some(q=>q.id===row.id)).map(row=>row.id);
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const frame=()=>page.evaluate(()=>window.lab.frame);
const atlas=page.locator('#worldAtlas');
const errors=[];
const huntFields=['liyue-entry','liyue-field','liyue-river-trail'];
page.on('pageerror',error=>errors.push(error.message));

try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/liyue-fresh-route/ferry-ready-save.json');
 await drive.waitNode(hub);
 const before=await frame();
 assert.equal(before.progression.level,40);
 assert.equal(before.progression.total,progress.route.find(row=>row.id==='lv40').total);
 assert.equal(before.story.quests['mond-watchtower-clear'].status,'complete');
 for(const id of quests) assert.equal(before.story.quests[id].status,'complete');

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
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
 await page.locator('#atlasRegion').selectOption('region-03');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-03');
 await page.locator('#atlasField').selectOption(destination);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,destination);
 const {guide}= (await frame()).worldMap;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),[ship,destination]);
 await page.locator('#atlasItineraryStops').getByText(/出航から30秒で着岸/).waitFor();
 await atlas.screenshot({path:'evidence/liyue-fresh-ferry-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await drive.cross(ship);
 assert.equal((await frame()).voyage.destination,destination);
 await page.waitForFunction(id=>window.lab.frame.story?.node===id,destination,{timeout:95000});
 const arrived=await frame();
 assert.equal(arrived.progression.total,before.progression.total);
 const firstQuest='inazuma-moving-lantern';
 await page.locator(`[data-quest="${firstQuest}"]`).getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='active',firstQuest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-fresh-route-browser.json',JSON.stringify({
  importedLevel:40,verifiedQuests:quests,huntFields,route:guide.stops.map(stop=>stop.id),
  autoArrived:true,firstInazumaQuestAccepted:firstQuest,totalXp:arrived.progression.total,errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv40 save, ferry guide, boarding, arrival and Inazuma quest.');
}finally {
 await browser.close();
}
