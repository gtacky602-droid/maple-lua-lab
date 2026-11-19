import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const encounters=[
 {name:'sigurd',host:'nod-wp-88148',path:'nod-bonemos-grave-path',arena:'nod-sigurd-grave-court',
  quest:'nod-bonemos-offerings',mode:'walk',returnY:480},
 {name:'crab-tsar',host:'nod-wp-88138',path:'nod-hiisi-mirror-court',arena:'nod-crab-tsar-palace',
  quest:'nod-hiisi-palace-mirrors',mode:'walk',returnY:409},
 {name:'raskolnikov',host:'nod-wp-88171',path:'nod-bureau-upper-lift-station',arena:'nod-raskolnikov-upper-ring',
  quest:'nod-bureau-lift-check',mode:'lift',returnY:407},
];
const source='nod-first-field-legend-poses-source-v1.png';
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
 if(status==='blocked')assert.match(await page.locator('#atlasItineraryNote').textContent(),/供え物|二つ|操作盤/);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}
async function approach(step){
 await drive.walk(step.x);
 await drive.changeHeight(step.y);
}
async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}
async function compare(name){
 await drive.walk(405);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.x===830);
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
 await page.locator('#importSave').setInputFiles('work/nod-first-field-legends-fixture.json');
 await drive.waitNode('nod-town');
 for(const encounter of encounters)await drive.accept(encounter.quest);

 for(const encounter of encounters){
  const {host,path,arena,quest,name}=encounter;
  const itinerary=graph.quests.find(q=>q.id===quest).itinerary;
  await drive.warp(host);
  await guide([[path,'walk'],[arena,encounter.mode]],'blocked');
  await drive.cross(path);
  if(name==='crab-tsar'){
   for(const [index,step] of itinerary.entries()){
    await approach(step);
    for(const face of step.reflect.faces.slice(0,step.reflect.align-1)){
     await page.keyboard.press('KeyG');
     await page.waitForFunction(label=>window.lab.frame.storyReflection?.orientation===label,face.label);
    }
    await page.keyboard.press('KeyG');
    await drive.count(quest,index+1);
   }
   await page.waitForFunction(()=>Object.values(window.lab.frame.platforms).some(p=>p.y===409&&p.x===1020&&p.moonDeck));
   await drive.walk(1280);
   await drive.changeHeight(409);
   await canvas.screenshot({path:'evidence/nod-crab-tsar-open-bridge.png'});
  }else{
   for(const [index,step] of itinerary.entries()){
    await approach(step);
    await page.keyboard.press('KeyG');
    await drive.count(quest,index+1);
   }
  }
  await guide([[arena,encounter.mode]]);
  if(name==='raskolnikov'){
   await Promise.all([
    drive.cross(arena),
    page.waitForFunction(()=>window.lab.frame.storyLift?.destination==='最上層への昇降機')
     .then(()=>page.locator('#storyLift').screenshot({path:'evidence/nod-raskolnikov-lift.png'})),
   ]);
  }else await drive.cross(arena);
  await compare(name);
  await drive.cross(path);
  assert.equal((await drive.actor()).y,encounter.returnY);
  await drive.cross(host);
 }
 await drive.warp('nod-town');
 for(const encounter of encounters)await drive.report(encounter.quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/nod-first-field-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,allQuestsReported:true,mirrorBridgeBuilt:true,
   upperLiftUsed:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
