import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8963';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const byQuest=Object.fromEntries(graph.quests.map(q=>[q.id,q]));
const errors=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1200,height:960}});
page.on('pageerror',e=>errors.push(e.message));
const driver=waypointDriver(page,nodes);
const {actor,walk,cross,warp,count,waitNode,accept,report,choices,waypointCount,journeys}=driver;

async function runQuest(id){
 const {hub,itinerary}=byQuest[id];
 await accept(id);
 for(const [i,step] of itinerary.entries()){
  if(step.kind==='arrive'){
   assert.equal(await driver.node(),step.from);
   await cross(step.node);
  }else{
   await walk(step.x);
   await page.keyboard.press('KeyG');
  }
  await count(id,i+1);
  if(step.node==='liyue-wp-97'){
   await walk(nodes[step.node].waypoint.x+120);
   await page.locator('#game').screenshot({path:'evidence/liyue-waypoint-statue.png'});
  }
 }
 if(await driver.node()!==hub)await warp(hub);
 await report(id);
}

try{
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/liyue-waypoint-browser-save.json');
 await waitNode('liyue-harbor');
 const total=graph.nodes.filter(n=>n.waypoint).length;
 assert.equal(await waypointCount.textContent(),'地図のワープ地点・神像 2 / '+total);
 assert.equal(await choices.locator('option[value="liyue-wp-97"]').count(),0);

 await cross('liyue-wp-111');
 await cross('liyue-harbor');
 assert.equal((await actor()).y,350);
 await runQuest('liyue-mapped-east-shore');

 await cross('liyue-entry');
 await cross('chenyu-camp');
 await runQuest('liyue-mapped-hidden-cave');
 const groupsBeforeMine=await choices.locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));
 assert.deepEqual(groupsBeforeMine,['モンド','璃月','沈玉の谷']);
 await warp('liyue-harbor');

 await cross('liyue-field');
 await cross('chasm-camp');
 await cross('liyue-wp-24912');
 await cross('chasm-camp');
 await cross('chasm-depth');
 await warp('liyue-harbor');
 await warp('chasm-depth');
 assert.equal((await actor()).x,nodes['chasm-depth'].waypoint.x);
 const labels=await choices.locator('optgroup').evaluateAll(groups=>groups.map(g=>g.label));
 assert.deepEqual(labels,['モンド','璃月','沈玉の谷','層岩巨淵・地下鉱区','層岩巨淵・地上']);
 const visited=await choices.locator('optgroup option').count();
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await waitNode('chasm-camp');
 for(const id of ['liyue-mapped-east-shore','liyue-mapped-hidden-cave']){
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }
 assert.equal(await choices.locator('optgroup option').count(),visited);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-waypoint-browser.json',JSON.stringify({
  total,visited,journeys,groups:labels,reported:['liyue-mapped-east-shore','liyue-mapped-hidden-cave'],restore:true,
  pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed the upper gate, harbor and Chenyu itineraries, shaft access, mine warp and save reload.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
