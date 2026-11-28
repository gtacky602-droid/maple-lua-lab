import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8968';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const quests=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const atlas=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const regions=Object.fromEntries(atlas.regions.flatMap(region=>region.points.map(p=>[p.id,region.id])));
const harbor='nod-mapped-harbor-lamp',shadow='nod-mapped-paha-shadow';
const bay='nod-mapped-north-bay',frost='nod-mapped-frostmoon-shadow';
const shore='nod-wp-88162',lamp='nod-wp-88169',deep='nod-wp-88170';
const captures=process.env.LAB_NOD_CAPTURES||'evidence';
await fs.mkdir(captures,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const d=waypointDriver(page,nodes);
const {walk,changeHeight,actor,cross,warp,accept,report,count,choices,journeys,waitNode}=d;
const follow=async(...ids)=>{for(const id of ids)await cross(id)};
const light=mode=>page.waitForFunction(mode=>window.lab.frame.storyLocalLight?.mode===mode,mode);
const scenery=()=>page.evaluate(async()=>{
 const {sceneryStatus}=await import('./scenery.js');
 return sceneryStatus(window.lab.frame);
});

async function importCheckpoint(file,location){
 await page.locator('#importSave').setInputFiles(file);
 await page.waitForFunction(()=>{
  const input=document.querySelector('#importSave');
  return !input.disabled&&!input.value&&document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存しました');
 });
 await waitNode(location);
}

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
  await page.locator('#atlasItineraryStops').getByText(/操作盤でGを押して消灯し、影の足場へ/).first().waitFor();
  await page.locator('#worldAtlas').screenshot({path:join(captures,screenshot)});
 }
 await page.locator('#atlasClose').click();
 await page.waitForFunction(()=>!window.lab.frame.worldMap);
 return guide.stops;
}

async function surveyApproach(target){
 const stops=await atlasGuide(target);
 for(const stop of stops)await cross(stop.id,stop.gateX);
 return stops.map(stop=>stop.id);
}

async function verifyAndOpenGate(to,takePictures=false){
 const from=await d.node();
 const node=nodes[from];
 const edge=node.exits.find(e=>e.to===to);
 const bridge=node.localLight.bridge;
 const control=node.localLight.controls[0];
 await light('bright');
 const observable=()=>page.evaluate(({to,bridge})=>{
  const f=window.lab.frame;
  const matches=f.platforms.filter(p=>p.x===bridge.x&&p.y===bridge.y&&p.w===bridge.w);
  return {gate:f.storyPortals.some(g=>g.to===to),platform:matches.length===1};
 },{to,bridge});
 assert.deepEqual(await observable(),{gate:false,platform:false});
 assert.equal((await scenery()).key,'enkanLamp');
 const route=await atlasGuide(to,takePictures?'nod-waypoint-light-atlas.png':undefined);
 assert.equal(route.length,1);
 assert.match(route[0].hint,/操作盤でGを押して消灯し、影の足場へ/);
 if(takePictures){
  await walk(1160);
  await page.locator('#game').screenshot({path:join(captures,'nod-waypoint-light-on.png')});
 }
 await walk(control.x);
 await page.keyboard.press('KeyG');
 await light('dark');
 assert.deepEqual(await observable(),{gate:true,platform:true});
 assert.equal((await scenery()).key,'enkanLampDark');
 const darkRoute=await atlasGuide(to);
 assert.match(darkRoute[0].hint,/消灯中。影の足場へ/);
 if(takePictures){
  await walk(1160);
  await page.locator('#game').screenshot({path:join(captures,'nod-waypoint-light-off.png')});
 }
 await cross(to);
 assert.equal((await actor()).y,edge.arrivalY);
}

