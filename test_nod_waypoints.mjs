import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8968';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const id='nod-mapped-frostmoon-shadow';
const quest=graph.quests.find(q=>q.id===id);
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const d=waypointDriver(page,nodes);
const {walk,actor,cross,warp,accept,report,count,choices,journeys,waitNode}=d;
const follow=async(...ids)=>{for(const id of ids)await cross(id)};
const light=mode=>page.waitForFunction(mode=>window.lab.frame.storyLocalLight?.mode===mode,mode);
const scenery=()=>page.evaluate(async()=>{
 const {sceneryStatus}=await import('./scenery.js');
 return sceneryStatus(window.lab.frame);
});

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
 if(takePictures){
  await walk(1160);
  await page.locator('#game').screenshot({path:'evidence/nod-waypoint-light-on.png'});
 }
 await walk(control.x);
 await page.keyboard.press('KeyG');
 await light('dark');
 assert.deepEqual(await observable(),{gate:true,platform:true});
 assert.equal((await scenery()).key,'enkanLampDark');
 if(takePictures){
  await walk(1160);
  await page.locator('#game').screenshot({path:'evidence/nod-waypoint-light-off.png'});
 }
 await cross(to);
 assert.equal((await actor()).y,edge.arrivalY);
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/nod-waypoint-browser-save.json');
 await waitNode('nod-north-harbor');
 await warp('nod-wp-88169');
 await verifyAndOpenGate('nod-wp-88170',true);
 await cross('nod-wp-88169');
 await light('bright');

 await warp('nod-wp-99219');
 await cross('frostmoon-camp');
 await accept(id);
 await follow('frost-wp-99282','frost-wp-99284','frost-wp-99285','frost-wp-99288','frost-wp-99291',
              'frost-wp-99293','frost-wp-99294','frost-wp-99297','frost-wp-99298','frost-wp-99308');
 for(const [i,step] of quest.itinerary.entries()){
  if(step.kind==='inspect'){
   await walk(step.x);
   await page.keyboard.press('KeyG');
  }else if(step.node==='frost-wp-99312'){
   await verifyAndOpenGate(step.node);
  }else await cross(step.node);
  await count(id,i+1);
 }
 await light('bright');
 await warp('frostmoon-camp');
 await report(id);
 const groups=await choices.locator('optgroup').evaluateAll(g=>g.map(item=>item.label));
 for(const group of ['北東の円環島','霜月','霜月・別階層'])assert.ok(groups.includes(group));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('frostmoon-camp');
 await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 await warp('frost-wp-99311');
 await light('bright');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/nod-waypoint-browser.json',JSON.stringify({
  journeys,groups,frostmoonQuest:id,shadowDoorAndPlatformHiddenUntilDark:true,
  backgroundChangesWithLamp:true,loadAndWarpRestoreBrightRoom:true,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed the two dark gates, Frostmoon transfer, quest report and saved warp.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 console.error('Last browser state:',await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,notice:f?.storyNotice,gate:f?.storyNearbyPortal,ride:f?.storyLift,
          status:document.querySelector('#status')?.textContent};
 }));
 throw error;
}finally{await browser.close()}
