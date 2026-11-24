import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const base=process.env.LAB_URL||'http://127.0.0.1:9068/';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});

async function play(host, test) {
 const context=await browser.newContext({viewport:{width:1280,height:940}});
 const page=await context.newPage(), errors=[];
 const drive=waypointDriver(page,nodes);
 const map=page.locator('#worldAtlas');
 page.setDefaultTimeout(24000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{
  if(response.url().endsWith('/api/frame')&&!response.ok())errors.push('Frame HTTP '+response.status());
 });
 const load=async level=>{
  await page.locator('#importSave').setInputFiles(`work/hunt-atlas-${host}-${level}.json`);
  await drive.waitNode(nodes[host].checkpoint);
  await drive.warp(host);
 };
 const open=async()=>{
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press('KeyM');
  await map.waitFor();
  await map.locator('#atlasLayer').selectOption('hunt');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 };
 const select=async id=>{
  await map.locator('#atlasField').selectOption(id);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
  return page.evaluate(()=>window.lab.frame.worldMap.guide);
 };
 const close=async()=>{
  await page.keyboard.press('Escape');
  await map.waitFor({state:'hidden'});
 };
 try{
  await page.goto(base);
  await page.waitForFunction(()=>window.lab?.frame);
  const result=await test({page,drive,map,load,open,select,close});
  assert.deepEqual(errors,[]);
  return result;
 }finally{
  await context.close();
 }
}

async function checkPocket({page,drive,map,load,open,select,close}){
 const host='mond-wp-21', hunt='sites-hunt-7092', pocket='sites-hunt-7092-pocket-1';
 await load(14);
 await open();
 const blocked=await select(pocket);
 assert.deepEqual(blocked.stops.map(leg=>leg.id),[hunt,pocket]);
 assert.equal(blocked.status,'blocked');
 assert.equal(blocked.reason,'必要Lv15');
 await map.screenshot({path:'evidence/world-hunt-pocket-level-gate.png'});
 await close();
 await drive.cross(hunt);
 const entry=nodes[hunt].exits.find(edge=>edge.to===pocket);
 await drive.walk(entry.x);
 await page.waitForFunction(pocket=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===pocket&&!gate.available&&gate.level===15;
 },pocket);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('必要レベル 15'));
 assert.equal(await drive.node(),hunt);

 await load(15);
 await open();
 const allowed=await select(pocket);
 assert.equal(allowed.status,'ready');
 const gates=allowed.stops.map(leg=>leg.id);
 assert.deepEqual(gates,[hunt,pocket]);
 await close();
 for(const id of gates)await drive.cross(id);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(pocket=>{
  const save=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  return save?.story?.visited?.[pocket]===true;
 },pocket);
 await open();
 const returning=await select(host);
 assert.deepEqual(returning.stops.map(leg=>leg.id),[hunt,host]);
 await close();
 for(const leg of returning.stops)await drive.cross(leg.id);
 await page.locator('#loadProgress').click();
 await drive.waitNode(nodes[host].checkpoint);
 return {blockedAt:14,enteredAt:15,gates,returning: returning.stops.map(leg=>leg.id),
  savedVisit:pocket,restoredAt:await drive.node(),journeys:drive.journeys};
}

async function checkMultipleHunts({map,load,open,select,close,drive}){
 const host='liyue-wp-104', low='liyue-quarry-scree', high='sites-hunt-7218';
 await load(36);
 await open();
 await select(host);
 const levelText=await map.locator('#atlasPlaceLevel').textContent();
 assert.match(levelText,/狩場はLv34・Lv38/);
 await map.screenshot({path:'evidence/world-hunt-multiple-entrances.png'});
 const lower=await select(low);
 assert.equal(lower.status,'ready');
 assert.deepEqual(lower.stops.map(leg=>leg.id),[low]);
 const higher=await select(high);
 assert.equal(higher.reason,'必要Lv38');
 assert.equal(higher.status,'blocked');
 await close();
 await drive.cross(low);
 await drive.cross(host);
 return {host,playerLevel:36,displayedLevels:[34,38],allowed:low,blocked:high,journeys:drive.journeys};
}

try{
 const [pocket,multipleHunts]=await Promise.all([
  play('mond-wp-21',checkPocket),play('liyue-wp-104',checkMultipleHunts)
 ]);
 await fs.writeFile('evidence/world-hunt-routes-browser.json',
  JSON.stringify({pocket,multipleHunts},null,2)+'\n');
 console.log('Hunt atlas Chrome: both entrance levels, blocked side room, guided round trip and save reload passed.');
}finally{
 await browser.close();
}
