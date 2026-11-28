import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const root='work/earned-natlan-port';
const checkpoint=process.env.LAB_NATLAN_GATES_START||'work/earned-natlan-iansan-training/earned-complete.json';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const frame=()=>page.evaluate(()=>window.lab.frame);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function examine(id,level,hunt){
 const current=await frame();
 const edge=nodes[current.story.node].exits.find(edge=>edge.to===id);
 await drive.walk(edge.x);
 await page.waitForFunction(id=>window.lab.frame.storyNearbyPortal?.to===id,id);
 const gate=(await frame()).storyNearbyPortal;
 assert.equal(gate.available,false);
 assert.equal(gate.level,level);
 assert.ok(gate.levelExpRemaining>0);
 await page.keyboard.press('KeyF');
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasField').selectOption(id);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,id);
 const {guide}=(await frame()).worldMap;
 assert.equal(guide.status,'blocked');
 assert.equal(guide.requiredLevel,level);
 assert.equal(guide.levelExpRemaining,gate.levelExpRemaining);
 assert.equal(guide.levelHunt.id,hunt);
 const shown=gate.levelExpRemaining.toLocaleString('ja-JP');
 assert.match(await page.locator('#atlasItineraryNote').innerText(),new RegExp(`あと ${shown} EXP`));
 if(id==='natlan-voyage')await page.locator('#worldAtlas').screenshot({path:root+'/locked-voyage-guide.png'});
 await page.locator('#atlasFirstBlocked').getByRole('button',{name:/の狩場.*への道順を見る/}).click();
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,hunt);
 assert.equal((await frame()).worldMap.guide.status,'ready');
 await page.keyboard.press('Escape');
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 assert.equal((await frame()).story.node,current.story.node);
 return {gate:id,level,remainingExp:gate.levelExpRemaining,hunt};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8970/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(checkpoint);
 await drive.waitNode('natlan-hub');
 assert.equal((await frame()).progression.level,111);
 const red='natlan-terrace-red-clay',slope='nat-wp-72414',ridge='nat-wp-72413';
 for(const node of ['natlan-entry',ridge,slope])await drive.cross(node);
 const gates=[await examine('natlan-east-valley-rocks',115,red),await examine('sites-hunt-73159',119,red)];
 for(const node of [ridge,'natlan-entry','natlan-hub','natlan-quarry-road','natlan-field','natlan-port'])await drive.cross(node);
 gates.push(await examine('natlan-voyage',120,red));
 assert.deepEqual(errors,[]);
 await fs.writeFile(root+'/gate-browser.json',JSON.stringify({startLevel:111,gates,errors},null,2)+'\n');
 console.log(gates);
}finally{
 await browser.close();
}
