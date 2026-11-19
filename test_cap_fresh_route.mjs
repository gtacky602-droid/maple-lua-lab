import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const file='work/cap-fresh-route/lv200-save.json';
const saved=JSON.parse(await fs.readFile(file,'utf8'));
const proof=JSON.parse(await fs.readFile('evidence/cap-fresh-route.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:920}});
const drive=waypointDriver(page,nodes);
const frame=()=>page.evaluate(()=>window.lab.frame);
const atlas=page.locator('#worldAtlas');
const status=page.locator('#progressionStatus');
const errors=[];
const station='white-pass-station',cap=proof.cap.node;
page.on('pageerror',error=>errors.push(error.message));

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8971/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(file);
 await drive.waitNode(station);
 await page.waitForFunction(()=>window.lab.frame.progression.level===200);
 const start=await frame();
 assert.deepEqual(start.progression,saved.progression);
 assert.match(await status.textContent(),/共通Lv 200 MAX.*上限後のEXP.*累計EXP/);
 for(const id of proof.growthQuests)assert.equal(start.story.quests[id].status,'complete');

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.locator('#atlasField').selectOption(cap);
 await page.waitForFunction(cap=>window.lab.frame.worldMap?.selected?.id===cap,cap);
 const {guide}=(await frame()).worldMap;
 assert.equal(guide.status,'ready');
 const route=guide.stops.map(s=>s.id);
 assert.deepEqual(route,[...proof.hunts.map(h=>h.node),cap]);
 await atlas.screenshot({path:'evidence/cap-fresh-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 for(const id of route)await drive.cross(id);
 const atCap=await frame();
 assert.equal(atCap.story.node,cap);
 assert.equal(atCap.total,28);
 assert.equal(atCap.progression.level,200);
 await page.locator('#auto').click();
 await page.waitForFunction(total=>window.lab.frame.progression.total>total,atCap.progression.total);
 await page.locator('#auto').click();
 await page.waitForFunction(()=>!window.lab.frame.auto);
 await page.getByRole('button',{name:'拠点へ：雪原の終着駅',exact:true}).click();
 await drive.waitNode(station);
 const gained=(await frame()).progression;
 const delta=gained.total-atCap.progression.total;
 assert(delta>0);
 assert.equal(gained.xp,0);
 assert.equal(gained.level,200);
 assert.equal(gained.overflowXp-atCap.progression.overflowXp,delta);
 assert.equal(gained.baseXp-atCap.progression.baseXp,delta);
 await status.screenshot({path:'evidence/cap-fresh-exp.png'});
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(station);
 const restored=(await frame()).progression;
 assert.deepEqual(restored,gained);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/cap-fresh-route-browser.json',JSON.stringify({
  imported:start.progression,route,growthQuests:proof.growthQuests,cap:restored,
  addedExp:delta,gameSaveReload:true,errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv200 save, all nine gates, post-cap EXP and reload.');
}finally{
 await browser.close();
}
