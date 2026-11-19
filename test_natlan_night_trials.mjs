import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const paths=[
 {host:'nat-wp-72417',approach:'temple-east-totem-pond',arena:'night-trial-undead',name:'undead',label:'アンデッド'},
 {host:'nat-wp-72416',approach:'temple-northwest-totem-ravine',arena:'night-trial-chimalli',name:'chimalli',label:'シェマリの陰'},
];
const source='natlan-night-trial-poses-source-v1.png';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(16000);
const drive=waypointDriver(page,nodes);
const errors=[],comparisons=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push('Frame HTTP '+response.status());
});

const read=()=>page.evaluate(source=>{
 const f=window.lab.frame;
 return {t:f.t,boss:f.fieldBoss,portal:f.storyNearbyPortal,commands:f.commands,
  spriteRows:f.draws.filter(draw=>draw.source===source).map(draw=>Math.floor(draw.box[1]/144))};
},source);
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function guide({approach,arena}){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(arena);
 await page.waitForFunction(([approach,arena])=>{
  const route=window.lab.frame.worldMap?.guide;
  const legs=Object.values(route?.stops??{});
  return route?.status==='ready'&&legs.length===2&&legs[0].id===approach&&legs[1].id===arena&&
   legs[1].mode==='night'&&legs[1].label==='黒曜石の柱';
 },[approach,arena]);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function compare(name){
 await drive.walk(635);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===845);
 await pause(true);
 const png=await read();
 assert.deepEqual(png.spriteRows.filter(row=>row!==2),[name==='undead'?0:1]);
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
 await page.locator('#importSave').setInputFiles('work/natlan-night-trial-fixture.json');
 await drive.waitNode('natlan-hub');
 for(const path of paths){
  await drive.warp(path.host);
  await guide(path);
  await drive.cross(path.approach);
  const entrance=nodes[path.approach].exits.find(edge=>edge.to===path.arena);
  await drive.walk(entrance.x-55);
  await page.waitForFunction(arena=>window.lab.frame.storyNearbyPortal?.to===arena,path.arena);
  const entranceFrame=await read();
  assert.deepEqual(entranceFrame.spriteRows,[2]);
  assert.equal(entranceFrame.portal.name,'柱に触れる・'+path.label);
  if(path.name==='undead'){
   await page.evaluate(async source=>{
    const img=new Image();img.src='assets/'+source;await img.decode();
   },source);
   await page.locator('#game').screenshot({path:'evidence/natlan-night-trial-totem.png'});
  }
  await drive.cross(path.arena);
  await compare(path.name);
  await drive.cross(path.approach);
  assert.equal(Math.round((await drive.actor()).x),entrance.x);
  await drive.cross(path.host);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-night-trials-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,twoObsidianPortals:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
