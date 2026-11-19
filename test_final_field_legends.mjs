import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const source='final-field-legend-poses-source-v1.png';
const commanderSource='frost-commander-normal-idle-source-v1.png';
const dorn='dornman-camp', sky='nat-sky-camp', frost='frostmoon-camp';
const chur={anchor:'mond-wp-95792',trail:'dorn-shieldrol-lake-trail',arena:'dorn-churldric-cooking-camp'};
const maha={anchor:'nat-wp-96377',trail:'sky-sand-pavilion-walk',arena:'sky-maha-pavilion-court',quest:'sky-pavilion-notes'};
const prism={anchor:'frost-wp-99287',trail:'frost-wujian-south-trail',arena:'frost-prism-slime-basin',quest:'frost-wujian-access-survey'};
const musht={anchor:'frost-wp-99306',trail:'frost-ancient-moon-console',arena:'frost-mushteshir-inner-chamber',
 quest:'frost-commander-console-test',first:'frost-commander-first-wave',second:'frost-commander-second-wave'};
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

async function guide(region,stops,status,layer,filename){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.waitForFunction(region=>window.lab.frame.worldMap?.region===region,region);
 await page.locator('#atlasLayer').selectOption(layer);
 await page.waitForFunction(layer=>window.lab.frame.worldMap?.layer===layer,layer);
 assert.equal(await page.locator('#atlasField option').evaluateAll((options,id)=>
  options.some(option=>option.value===id),stops.at(-1)),true);
 await page.locator('#atlasLayer').selectOption('hunt');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='hunt');
 await page.locator('#atlasField').selectOption(stops.at(-1));
 await page.waitForFunction(({stops,status})=>{
  const world=window.lab.frame.worldMap;
  return world.guide?.status===status&&world.guide.stops?.map(leg=>leg.id).join()===stops.join();
 },{stops,status});
 if(filename)await atlas.screenshot({path:'evidence/final-legend-'+filename+'-map.png'});
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

async function compare(name){
 await drive.walk(485);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.hp>0);
 const read=()=>page.evaluate(source=>{
  const {t,fieldBoss,commands,draws}=window.lab.frame;
  const crops=draws.filter(draw=>draw.source===source).map(draw=>draw.box);
  return {t,fieldBoss,commands,crops};
 },source);
 await pause(true);
 const png=await read();
 assert.equal(png.crops.length,1);
 assert.ok(png.fieldBoss.hp>0);
 await page.evaluate(async source=>{
  const img=new Image();
  img.src='assets/'+source;
  await img.decode();
 },source);
 const mode=page.locator('#renderMode');
 await canvas.screenshot({path:'evidence/final-legend-'+name+'-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n+20,png.commands);
 const rectangles=await read();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n,rectangles.commands);
 const light=await read();
 assert.equal(light.t,png.t);
 assert.deepEqual(light.fieldBoss,png.fieldBoss);
 await canvas.screenshot({path:'evidence/final-legend-'+name+'-16colors.png'});
 comparisons.push({name,bodies:png.crops.length,pngCommands:png.commands,rectangleCommands:rectangles.commands,
  lightCommands:light.commands});
 await mode.selectOption('sprite');
 await pause(false);
}

async function wave(count){
 await page.waitForFunction(()=>window.lab.frame.total===2);
 const state=()=>page.evaluate(({id,commanderSource})=>{
  const f=window.lab.frame;
  const actor=f.actors.find(item=>item.id===f.active);
  const alive=f.draws.filter(draw=>draw.source===commanderSource).map(draw=>draw.x+(f.camera||0));
  alive.sort((a,b)=>Math.abs(a-actor.x)-Math.abs(b-actor.x));
  return {count:f.story.quests[id].count,x:actor.x,nearest:alive[0]};
 },{id:musht.quest,commanderSource});
 for(let retry=0;retry<12;retry++){
  const current=await state();
  if(current.count===count)return;
  const target=current.nearest;
  const aim=target===undefined?1050:target+(current.x<target?-42:42);
  await drive.walk(aim);
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(({id,count})=>window.lab.frame.story.quests[id]?.count===count,
    {id:musht.quest,count},{timeout:3500});
   return;
  }catch(error){
   if(error.name!=='TimeoutError')throw error;
  }finally{
   await page.keyboard.up('KeyJ');
  }
 }
 assert.equal((await state()).count,count);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/final-field-legends-fixture.json');
 await drive.waitNode(dorn);
 await drive.warp(chur.anchor);
 await guide('branch-06',[chur.trail,chur.arena],'ready','surface','chur');
 await drive.cross(chur.trail);
 await drive.cross(chur.arena);
 await compare('chur');
 await drive.cross(chur.trail);
 await drive.cross(chur.anchor);

 await drive.warp(sky);
 await drive.accept(maha.quest);
 await drive.warp(maha.anchor);
 await guide('official-area-14',[maha.trail,maha.arena],'blocked','surface','maha');
 await drive.cross(maha.trail);
 for(let step=0;step<3;step++)await collect(maha.quest,step);
 await drive.cross(maha.arena);
 await compare('maha');
 await drive.cross(maha.trail);
 await drive.cross(maha.anchor);
 assert.equal((await drive.actor()).y,365);
 await drive.warp(sky);
 await drive.report(maha.quest);

 await drive.warp(frost);
 await drive.accept(prism.quest);
 await collect(prism.quest,0);
 await drive.warp('frost-wp-99285');
 await collect(prism.quest,1);
 await drive.warp(frost);
 await drive.report(prism.quest);
 await drive.accept(musht.quest);
 await drive.warp(prism.anchor);
 await guide('official-area-15',[prism.trail,prism.arena],'ready','surface','prism');
 await drive.cross(prism.trail);
 await drive.cross(prism.arena);
 await compare('prism');
 await drive.cross(prism.trail);
 await drive.cross(prism.anchor);

 await drive.warp(musht.anchor);
 await guide('official-area-15',[musht.trail,musht.arena],'blocked','below','musht');
 await drive.cross(musht.trail);
 await collect(musht.quest,0);
 await drive.cross(musht.first);
 await page.waitForFunction(source=>window.lab.frame.draws.some(draw=>draw.source===source),commanderSource);
 await canvas.screenshot({path:'evidence/final-legend-normal-commanders.png'});
 await wave(2);
 await drive.cross(musht.trail);
 await collect(musht.quest,2);
 await drive.cross(musht.second);
 await wave(4);
 await drive.cross(musht.trail);
 await collect(musht.quest,4);
 await drive.cross(musht.arena);
 await compare('musht');
 await drive.cross(musht.trail);
 await drive.cross(musht.first);
 await page.waitForFunction(()=>window.lab.frame.total===0);
 await drive.cross(musht.trail);
 await drive.cross(musht.anchor);
 assert.equal((await drive.actor()).y,390);
 await drive.warp(frost);
 await drive.report(musht.quest);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/final-field-legends-browser.json',
  JSON.stringify({routes:drive.journeys,comparisons,consoleWavesPassed:true,waveStaysCleared:true,questsReported:true,errors},null,2)+'\n');
 console.log(JSON.stringify(comparisons));
}finally{
 await browser.close();
}
