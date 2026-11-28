import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const draft=process.env.DRAFT_BALANCE==='1';
const earned=process.argv.includes('--earned');
assert.ok(!earned||!draft);
const suffix=draft?'-draft':'';
const output=earned?'work/earned-aurora-cap':'evidence';
const file=earned?`${output}/lv200-save.json`:`work/cap-fresh-route${suffix}/lv200-save.json`;
const bytes=await fs.readFile(file);
const saved=JSON.parse(bytes);
const sourceSha256=createHash('sha256').update(bytes).digest('hex');
const proof=JSON.parse(await fs.readFile(earned?`${output}/lua.json`:`evidence/cap-fresh-route${suffix}.json`,'utf8'));
const growthQuests=earned?['growth-light-release','growth-branch-visit','growth-light-echo',
 'growth-seven-strike','growth-next-goal']:proof.growthQuests;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:920}});
const drive=waypointDriver(page,nodes,{walkTimeout:22000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const atlas=page.locator('#worldAtlas');
const status=page.locator('#progressionStatus');
const errors=[];
const station='white-pass-station',cap=proof.cap.node;
page.on('pageerror',error=>errors.push(error.message));

async function checkpoint() {
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 return page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8971/');
 await page.waitForFunction(()=>window.lab?.frame);
 if(earned){
  await page.setViewportSize({width:390,height:844});
  await page.locator('#importSave').setInputFiles(`${output}/lv195-save.json`);
  await page.waitForFunction(()=>window.lab.frame.progression?.level===195);
  const almost=await frame();
  const meter=page.locator('#progressionMeter');
  await meter.waitFor();
  assert.deepEqual(await meter.evaluate(el=>[el.value,el.max]),[almost.progression.xp,almost.nextExp]);
  assert.ok(await status.evaluate(el=>el.getBoundingClientRect().right<=390&&el.scrollWidth<=el.clientWidth));
  await page.locator('#progressionPanel').screenshot({path:`${output}/near-cap-mobile.png`});
 }
 await page.locator('#importSave').setInputFiles(file);
 await drive.waitNode(station);
 await page.waitForFunction(()=>window.lab.frame.progression.level===200);
 const start=await frame();
 assert.equal(Boolean(start.fieldBalance),draft);
 assert.deepEqual(start.progression,saved.progression);
 assert.match(await status.textContent(),/共通Lv 200 MAX.*上限後のEXP.*累計EXP/);
 await page.locator('#progressionMeter').waitFor({state:'hidden'});
 for(const id of growthQuests)assert.equal(start.story.quests[id].status,'complete');
 if(earned){
  assert.ok(await status.evaluate(el=>el.getBoundingClientRect().right<=390&&el.scrollWidth<=el.clientWidth));
  await page.setViewportSize({width:1240,height:920});
 }

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.locator('#atlasField').selectOption(cap);
 await page.waitForFunction(cap=>window.lab.frame.worldMap?.selected?.id===cap,cap);
 const {guide}=(await frame()).worldMap;
 assert.equal(guide.status,'ready');
 const route=guide.stops.map(s=>s.id);
 const previous=earned?JSON.parse(await fs.readFile('evidence/earned-postgame-ridge-browser.json','utf8')).guide.slice(0,-1):[];
 assert.deepEqual(route,[...previous,...proof.hunts.map(h=>h.node),cap]);
 await atlas.screenshot({path:`${output}/cap-fresh-atlas${suffix}.png`});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 for(const id of route)await drive.cross(id);
 if(draft||earned)await drive.walk(265);
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
 assert.equal(gained.killXp-atCap.progression.killXp,delta);
 await page.locator('#progressionPanel').screenshot({path:`${output}/cap-fresh-exp${suffix}.png`});
 const last=await checkpoint();
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(station);
 const restored=(await frame()).progression;
 assert.deepEqual(restored,gained);
 const reloaded=await checkpoint();
 assert.deepEqual(reloaded.inventory,last.inventory);
 assert.deepEqual(reloaded.weapons,last.weapons);
 assert.deepEqual(reloaded.story.quests,last.story.quests);
 const equippedItems=reloaded.inventory.items.filter(item=>item.owner>0).length;
 const completedQuests=Object.values(reloaded.story.quests).filter(q=>q.status==='complete').length;
 if(earned){
  for(const [id,quest] of Object.entries(saved.story.quests)){
   if(quest.status==='complete')assert.deepEqual(reloaded.story.quests[id],quest,id);
  }
  assert.ok(reloaded.story.visited[cap]);
  assert.equal((await frame()).actors[0].atk,proof.travelerAttack);
  assert.equal(reloaded.companion,saved.companion);
  await fs.writeFile(`${output}/complete.json`,JSON.stringify(reloaded)+'\n');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`${output}/cap-fresh-route-browser${suffix}.json`,JSON.stringify({
  sourceSha256,imported:start.progression,route,growthQuests,cap:restored,
  addedExp:delta,gameSaveReload:true,equippedItems,completedQuests,inventoryAndQuestsRestored:true,
  ...(earned?{mobileLevelMeter:true,travelersAttack:proof.travelerAttack,companion:reloaded.companion}:{}),errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv200 save, all nine gates, post-cap EXP and reload.');
}finally{
 await browser.close();
}
