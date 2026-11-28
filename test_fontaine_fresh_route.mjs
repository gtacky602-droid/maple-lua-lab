import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const earned=process.argv.includes('--earned-crossing');
const work='work/earned-fontaine-natlan';
const proof=JSON.parse(await fs.readFile(earned?'evidence/earned-fontaine-natlan-lua.json':'evidence/fontaine-fresh-route.json','utf8'));
const path=earned?work+'/level100.json':'work/fontaine-fresh-route/natlan-ready-save.json';
const saved=JSON.parse(await fs.readFile(path,'utf8'));
const questIds=earned?Object.entries(saved.story.quests).filter(([,q])=>q.status==='complete').map(([id])=>id):proof.completedQuests;
const start='fontaine-hub',canal='fontaine-field',entry='natlan-entry',hub='natlan-hub';
const firstQuest='natlan-ridge-flag';
const chart=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const frame=()=>page.evaluate(()=>window.lab.frame);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function loadCheckpoint(filename,level,{queuedGate=false}={}){
 const input=page.locator('#importSave');
 if(queuedGate){
  let held=false;
  const started=Promise.withResolvers(),resume=Promise.withResolvers();
  const hold=async route=>{
   if(!held){
    held=true;
    started.resolve();
    await resume.promise;
   }
   await route.continue();
  };
  await page.route('**/api/frame',hold);
  try{
   await started.promise;
   await page.evaluate(()=>document.activeElement.blur());
   await page.keyboard.press('KeyF');
   await input.setInputFiles(filename);
   await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('検証して再開'));
   const request=page.waitForRequest(req=>req.url().endsWith('/api/frame')&&req.postDataJSON()?.restore);
   resume.resolve();
   const payload=(await request).postDataJSON();
   assert.deepEqual(payload.actions,[]);
   assert.equal(payload.steps,0);
   assert.ok(Object.values(payload.input).every(value=>!value));
  }finally{
   resume.resolve();
   await page.unroute('**/api/frame',hold);
  }
 }else await input.setInputFiles(filename);
 await page.waitForFunction(()=>{
  const el=document.querySelector('#importSave');
  return !el.disabled&&!el.value;
 });
 const message=await page.locator('#saveStatus').textContent();
 assert.match(message,/このブラウザにも保存しました/,`Import ${filename}: ${message}`);
 await page.waitForFunction(level=>{
  const f=window.lab.frame;
  return f.story?.node==='fontaine-hub'&&f.progression?.level===level;
 },level);
}

async function mapTo(target,screenshot){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 const region=chart.regions.find(r=>r.points.some(p=>p.id===target));
 await page.locator('#atlasRegion').selectOption(region.id);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.region===id,region.id);
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 if(screenshot)await atlas.screenshot({path:work+'/'+screenshot});
 const result=await page.evaluate(()=>({guide:window.lab.frame.worldMap.guide,progress:window.lab.frame.progression.total,
  note:document.querySelector('#atlasItineraryNote').textContent}));
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 return result;
}

async function reachGate(target,expected){
 const leg=(await mapTo(target)).guide.stops.at(-1);
 if(leg.from!==await drive.node()){
  if(await drive.choices.locator('option').evaluateAll((options,id)=>options.some(o=>o.value===id),leg.from)){
   await drive.warp(leg.from);
  }else{
   const approach=(await mapTo(leg.from)).guide;
   assert.ok(['here','ready'].includes(approach.status));
   for(const stop of approach.stops)await drive.cross(stop.id,stop.gateX);
  }
 }
 if(expected!==undefined)assert.equal(leg.from,expected);
 const gate=nodes[leg.from].exits.find(e=>e.to===target&&e.x===leg.previewX);
 assert.ok(gate);
 return {leg,gate};
}

async function blockedAt(target,required){
 const {leg,gate}=await reachGate(target);
 await drive.walk(gate.x);
 await drive.changeHeight(gate.y??480);
 await page.waitForFunction(id=>{
  const portal=window.lab.frame.storyNearbyPortal;
  return portal?.to===id&&portal.levelExpRemaining>0;
 },target);
 const {portal,display,progress}=await page.evaluate(()=>({portal:window.lab.frame.storyNearbyPortal,
  display:document.querySelector('#nearbyPortalText').textContent,progress:window.lab.frame.progression.total}));
 assert.equal(portal.available,false);
 assert.equal(portal.level,required);
 assert.ok(portal.levelExpRemaining>0);
 const xp=portal.levelExpRemaining.toLocaleString('ja-JP');
 assert.ok(display.includes('あと '+xp+' EXP'),`Expected ${xp} EXP, got ${display}`);
 const menu=await mapTo(target,target+'-blocked.png');
 const {guide,note}=menu;
 assert.equal(guide.requiredLevel,required);
 assert.equal(guide.levelExpRemaining,portal.levelExpRemaining-(menu.progress-progress));
 assert.ok(note.includes('あと '+guide.levelExpRemaining.toLocaleString('ja-JP')+' EXP'));
 assert.equal(await page.locator('#nearbyPortalGo').isDisabled(),true);
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),leg.from);
 return {target,from:leg.from,level:required,xp:portal.levelExpRemaining};
}

