import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
page.setDefaultTimeout(30000);
const atlas=page.locator('#worldAtlas');
const drive=waypointDriver(page,nodes);
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('response',res=>{
 if(res.url().endsWith('/api/frame')&&!res.ok())errors.push(`Frame HTTP ${res.status()}`);
});

async function visit(file,host){
 await page.locator('#importSave').setInputFiles('work/sites-geographic-'+file+'-fixture.json');
 await drive.waitNode(nodes[host].checkpoint);
 await drive.warp(host);
}

async function showMap(stage,layer){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,stage);
 await page.locator('#atlasLayer').selectOption(layer);
 await page.waitForFunction(layer=>window.lab.frame.worldMap?.layer===layer,layer);
 assert.match(await page.locator('#atlasPlaceLevel').textContent(),/試作区画/);
}

async function closeMap(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8973/');
 await page.waitForFunction(()=>window.lab?.frame);
 await visit('water','fon-wp-50075');
 assert.equal(await page.evaluate(()=>window.lab.frame.storySwim),true);
 await drive.cross('sites-hunt-50067');
 await page.waitForFunction(()=>window.lab.frame.total===18&&!window.lab.frame.storySwim);
 await showMap('sites-hunt-50067','water');
 await page.getByRole('button',{name:/水路・Lv88/}).waitFor();
 await atlas.screenshot({path:'evidence/sites-geographic-water-atlas.png'});
 await closeMap();
 await page.locator('#game').screenshot({path:'evidence/sites-geographic-water-field.png'});
 await drive.cross('fon-wp-50075');
 assert.equal(await page.evaluate(()=>window.lab.frame.storySwim),true);
 console.log('Fontaine swim, waterway, dry-platform hunt, M map and return passed.');

 await visit('boat','tsurumi-coast');
 await drive.cross('sites-hunt-18667');
 await page.waitForFunction(()=>window.lab.frame.total===48);
 await showMap('sites-hunt-18667','surface');
 await page.getByRole('button',{name:/舟・寄港・Lv54/}).waitFor();
 await closeMap();
 await drive.cross('tsurumi-coast');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sites-geographic-fields-browser.json',JSON.stringify({
  fontaineWaterwayRoundTrip:true,huntOnWalkablePlatforms:true,fontaineEnemies:18,
  tsurumiFerryRoundTrip:true,islandEnemies:48,atlasTracksCurrentFieldAndTravelMode:true,errors
 },null,2)+'\n');
 console.log('Tsurumi ferry, island population, M map and return passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,
  gate:window.lab?.frame?.storyNearbyPortal,status:document.querySelector('#status').textContent
 })));
 throw error;
}finally{
 await browser.close();
}
