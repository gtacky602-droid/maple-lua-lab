import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const quests=Object.fromEntries(graph.quests.map(quest=>[quest.id,quest]));
const base=process.env.LAB_URL||'http://127.0.0.1:19828/';
const output='work/earned-sumeru-frontier';
const [camp,hub,shelf,shaft,shelter]=['tunigi-camp','sumeru-hub','sum-wp-41838','sum-wp-41836','sum-wp-41835'];
const [water,wind,survey]=['sum-mapped-tunigi-water','sum-mapped-desert-wind','tunigi-survey'];
const [entry,fontaine,delivery]=['fontaine-entry','fontaine-hub','fontaine-moon-parcel'];
const browser=await chromium.launch({headless:true,channel:'chrome'});

const read=page=>page.evaluate(()=>window.lab.frame);
const questRow=(page,id)=>page.locator('[data-quest="'+id+'"]');
const pause=page=>page.locator('#pause').click();
const atlas=page=>page.locator('#worldAtlas');

async function run(seed,at,play){
 const page=await browser.newPage({viewport:{width:1300,height:970}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const drive=waypointDriver(page,nodes,{walkTimeout:25000});
 try{
  await page.goto(base);
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles(output+'/'+seed+'.json');
  await drive.waitNode(at);
  const result=await play(page,drive);
  assert.deepEqual(errors,[]);
  return result;
 }catch(error){
  const f=await read(page);
  const actor=f?.actors.find(a=>a.id===f.active);
  console.error(seed,{node:f?.story?.node,position:[actor?.x,actor?.y],paused:f?.paused,
   map:f?.worldMap?.selected?.id,notice:f?.storyNotice,portal:f?.storyNearbyPortal,journeys:drive.journeys});
  throw error;
 }finally{await page.close()}
}

async function checkpoint(page,drive,at,preserved){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await drive.waitNode(at);
 for(const id of preserved)assert.equal((await read(page)).story.quests[id].cycles,1);
}

async function inspect(page,drive,step,id,i){
 assert.equal(await drive.node(),step.node);
 await drive.walk(step.x-26);
 await drive.changeHeight(step.y??480);
 await page.keyboard.press('KeyG');
 await drive.count(id,i);
}

async function playWater(page,drive){
 assert.equal((await read(page)).progression.level,74);
 await drive.accept(water);
 await questRow(page,water).getByRole('button',{name:'この依頼を追跡'}).click();
 const steps=quests[water].itinerary;
 for(const [i,step] of steps.entries()){
  if(step.kind==='inspect')await inspect(page,drive,step,water,i+1);
  else{
   assert.equal(await drive.node(),step.from);
   if(step.node==='sum-wp-46523'){
    await page.locator('#trackedQuestMap').click();
    await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='sum-wp-46523');
    const route=(await read(page)).worldMap.guide;
    assert.deepEqual(route.stops.map(s=>[s.id,s.mode]),[['sum-wp-46523','lift']]);
    await atlas(page).screenshot({path:output+'/observation-lift-map.png'});
    await page.locator('#atlasClose').click();
    await atlas(page).waitFor({state:'hidden'});
   }
   await drive.cross(step.node);
   await drive.count(water,i+1);
  }
 }
 await drive.warp(camp);
 await drive.report(water);
 await drive.report(survey);
 await checkpoint(page,drive,camp,[water,survey]);
 assert.equal((await read(page)).progression.level,74);
 return {objectives:steps.length,crossings:drive.journeys,reloadedReports:[water,survey]};
}

async function windCapture(page,calm){
 const starts=calm?'弱風 残り':'風待ち ';
 await page.waitForFunction(({calm,starts})=>{
  const f=window.lab.frame, portal=f.storyNearbyPortal;
  if(f.paused||portal?.wind?.calm!==calm||portal.wind.seconds<.65||
     !f.draws.some(d=>d.kind==='text'&&d.text.startsWith(starts)))return false;
  window.lab.action('pause');
  return true;
 },{calm,starts},{timeout:18000});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const before=await read(page);
 const sign=f=>f.draws.find(d=>d.kind==='text'&&d.text.startsWith(starts));
 const marker=sign(before);
 assert.ok(marker&&before.storyNearbyPortal.wind.calm===calm);
 const png=before.commands,canvas=page.locator('#game');
 await canvas.screenshot({path:output+(calm?'/wind-calm.png':'/wind-wait.png')});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n*3,png);
 const standard=await read(page);
 await page.selectOption('#renderMode','h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.75,standard.commands);
 const light=await read(page);
 assert.deepEqual(sign(standard),marker);
 assert.deepEqual(sign(light),marker);
 assert.equal(light.t,before.t);
 await canvas.screenshot({path:output+(calm?'/wind-calm-light.png':'/wind-wait-light.png')});
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(n=>window.lab.frame.commands===n,png);
 await pause(page);
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {text:marker.text,png,standard:standard.commands,light:light.commands};
}

async function playWind(page,drive){
 assert.equal((await read(page)).progression.level,78);
 await drive.warp(shelter);
 await drive.cross(shelf);
 await drive.count(wind,1);
 const edge=nodes[shelf].exits.find(e=>e.to===shaft);
 await drive.walk(edge.x);
 await drive.changeHeight(edge.y);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.wind?.calm===false&&
  window.lab.frame.storyNearbyPortal.wind.seconds>1,{},{timeout:16000});
 assert.ok(await page.locator('#nearbyPortalGo').isDisabled());
 await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('風が弱まるまで'));
 assert.equal(await drive.node(),shelf);
 const closed=await windCapture(page,false);
 const open=await windCapture(page,true);
 await drive.cross(shaft);
 await drive.count(wind,2);
 await inspect(page,drive,quests[wind].itinerary[2],wind,3);
 await drive.cross(shelf);
 await drive.count(wind,4);
 await drive.warp(camp);
 await drive.report(wind);
 await checkpoint(page,drive,camp,[water,wind,survey]);
 await drive.warp(shaft);
 return {closed,open,crossings:drive.journeys,lowerLevelWaypointRestored:true};
}

