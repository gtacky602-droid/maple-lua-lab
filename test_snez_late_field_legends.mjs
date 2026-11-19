import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const source='snez-late-field-legend-poses-source-v1.png';
const routesOnly=process.argv.includes('--routes-only');
const snow='snezhnaya-hub', camp='novokichev-camp';
const mouse={host:'sne-wp-106194',path:'sne-merciful-fissure',arena:'sne-ancient-mouse-den',quest:'sne-rescue-three-mice'};
const tree={host:'sne-wp-106186',junction:'sne-crystal-mining-junction',path:'sne-crystal-prism-gallery',
 arena:'sne-crystal-tree-refuge',quest:'sne-crystal-stream-survey'};
const beasts={path:'sne-novokichev-lantern-alley',arena:'sne-novokichev-ore-yard',quest:'sne-suspicious-lantern'};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(18000);
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const canvas=page.locator('#game');
const comparisons=[], errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push('Frame HTTP '+response.status());
});

async function guide(region,stops,status,filename){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.waitForFunction(region=>window.lab.frame.worldMap?.region===region,region);
 await page.locator('#atlasLayer').selectOption('below');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='below');
 assert.equal(await page.locator('#atlasField option').evaluateAll((options,id)=>
  options.some(option=>option.value===id),stops.at(-1)),true);
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(stops.at(-1));
 await page.waitForFunction(({stops,status})=>{
  const world=window.lab.frame.worldMap;
  return world.guide?.status===status&&world.guide.stops?.map(leg=>leg.id).join()===stops.join();
 },{stops,status});
 if(filename&&!routesOnly)await atlas.screenshot({path:'evidence/snez-late-'+filename+'-map.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function collect(quest,index){
 const step=graph.quests.find(item=>item.id===quest).itinerary[index];
 await drive.walk(step.x);
 await drive.changeHeight(step.y);
 await page.keyboard.press('KeyG');
 await drive.count(quest,index+1);
}

async function pause(value){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function compare(name,expectedNames=[]){
 await drive.walk(expectedNames.length ? 650 : 525);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.hp>0);
 const read=()=>page.evaluate(source=>{
  const {t,fieldBoss,commands,draws}=window.lab.frame;
  const crops=draws.filter(draw=>draw.source===source).map(draw=>draw.box);
  return {t,fieldBoss,commands,crops};
 },source);
 if(routesOnly){
  const {fieldBoss}=await read();
  assert.deepEqual(fieldBoss.bodies?.map(body=>body.name)??[],expectedNames);
  return;
 }
 await pause(true);
 const png=await read();
 assert.deepEqual(png.fieldBoss.bodies?.map(body=>body.name)??[],expectedNames);
 assert.equal(png.crops.length,expectedNames.length||1);
 assert.equal(new Set(png.crops.map(crop=>crop.join())).size,png.crops.length);
 assert.ok((png.fieldBoss.bodies??[png.fieldBoss]).every(body=>body.hp>0));
 await page.evaluate(async source=>{
  const img=new Image();
  img.src='assets/'+source;
  await img.decode();
 },source);
 const mode=page.locator('#renderMode');
 await canvas.screenshot({path:'evidence/snez-late-'+name+'-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+20,png.commands);
 const rectangles=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,rectangles.commands);
 const light=await read();
 assert.equal(light.t,png.t);
 assert.deepEqual(light.fieldBoss,png.fieldBoss);
 await canvas.screenshot({path:'evidence/snez-late-'+name+'-16colors.png'});
 comparisons.push({name,bodies:png.crops.length,pngCommands:png.commands,rectangleCommands:rectangles.commands,
  lightCommands:light.commands});
 await mode.selectOption('sprite');
 await pause(false);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/snez-late-field-legends-fixture.json');
 await drive.waitNode(snow);
 await drive.accept(mouse.quest);
 await drive.warp(mouse.host);
 await guide('region-08',[mouse.path,mouse.arena],'blocked','mouse');
 await drive.cross(mouse.path);
 for(let step=0;step<4;step++)await collect(mouse.quest,step);
 await drive.cross(mouse.arena);
 await compare('mouse');
 await drive.cross(mouse.path);
 assert.equal((await drive.actor()).y,393);
 await drive.cross(mouse.host);
 await drive.warp(snow);
 await drive.report(mouse.quest);

 await drive.warp(camp);
 await drive.accept(tree.quest);
 await drive.accept(beasts.quest);
 await drive.warp(tree.host);
 await guide('branch-09',[tree.junction,tree.path,tree.arena],'blocked','tree');
 await drive.cross(tree.junction);
 await collect(tree.quest,0);
 await drive.cross(tree.path);
 await collect(tree.quest,1);
 await drive.cross(tree.arena);
 await compare('tree');
 await drive.cross(tree.path);
 await drive.cross(tree.junction);
 await guide('branch-09',[beasts.path,beasts.arena],'blocked','beasts');
 await drive.cross(beasts.path);
 for(let step=0;step<2;step++)await collect(beasts.quest,step);
 await drive.cross(beasts.arena);
 await compare('beasts',['スタヴローギン','バルバラ','ヴェルホヴェンスキー']);
 await drive.cross(beasts.path);
 assert.equal((await drive.actor()).y,405);
 await drive.cross(tree.junction);
 await drive.cross(tree.host);
 assert.equal((await drive.actor()).y,344);
 await drive.warp(camp);
 await drive.report(tree.quest);
 await drive.report(beasts.quest);
 assert.deepEqual(errors,[]);
 if(!routesOnly)await fs.writeFile('evidence/snez-late-field-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,undergroundMapLayer:true,questsReported:true,errors},null,2)+'\n');
 console.log(routesOnly?'Three Snezhnaya routes, underground atlas, group names, and quest reports passed':JSON.stringify(comparisons));
}finally{
 await browser.close();
}
