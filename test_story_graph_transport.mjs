import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const data=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(data.nodes.map(n=>[n.id,n]));
const base=process.env.LAB_URL||'http://127.0.0.1:8974/';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:920}});
page.setDefaultTimeout(25000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

function frameResponseWith(page, predicate){
 return page.waitForResponse(async response=>
  response.url().endsWith('/api/frame') && response.ok() && predicate(await response.json()));
}

async function openMap(){
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
}

try{
 const first=frameResponseWith(page,frame=>Boolean(frame.storyGraph));
 await page.goto(base);
 const firstFrame=await (await first).json();
 assert.equal(typeof firstFrame.storyGraphRevision,'string');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story.active);
 const stable=await (await frameResponseWith(page,f=>f.story.active&&!f.storyGraph)).json();
 assert.equal(stable.storyGraphRevision,firstFrame.storyGraphRevision);

 await openMap();
 assert.equal(await page.evaluate(()=>window.lab.frame.worldMap.selected.id),'mond-town');
 assert.ok(await page.evaluate(()=>window.lab.frame.storyGraph.nodes.length>1200));
 assert.equal(await page.evaluate(()=>window.lab.frame.worldMap.options.some(r=>r.id==='hidden-01')),false);
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});

 const walk=waypointDriver(page,nodes,{walkTimeout:25000});
 await walk.cross('mond-road');
 await walk.walk(1105);
 await page.waitForFunction(()=>Boolean(window.lab.frame.storyNearbyMilestone));
 const updated=frameResponseWith(page,f=>f.story?.discovered?.golden&&f.storyGraph);
 await page.keyboard.press('KeyG');
 const discovery=await (await updated).json();
 assert.notEqual(discovery.storyGraphRevision,firstFrame.storyGraphRevision);
 assert.ok(discovery.storyGraph.nodes.some(n=>n.id==='golden-hub'));
 assert.ok(discovery.storyGraph.quests.some(q=>q.id==='golden-explore'));
 await page.waitForFunction(rev=>window.lab.frame.storyGraphRevision===rev,discovery.storyGraphRevision);

 await openMap();
 assert.ok(await page.evaluate(()=>window.lab.frame.worldMap.options.some(r=>r.id==='hidden-01')));
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 const reload=frameResponseWith(page,f=>f.session===firstFrame.session && Boolean(f.storyGraph));
 await page.reload();
 await reload;
 await page.waitForFunction(()=>window.lab?.frame.story.discovered?.golden);
 assert.equal(await page.evaluate(()=>window.lab.frame.session),firstFrame.session);

 const comparison=await browser.newPage();
 comparison.setDefaultTimeout(25000);
 comparison.on('pageerror',error=>errors.push(error.message));
 await comparison.goto(new URL('compare.html',base).href);
 await comparison.waitForFunction(()=>window.compareLab?.samples.length>=3);
 const compactComparison=await (await frameResponseWith(comparison,f=>f.comparisons&&!f.storyGraph)).json();
 assert.equal(compactComparison.comparisons.length,2);
 assert.ok(await comparison.evaluate(()=>window.compareLab.frame.storyGraph.nodes.length>1200));

 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/story-graph-browser.json',JSON.stringify({
  stableFramesReuseGraph:true,mKeyAlwaysWorks:true,realGoldenClueRefreshesAtlas:true,
  reloadRestoresGraphAndSession:true,comparisonPageUsesCompactFrames:true,errors
 },null,2)+'\n');
 console.log('Compact frames, M map, Golden Island discovery, reload, and sprite comparison passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,
  clue:window.lab?.frame?.storyNearbyMilestone,active:window.lab?.frame?.story?.active,
  status:document.querySelector('#status')?.textContent
 })));
 throw error;
}finally{
 await browser.close();
}
