import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const peakHost='nat-wp-82571',trail='atocpan-peak-rock-trail',peak='atocpan-peak-cave';
const coast='nat-wp-82564',domain='sites-hunt-82577',clearing='atocpan-domain-side-clearing';
const pair='atocpan-battlegoat-ironclaw-field',bay='nat-wp-85972',teno='zapabay-tenochtzitoc-shallows';
const quest='natlan-southern-trail-survey',source='natlan-final-legend-poses-source-v1.png';
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
 await page.locator('#atlasField').selectOption(stops.at(-1));
 await page.waitForFunction(stops=>{
  const guide=window.lab.frame.worldMap?.guide;
  return guide?.status==='ready'&&Object.values(guide.stops??{}).map(leg=>leg.id).join()===stops.join();
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
async function compare(name,members=[]){
 await drive.walk(members.length?384:405);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===845);
 await pause(true);
 const read=()=>page.evaluate(source=>{
  const f=window.lab.frame;
  return {t:f.t,boss:f.fieldBoss,commands:f.commands,sprites:f.draws.filter(d=>d.source===source).length};
 },source);
 const png=await read();
 assert.equal(png.sprites,members.length||1);
 if(members.length){
  const bodies=Object.values(png.boss.bodies);
  assert.deepEqual(bodies.map(body=>body.name),members);
  assert.equal(png.boss.hp,bodies.reduce((hp,body)=>hp+body.hp,0));
 }
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
 await page.locator('#importSave').setInputFiles('work/natlan-final-legends-fixture.json');
 await drive.waitNode('natlan-hub');
 await drive.accept(quest);
 await drive.warp(peakHost);
 await guide([trail,peak]);
 await drive.cross(trail);
 await climb([[526,412],[851,346]]);
 await collect(0);
 await drive.cross(peak);
 await compare('peak');
 await drive.cross(trail);
 assert.equal((await drive.actor()).y,346);
 await drive.cross(peakHost);

 await drive.warp(coast);
 await guide([clearing,pair]);
 await drive.cross(domain);
 await guide([clearing,pair]);
 await drive.cross(clearing);
 await collect(1);
 await drive.cross(pair);
 await compare('battlegoat-ironclaw',['戦羊','鉄爪']);
 await drive.cross(clearing);
 await drive.cross(coast);
 await drive.cross(clearing);
 await drive.cross(coast);

 await drive.warp(bay);
 await guide([teno]);
 await drive.cross(teno);
 assert.ok(await page.evaluate(()=>!window.lab.frame.storySwim));
 await compare('last-tenochtzitoc');
 await drive.cross(bay);
 assert.equal((await drive.actor()).y,419);
 await drive.warp('natlan-hub');
 await drive.report(quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-final-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,separateGroupHp:true,shallowGround:true,questReported:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
