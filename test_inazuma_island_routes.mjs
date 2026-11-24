import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const port='inazuma-port';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

async function checkGuide(shore,arena,seconds,picture){
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasField').selectOption(arena);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,arena);
 const guide=await page.evaluate(()=>window.lab.frame.worldMap.guide);
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(leg=>[leg.id,leg.mode]),[[shore,'boat'],[arena,'walk']]);
 await page.locator('#atlasItineraryStops').getByText(`移動に${seconds}秒`,{exact:false}).waitFor();
 if(picture)await atlas.screenshot({path:picture});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
}

async function sail(from,to,seconds){
 const edge=nodes[from].exits.find(gate=>gate.to===to);
 await drive.walk(edge.x);
 await page.getByRole('button',{name:'F：小舟に乗る',exact:true}).waitFor();
 await page.keyboard.press('KeyF');
 await page.waitForFunction(([name,seconds])=>{
  const ride=window.lab.frame.storyLift;
  return ride?.boat&&ride.destination===name&&ride.seconds===seconds;
 },[edge.rideLabel,seconds]);
 await page.locator('#storyLiftText').getByText(edge.rideLabel,{exact:false}).waitFor();
 await drive.waitNode(to);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/inazuma-island-routes/port.json');
 await drive.waitNode(port);
 const lines=[
  ['watatsumi-landing','hydro-hypostasis-field-cove',4.2],
  ['tsurumi-coast','wolflord-field-ruins',4.8,'evidence/inazuma-tsurumi-shuttle-atlas.png'],
 ];
 const completed=[];
 for(const [shore,arena,seconds,picture] of lines){
  await checkGuide(shore,arena,seconds,picture);
  await sail(port,shore,seconds);
  await sail(shore,port,seconds);
  completed.push({shore,arena,secondsEachWay:seconds});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/inazuma-island-routes-browser.json',JSON.stringify({
  shuttles:completed,usedFForAllFourCrossings:true,errors
 },null,2)+'\n');
 console.log('Watatsumi and Tsurumi shuttles: both guides and four real sailings passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,gate:window.lab?.frame?.storyNearbyPortal,
  lift:window.lab?.frame?.storyLift,guide:window.lab?.frame?.worldMap?.guide})));
 throw error;
}finally{
 await browser.close();
}
