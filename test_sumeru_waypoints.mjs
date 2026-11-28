import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8965';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const quests=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const quay='sum-mapped-north-quay',wind='sum-mapped-desert-wind';
const nursery='sum-mapped-twin-shaft',water='sum-mapped-tunigi-water';
const captures=process.env.LAB_SUMERU_CAPTURES||'evidence';
await fs.mkdir(captures,{recursive:true});
const errors=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
page.on('pageerror',e=>errors.push(e.message));
const {node,walk,changeHeight,cross,actor,warp,count,waitNode,accept,report,choices,journeys}=waypointDriver(page,nodes);
const follow=async(...stages)=>{for(const stage of stages)await cross(stage)};
const calls=()=>page.evaluate(()=>Number(document.querySelector('#draws').textContent.replaceAll(',','')));

async function inspect(step,quest,index){
 await walk(step.x-38);
 await page.keyboard.press('KeyG');
 await count(quest,index);
}

async function itinerary(quest){
 for(const [i,step] of quests[quest].itinerary.entries()){
  if(step.kind==='arrive'){
   assert.equal(await node(),step.from);
   await cross(step.node);
   await count(quest,i+1);
  }else await inspect(step,quest,i+1);
 }
 await warp(quests[quest].hub);
 await report(quest);
}

async function atlasShortcut(from,to){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#atlasField').selectOption(to);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,to);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 assert.equal(guide.stops.length,1);
 const [stop]=guide.stops;
 assert.deepEqual([stop.from,stop.id,stop.mode,stop.hint],[from,to,'walk','深層の根室へ続く横穴']);
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 await cross(to,stop.gateX);
 return stop;
}

async function compareProfiles(){
 await walk(750);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const before=await actor();
 const pin=await page.evaluate(()=>window.lab.frame.storyWaypoint.id);
 assert.equal(pin,'teyvat:28707');
 const canvas=page.locator('#game');
 const png=await calls();
 await canvas.screenshot({path:join(captures,'sumeru-waypoint-png.png')});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(n=>Number(document.querySelector('#draws').textContent.replaceAll(',',''))>n*8,png);
 const standard=await calls();
 await page.selectOption('#renderMode','h32c16');
 await page.waitForFunction(n=>Number(document.querySelector('#draws').textContent.replaceAll(',',''))<n*.75,standard);
 const light=await calls();
 await canvas.screenshot({path:join(captures,'sumeru-waypoint-light.png')});
 const after=await actor();
 assert.deepEqual([before.x,before.y,before.hp],[after.x,after.y,after.hp]);
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(n=>Number(document.querySelector('#draws').textContent.replaceAll(',',''))===n,png);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {marker:pin,png,standard,light,actor:[before.x,before.y],frozen:true};
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/sumeru-waypoint-browser-save.json');
 await waitNode('sumeru-hub');
 await accept(quay);
 await itinerary(quay);
 const lateSave='work/sumeru-waypoint-late-browser-save.json';
 const lateLevel=JSON.parse(await fs.readFile(lateSave,'utf8')).progression.level;
 await page.locator('#importSave').setInputFiles(lateSave);
 await waitNode('sumeru-hub');
 await page.waitForFunction(lv=>window.lab.frame.progression.level===lv,lateLevel);
 await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',quay);
 console.log('Quay reported; late Sumeru checkpoint loaded.');
 await follow('sum-wp-28740','sum-wp-28743','sum-wp-28708','sum-wp-28707');
 const render=await compareProfiles();
 await warp('sumeru-hub');
 await accept(nursery);
 await page.locator('[data-quest="'+nursery+'"]').getByRole('button',{name:'この依頼を追跡'}).click();
 const statue='sum-wp-32451',shallow='sum-wp-32452',deep='sum-wp-28709';
 await follow('sum-wp-28740','sum-wp-28743','sum-wp-28708',statue);
 const shortcut=await atlasShortcut(statue,deep);
 await count(nursery,0);
 await cross(statue);
 await page.waitForFunction(id=>document.querySelector('#trackedQuestMap').dataset.node===id,shallow);
 await page.locator('#trackedQuestMap').click();
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,shallow);
 const firstLift=await page.evaluate(()=>window.lab.frame.worldMap.guide.stops[0]);
 assert.deepEqual([firstLift.from,firstLift.id,firstLift.mode],[statue,shallow,'lift']);
 assert.match(firstLift.hint,/苗畑浅層の昇降機/);
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 await itinerary(nursery);
 console.log('Nursery shortcut and two lifts checked; nursery reported.');

 await follow('sumeru-field','tunigi-camp');
 await accept(wind);
 await page.locator('[data-quest="'+wind+'"]').getByRole('button',{name:'この依頼を追跡'}).click();
 await follow('sum-wp-46517','sum-wp-46516','sum-wp-46515','sum-wp-41834','sum-wp-41835','sum-wp-41838');
 await count(wind,1);

 const shaft=nodes['sum-wp-41838'].exits.find(e=>e.to==='sum-wp-41836');
 await walk(shaft.x);
 await changeHeight(shaft.y);
 await page.waitForFunction(()=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to==='sum-wp-41836'&&!gate.available&&gate.wind?.seconds>.6;
 },null,{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('#trackedQuestText').textContent.includes('風が弱まるまであと約')&&window.lab.frame.storyNearbyPortal.wind.seconds>.6);
 assert.equal(await page.locator('#nearbyPortalGo').isDisabled(),true);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('風が弱まるまで'));
 await cross('sum-wp-41836');
 await count(wind,2);
 await inspect(quests[wind].itinerary[2],wind,3);
 await cross('sum-wp-41838');
 await count(wind,4);
 await warp('tunigi-camp');
 await report(wind);
 console.log('Wind window checked; wind quest reported.');
 await accept(water);
 await itinerary(water);
 const groupLabels=await choices.locator('optgroup').evaluateAll(items=>items.map(g=>g.label));
 assert.ok(groupLabels.includes('ハドラマヴェス砂漠・別階層'));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('tunigi-camp');
 for(const id of [quay,nursery,wind,water]){
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }
 await warp('sum-wp-41836');
 assert.deepEqual(errors,[]);
 await fs.writeFile(join(captures,'sumeru-waypoint-browser.json'),JSON.stringify({
  journeys,groupLabels,render,shortcut,firstLift,windInitiallyBlocked:true,restoredLayerWarp:true,
  reported:[quay,nursery,wind,water],pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed the ferry, nursery shortcut and lifts, wind timing, four quest reports, reload and frozen-frame pixel comparison.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
