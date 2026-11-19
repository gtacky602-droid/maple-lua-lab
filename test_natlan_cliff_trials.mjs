import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const atlatl={host:'nat-wp-72414',water:'tepeacac-waterfall-wall',ledge:'ancient-excavation-upper-ledge',
 arena:'night-trial-atlatl',quest:'natlan-ancient-excavation-wall'};
const cihua={host:'nat-wp-72759',top:'canopy-square-plateau',arena:'night-trial-cihuacoatl'};
const source='natlan-cliff-trial-poses-source-v1.png';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes);
const errors=[],comparisons=[];
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
async function collect(spot){
 await drive.walk(spot.x);
 await drive.changeHeight(spot.y);
 await page.keyboard.press('KeyG');
}
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function compare(name){
 await drive.walk(635);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===845);
 await pause(true);
 const read=()=>page.evaluate(source=>{
  const f=window.lab.frame;
  return {t:f.t,boss:f.fieldBoss,commands:f.commands,sprites:f.draws.filter(d=>d.source===source).length};
 },source);
 const png=await read();
 assert.equal(png.sprites,1);
 await page.evaluate(async source=>{
  const img=new Image();img.src='assets/'+source;await img.decode();
 },source);
 const canvas=page.locator('#game'),mode=page.locator('#renderMode');
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
 await page.locator('#importSave').setInputFiles('work/natlan-cliff-trials-fixture.json');
 await drive.waitNode('natlan-hub');
 await drive.accept(atlatl.quest);
 await drive.warp(atlatl.host);
 await guide(atlatl.arena,['walk','wall','night']);
 await drive.cross(atlatl.water);
 const itinerary=graph.quests.find(q=>q.id===atlatl.quest).itinerary;
 await collect(itinerary[0]);
 await drive.count(atlatl.quest,1);
 await Promise.all([
  drive.cross(atlatl.ledge),
  page.waitForFunction(()=>window.lab.frame.storyLift?.wall&&window.lab.frame.storyLift.remaining<1.55&&
   document.querySelector('#storyLiftText').textContent.includes('壁伝い')).then(()=>
    page.locator('#game').screenshot({path:'evidence/natlan-atlatl-wall.png'})),
 ]);
 await drive.count(atlatl.quest,2);
 await collect(itinerary[2]);
 await drive.count(atlatl.quest,3);
 await page.keyboard.press('KeyE');
 await page.waitForFunction(()=>window.lab.frame.active===2);
 await drive.cross(atlatl.arena);
 await page.waitForFunction(()=>window.lab.frame.storyTravelerTrial===true&&window.lab.frame.active===1&&
  document.querySelector('#a2').hidden);
 await compare('atlatl');
 await drive.cross(atlatl.ledge);
 await page.waitForFunction(()=>!window.lab.frame.storyTravelerTrial&&window.lab.frame.active===2&&
  !document.querySelector('#a2').hidden);
 await drive.cross(atlatl.water);

 await drive.warp(cihua.host);
 await guide(cihua.arena,['walk','night']);
 await drive.cross(cihua.top);
 for(const [x,y] of [[495,412],[631,343],[870,275],[1143,207]]){
  await drive.walk(x);
  await drive.changeHeight(y);
 }
 await drive.walk(1430);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.to==='night-trial-cihuacoatl');
 await page.locator('#game').screenshot({path:'evidence/natlan-cihuacoatl-high-plateau.png'});
 await drive.cross(cihua.arena);
 await compare('cihuacoatl');
 await drive.cross(cihua.top);
 assert.equal((await drive.actor()).y,207);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-cliff-trials-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,wallNotice:true,soloAndRestoredHud:true,topShelfReturn:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
