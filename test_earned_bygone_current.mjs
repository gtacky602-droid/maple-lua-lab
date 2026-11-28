import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const hub='fontaine-hub',camp='bygone-camp',cave='bygone-depth',pier='bygone-waterway-pier';
const west='bygone-wp-68604',east='bygone-wp-68605';
const visit='bygone-survey',current='fon-mapped-bygone-current';
const output='work/earned-bygone-current';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const d=waypointDriver(page,nodes), swimHelp=page.locator('#fieldSwimHelp');
const frame=()=>page.evaluate(()=>window.lab.frame);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function guide(target){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 const region=page.locator('#atlasRegion');
 if(await region.inputValue()!=='branch-05'){
  await region.selectOption('branch-05');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='branch-05');
 }
 await page.locator('#atlasLayer').selectOption('all');
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(target=>window.lab.frame.worldMap?.selected?.id===target,target);
 const result=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 return result;
}

async function depthGate(from,to,y,direction,label){
 const edge=nodes[from].exits.find(row=>row.to===to);
 await d.walk(edge.x);
 await d.changeHeight(y);
 await page.waitForFunction(to=>window.lab.frame.storySwimGate?.to===to,to);
 const {storySwimGate:hint}=await frame();
 assert.deepEqual([hint.name,hint.direction],[label,direction]);
 assert.ok((await swimHelp.textContent()).includes(label+'へは'+(direction==='up'?'浮上':'潜水')));
 await page.locator('.game').screenshot({path:output+'/'+direction+'-gate.png'});
 await page.keyboard.press('KeyF');
 assert.equal(await d.node(),from);
 const route=await guide(to);
 assert.equal(route.status,'ready');
 assert.equal(route.stops.length,1);
 assert.ok(route.stops[0].hint.includes(label));
 await d.cross(to);
 assert.equal(await page.evaluate(()=>window.lab.frame.storySwimGate??null),null);
 return {from,to,direction,label,atlas:route.stops[0].hint};
}

async function compareStoneBridge(){
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame();
 const canvas=page.locator('#game'), mode=page.locator('#renderMode');
 await canvas.screenshot({path:output+'/stone-bridge-png.png'});
 await mode.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await mode.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t, light.t],[png.t,png.t]);
 assert.deepEqual(light.story.quests[current],png.story.quests[current]);
 await canvas.screenshot({path:output+'/stone-bridge-light.png'});
 await mode.selectOption('sprite');
 await page.waitForFunction(n=>window.lab.frame.commands===n,png.commands);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:19832/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(output+'/bygone-ready.json');
 await d.waitNode(hub);
 assert.equal((await frame()).progression.level,92);
 const entry=await guide(camp);
 assert.deepEqual(entry.stops.map(leg=>leg.id),['fontaine-field',camp]);
 for(const leg of entry.stops)await d.cross(leg.id,leg.gateX);
 await d.walk(nodes[camp].exits.find(edge=>edge.to===pier).x);
 await page.waitForFunction(pier=>window.lab.frame.storyNearbyPortal?.to===pier,pier);
 assert.equal((await frame()).storyNearbyPortal.reason,'必要レベル 148');
 assert.equal((await guide(pier)).reason,'必要Lv148');

 await d.accept(visit);
 await d.accept(current);
 await d.cross(cave);
 await d.count(visit,1);
 await d.count(current,1);
 await d.cross(west);
 await d.count(current,2);
 const gates=[await depthGate(west,east,345,'up','東海の石橋へ続く上の門')];
 await d.count(current,3);
 const step=graph.quests.find(q=>q.id===current).itinerary[3];
 await d.walk(step.x);
 await d.changeHeight(step.y);
 await page.keyboard.press('KeyG');
 await d.count(current,4);
 const compression=await compareStoneBridge();
 gates.push(await depthGate(east,west,264,'down','西海の峡谷へ戻る下の門'));
 await d.count(current,5);
 await d.cross(cave);
 await d.cross(camp);
 const before=await frame();
 await d.report(visit);
 await d.report(current);
 const after=await frame();
 assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],[171500,14350]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await d.waitNode(camp);
 assert.ok([visit,current].every(q=>after.story.quests[q].status==='complete'));
 const restored=await frame();
 assert.ok([visit,current].every(q=>restored.story.quests[q]?.status==='complete'));
 await d.warp(east);
 assert.equal((await d.actor()).y,nodes[east].waypoint.y);
 await swimHelp.waitFor();
 await d.warp(camp);
 await swimHelp.waitFor({state:'hidden'});
 assert.equal((await frame()).returns,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/earned-bygone-current-browser.json',JSON.stringify({
  level:after.progression.level,reported:[visit,current],lockedLateGate:148,
  gates,journeys:d.journeys,compression,restoredUnderwaterWarp:true,errors
 },null,2)+'\n');
 console.log('Earned Bygone survey and current reported and reloaded in Chrome.');
} catch(error) {
 console.error('Completed crossings',d.journeys);
 console.error(await page.evaluate(()=>({story:window.lab?.frame.story.node,gate:window.lab?.frame.storyNearbyPortal,swim:window.lab?.frame.storySwimGate})));
 throw error;
} finally {
 await browser.close();
}
