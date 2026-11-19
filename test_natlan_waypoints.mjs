import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8967';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const quests=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const mountain='nat-mapped-mountain-layers',sky='nat-mapped-sky-lift';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const d=waypointDriver(page,nodes);
const {actor,walk,changeHeight,cross,warp,accept,report,count,choices,journeys,waitNode}=d;
const follow=async(...ids)=>{for(const id of ids)await cross(id)};

async function survey(id){
 const {hub,itinerary}=quests[id];
 for(const [i,step] of itinerary.entries()){
  if(step.kind==='arrive'){
   assert.equal(await d.node(),step.from);
   if(step.from==='nat-wp-96376'&&step.node==='nat-wp-96375'){
    assert.equal((await actor()).y,480);
    await walk(760);
    await changeHeight(390);
    assert.equal((await actor()).y,390);
   }
   await cross(step.node);
   if(step.from==='nat-wp-96375'&&step.node==='nat-wp-96376'){
    assert.equal((await actor()).y,300);
    await page.locator('#game').screenshot({path:'evidence/natlan-waypoint-sky-lift.png'});
   }
  }else{
   await walk(step.x);
   await page.keyboard.press('KeyG');
  }
  await count(id,i+1);
 }
 await warp(hub);
 await report(id);
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/natlan-waypoint-browser-save.json');
 await waitNode('nat-mountain-camp');
 assert.equal(await choices.locator('option[value="nat-wp-84121"]').count(),0);
 await accept(mountain);
 await follow('nat-wp-84104','nat-wp-84105','nat-wp-84106','nat-wp-84108');
 await survey(mountain);
 await warp('nat-wp-84108');
 await follow('nat-wp-84109','nat-wp-84110','nat-sky-camp');
 await accept(sky);
 await follow('nat-wp-96366','nat-wp-96367','nat-wp-96373','nat-wp-96375');
 await survey(sky);
 const groups=await choices.locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));
 for(const label of ['古の聖山','古の聖山・別階層','空の神殿'])assert.ok(groups.includes(label));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('nat-sky-camp');
 for(const id of [mountain,sky])await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 await warp('nat-wp-84121');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-waypoint-browser.json',JSON.stringify({
  journeys,groups,reported:[mountain,sky],movingLiftInBothDirections:true,twoJumpLanding:[480,390,300],
  restoredAndWarpedToLowerLayer:true,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed Sacred Mountain floors, the animated Sky Temple lift, two-stage jump and saved warp.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 console.error('Last browser state:',await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,notice:f?.storyNotice,gate:f?.storyNearbyPortal,ride:f?.storyLift,
          status:document.querySelector('#status')?.textContent};
 }));
 throw error;
}finally{await browser.close()}
