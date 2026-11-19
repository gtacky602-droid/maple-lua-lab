import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const rim='nat-wp-82559',island='nat-wp-82563',valley='nat-wp-82562';
const ruins={approach:'tetenanco-seaward-foot',arena:'night-trial-reji'};
const headland={approach:'collective-eastern-headland',arena:'night-trial-tupu'};
const quest='natlan-atocpan-landmarks',source='natlan-atocpan-totem-poses-source-v1.png';
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

async function guide(route,mode){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(route.arena);
 await page.waitForFunction(({approach,arena,mode})=>{
  const guide=window.lab.frame.worldMap?.guide;
  const stops=Object.values(guide?.stops??{});
  return guide?.status==='ready'&&stops.length===2&&stops[0].id===approach&&stops[0].mode===mode&&
   stops[1].id===arena&&stops[1].mode==='night';
 },{...route,mode});
 if(mode==='boat')await atlas.screenshot({path:'evidence/natlan-tupu-boat-guide.png'});
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
 await page.locator('#importSave').setInputFiles('work/natlan-atocpan-totem-fixture.json');
 await drive.waitNode('natlan-hub');
 await drive.accept(quest);
 await drive.warp(rim);
 await guide(ruins,'walk');
 await drive.cross(ruins.approach);
 assert.equal((await drive.actor()).y,414);
 await collect(0);
 await drive.walk(1250);
 await page.waitForFunction(id=>window.lab.frame.storyNearbyPortal?.to===id,ruins.arena);
 await canvas.screenshot({path:'evidence/natlan-reji-ruins-pillar.png'});
 await drive.cross(ruins.arena);
 await compare('reji');
 await drive.cross(ruins.approach);
 assert.equal((await drive.actor()).y,480);
 await drive.cross(rim);

 await drive.warp(valley);
 await guide(headland,'walk');
 await drive.cross(headland.approach);
 await drive.walk(865);
 assert.equal((await drive.actor()).y,480);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),headland.approach);
 await climb([[536,414],[735,345]]);
 await collect(1);
 await drive.walk(840);
 await page.waitForFunction(id=>window.lab.frame.storyNearbyPortal?.to===id,headland.arena);
 await canvas.screenshot({path:'evidence/natlan-tupu-headland-pillar.png'});
 await drive.cross(valley);

 await drive.warp(island);
 await guide(headland,'boat');
 await drive.cross(headland.approach);
 assert.equal((await drive.actor()).y,480);
 await climb([[536,414],[735,345]]);
 await drive.cross(headland.arena);
 await compare('tupu');
 await drive.cross(headland.approach);
 assert.equal((await drive.actor()).y,345);
 await drive.cross(island);
 await drive.warp('natlan-hub');
 await drive.report(quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-atocpan-totem-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,headlandAvailableFromLandAndFerry:true,
   trialReturnHeights:[480,345],questReported:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
