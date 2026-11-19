import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const encounters=[
 {host:'nat-wp-72438',stage:'tepeakak-sappho-bank',name:'sappho',walkTo:682,x:800,count:1},
 {host:'nat-wp-72432',stage:'witztli-tristars-camp',name:'tristars',walkTo:608,x:875,count:3},
];
const source='natlan-first-legend-poses-source-v1.png';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(16000);
const drive=waypointDriver(page,nodes);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push('Frame HTTP '+response.status());
});
const read=()=>page.evaluate(source=>{
 const f=window.lab.frame;
 return {t:f.t,boss:f.fieldBoss,commands:f.commands,sprites:f.draws.filter(draw=>draw.source===source).length};
},source);
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8987/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/natlan-first-fixture.json');
 await drive.waitNode('natlan-hub');
 const comparisons=[];
 for(const {host,stage,name,walkTo,x,count} of encounters){
  await drive.warp(host);
  await page.evaluate(()=>document.activeElement.blur());
  await page.keyboard.press('KeyM');
  const atlas=page.locator('#worldAtlas');
  await atlas.waitFor();
  await page.locator('#atlasLayer').selectOption('hunt');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
  await page.locator('#atlasField').selectOption(stage);
  await page.waitForFunction(stage=>Object.values(window.lab.frame.worldMap?.guide?.stops??{})[0]?.id===stage,stage);
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  await drive.cross(stage);
  await drive.walk(walkTo);
  await page.waitForFunction(x=>window.lab.frame.fieldBoss?.x===x,x);
  await pause(true);
  await page.evaluate(async source=>{
   const img=new Image();
   img.src='assets/'+source;
   await img.decode();
  },source);
  const png=await read();
  assert.equal(png.sprites,count);
  if(name==='sappho')assert.equal(png.boss.phase,'available');
  if(name==='tristars')assert.deepEqual(png.boss.bodies.map(body=>body.name),['氷銃','雷槌','炎銃']);
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
  if(name==='sappho'){
   await drive.walk(754);
   await page.keyboard.down('KeyJ');
   try{
    await page.waitForFunction(hp=>window.lab.frame.fieldBoss?.hp<hp,png.boss.hp);
   }finally{await page.keyboard.up('KeyJ');}
  }
  await drive.cross(host);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-first-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
