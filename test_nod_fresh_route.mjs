import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const draft=process.env.DRAFT_BALANCE==='1';
const suffix=draft?'-draft':'';
const proof=JSON.parse(await fs.readFile(`evidence/nod-fresh-route${suffix}.json`,'utf8'));
const path=`work/nod-fresh-route${suffix}/snow-ready-save.json`;
const saved=JSON.parse(await fs.readFile(path,'utf8'));
const start='nod-town',entry='snezhnaya-entry',town='snezhnaya-hub',road='snezhnaya-field',hunt='white-pass-cut';
const ticket='white-pass-ticket';
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
 await drive.waitNode(start);
 const before=await frame();
 assert.equal(Boolean(before.fieldBalance),draft);
 assert.equal(before.progression.level,140);
 assert.equal(before.progression.total,saved.progression.total);
 for(const id of proof.completedQuests) assert.equal(before.story.quests[id].status,'complete');

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 const hunts=['nod-north-spruce-shelves','nod-west-frost-slope','winter-frontier-switchback'];
 await page.locator('#atlasLayer').selectOption('hunt');
 for(const id of hunts){
  await page.locator('#atlasField').selectOption(id);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
  assert.equal((await frame()).worldMap.guide.status,'ready');
 }
 await page.locator('#atlasLayer').selectOption('all');
 await page.locator('#atlasRegion').selectOption('region-08');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-08');
 await page.locator('#atlasField').selectOption(town);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,town);
 const {guide}=(await frame()).worldMap;
 const route=guide.stops.map(stop=>[stop.id,stop.mode]);
 assert.equal(guide.status,'ready');
 assert.deepEqual(route,[[entry,'walk'],[town,'walk']]);
 await atlas.screenshot({path:`evidence/nod-fresh-snezhnaya-atlas${suffix}.png`});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await drive.cross(entry);
 await drive.cross(town);
 const after=await frame();
 assert.equal(after.progression.level,140);
 assert.equal(after.progression.questXp,before.progression.questXp);
 const travelKillXp=after.progression.killXp-before.progression.killXp;
 assert(travelKillXp>=0);
 assert.equal(after.progression.total,before.progression.total+travelKillXp);
 for(const id of proof.completedQuests) assert.equal(after.story.quests[id].status,'complete');
 const locked=page.locator(`[data-quest="${ticket}"][data-status="locked"]`);
 await locked.waitFor();
 assert.match(await locked.textContent(),/Lv141/);
 assert.equal(await locked.getByRole('button',{name:'受注',exact:true}).count(),0);
 await drive.cross(road);
 await drive.cross(hunt);
 assert.equal((await frame()).total,28);
 assert.deepEqual(errors,[]);

 await fs.writeFile(`evidence/nod-fresh-route-browser${suffix}.json`,JSON.stringify({
  importedLevel:before.progression.level,arrivalLevel:after.progression.level,route,hunts,
  completedQuests:proof.completedQuests,nextChapter:{id:ticket,requiredLevel:141,availableHunt:hunt},
  travelKillXp,errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv140 save, snow town guide, level-141 gate and reachable hunt.');
}finally {
 await browser.close();
}