async function legendsAndHunting(){
 const beryl='sites-hunt-50034';
 const legends=['deianeira-legend-lab','iron-viscount-legend-pool'];
 await loadCheckpoint('work/earned-fontaine-nostoi/nostoi-browser-save.json',96);
 const low=await blockedAt(beryl,99);
 await loadCheckpoint(work+'/level99.json',99,{queuedGate:true});
 const hunt=await reachGate(beryl);
 await drive.cross(beryl,hunt.gate.x);
 assert.equal((await frame()).progression.level,99);
 await drive.cross(hunt.leg.from);
 const blocked=[];
 for(const target of [...legends,entry])blocked.push(await blockedAt(target,100));
 await loadCheckpoint(path,100);
 const roundTrips=[];
 for(const arena of legends){
  const {leg,gate}=await reachGate(arena);
  const open=(await mapTo(arena,arena+'-ready.png')).guide;
  assert.equal(open.status,'ready');
  assert.equal(open.levelExpRemaining,undefined);
  await drive.cross(arena,gate.x);
  await drive.cross(leg.from);
  roundTrips.push([leg.from,arena,leg.from]);
 }
 await drive.warp(start);
 return {low,blocked,roundTrips,openedHuntAt99:true,restoreDiscardedQueuedGate:true};
}

try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 const joined=earned?await legendsAndHunting():undefined;
 if(!earned)await loadCheckpoint(path,100);
 const before=await frame();
 assert.equal(before.progression.level,100);
 if(!earned)assert.equal(before.progression.total,saved.progression.total);
 for(const id of questIds) assert.equal(before.story.quests[id].status,'complete');
 const groundLoot=inventory=>inventory.ground
  .filter(drop=>earned||drop.zone.startsWith('story:fontaine-beryl-'))
  .map(drop=>[drop.item.id,drop.zone]);
 const restoredLoot=groundLoot(saved.inventory);
 assert(restoredLoot.length>0);
 assert.deepEqual(groundLoot(before.inventory),restoredLoot);

 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 const hunts=['fontaine-entry',canal,'fontaine-outskirts-loading',
  'fontaine-beryl-bank','fontaine-beryl-foothills'];
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
 await page.locator('#atlasRegion').selectOption('region-06');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-06');
 await page.locator('#atlasField').selectOption(hub);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,hub);
 const {guide}=(await frame()).worldMap;
 const route=guide.stops.map(stop=>[stop.id,stop.mode]);
 assert.equal(guide.status,'ready');
 assert.deepEqual(route,[[canal,'walk'],[entry,'walk'],[hub,'walk']]);
 await atlas.screenshot({path:earned?work+'/natlan-ready.png':'evidence/fontaine-fresh-natlan-atlas.png'});
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
 for(const id of questIds) assert.equal(after.story.quests[id].status,'complete');
 assert.deepEqual(groundLoot(after.inventory),restoredLoot);
 await drive.accept(firstQuest);
 if(earned){
  await page.locator('#saveProgress').click();
  await page.waitForFunction(id=>{
   const raw=localStorage.getItem('maple-lua-lab.checkpoint.v1');
   return raw&&JSON.parse(raw).story.quests[id]?.status==='active';
  },firstQuest);
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await drive.waitNode(hub);
  await drive.count(firstQuest,0);
  const snapshot=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  await fs.writeFile(work+'/natlan-browser-start.json',snapshot+'\n');
 }
 assert.deepEqual(errors,[]);

 await fs.writeFile(earned?'evidence/earned-fontaine-natlan-browser.json':'evidence/fontaine-fresh-route-browser.json',JSON.stringify({
  importedLevel:before.progression.level,arrivalLevel:after.progression.level,route,
  completedQuests:earned?questIds.length:questIds,hunts,firstNatlanQuestAccepted:firstQuest,joined,
  importedXp:before.progression.total,arrivalXp:after.progression.total,travelKillXp,
  ...(earned?{retainedGroundLoot:restoredLoot.length}:{retainedLootFromNewHunts:restoredLoot.length}),errors
 },null,2)+'\n');
 console.log('Chrome passed the earned Lv100 save, Natlan guide, entry and first quest.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story?.node,level:window.lab?.frame.progression?.level,
  status:document.querySelector('#status').textContent,save:document.querySelector('#saveStatus').textContent})));
 throw error;
}finally {
 await browser.close();
}
