import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:8962';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const pinCount=graph.nodes.filter(node=>node.waypoint).length;
const errors=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const p=await browser.newPage({viewport:{width:1200,height:960}});
p.on('pageerror',e=>errors.push(e.message));
const {actor,journeys,walk,cross,warp,count,waitNode,accept,report,choices,waypointCount}=waypointDriver(p,nodes);

try{
 await p.goto(base);
 await p.waitForFunction(()=>window.lab?.frame);
 await p.locator('#importSave').setInputFiles('work/mondstadt-waypoint-browser-save.json');
 await waitNode('mond-town');
 assert.ok((await waypointCount.textContent()).endsWith(' 1 / '+pinCount));
 assert.equal(await choices.locator('option[value="mond-wp-12"]').count(),0);
 const lake='mond-mapped-lakeside';
 await accept(lake);
 for(const [i,id] of ['mond-road','mond-wp-13','mond-wp-7','mond-wp-12'].entries()){
  await cross(id);
  await count(lake,i+1);
 }
 await walk(675);
 await p.keyboard.press('KeyG');
 await count(lake,5);
 const pin=await p.evaluate(()=>window.lab.frame.storyWaypoint);
 assert.equal(pin.id,'teyvat:12');
 assert.equal(pin.kind,'statue');
 assert.ok((await waypointCount.textContent()).endsWith(' 5 / '+pinCount));
 await walk(800);
 await p.locator('#game').screenshot({path:'evidence/mondstadt-waypoint-travel.png'});
 await cross('mond-wp-8');
 await cross('mond-wp-12');
 assert.equal((await actor()).y,370);
 await warp('mond-town');
 await report(lake);
 await warp('mond-road');
 await cross('dornman-camp');
 const islet='mond-mapped-islet';
 await accept(islet);
 await cross('mond-wp-95797');
 await cross('mond-wp-95803');
 await cross('mond-wp-95797');
 await count(islet,1);
 await cross('mond-wp-95799');
 await count(islet,2);
 await walk(675);
 await p.keyboard.press('KeyG');
 await count(islet,3);
 await cross('mond-wp-95797');
 await count(islet,4);
 await warp('dornman-camp');
 await report(islet);
 await p.locator('#saveProgress').click();
 await p.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await p.reload();
 await p.waitForFunction(()=>window.lab?.frame);
 await p.locator('#loadProgress').click();
 await p.waitForFunction(([lake,islet])=>{
  const f=window.lab.frame;
  return f.story?.quests[lake]?.status==='complete'&&f.story?.quests[islet]?.status==='complete';
 },[lake,islet]);
 assert.ok((await waypointCount.textContent()).endsWith(' 10 / '+pinCount));
 await p.setViewportSize({width:390,height:844});
 const fits=await choices.evaluate(el=>el.clientWidth<=el.parentElement.clientWidth);
 assert.equal(fits,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-waypoint-browser.json',JSON.stringify({
  journeys,journal:[lake,islet],restored:true,pin,visitedCount:10,mobileSelectorFits:true,pageErrors:errors
 },null,2)+'\n');
 console.log('Chrome passed walking, raised gate, lift, boat, quest reports, fast travel and save reload.');
}catch(error){
 console.error('Last completed crossings:',journeys);
 throw error;
}finally{await browser.close()}
