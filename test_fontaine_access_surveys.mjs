import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const chart=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const cases=[
 ['fon-hidden-lab-access','deianeira-legend-lab'],
 ['fon-beryl-thermal-vents','iron-viscount-legend-pool'],
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const errors=[];
const frame=()=>page.evaluate(()=>window.lab.frame);
const atlas=page.locator('#worldAtlas');
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

async function routeTo(destination){
 const region=chart.regions.find(row=>row.points.some(point=>point.id===destination)).id;
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption(region);
 await page.locator('#atlasField').selectOption(destination);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,destination);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 return guide;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9069/');
 await page.waitForFunction(()=>window.lab?.frame);
 const result={};
 for(const [id,arena] of cases){
  const quest=graph.quests.find(q=>q.id===id);
  const first=quest.itinerary[0],anchor=first.from??first.node;
  await page.locator('#importSave').setInputFiles(`work/${id}-ready.json`);
  await drive.waitNode(quest.hub);
  await drive.count(id,0);
  await drive.warp(anchor);
  for(const [index,step] of quest.itinerary.entries()){
   if(step.kind==='arrive')await drive.cross(step.node);
   else{
    await drive.walk(step.x);
    await drive.changeHeight(step.y);
    await page.keyboard.press('KeyG');
   }
   await drive.count(id,index+1);
  }
  const locked=await routeTo(arena);
  assert.equal(locked.status,'blocked');
  assert.match(locked.reason,/報告/);

  await drive.warp(quest.hub);
  const before=await frame();
  await drive.report(id);
  const after=await frame();
  assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],[quest.xp,quest.mora]);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(id=>{
   const checkpoint=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
   return checkpoint?.story.quests[id]?.status==='complete';
  },id);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開'));
  await drive.warp(anchor);
  const guide=await routeTo(arena);
  assert.equal(guide.status,'ready');
  for(const stop of guide.stops)await drive.cross(stop.id);
  assert.equal(await drive.node(),arena);
  await drive.cross(guide.stops.at(-1).from);
  result[id]={steps:quest.goal,arena,requiredReport:true,openedAfterReload:true,payoutXp:quest.xp,payoutMora:quest.mora};
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/fontaine-access-surveys-browser.json',JSON.stringify({cases:result,errors},null,2)+'\n');
 console.log('Both Fontaine surveys, depths, reports, reload and arena returns passed in Chrome.');
}catch(error){
 console.error(await page.evaluate(()=>({
  state:window.lab?.frame?.story?.node,gate:window.lab?.frame?.storyNearbyPortal,
  guide:window.lab?.frame?.worldMap?.guide,save:document.querySelector('#saveStatus')?.textContent,
 })));
 throw error;
}finally{
 await browser.close();
}
