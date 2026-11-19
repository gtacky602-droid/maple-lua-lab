import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const water={host:'nat-wp-79051',approach:'stadium-west-waterfall-foot',arena:'night-trial-potapo'};
const cliff={host:'nat-wp-79542',approach:'flower-feather-statue-back-cliff',arena:'night-trial-tupayo'};
const quest='natlan-two-pillar-trails',source='natlan-wayob-duo-poses-source-v1.png';
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

async function guide(route){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(route.arena);
 await page.waitForFunction(({approach,arena})=>{
  const guide=window.lab.frame.worldMap?.guide;
  const stops=Object.values(guide?.stops??{});
  return guide?.status==='ready'&&stops.length===2&&stops[0].id===approach&&stops[0].mode==='walk'&&
   stops[1].id===arena&&stops[1].mode==='night';
 },route);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}
async function climb(shelves){
 for(const [x,y] of shelves){
  await drive.walk(x);
  await drive.changeHeight(y);
 }
}
async function collect(index){
 const spot=graph.quests.find(q=>q.id===quest).itinerary[index];
 await drive.walk(spot.x);
 await drive.changeHeight(spot.y);
 await page.keyboard.press('KeyG');
 await drive.count(quest,index+1);
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

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/natlan-wayob-duo-fixture.json');
 await drive.waitNode('natlan-hub');
 await drive.accept(quest);
 await drive.warp(water.host);
 await guide(water);
 await drive.cross(water.approach);
 assert.equal((await drive.actor()).y,335);
 await drive.walk(580);
 await drive.changeHeight(407);
 await collect(0);
 await drive.walk(1190);
 await page.waitForFunction(id=>window.lab.frame.storyNearbyPortal?.to===id,water.arena);
 await canvas.screenshot({path:'evidence/natlan-potapo-waterfall-pillar.png'});
 await drive.cross(water.arena);
 await compare('potapo');
 await drive.cross(water.approach);
 assert.equal((await drive.actor()).y,480);
 await climb([[665,407],[370,335]]);
 await drive.cross(water.host);
 await drive.warp(cliff.host);
 await guide(cliff);
 await drive.cross(cliff.approach);
 await drive.walk(1410);
 assert.equal((await drive.actor()).y,480);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),cliff.approach);
 await climb([[475,412],[682,343],[1000,274]]);
 await collect(1);
 await drive.walk(1380);
 await page.waitForFunction(id=>window.lab.frame.storyNearbyPortal?.to===id,cliff.arena);
 await canvas.screenshot({path:'evidence/natlan-tupayo-sea-cliff-pillar.png'});
 await drive.cross(cliff.arena);
 await compare('tupayo');
 await drive.cross(cliff.approach);
 assert.equal((await drive.actor()).y,274);
 await drive.cross(cliff.host);
 await drive.warp('natlan-hub');
 await drive.report(quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-wayob-duo-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,waterfallTwoShelfDescentAndReturn:true,
   highCliffThreeShelves:true,trialReturnHeights:[480,274],questReported:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
