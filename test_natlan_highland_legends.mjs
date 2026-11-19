import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const dock='ochkanatlan-dock',isle='nat-wp-84107',reef='nat-wp-80030';
const small='sacred-mountain-east-isle-dais',device='ochka-bronzelock-device-shore';
const landing='ochka-bronzelock-floating-landing',lock='ochka-bronzelock-island-court';
const quest='ochka-floating-island-spiritway',source='natlan-highland-legend-poses-source-v1.png';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes);
const canvas=page.locator('#game');
const errors=[],comparisons=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',receive=>{
 if(receive.url().endsWith('/api/frame')&&!receive.ok())errors.push('Frame HTTP '+receive.status());
});

async function guide(stops,status='ready'){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(stops.at(-1)[0]);
 await page.waitForFunction(({stops,status})=>{
  const guide=window.lab.frame.worldMap?.guide;
  return guide?.status===status&&JSON.stringify(Object.values(guide.stops??{}).map(leg=>[leg.id,leg.mode]))===JSON.stringify(stops);
 },{stops,status});
 if(status==='blocked')assert.match(await page.locator('#atlasItineraryNote').textContent(),/二つ/);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}
async function breakDevice(x,remaining){
 await drive.walk(x-36);
 await drive.walk((await drive.actor()).x+25);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(expected=>window.lab.frame.draws.filter(draw=>draw.text==='浮遊装置').length===expected,remaining);
 }finally{
  await page.keyboard.up('KeyJ');
 }
}
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function compare(name){
 await drive.walk(405);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===832);
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

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/natlan-highland-legends-fixture.json');
 await drive.waitNode(dock);
 await drive.accept(quest);
 await drive.warp(isle);
 await guide([[small,'walk']]);
 await drive.cross(small);
 await compare('infinitesimal');
 await drive.cross(isle);
 assert.equal((await drive.actor()).y,401);

 await drive.warp(reef);
 await guide([[device,'walk'],[landing,'spiritway'],[lock,'walk']],'blocked');
 await drive.cross(device);
 await breakDevice(503,1);
 await drive.walk(1210);
 await drive.changeHeight(414);
 await page.waitForFunction(landing=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===landing&&!gate.available&&gate.reason.includes('二つ');
 },landing);
 await drive.walk(902);
 await drive.changeHeight(480);
 await breakDevice(942,0);
 await drive.count(quest,1);
 await guide([[landing,'spiritway'],[lock,'walk']]);
 await Promise.all([
  drive.cross(landing),
  page.waitForFunction(()=>window.lab.frame.storyLift?.spiritway&&window.lab.frame.storyLift.remaining<1.6&&
   window.lab.frame.actors[0].y<290&&document.querySelector('#storyLiftText').textContent.includes('スピリットウェイ'))
   .then(()=>canvas.screenshot({path:'evidence/natlan-bronzelock-spiritway.png'})),
 ]);
 await drive.count(quest,2);
 await drive.cross(lock);
 await compare('bronzelock');
 await drive.cross(landing);
 assert.equal((await drive.actor()).y,410);
 await drive.cross(device);
 assert.equal((await drive.actor()).y,414);
 await drive.cross(reef);
 await drive.warp(dock);
 await drive.report(quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-highland-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,spiritwayHud:true,physicalDeviceInput:true,questReported:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