async function survey(id){
 const quest=quests[id];
 for(const [i,step] of quest.itinerary.entries()){
  if(step.kind==='inspect'){
   assert.equal(await d.node(),step.node);
   await walk(step.x);
   await changeHeight(step.y);
   await page.keyboard.press('KeyG');
  }else{
   assert.equal(await d.node(),step.from);
   const edge=nodes[step.from].exits.find(e=>e.to===step.node);
   if(edge.darkOnly)await verifyAndOpenGate(step.node,id===shadow);
   else await cross(step.node);
   if(nodes[step.node].localLight)await light('bright');
  }
  await count(id,i+1);
 }
 await warp(quest.hub);
 await report(id);
 console.log('Reported '+id);
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await importCheckpoint('work/nod-waypoint-entry-browser-save.json','nod-port');
 await accept(harbor);
 await survey(harbor);
 await warp('nod-town');
 await accept(shadow);
 const shadowApproach=await surveyApproach(shore);
 const shortcutVisible=()=>page.evaluate(([shore,deep])=>{
  const node=window.lab.frame.storyGraph.nodes.find(n=>n.id===shore);
  return node.exits.some(e=>e.to===deep);
 },[shore,deep]);
 assert.equal(await shortcutVisible(),false);
 const firstVisit=(await atlasGuide(deep)).map(stop=>stop.id);
 assert.deepEqual(firstVisit,[lamp,deep]);
 await survey(shadow);
 await warp(shore);
 assert.equal(await shortcutVisible(),true);
 const shortcut=await atlasGuide(deep);
 assert.deepEqual(shortcut.map(stop=>stop.id),[deep]);
 assert.match(shortcut[0].hint,/初回訪問後に通れる近道/);
 await cross(deep);
 await cross(shore);
 await follow('nod-wp-88168','nod-wp-92867','nod-north-harbor');
 await accept(bay);
 await survey(bay);
 await follow('nod-wp-92868','nod-wp-92870','nod-wp-92871','nod-wp-92872','nod-wp-99218','nod-wp-99223','nod-wp-99219');
 await cross('frostmoon-camp');
 await accept(frost);
 await follow('frost-wp-99282','frost-wp-99284','frost-wp-99285','frost-wp-99288','frost-wp-99291',
              'frost-wp-99293','frost-wp-99294','frost-wp-99297','frost-wp-99298','frost-wp-99308');
 await survey(frost);
 const groups=await choices.locator('optgroup').evaluateAll(g=>g.map(item=>item.label));
 for(const group of ['北東の円環島','霜月','霜月・別階層'])assert.ok(groups.includes(group));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('frostmoon-camp');
 const reported=[harbor,shadow,bay,frost];
 for(const id of reported)await page.waitForFunction(key=>window.lab.frame.story.quests[key]?.status==='complete',id);
 await warp('frost-wp-99311');
 await light('bright');
 await importCheckpoint('work/nod-waypoint-legacy-browser-save.json','nod-town');
 const legacy=await page.evaluate(()=>{
  const {story,storyGraph,weaponView}=window.lab.frame;
  return {location:story.node,oldQuest:story.quests['nod-rim-return']?.status,
   equipped:weaponView.traveler,hidden:!storyGraph.nodes.some(n=>n.id==='nod-quiet-rim')};
 });
 assert.deepEqual(legacy,{location:'nod-town',oldQuest:'complete',equipped:'SW08',hidden:true});
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 assert.equal(await page.locator('#atlasRegion option[value="branch-08"]').count(),0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(join(captures,'nod-waypoint-browser.json'),JSON.stringify({
  journeys,groups,reported,shadowApproach,firstVisit,afterVisitShortcut:shortcut.map(stop=>stop.id),
  shadowDoorAndPlatformHiddenUntilDark:true,backgroundChangesWithLamp:true,loadAndWarpRestoreBrightRoom:true,
  legacy,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed two dark gates, the visited shortcut, four reports, saved warp and the legacy migration.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 console.error('Last browser state:',await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,notice:f?.storyNotice,gate:f?.storyNearbyPortal,ride:f?.storyLift,
          status:document.querySelector('#status')?.textContent};
 }));
 throw error;
}finally{await browser.close()}
