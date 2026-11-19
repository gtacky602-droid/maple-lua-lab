import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const mand={host:'nod-wp-92875',path:'nod-pyramid-seaward-steps',arena:'nod-mandragora-cliff-foot'};
const hilt={host:'nod-wp-92879',path:'nod-wind-fort-peninsula',arena:'nod-hiljetta-peninsula-camp'};
const wolf={host:'nod-wp-92889',path:'nod-aamsvaltnir-east-ridge',arena:'nod-homesick-wolf-lakeland'};
const alternate='nod-wp-92880',quest='nod-north-landmark-round';
const paths=graph.quests.find(q=>q.id===quest).paths;
const source='nod-north-field-legend-poses-source-v1.png';
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

async function guide(stops){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(stops.at(-1)[0]);
 await page.waitForFunction(stops=>{
  const guide=window.lab.frame.worldMap?.guide;
  return guide?.status==='ready'&&JSON.stringify(Object.values(guide.stops??{}).map(leg=>[leg.id,leg.mode]))===JSON.stringify(stops);
 },stops);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}
async function climb(shelves){
 for(const [x,y] of shelves){
  await drive.walk(x);
  await drive.changeHeight(y);
 }
}
async function survey(path){
 const step=paths.find(item=>item.id===path).steps[0];
 await drive.walk(step.x);
 await drive.changeHeight(step.y);
 await page.keyboard.press('KeyG');
 await page.waitForFunction(([quest,path])=>window.lab.frame.story.quests[quest]?.pathProgress[path]?.count===1,[quest,path]);
}
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function compare(name){
 await drive.walk(405);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===825);
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
 await canvas.screenshot({path:'evidence/nod-'+name+'-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+20,png.commands);
 const full=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,full.commands);
 const light=await read();
 assert.equal(light.t,png.t);
 assert.deepEqual(light.boss,png.boss);
 await canvas.screenshot({path:'evidence/nod-'+name+'-16colors.png'});
 comparisons.push({name,pngCommands:png.commands,rectangleCommands:full.commands,lightCommands:light.commands});
 await mode.selectOption('sprite');
 await pause(false);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/nod-north-field-legends-fixture.json');
 await drive.waitNode('nod-north-harbor');
 await drive.accept(quest);
 await drive.warp(wolf.host);
 await guide([[wolf.path,'walk'],[wolf.arena,'walk']]);
 await drive.cross(wolf.path);
 await drive.walk(1360);
 assert.equal((await drive.actor()).y,480);
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),wolf.path);
 await climb([[570,412],[836,345]]);
 await survey('ridge');
 await drive.cross(wolf.arena);
 await compare('homesick-wolf');
 await drive.cross(wolf.path);
 assert.equal((await drive.actor()).y,345);
 await drive.cross(wolf.host);

 await drive.warp(alternate);
 await guide([[hilt.path,'walk'],[hilt.arena,'walk']]);
 await drive.cross(hilt.path);
 await survey('peninsula');
 await drive.cross(hilt.arena);
 await compare('hiljetta');
 await drive.cross(hilt.path);
 await drive.cross(hilt.host);
 assert.equal((await drive.actor()).y,410);
 await guide([[hilt.path,'walk'],[hilt.arena,'walk']]);

 await drive.warp(mand.host);
 await guide([[mand.path,'walk'],[mand.arena,'walk']]);
 await drive.cross(mand.path);
 assert.equal((await drive.actor()).y,340);
 await drive.walk(596);
 await drive.changeHeight(411);
 await survey('coast');
 await drive.count(quest,1);
 await drive.cross(mand.arena);
 await compare('mandragora');
 await drive.cross(mand.path);
 await climb([[640,411],[365,340]]);
 await drive.cross(mand.host);
 assert.equal((await drive.actor()).y,403);

 await drive.warp('nod-north-harbor');
 await drive.report(quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/nod-north-field-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,surveyOrder:['ridge','peninsula','coast'],
   lowerAndUpperPaths:true,twoPeninsulaGuides:true,questReported:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
