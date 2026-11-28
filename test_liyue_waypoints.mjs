import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8963';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const byQuest=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const atlas=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const regions=Object.fromEntries(atlas.regions.flatMap(region=>region.points.map(p=>[p.id,region.id])));
const captures=process.env.LAB_LIYUE_CAPTURES||'evidence';
await fs.mkdir(captures,{recursive:true});
const errors=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
page.on('pageerror',e=>errors.push(e.message));
const driver=waypointDriver(page,nodes);
const {actor,walk,changeHeight,cross,warp,count,waitNode,accept,report,choices,waypointCount,journeys}=driver;

async function atlasGuide(target,screenshot){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 const region=regions[target];
 if(await page.locator('#atlasRegion').inputValue()!==region){
  await page.locator('#atlasRegion').selectOption(region);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.region===id,region);
 }
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,target);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 if(screenshot){
  await page.locator('#atlasItineraryStops').getByText(guide.stops[0].hint,{exact:false}).first().waitFor();
  await page.locator('#worldAtlas').screenshot({path:join(captures,screenshot)});
 }
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 return guide.stops;
}

async function followAtlas(target){
 const stops=await atlasGuide(target);
 for(const stop of stops)await cross(stop.id,stop.gateX);
 return stops.map(stop=>stop.id);
}

async function stoneLeg(target,mode,label,screenshot){
 const from=await driver.node();
 const route=await atlasGuide(target,screenshot);
 assert.equal(route.length,1);
 const [leg]=route;
 assert.deepEqual([leg.from,leg.id,leg.mode,leg.level],[from,target,mode,nodes[target].level]);
 assert.ok(leg.hint.includes(label),leg.hint);
 await cross(target,leg.gateX);
 return {from,to:target,mode,hint:leg.hint};
}

async function runQuest(id){
 const {hub,itinerary}=byQuest[id];
 await accept(id);
 for(const [i,step] of itinerary.entries()){
  if(step.kind==='arrive'){
   assert.equal(await driver.node(),step.from);
   await cross(step.node);
  }else{
   await walk(step.x);
   await changeHeight(step.y);
   await page.keyboard.press('KeyG');
  }
  await count(id,i+1);
  if(step.node==='liyue-wp-97'){
   await walk(nodes[step.node].waypoint.x+120);
   await page.locator('#game').screenshot({path:join(captures,'liyue-waypoint-statue.png')});
  }
 }
 if(await driver.node()!==hub)await warp(hub);
 await report(id);
 console.log('Reported '+id);
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/liyue-waypoint-browser-save.json');
 await waitNode('liyue-harbor');
 const {total,initial}=await page.evaluate(()=>{
  const f=window.lab.frame,pins=f.storyGraph.nodes.filter(n=>n.waypoint);
  return {total:pins.length,initial:pins.filter(n=>f.story.visited[n.id]).length};
 });
 assert.equal(await waypointCount.textContent(),`地図のワープ地点・神像 ${initial} / ${total}`);
 assert.equal(await choices.locator('option[value="liyue-wp-97"]').count(),0);

 await cross('liyue-wp-111');
 await cross('liyue-harbor');
 assert.equal((await actor()).y,350);
 await runQuest('liyue-mapped-east-shore');

 await cross('liyue-entry');
 await cross('chenyu-camp');
 await runQuest('liyue-mapped-hidden-cave');
 const west='liyue-wp-64826',chamber='liyue-wp-64849',shelf='liyue-wp-64827';
 await followAtlas(west);
 const stoneRoutes=[];
 stoneRoutes.push(await stoneLeg(chamber,'walk','西峰の石室へ続く横穴','liyue-stone-passage-atlas.png'));
 stoneRoutes.push(await stoneLeg(shelf,'lift','西峰の石棚へ上がる昇降機','liyue-stone-lift-atlas.png'));
 stoneRoutes.push(await stoneLeg(chamber,'lift','西峰の石室へ降りる昇降機'));
 stoneRoutes.push(await stoneLeg(west,'walk','西岸の道へ戻る横穴'));
 const groupsBeforeMine=await choices.locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));
 for(const name of ['モンド','璃月','沈玉の谷'])assert.ok(groupsBeforeMine.includes(name));
 await warp('liyue-harbor');

 await cross('liyue-field');
 await cross('chasm-camp');
 await runQuest('liyue-mapped-chasm-shaft');
 await cross('chasm-depth');
 await warp('liyue-harbor');
 await warp('chasm-depth');
 assert.equal((await actor()).x,nodes['chasm-depth'].waypoint.x);
 const labels=await choices.locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));
 for(const name of ['モンド','璃月','沈玉の谷','層岩巨淵・地下鉱区','層岩巨淵・地上'])assert.ok(labels.includes(name));
 const visited=await choices.locator('optgroup option').count();
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('chasm-camp');
 const reported=['liyue-mapped-east-shore','liyue-mapped-hidden-cave','liyue-mapped-chasm-shaft'];
 for(const id of reported){
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }
 assert.equal(await choices.locator('optgroup option').count(),visited);
 assert.deepEqual(errors,[]);
 await fs.writeFile(join(captures,'liyue-waypoint-browser.json'),JSON.stringify({
  total,visited,journeys,groups:labels,reported,stoneRoutes,restore:true,
  pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed both West Peak entrances, three reports, the Chasm shaft, mine warp and save reload.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
