import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1280,height:930}});
const drive=waypointDriver(page,nodes);
const slots=page.locator('#skillSlots button');
const events=()=>page.evaluate(()=>window.lab.frame.events.filter(event=>event.actor===1).map(event=>event.kind));
const waitCast=key=>page.waitForFunction(key=>window.lab.frame.events.some(event=>
 event.kind===`cast:${key}`&&event.actor===1),key);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9070/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/skill-unlock-lv20-ready.json');
 await drive.waitNode('mond-town');
 await page.waitForFunction(()=>window.lab.frame.progression?.level===20);
 assert.match(await page.locator('#skillEditor select').first().locator('option[value=SK05]').textContent(),/Lv20/);
 await drive.cross('mond-road');
 await slots.nth(0).click();
 await page.waitForFunction(()=>document.getElementById('skillCondition').textContent.includes('未習得の元素：岩'));
 assert.ok(!(await events()).includes('cast:SK05'));

 await drive.cross('mond-border');
 await drive.cross('liyue-entry');
 await slots.nth(0).click();
 await waitCast('SK05');
 await page.waitForFunction(()=>window.lab.frame.actors[0].lock<=0);
 await slots.nth(1).click();
 await page.waitForFunction(()=>window.lab.frame.macro?.index===2);
 await page.keyboard.press('ShiftLeft');
 await page.waitForFunction(()=>!window.lab.frame.macro);
 const dodgedAt=await page.evaluate(()=>window.lab.frame.t);
 await page.waitForFunction(t=>window.lab.frame.t>t+1.2,dodgedAt);
 assert.ok(!(await events()).includes('cast:skill2'));

 await drive.cross('liyue-harbor');
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('町から再開しました'));
 await drive.waitNode('liyue-harbor');
 await drive.cross('liyue-field');
 assert.equal((await page.evaluate(()=>window.lab.frame.loadout[0][0])),'SK05');
 await slots.nth(0).click();
 await waitCast('SK05');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/skill-learning-browser.json',JSON.stringify({
  storyLevel:20,skill:'SK05',loadoutDisplaysRequiredLevel:true,
  missingElementBlocked:true,firstLiyueArrivalUnlocked:true,
  restoredRegionAndLoadout:true,dodgeCanceledSecondMacroStep:true,errors,
 },null,2)+'\n');
 console.log('Chrome verified the regional unlock, dodge cancellation and loadout restoration.');
}catch(error){
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame?.story?.node,skillNotice:window.lab?.frame?.skillNotice,
  macro:window.lab?.frame?.macro,save:document.querySelector('#saveStatus')?.textContent,
 })));
 throw error;
}finally{
 await browser.close();
}
