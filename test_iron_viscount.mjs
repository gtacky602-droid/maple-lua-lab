import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const hub='fontaine-hub', host='fon-wp-50044', vent='iron-viscount-thermal-gallery', stage='iron-viscount-legend-pool';
const quest=graph.quests.find(row=>row.id==='fon-beryl-thermal-vents');
const source='fontaine-iron-viscount-poses-source-v1.png';
const root=process.env.LAB_URL||'http://127.0.0.1:8982/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes,{walkTimeout:20000});
const errors=[], requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',r=>{if(r.url().endsWith('/api/frame')&&!r.ok())errors.push('Frame HTTP '+r.status());});
page.on('request',req=>{if(new URL(req.url()).pathname.endsWith('/'+source))requests.push(req.url());});

const read=()=>page.evaluate(asset=>{
 const f=window.lab?.frame;
 return f&&{t:f.t,commands:f.commands,boss:f.fieldBoss,paused:f.paused,portal:f.storyNearbyPortal,
  art:f.draws.find(d=>d.source===asset),controls:f.storySwimCombat};
},source);

async function assertLocked(destination,reason){
 const from=await drive.node();
 const edge=nodes[from].exits.find(e=>e.to===destination);
 await drive.walk(edge.x);
 await drive.changeHeight(edge.y??480);
 await page.waitForFunction(destination=>window.lab.frame.storyNearbyPortal?.to===destination,destination);
 const gate=(await read()).portal;
 assert.equal(gate.available,false);
 assert.match(gate.reason,reason);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),from);
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(requests.length,0);
 await page.locator('#importSave').setInputFiles('work/iron-viscount-fixture.json');
 await drive.waitNode(hub);
 await drive.accept(quest.id);
 await drive.warp(host);
 await assertLocked(vent,/排熱弁/);
 for(const [index,step] of quest.itinerary.entries()){
  if(step.kind==='arrive'){
   await drive.cross(step.node);
  }else{
   assert.equal(await drive.node(),step.node);
   await drive.walk(step.x);
   await drive.changeHeight(step.y);
   await page.keyboard.press('KeyG');
  }
  await drive.count(quest.id,index+1);
 }
 await drive.cross(vent);
 await assertLocked(stage,/報告/);
 await drive.cross(host);
 await drive.warp(hub);
 await drive.report(quest.id);
 await drive.warp(host);

 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.locator('#atlasField').selectOption(stage);
 await page.waitForFunction(([vent,stage])=>{
  const ids=Object.values(window.lab.frame.worldMap?.guide?.stops??{}).map(p=>p.id);
  return ids?.length===2&&ids[0]===vent&&ids[1]===stage;
 },[vent,stage]);
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 await drive.cross(vent);
 await drive.cross(stage);
 const guard=page.locator('#touchSwimGuard');
 await page.waitForFunction(()=>window.lab.frame.storySwimCombat?.counter);
 assert.equal(await guard.evaluate(b=>b.hidden),false);
 await drive.walk(565);
 await page.waitForFunction(()=>{
  const boss=window.lab.frame.fieldBoss;
  return boss?.move==='FW21'&&boss.warnings[0]?.catchable&&boss.tick>=45&&boss.tick<=65;
 },null,{timeout:9000});
 await page.keyboard.press('KeyK');
 await page.waitForFunction(()=>window.lab.frame.storySwimCombat?.counter?.ready,null,{timeout:5000});
 assert.match(await page.locator('#fieldSwimHelp').textContent(),/反撃/);

 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 assert.ok(requests.length>0);
 await page.evaluate(async source=>{
  const img=new Image();
  img.src='assets/'+source;
  await img.decode();
 },source);
 const mode=page.locator('#renderMode'), canvas=page.locator('#game');
 const png=await read();
 assert.ok(png.art&&png.boss.warnings[0]?.catchable);
 await canvas.screenshot({path:'evidence/iron-viscount-field.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+200,png.commands);
 const standard=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,standard.commands);
 const light=await read();
 assert.equal(png.t,light.t);
 assert.equal(standard.t,light.t);
 assert.deepEqual(png.boss.warnings,light.boss.warnings);
 await canvas.screenshot({path:'evidence/iron-viscount-light.png'});

 await mode.selectOption('sprite');
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
 await drive.walk(680);
 const hp=(await read()).boss.hp;
 await page.keyboard.down('KeyJ');
 try {
  await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp&&
   !window.lab.frame.storySwimCombat?.counter?.ready,hp);
 } finally {await page.keyboard.up('KeyJ');}
 await drive.cross(vent);
 assert.equal((await drive.actor()).y,343);
 assert.equal(await guard.evaluate(b=>b.hidden),true);
 await drive.cross(stage);
 await drive.walk(350);
 await page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.fieldBoss?.hp===f.fieldBoss?.maxhp&&f.storySwimCombat?.counter?.ready===false;
 });
 await drive.cross(vent);

 await page.goto(new URL('/bosses-art.html?q=鉄皮の子爵',root).href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 assert.equal(await page.locator('#cards article:not([hidden])').count(),1);
 assert.equal(await page.locator('#cards article:not([hidden]) canvas').count(),2);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/iron-viscount-browser.json',JSON.stringify({
  questObjectives:quest.itinerary.length,lockedBeforeInspectionAndReport:true,atlasStops:[vent,stage],
  keyboardCatchAndCounter:true,retreatAtSameDepthAndReentry:true,guardControlHiddenOutsideArena:true,
  startupDefersBossArt:true,profileChangesKeepTimeAndWarning:true,
  commands:{png:png.commands,legacy:standard.commands,h32c16:light.commands},journeys:drive.journeys,
  gallery:true,errors
 },null,2)+'\n');
 console.log('Chrome passed the thermal quest, atlas, guard, counter, render profiles and retreat.');
}catch(error){
 console.error({frame:await read(),node:await drive.node(),actor:await drive.actor()});
 throw error;
}finally{
 await browser.close();
}
