import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8965';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const quests=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const quay='sum-mapped-north-quay',wind='sum-mapped-desert-wind';
const errors=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
page.on('pageerror',e=>errors.push(e.message));
const {walk,changeHeight,cross,actor,warp,count,waitNode,accept,report,choices,journeys}=waypointDriver(page,nodes);
const follow=async(...stages)=>{for(const stage of stages)await cross(stage)};
const calls=()=>page.evaluate(()=>window.lab.frame.draws.length);

async function inspect(step,quest,index){
 await walk(step.x-38);
 await page.keyboard.press('KeyG');
 await count(quest,index);
}

async function compareProfiles(){
 await walk(750);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 const before=await actor();
 const pin=await page.evaluate(()=>window.lab.frame.storyWaypoint.id);
 assert.equal(pin,'teyvat:28707');
 const canvas=page.locator('#game');
 const png=await calls();
 await canvas.screenshot({path:'evidence/sumeru-waypoint-png.png'});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(n=>window.lab.frame.draws.length>n*8,png);
 const standard=await calls();
 await page.selectOption('#renderMode','h32c16');
 await page.waitForFunction(n=>window.lab.frame.draws.length<n*.75,standard);
 const light=await calls();
 await canvas.screenshot({path:'evidence/sumeru-waypoint-light.png'});
 const after=await actor();
 assert.deepEqual([before.x,before.y,before.hp],[after.x,after.y,after.hp]);
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(n=>window.lab.frame.draws.length===n,png);
 await page.locator('#pause').click();
 await page.waitForFunction(()=>!window.lab.frame.paused);
 return {marker:pin,png,standard,light,actor:[before.x,before.y],frozen:true};
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/sumeru-waypoint-browser-save.json');
 await waitNode('sumeru-hub');
 await accept(quay);
 for(const [i,step] of quests[quay].itinerary.entries()){
  if(step.kind==='arrive'){
   await cross(step.node);
   await count(quay,i+1);
  }else await inspect(step,quay,i+1);
 }
 await warp('sumeru-hub');
 await report(quay);
 await follow('sum-wp-28740','sum-wp-28743','sum-wp-28708','sum-wp-28707');
 const render=await compareProfiles();
 await warp('sumeru-hub');
 await follow('sumeru-field','tunigi-camp');
 await accept(wind);
 await follow('sum-wp-46517','sum-wp-46516','sum-wp-46515','sum-wp-41834','sum-wp-41835','sum-wp-41838');
 await count(wind,1);

 const shaft=nodes['sum-wp-41838'].exits.find(e=>e.to==='sum-wp-41836');
 await walk(shaft.x);
 await changeHeight(shaft.y);
 await page.waitForFunction(()=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to==='sum-wp-41836'&&!gate.available&&gate.wind?.seconds>.6;
 },null,{timeout:15000});
 assert.equal(await page.locator('#nearbyPortalGo').isDisabled(),true);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('風が弱まるまで'));
 await cross('sum-wp-41836');
 await count(wind,2);
 await inspect(quests[wind].itinerary[2],wind,3);
 await cross('sum-wp-41838');
 await count(wind,4);
 await warp('tunigi-camp');
 await report(wind);
 const groupLabels=await choices.locator('optgroup').evaluateAll(items=>items.map(g=>g.label));
 assert.ok(groupLabels.includes('ハドラマヴェス砂漠・別階層'));
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('tunigi-camp');
 for(const id of [quay,wind]){
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }
 await warp('sum-wp-41836');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sumeru-waypoint-browser.json',JSON.stringify({
  journeys,groupLabels,render,windInitiallyBlocked:true,restoredLayerWarp:true,reported:[quay,wind],pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed ferry, wind timing, underground warp, two quest reports, reload and frozen-frame pixel comparison.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
