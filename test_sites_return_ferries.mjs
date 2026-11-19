import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const data=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(data.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
page.setDefaultTimeout(28000);
const drive=waypointDriver(page,nodes,{walkTimeout:25000});
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('response',res=>{
 if(res.url().endsWith('/api/frame')&&!res.ok())errors.push(`Frame HTTP ${res.status()}`);
});

async function restore(name,node){
 await page.locator('#importSave').setInputFiles('work/sites-ferry-'+name+'-fixture.json');
 await drive.waitNode(node);
}

async function inspectRoute(ship,end,file){
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,ship);
 assert.ok(await page.evaluate(id=>window.lab.frame.worldMap.routes.some(r=>r.id===id&&r.label==='舟・寄港'),end));
 await atlas.getByRole('button',{name:/航海を中止/}).waitFor();
 const remaining=await page.evaluate(()=>window.lab.frame.voyage.seconds);
 await atlas.screenshot({path:file});
 assert.equal(await page.evaluate(()=>window.lab.frame.voyage.seconds),remaining);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function arrive(end,seconds){
 await page.waitForFunction(id=>window.lab.frame.story.node===id,end,{timeout:(seconds+45)*1000});
 assert.equal(await page.evaluate(()=>Boolean(window.lab.frame.voyage)),false);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8974/');
 await page.waitForFunction(()=>window.lab?.frame);

 await restore('inazuma','inazuma-port');
 await drive.cross('liyue-ferry-return');
 await page.getByText(/航海中.*璃月・港の広場まで/).waitFor();
 assert.equal(await page.evaluate(()=>window.lab.frame.voyage.total),30);
 await inspectRoute('liyue-ferry-return','liyue-harbor','evidence/sites-ferry-liyue-atlas.png');
 await arrive('liyue-harbor',30);
 console.log('Ritou boarding, M map, and Liyue arrival passed.');

 await restore('ochka','ochkanatlan-dock');
 const edge=nodes['ochkanatlan-dock'].exits.find(e=>e.to==='natlan-voyage-return');
 await drive.walk(edge.x);
 await page.getByRole('button',{name:'F：再乗船する',exact:true}).waitFor();
 await drive.cross('natlan-voyage-return');
 const voyage=await page.evaluate(()=>window.lab.frame.voyage);
 assert.ok(voyage.seconds>37&&voyage.seconds<=40&&!voyage.stopover);
 await page.locator('#game').screenshot({path:'evidence/sites-ferry-natlan-deck.png'});
 await arrive('natlan-port',40);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sites-return-ferries-browser.json',JSON.stringify({
  ritouLiyueFullReturn:true,atlasRouteAndPauseWhileAboard:true,
  ochkanatlanReboardingAndNatlanArrival:true,reboardingStartedAt40Seconds:true,errors
 },null,2)+'\n');
 console.log('Ochkanatlan southbound reboarding and Natlan arrival passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,
  voyage:window.lab?.frame?.voyage,gate:window.lab?.frame?.storyNearbyPortal,
  status:document.querySelector('#status')?.textContent
 })));
 throw error;
}finally{
 await browser.close();
}
