import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const luHost='fon-wp-53865', luStage='luachra-legend-shelf';
const chHost='fon-wp-55765', chStage='chassanion-legend-bubble-room', tower='morte-tower-sluice';
const hub='fontaine-hub', quest=graph.quests.find(row=>row.id==='fon-morte-sluice-survey');
const asset='fontaine-bubble-poses-source-v1.png';
const root=process.env.LAB_URL||'http://127.0.0.1:8985/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes,{walkTimeout:20000});
const requests=[], errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',r=>{if(r.url().endsWith('/api/frame')&&!r.ok())errors.push('Frame HTTP '+r.status());});
page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/'+asset))requests.push(r.url());});
const canvas=page.locator('#game'), mode=page.locator('#renderMode'), control=page.locator('#touchSwimGuard');

const read=()=>page.evaluate(asset=>{
 const f=window.lab?.frame;
 return f&&{t:f.t,commands:f.commands,boss:f.fieldBoss,reflect:f.storySwimCombat?.reflect,
  location:f.location,art:f.draws.find(d=>d.source===asset)};
},asset);

async function atlasPath(stage,ids){
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(stage);
 await page.waitForFunction(ids=>JSON.stringify(Object.values(window.lab.frame.worldMap?.guide?.stops??{}).map(p=>p.id))===
  JSON.stringify(ids),ids);
 if(stage===chStage){
  const reported=ids.includes(tower);
  const href=page.locator('#atlasBackgroundCompare');
  await page.waitForFunction(({stage,reported})=>{
   const u=new URL(document.getElementById('atlasBackgroundCompare').href);
   return u.searchParams.get('node')===stage&&(u.searchParams.get('phase')==='after')===reported;
  },{stage,reported});
  const [viewer]=await Promise.all([page.waitForEvent('popup'),href.click()]);
  const expected=reported?'bygone-resonance-background-v1.png':'morte-bubble-room-background-v1.png';
  await viewer.waitForFunction(f=>window.mapArt?.backgroundFile===f&&window.mapArt.backgroundState==='ready',expected);
  assert.equal(await viewer.locator('#sceneryPhase').inputValue(),reported?'after':'before');
  await viewer.close();
  await page.bringToFront();
 }
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function pause(want){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(want=>window.lab.frame.paused===want,want);
}

async function capture(tag){
 await page.evaluate(async asset=>{
  const image=new Image();image.src='assets/'+asset;await image.decode();
 },asset);
 const png=await read();
 assert.ok(png.art);
 await canvas.screenshot({path:'evidence/'+tag+'-field.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+200,png.commands);
 const standard=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,standard.commands);
 const light=await read();
 assert.equal(png.t,standard.t);
 assert.equal(png.t,light.t);
 assert.deepEqual(light.boss.warnings,png.boss.warnings);
 assert.deepEqual(light.reflect,png.reflect);
 await canvas.screenshot({path:'evidence/'+tag+'-light.png'});
 await mode.selectOption('sprite');
 return {png:png.commands,legacy:standard.commands,h32c16:light.commands};
}

async function background(){
 return page.evaluate(async ()=>{
  const {sceneryStatus}=await import('/scenery.js');
  return sceneryStatus(window.lab.frame);
 });
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(requests.length,0);
 await page.locator('#importSave').setInputFiles('work/fontaine-bubble-fixture.json');
 await drive.waitNode(hub);
 await drive.warp(luHost);
 await atlasPath(luStage,[luStage]);
 await drive.cross(luStage);
 assert.equal(await control.evaluate(b=>b.hidden),true);
 await drive.walk(645);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.move==='FW47'&&
   window.lab.frame.fieldBoss.warnings[0]?.dash&&window.lab.frame.fieldBoss.warnings[0].active);
 await pause(true);
 assert.ok((await read()).boss.x<840&&requests.length>0);
 const luCounts=await capture('luachra-dash');
 await pause(false);
 await drive.cross(luHost);

 await drive.warp(chHost);
 await atlasPath(chStage,[chStage]);
 await drive.cross(chStage);
 assert.equal((await background()).key,'morteBubbleChamber');
 await drive.walk(645);
 await page.waitForFunction(()=>{
  const reflect=window.lab.frame.storySwimCombat?.reflect;
  return reflect?.ready&&!reflect.cooldown;
 });
 assert.equal((await control.textContent()).trim(),'泡返し');
 assert.match(await page.locator('#fieldSwimHelp').textContent(),/今Kで泡返し/);
 await pause(true);
 assert.ok((await read()).boss.warnings[0]?.reflectable);
 const chCounts=await capture('chassanion-outside');
 await pause(false);
 const hp=(await read()).boss.hp;
 await page.keyboard.press('KeyK');
 await page.waitForFunction(()=>Object.values(window.lab.frame.fieldBoss?.warnings??{}).some(w=>w.returning));
 await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp,hp);
 await drive.cross(chHost);
 assert.equal(await control.evaluate(b=>b.hidden),true);

 await drive.warp(hub);
 await drive.accept(quest.id);
 await drive.warp(chHost);
 for(const [i,step] of quest.itinerary.entries()){
  if(step.kind==='arrive') await drive.cross(step.node);
  else {
   assert.equal(await drive.node(),step.node);
   await drive.walk(step.x);
   await drive.changeHeight(step.y);
   await page.keyboard.press('KeyG');
  }
  await drive.count(quest.id,i+1);
 }
 await drive.warp(hub);
 await drive.report(quest.id);
 await drive.warp(chHost);
 await atlasPath(chStage,[tower,chStage]);
 const oldGate=nodes[chHost].exits.find(e=>e.to===chStage);
 await drive.walk(oldGate.x);
 await drive.changeHeight(oldGate.y);
 assert.notEqual(await page.evaluate(()=>window.lab.frame.storyNearbyPortal?.to),chStage);
 await drive.cross(tower);
 await drive.cross(chStage);
 await page.waitForFunction(()=>window.lab.frame.storyScenery==='bygoneResonance');
 assert.deepEqual(await background(),{key:'bygoneResonance',file:'bygone-resonance-background-v1.png',state:'ready'});
 await drive.walk(645);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.hp===window.lab.frame.fieldBoss?.maxhp&&
   window.lab.frame.fieldBoss?.move==='FW51');
 await pause(true);
 assert.match((await read()).location,/下層/);
 await canvas.screenshot({path:'evidence/chassanion-inside-field.png'});
 await pause(false);
 await drive.cross(tower);
 assert.equal((await drive.actor()).y,316);
 await drive.cross(chHost);

 const gallery=new URL('bosses-art.html?q=シャサニョン',root);
 await page.goto(gallery.href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 for(const [name,ids] of [
  ['シャサニョン',['legend-chassanion','legend-hat-jellyfish-shared']],
  ['極彩色のルケア',['legend-cherubic-sea-hare-shared','legend-luachra']]
 ]){
  await page.locator('#assetSearch').fill(name);
  for(const id of ids)assert.equal(await page.locator('#cards article[data-id="'+id+'"]:not([hidden]) canvas').count(),2);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/fontaine-bubble-browser.json',JSON.stringify({
  bothRoutesFromAtlas:true,luachraMovesThroughWarnedDepth:true,keyboardReturnsMovingBubble:true,
  surveySteps:quest.itinerary.length,reportMovesGateAndBackground:true,atlasComparisonFollowsReport:true,towerRetreat:true,
  sameFrameLightPreview:true,counts:{luachra:luCounts,chassanion:chCounts},errors
 },null,2)+'\n');
 console.log('Chrome verified both battles, reflected bubble and the tower survey route change.');
}catch(error){
 console.error({url:page.url(),frame:await read()});
 throw error;
}finally{
 await browser.close();
}
