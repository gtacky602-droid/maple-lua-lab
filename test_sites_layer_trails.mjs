import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
page.setDefaultTimeout(30000);
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('response',res=>{
 if(res.url().endsWith('/api/frame')&&!res.ok())errors.push(`Frame HTTP ${res.status()}`);
});

async function visit(file,host){
 await page.locator('#importSave').setInputFiles('work/sites-layer-'+file+'-fixture.json');
 await drive.waitNode(nodes[host].checkpoint);
 await drive.warp(host);
}

async function showMap(stage,layer){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,stage);
 if(layer){
  await page.locator('#atlasLayer').selectOption(layer);
  await page.waitForFunction(([id,layer])=>window.lab.frame.worldMap?.layer===layer&&window.lab.frame.worldMap?.selected?.id===id,[stage,layer]);
 }
}

async function closeMap(){
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8973/');
 await page.waitForFunction(()=>window.lab?.frame);

 await visit('ice','sne-wp-100654');
 await drive.cross('sne-wp-100684');
 await showMap('sne-wp-100684','below');
 const liftReturn=page.getByRole('button',{name:/氷壁の南端.*昇降機・Lv146/});
 await liftReturn.waitFor();
 await atlas.screenshot({path:'evidence/sites-layer-ice-map.png'});
 await liftReturn.click();
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='sne-wp-100654'&&window.lab.frame.worldMap.layer==='all');
 await closeMap();
 await drive.cross('sne-wp-100654');
 console.log('Ice-wall lift and cross-layer atlas navigation passed.');

 await visit('bay','fon-wp-55760');
 await drive.cross('fon-wp-55767');
 assert.equal(await page.evaluate(()=>window.lab.frame.storySwim),true);
 await showMap('fon-wp-55767','water');
 await page.getByRole('button',{name:/東湾の神像.*水路・Lv87/}).waitFor();
 await closeMap();
 await drive.cross('fon-wp-55760');
 assert.equal(await page.evaluate(()=>Boolean(window.lab.frame.storySwim)),false);
 console.log('East Bay shore to submerged stairs and back passed.');

 await visit('ridge','mond-border');
 await drive.cross('sites-lookout-10009');
 await showMap('sites-lookout-10009','surface');
 await page.getByRole('button',{name:/国境の道.*徒歩/}).waitFor();
 await closeMap();
 await drive.cross('mond-border');
 console.log('Ridge Watch exterior and the border round trip passed.');

 await visit('chess-low','mond-wp-15');
 await drive.cross('sites-lookout-85351');
 await drive.walk(780);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.reason==='必要レベル 112');
 await page.keyboard.press('KeyF');
 assert.equal(await page.evaluate(()=>window.lab.frame.story.node),'sites-lookout-85351');
 await drive.cross('mond-wp-15');

 await visit('chess','mond-wp-15');
 await drive.cross('sites-lookout-85351');
 await showMap('sites-lookout-85351','surface');
 await page.getByRole('button',{name:/東の浜道.*風の流れ/}).waitFor();
 await atlas.screenshot({path:'evidence/sites-domain-chess-map.png'});
 await closeMap();
 await drive.cross('mond-gate-chess-court');
 assert.equal(await page.evaluate(()=>window.lab.frame.weeklyBoss?.id),'boss-29122000');
 await drive.cross('sites-lookout-85351');
 await drive.cross('mond-wp-15');
 console.log('Coastal wind route, weekly level gate, and chess court return passed.');

 await visit('lookout','mond-wp-95782');
 await drive.cross('sites-windcrown-waterfall');
 await drive.cross('sites-lookout-98500');
 assert.equal(await page.evaluate(()=>window.lab.frame.total),0);
 await showMap('sites-lookout-98500','surface');
 await page.getByRole('button',{name:/滝のふもと.*風の流れ/}).waitFor();
 await atlas.screenshot({path:'evidence/sites-layer-lookout-map.png'});
 await closeMap();
 await drive.walk(225);
 await page.waitForFunction(()=>window.lab.frame.draws.some(draw=>draw.text==='山風の荊冠'));
 await drive.cross('sites-windcrown-waterfall');
 await drive.cross('mond-wp-95782');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sites-layer-trails-browser.json',JSON.stringify({
  iceLiftRoundTrip:true,buttonCrossesLayerFilter:true,eastBayWaterwayRoundTrip:true,
  ridgeExteriorRoundTrip:true,weeklyChessCoastAndLevelGate:true,windcrownAscentAndReturn:true,
  journeys:drive.journeys,errors
 },null,2)+'\n');
 console.log('Windcrown waterfall ascent and return passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,
  gate:window.lab?.frame?.storyNearbyPortal,layer:window.lab.frame.worldMap?.layer,
  status:document.querySelector('#status').textContent
 })));
 throw error;
}finally{
 await browser.close();
}
