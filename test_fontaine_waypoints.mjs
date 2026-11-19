import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8966';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const quests=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const samples='fon-mapped-depth-samples',bygone='fon-mapped-bygone-current';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const d=waypointDriver(page,nodes);
const {walk,changeHeight,actor,cross,warp,count,waitNode,accept,report,choices,journeys}=d;
const diveHelp=page.locator('#fieldSwimHelp');
const follow=async(...nodes)=>{for(const id of nodes)await cross(id)};

async function inspect(step,quest,index){
 await walk(step.x-33);
 await changeHeight(step.y);
 await page.keyboard.press('KeyG');
 await count(quest,index);
}

async function survey(id){
 const {itinerary,hub}=quests[id];
 await accept(id);
 for(const [i,step] of itinerary.entries()){
  if(step.kind==='inspect'){
   await inspect(step,id,i+1);
   if(step.node==='fon-wp-50065'||step.node==='bygone-wp-68605'){
    const path=step.node.startsWith('fon')?'fontaine-waypoint-swim.png':'bygone-waypoint-swim.png';
    await page.locator('#game').screenshot({path:'evidence/'+path});
   }
  }else{
   assert.equal(await d.node(),step.from);
   if(step.node==='fon-wp-50065'){
    const gate=nodes[step.from].exits.find(e=>e.to===step.node);
    await walk(gate.x);
    assert.ok(Math.abs((await actor()).y-gate.y)>60);
    const approaching=await page.evaluate(()=>window.lab.frame.storyNearbyPortal?.to??null);
    assert.notEqual(approaching,step.node);
    await page.keyboard.press('KeyF');
    assert.equal(await d.node(),step.from);
    assert.equal(await diveHelp.isVisible(),true);
    assert.equal(await page.locator('#touchJump').isHidden(),true);
   }
   await cross(step.node);
   await count(id,i+1);
  }
 }
 await warp(hub);
 assert.equal(await diveHelp.isHidden(),true);
 await report(id);
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/fontaine-waypoint-browser-save.json');
 await waitNode('fontaine-hub');
 await survey(samples);
 await follow('nostoi-castle-approach','fon-wp-68341','fon-wp-68345',
              'bygone-wp-68599','bygone-wp-68600','bygone-camp');
 await survey(bygone);
 const labels=await choices.locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));
 for(const label of ['フォンテーヌ湖・水中','ノストイ地区・水中','往日の海・水中'])assert.ok(labels.includes(label));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('bygone-camp');
 for(const id of [samples,bygone]){
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }
 await warp('fon-wp-50065');
 const a=await actor(),pin=nodes['fon-wp-50065'].waypoint;
 assert.deepEqual([a.x,a.y],[pin.x,pin.y]);
 assert.equal(await diveHelp.isVisible(),true);
 await warp('fontaine-hub');
 assert.equal(await diveHelp.isHidden(),true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/fontaine-waypoint-browser.json',JSON.stringify({
  journeys,labels,reported:[samples,bygone],differentDepthRejection:true,reloadAndWarp:true,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed swimming at two depths, two quest reports, the Nostoi–Bygone route and saved underwater warp.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 console.error('Last browser state:',await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,notice:f?.storyNotice,gate:f?.storyNearbyPortal,ride:f?.storyLift,
          status:document.querySelector('#status')?.textContent};
 }));
 throw error;
}finally{await browser.close()}
