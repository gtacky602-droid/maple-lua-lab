import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const atlas=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const quests=Object.fromEntries(graph.quests.map(quest=>[quest.id,quest]));
const hub='fontaine-hub', outside='fon-wp-55765', tower='morte-tower-sluice';
const workshop='fon-wp-55784', root='erinnyes-root-waterway';
const morte='fon-morte-sluice-survey', erinnyes='fon-erinnyes-root-water-survey';
const bubbles='chassanion-legend-bubble-room', cleft='erinnyes-corrouge-cleft';
const source='work/earned-fontaine-acts/acts-browser-complete.json';
const output='work/earned-fontaine-waterworks';
await fs.mkdir(output,{recursive:true});

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const drive=waypointDriver(page,nodes);
const frame=()=>page.evaluate(()=>window.lab.frame);
const errors=[],depths=[];
page.on('pageerror',error=>errors.push(error.message));

async function guide(target,layer='all'){
 const region=atlas.regions.find(r=>r.points.some(point=>point.id===target)).id;
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 if(await page.locator('#atlasRegion').inputValue()!==region){
  await page.locator('#atlasRegion').selectOption(region);
  await page.waitForFunction(region=>window.lab.frame.worldMap?.region===region,region);
 }
 await page.locator('#atlasLayer').selectOption(layer);
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(target=>window.lab.frame.worldMap?.selected?.id===target,target);
 const planned=(await frame()).worldMap.guide;
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 return planned;
}

async function travel(target){
 const planned=await guide(target);
 assert.equal(planned.status,'ready');
 for(const leg of planned.stops)await drive.cross(leg.id,leg.gateX);
}

async function locked(target,fragment){
 const origin=await drive.node();
 const edge=nodes[origin].exits.find(edge=>edge.to===target);
 await drive.walk(edge.x);
 await drive.changeHeight(edge.y??480);
 await page.waitForFunction(target=>window.lab.frame.storyNearbyPortal?.to===target,target);
 const portal=(await frame()).storyNearbyPortal;
 assert.ok(!portal.available&&portal.reason.includes(fragment),JSON.stringify(portal));
 await page.keyboard.press('KeyF');
 assert.equal(await drive.node(),origin);
}

async function inspect(quest,index,offset){
 const step=quests[quest].itinerary[index-1];
 await drive.walk(step.x);
 if(offset!==undefined){
  await drive.changeHeight(step.y+offset);
  const direction=offset>0?'up':'down';
  const expectation={objective:step.objective,direction};
  await page.waitForFunction(({objective,direction})=>{
   const hint=window.lab.frame.storySwimInstrument;
   return hint?.objective===objective&&hint.direction===direction;
  },expectation);
  const message=await page.locator('#fieldSwimHelp').textContent();
  assert.ok(message.endsWith(step.objective+'には'+(offset>0?'浮上':'潜水')));
  await page.keyboard.press('KeyG');
  await drive.count(quest,index-1);
  depths.push({quest,index,direction,message});
  if(step.waterInstrument==='gauge'||step.waterInstrument==='temperature'){
   await page.locator('.game').screenshot({path:output+'/'+step.waterInstrument+'-approach.png'});
  }
 }
 await drive.changeHeight(step.y);
 await page.waitForFunction(label=>window.lab.frame.storyNearbyMilestone?.label===label,step.label);
 assert.equal((await frame()).storySwimInstrument,undefined);
 await page.keyboard.press('KeyG');
 await drive.count(quest,index);
}

async function compare(){
 const menu=page.locator('#renderMode'),canvas=page.locator('#game');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame();
 await canvas.screenshot({path:output+'/morte-valve-png.png'});
 await menu.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame();
 await canvas.screenshot({path:output+'/morte-valve-light.png'});
 assert.deepEqual([standard.t,light.t],[png.t,png.t]);
 assert.deepEqual(light.story.quests[morte],png.story.quests[morte]);
 await menu.selectOption('sprite');
 await page.waitForFunction(n=>window.lab.frame.commands===n,png.commands);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function reload(){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 await drive.waitNode(hub);
}

async function entrance(target,expected){
 const plan=await guide(target,'hunt');
 assert.equal(plan.reason,'必要Lv100');
 assert.deepEqual([plan.stops.at(-1).from,plan.stops.at(-1).id],[expected,target]);
 return expected;
}

async function reportQuest(id){
 const before=await frame();
 await drive.report(id);
 const after=await frame();
 const payout={xp:after.progression.questXp-before.progression.questXp,mora:after.mora-before.mora};
 assert.deepEqual(payout,{xp:quests[id].xp,mora:quests[id].mora});
 return payout;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:19834/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(source);
 await drive.waitNode(hub);
 const start=await frame();
 assert.equal(start.progression.level,94);
 assert.equal(start.story.quests[morte].status,'active');

 await travel(outside);
 await locked(tower,'開通まで 0/1');
 const routeBefore=await entrance(bubbles,outside);
 await inspect(morte,1,-76);
 await reload();
 await drive.count(morte,1);
 await drive.warp(outside);
 await drive.cross(tower);
 await drive.count(morte,2);
 await inspect(morte,3,79);
 const compression=await compare();
 await drive.cross(outside);
 await drive.count(morte,4);
 await drive.warp(hub);
 const mortePayout=await reportQuest(morte);
 await reload();
 await drive.warp(outside);
 const routeAfter=await entrance(bubbles,tower);
 await drive.cross(tower);
 await locked(bubbles,'必要レベル 100');
 await drive.cross(outside);
 await drive.warp(hub);
 console.log('Morte report restored and the bubble-room approach moved inside the tower.');

 await drive.accept(erinnyes);
 await travel(workshop);
 await locked(root,'開通まで 0/1');
 await inspect(erinnyes,1);
 await drive.cross(root);
 await drive.count(erinnyes,2);
 await inspect(erinnyes,3,-80);
 await inspect(erinnyes,4,83);
 await drive.cross(workshop);
 await drive.count(erinnyes,5);
 await drive.warp(hub);
 const erinnyesPayout=await reportQuest(erinnyes);
 await reload();
 await drive.warp(workshop);
 await drive.cross(root);
 const rootApproach=await entrance(cleft,root);
 await locked(cleft,'必要レベル 100');
 await drive.cross(workshop);
 await drive.warp(hub);
 const end=await frame();
 assert.ok([morte,erinnyes].every(id=>end.story.quests[id].status==='complete'));
 assert.equal(end.returns,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/earned-fontaine-waterworks-browser.json',JSON.stringify({
  source,endLevel:end.progression.level,depths,compression,journeys:drive.journeys,
  routeBefore,routeAfter,rootApproach,reportAfterReload:true,
  payouts:{[morte]:mortePayout,[erinnyes]:erinnyesPayout},errors
 },null,2)+'\n');
 console.log('Both earned waterworks reports, depths, waterways and Lv100 entrance locks verified.');
}catch(error){
 console.error('Last crossings:',drive.journeys);
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame.story.node,gate:window.lab?.frame.storyNearbyPortal,
  note:window.lab?.frame.storyNotice,instrument:window.lab?.frame.storySwimInstrument
 })));
 throw error;
}finally{
 await browser.close();
}
