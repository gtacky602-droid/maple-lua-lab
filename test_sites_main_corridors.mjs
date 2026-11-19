import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
page.setDefaultTimeout(30000);
const drive=waypointDriver(page,nodes,{walkTimeout:30000});
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('response',res=>{
 if(res.url().endsWith('/api/frame')&&!res.ok())errors.push(`Frame HTTP ${res.status()}`);
});

async function visit(file,host){
 await page.locator('#importSave').setInputFiles('work/sites-corridor-'+file+'-fixture.json');
 await drive.waitNode(nodes[host].checkpoint);
 await drive.warp(host);
}

async function showMap(stage){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,stage);
}

async function closeMap(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8973/');
 await page.waitForFunction(()=>window.lab?.frame);

 await visit('border','liyue-wp-28732');
 await drive.cross('sites-corridor-chasm-border');
 await showMap('sites-corridor-chasm-border');
 const forest=page.locator('#atlasRoutes button').filter({hasText:nodes['sum-wp-28704'].name});
 await forest.waitFor();
 assert.match(await page.locator('#atlasPlaceLevel').textContent(),/通行Lv64.*試作区画/);
 await atlas.screenshot({path:'evidence/sites-corridor-border-map.png'});
 await forest.click();
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='sum-wp-28704'&&window.lab.frame.worldMap.region==='region-04');
 await closeMap();
 await drive.cross('sum-wp-28704');
 await drive.cross('sites-corridor-chasm-border');
 await drive.cross('liyue-wp-28732');
 console.log('Chasm border passage and cross-region atlas selection passed.');

 await visit('boat','nod-wp-88129');
 await showMap('nod-wp-88129');
 const boat=page.locator('#atlasRoutes button').filter({hasText:nodes['nod-wp-88157'].name});
 assert.match(await boat.textContent(),/舟・寄港/);
 await atlas.screenshot({path:'evidence/sites-corridor-supply-boat-map.png'});
 await closeMap();
 await drive.cross('nod-wp-88157');
 await drive.cross('nod-wp-88129');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sites-main-corridors-browser.json',JSON.stringify({
  chasmSumeruPassageRoundTrip:true,atlasCrossRegionSelection:true,pahaRempoySupplyBoatRoundTrip:true,errors
 },null,2)+'\n');
 console.log('Paha–Rempoy boat round trip passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,
  gate:window.lab?.frame?.storyNearbyPortal,
  x:window.lab?.frame?.actors?.find(a=>a.id===window.lab.frame.active)?.x,
  status:document.querySelector('#status').textContent
 })));
 throw error;
}finally{
 await browser.close();
}
