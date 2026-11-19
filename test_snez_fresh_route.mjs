import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const proof=JSON.parse(await fs.readFile('evidence/snez-fresh-route.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const frame=()=>page.evaluate(()=>window.lab.frame);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

const hub='snezhnaya-hub', coach='white-pass-coach', station='white-pass-station';
const aurora='aurora-ice-cut', iceShelf='aurora-ice-shelf', cap='dawn-crystal-field';
const huntLevels={
 'white-pass-cut':140,'white-pass-woods':148,'white-pass-ridge':155,
 [aurora]:160,[iceShelf]:165,'aurora-steam-channel':170,'aurora-mineral-terraces':175,
 'dawn-vein-mine':180,'dawn-vein-deep':185,'dawn-glass-ridge':190,'dawn-glass-divide':195,[cap]:200
};

async function load(name,node){
 const path=`work/snez-fresh-route/${name}.json`;
 await page.locator('#importSave').setInputFiles(path);
 await drive.waitNode(node);
 return JSON.parse(await fs.readFile(path,'utf8'));
}

async function openMap(){
 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
}

async function closeMap(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function guide(id){
 await page.locator('#atlasField').selectOption(id);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
 return (await frame()).worldMap;
}

try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8971/');
 await page.waitForFunction(()=>window.lab?.frame);
 const savedTrain=await load('train-save',hub);
 const before=await frame();
 assert.equal(before.progression.level,savedTrain.progression.level);
 assert.equal(before.story.quests['white-pass-ticket'].status,'complete');
 assert.equal(before.voyage,undefined);
 await openMap();
 const trainGuide=(await guide(station)).guide;
 assert.equal(trainGuide.status,'ready');
 assert.deepEqual(trainGuide.stops.map(s=>[s.id,s.mode]),[[coach,'rail'],[station,'rail']]);
 assert.equal(trainGuide.stops[1].hint,'発車から9秒で到着');
 await atlas.screenshot({path:'evidence/snez-fresh-train-atlas.png'});
 await closeMap();

 await drive.walk(800);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.trainBoard);
 assert.equal(await page.locator('#nearbyPortalGo').textContent(),'F：列車に乗る');
 await page.keyboard.press('KeyF');
 await drive.waitNode(coach);
 const vehicle=(await frame()).voyage;
 assert.equal(vehicle.kind,'train');
 assert.equal(vehicle.destinationName,'雪原の終着駅');
 assert.equal(vehicle.total,9);
 assert.match(await page.locator('#storyLiftText').textContent(),/列車で移動中.*雪原の終着駅.*秒/);
 await drive.waitNode(station);
 assert.equal((await frame()).progression.total,before.progression.total);
 const locked=page.locator('[data-quest="white-pass-trail"][data-status="locked"]');
 await locked.waitFor();
 assert.match(await locked.textContent(),/Lv148/);

 const saved=await load('aurora-ready-save',station);
 await page.waitForFunction(level=>window.lab.frame.progression?.level===level,160);
 let soFar=await frame();
 assert.equal(soFar.progression.total,saved.progression.total);
 for(const id of proof.completedQuests)assert.equal(soFar.story.quests[id].status,'complete');
 await openMap();
 await page.locator('#atlasLayer').selectOption('hunt');
 const firstHunt=await guide(aurora);
 assert.equal(firstHunt.guide.status,'ready');
 for(const [id,level] of Object.entries(huntLevels)){
  assert.equal(firstHunt.points.find(p=>p.id===id)?.level,level);
 }
 const later=(await guide(cap)).guide;
 assert.equal(later.status,'blocked');
 assert.equal(later.reason,'必要Lv165');
 assert.equal(later.stops.at(-1).id,cap);
 assert.equal(later.stops.at(-1).reason,'必要Lv200');
 await atlas.screenshot({path:'evidence/snez-fresh-endgame-atlas.png'});
 await closeMap();

 await drive.cross(aurora);
 const inHunt=await frame();
 assert.equal(inHunt.story.quests['growth-light-release'],undefined);
 if(inHunt.active!==1){
  await page.keyboard.press('KeyE');
  await page.waitForFunction(()=>window.lab.frame.active===1);
 }
 await page.evaluate(()=>document.activeElement.blur());
 for(let attempt=0;attempt<5;attempt++){
  const current=await frame();
  if(current.lightForm?.seconds>0)break;
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(time=>window.lab.frame.t>=time+.22,current.t);
 }
 const release=await frame();
 assert(release.lightForm?.seconds>0,JSON.stringify({
  active:release.active,gauge:release.gauge,eligibility:release.growthEligibility,
  skillNotice:release.skillNotice,notice:release.storyNotice,
 }));
 await drive.walk(1780);
 await page.waitForFunction(id=>window.lab.frame.storyNearbyPortal?.to===id,iceShelf);
 soFar=await frame();
 assert.equal(soFar.total,28);
 assert.equal(soFar.storyNearbyPortal.available,false);
 assert.equal(soFar.storyNearbyPortal.level,165);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/snez-fresh-route-browser.json',JSON.stringify({
  trainGuide:trainGuide.stops,boardLabel:'F：列車に乗る',trainSeconds:vehicle.total,
  persistedQuests:proof.completedQuests,firstHunt:aurora,huntLevels,capGuide:later.stops,
  verifiedAtLv:soFar.progression.level,lightReleaseKeyQ:true,blockedGate:iceShelf,errors
 },null,2)+'\n');
 console.log('Chrome passed the earned White Pass saves, rail guide and every Lv140–200 hunt marker.');
} finally {
 await browser.close();
}
