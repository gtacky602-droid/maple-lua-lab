import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const earned=process.env.LAB_NATLAN_PORT_CHECKPOINT;
const proof=JSON.parse(await fs.readFile(earned?'evidence/earned-natlan-port-lua.json':'evidence/natlan-fresh-route.json','utf8'));
const path=earned||'work/natlan-fresh-route/nod-ready-save.json';
const output=earned?'work/earned-natlan-port':'evidence';
const saved=JSON.parse(await fs.readFile(path,'utf8'));
const port='natlan-port',ship='natlan-voyage',arrival='nod-port',approach='nod-field',town='nod-town';
const firstQuest='nod-first-treasure';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const frame=()=>page.evaluate(()=>window.lab.frame);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8970/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(path);
 await drive.waitNode(port);
 const before=await frame();
 assert.equal(before.progression.level,120);
 assert.equal(before.progression.total,saved.progression.total);
 for(const id of proof.completedQuests) assert.equal(before.story.quests[id].status,'complete');

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 const hunts=['natlan-entry','natlan-field','natlan-quarry-road','natlan-riverside-range',
  'natlan-terrace-red-clay','natlan-east-valley-rocks'];
 await page.locator('#atlasLayer').selectOption('hunt');
 for(const id of hunts){
  await page.locator('#atlasField').selectOption(id);
  await page.waitForFunction(id=>{
   const map=window.lab.frame.worldMap;
   return map?.layer==='hunt'&&map.selected?.id===id&&map.selected.huntKind==='field';
  },id);
  assert.equal((await frame()).worldMap.guide.status,'ready');
 }
 assert.equal(await page.locator('#atlasField option[value="natlan-flag-slope"]').count(),0);
 await page.locator('#atlasLayer').selectOption('all');
 await page.locator('#atlasRegion').selectOption('region-07');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-07');
 await page.locator('#atlasField').selectOption(town);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,town);
 const {guide}=(await frame()).worldMap;
 const route=guide.stops.map(stop=>[stop.id,stop.mode]);
 assert.equal(guide.status,'ready');
 assert.deepEqual(route.map(([id])=>id),[ship,arrival,approach,town]);
 assert.deepEqual(route.map(([,mode])=>mode),['boat','boat','walk','walk']);
 await page.locator('#atlasItineraryStops').getByText(/出航から90秒で着岸/).waitFor();
 await atlas.screenshot({path:output+'/natlan-fresh-nod-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await drive.cross(ship);
 const aboard=await frame();
 assert.equal(aboard.voyage.destination,arrival);
 assert.equal(aboard.voyage.total,90);
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 const remaining=(await frame()).voyage.seconds;
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,100)));
 assert.equal((await frame()).voyage.seconds,remaining);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await page.waitForFunction(id=>window.lab.frame.story?.node===id,arrival,{timeout:160000});
 const landed=await frame();
 assert.equal(Boolean(landed.voyage),false);
 assert.equal(landed.progression.total,before.progression.total);
 await drive.cross(approach);
 await drive.cross(town);
 const after=await frame();
 assert.equal(after.progression.level,120);
 assert.equal(after.progression.questXp,before.progression.questXp);
 const travelKillXp=after.progression.killXp-before.progression.killXp;
 assert(travelKillXp>=0);
 assert.equal(after.progression.total,before.progression.total+travelKillXp);
 for(const id of proof.completedQuests) assert.equal(after.story.quests[id].status,'complete');
 await drive.accept(firstQuest);
 if(earned){
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  const checkpoint=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  const next=JSON.parse(checkpoint);
  for(const [id,record] of Object.entries(saved.story.quests))assert.deepEqual(next.story.quests[id],record,id);
  assert.equal(next.story.quests[firstQuest].status,'active');
  await fs.writeFile(output+'/nod-browser-save.json',checkpoint+'\n');
 }
 assert.deepEqual(errors,[]);

 await fs.writeFile(output+'/natlan-fresh-route-browser.json',JSON.stringify({
  importedLevel:before.progression.level,arrivalLevel:after.progression.level,route,hunts,
  completedQuests:proof.completedQuests,ferrySeconds:aboard.voyage.total,autoLanded:true,
  mapPausedVoyage:true,firstNodQuestAccepted:firstQuest,travelKillXp,errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv120 save, 90-second voyage, Nod-Krai arrival and first quest.');
}finally {
 await browser.close();
}
