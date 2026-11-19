import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const west='nat-wp-79053',fork='night-wind-seaward-fork',rilai='night-wind-rilai-clearing';
const dawn='night-trial-fallen-dawnstar',port='natlan-port',ridge='flower-feather-smiths-ridge';
const iron='night-trial-ironbeard',quest='natlan-seaward-signs';
const source='natlan-northwest-legend-poses-source-v1.png';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes);
const errors=[],comparisons=[];
const canvas=page.locator('#game');
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push('Frame HTTP '+response.status());
});

async function guide(arena,modes){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(arena);
 await page.waitForFunction(wanted=>{
  const route=window.lab.frame.worldMap?.guide;
  return route?.status==='ready'&&Object.values(route.stops??{}).map(leg=>leg.mode).join()===wanted;
 },modes.join());
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}
async function climb(shelves){
 for(const [x,y] of shelves){
  await drive.walk(x);
  await drive.changeHeight(y);
 }
}
async function collect(spot,count){
 await drive.walk(spot.x);
 await drive.changeHeight(spot.y);
 await page.keyboard.press('KeyG');
 await drive.count(quest,count);
}
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function compare(name){
 await drive.walk(405);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===845);
 await pause(true);
 const read=()=>page.evaluate(source=>{
  const f=window.lab.frame;
  return {t:f.t,boss:f.fieldBoss,commands:f.commands,sprites:f.draws.filter(d=>d.source===source).length};
 },source);
 const png=await read();
 assert.equal(png.sprites,1);
 assert.equal(png.boss.hp,png.boss.maxhp);
 await page.evaluate(async source=>{
  const img=new Image();
  img.src='assets/'+source;
  await img.decode();
 },source);
 const mode=page.locator('#renderMode');
 await canvas.screenshot({path:'evidence/natlan-'+name+'-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+20,png.commands);
 const full=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,full.commands);
 const light=await read();
 assert.equal(light.t,png.t);
 assert.deepEqual(light.boss,png.boss);
 await canvas.screenshot({path:'evidence/natlan-'+name+'-16colors.png'});
 comparisons.push({name,pngCommands:png.commands,rectangleCommands:full.commands,lightCommands:light.commands});
 await mode.selectOption('sprite');
 await pause(false);
}
async function checkPillar(approach,arena,shelves,name){
 const edge=nodes[approach].exits.find(gate=>gate.to===arena);
 await drive.walk(edge.x);
 assert.equal((await drive.actor()).y,480);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),approach);
 await drive.walk(shelves[0][0]);
 await climb(shelves);
 await drive.cross(arena);
 await compare(name);
 await drive.cross(approach);
 assert.equal((await drive.actor()).y,edge.y);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/natlan-northwest-legends-fixture.json');
 await drive.waitNode('natlan-hub');
 await drive.accept(quest);
 await drive.warp(west);
 await guide(rilai,['walk','walk']);
 await guide(dawn,['walk','night']);
 await drive.cross(fork);
 const itinerary=graph.quests.find(q=>q.id===quest).itinerary;
 await collect(itinerary[0],1);
 await drive.cross(rilai);
 await drive.walk(796);
 const neutral=await page.evaluate(()=>window.lab.frame.fieldBoss);
 assert.equal(neutral.phase,'available');
 assert.equal(neutral.hp,neutral.maxhp);
 assert.equal(neutral.label,'待機中・攻撃で挑戦');
 await compare('rilai');
 await drive.walk(796);
 await page.keyboard.down('KeyJ');
 try{await page.waitForFunction(()=>window.lab.frame.fieldBoss.hp<window.lab.frame.fieldBoss.maxhp)}
 finally{await page.keyboard.up('KeyJ')}
 await drive.cross(fork);
 await climb([[650,414],[935,346]]);
 await collect(itinerary[1],2);
 await drive.changeHeight(480);
 await checkPillar(fork,dawn,[[650,414],[935,346]],'fallen-dawnstar');
 await drive.cross(west);
 await drive.warp(port);
 await guide(iron,['walk','night']);
 await drive.cross(ridge);
 await checkPillar(ridge,iron,[[510,411],[945,343]],'ironbeard');
 await drive.cross(port);
 await drive.warp('natlan-hub');
 await drive.report(quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-northwest-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,distinctMapGuide:true,rilaiProvoked:true,
   pillarReturns:true,questReported:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