async function crossFontaine(page,drive){
 const before=await read(page);
 assert.equal(before.progression.level,80);
 await page.locator('#game').click();
 await page.keyboard.press('KeyM');
 await atlas(page).waitFor();
 await page.locator('#atlasRegion').selectOption('region-05');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-05');
 await page.locator('#atlasField').selectOption(fontaine);
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='fontaine-hub');
 const {guide}=(await read(page)).worldMap;
 const route=guide.stops.map(stop=>[stop.id,stop.mode]);
 assert.equal(guide.status,'ready');
 assert.deepEqual(route,[['sumeru-field','walk'],[entry,'walk'],[fontaine,'walk']]);
 await atlas(page).screenshot({path:output+'/fontaine-route.png'});
 await page.locator('#atlasClose').click();
 await atlas(page).waitFor({state:'hidden'});
 for(const [node] of route)await drive.cross(node);
 await drive.accept(delivery);
 const arrival=await read(page);
 assert.equal(arrival.progression.level,80);
 await checkpoint(page,drive,fontaine,[water,wind,survey,'baptist-commission']);
 assert.equal((await read(page)).story.quests[delivery].status,'active');
 return {route,level:arrival.progression.level,accepted:delivery,restored:true};
}

try{
 const waterResult=await run('water-ready',camp,playWater);
 console.log('Water surveys reported and reloaded.');
 const windResult=await run('wind-ready',hub,playWind);
 console.log('Wind windows captured and shaft waypoint reloaded.');
 const fontaineResult=await run('fontaine-ready',hub,crossFontaine);
 await fs.writeFile('evidence/earned-sumeru-frontier-browser.json',JSON.stringify({
  water:waterResult,wind:windResult,fontaine:fontaineResult
 },null,2)+'\n');
 console.log('Chrome: water and wind surveys reported, wind sign matched in all profiles, Lv80 crossed and reloaded in Fontaine.');
}finally{await browser.close()}
