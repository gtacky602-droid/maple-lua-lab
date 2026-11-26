import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const chart=JSON.parse(await fs.readFile('content/world-atlas.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const [town,road,border,lookout,domain]=['mond-town','mond-road','mond-border','sites-lookout-10009','ridge-watch-domain'];
const region=chart.regions.find(row=>row.points.some(point=>point.id===domain)).id;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:940}});
const drive=waypointDriver(page,nodes);
const atlas=page.locator('#worldAtlas');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await drive.waitNode(town);
 await page.waitForFunction(()=>window.lab.frame.story.active&&window.lab.frame.progression);
 assert.equal(await page.evaluate(()=>window.lab.frame.progression.level),1);
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption(region);
 await page.locator('#atlasField').selectOption(domain);
 await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,domain);
 const stops=page.locator('#atlasItineraryStops button');
 assert.match(await stops.first().innerText(),/現在地から右へ/);
 assert.equal(await stops.filter({hasText:'現在地から'}).count(),1);
 await stops.filter({hasText:/石門の岩棚.*必要Lv12/}).waitFor();
 await stops.filter({hasText:/試練の広間.*必要Lv20.*上段の入口/}).scrollIntoViewIfNeeded();
 await atlas.screenshot({path:'evidence/mondstadt-domain-gate-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await page.locator('#importSave').setInputFiles('work/mondstadt-map-access/domain-ready.json');
 await page.waitForFunction(()=>window.lab.frame.progression.level===20);
 assert.ok(!await page.evaluate(id=>window.lab.frame.story.visited[id],domain));
 for(const node of [road,border,lookout,domain]) await drive.cross(node);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(id=>{
  const data=JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  return data?.story?.node===id;
 },domain);
 for(const node of [lookout,border,road,town]) await drive.cross(node);
 await page.locator('#loadProgress').click();
 await page.getByText('保存した進行で町から再開しました。',{exact:true}).waitFor();
 await drive.waitNode(town);
 assert.ok(await page.evaluate(id=>window.lab.frame.story.visited[id],domain));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-map-access-browser.json',JSON.stringify({
  freshLevel:1,gatesShown:[12,20],upperGateHintShown:true,roundTrip:[town,road,border,lookout,domain,lookout,border,road,town],
  travelFromLevel20Fixture:true,restoredAt:town,errors
 },null,2)+'\n');
 console.log('Mondstadt: fresh map conditions, physical domain return and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame?.story?.node,gate:window.lab?.frame?.storyNearbyPortal,
  guide:window.lab?.frame?.worldMap?.guide,save:document.querySelector('#saveStatus')?.textContent})));
 throw error;
}finally{
 await browser.close();
}
