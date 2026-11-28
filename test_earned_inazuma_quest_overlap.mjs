import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:950}});
const drive=waypointDriver(page,nodes);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const prompt=page.locator('#nearbyCargoGo');

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-inazuma-bosses/ayaka-overlap.json');
 await drive.waitNode('inazuma-town');
 await page.waitForFunction(()=>{
  const q=window.lab.frame.story.quests;
  return q['ina-sayu-quiet-route']?.status==='complete' && q['ayaka-join']?.status==='active';
 });
 await drive.walk(1110);
 await page.waitForFunction(()=>{
  const f=window.lab.frame;
  const x=f.actors[f.active-1].x;
  return x>=1088&&x<=1134&&f.storyNearbySight?.label.includes('海の坂')&&!f.storyNearbyMilestone;
 });
 assert.match(await prompt.textContent(),/海の坂/);
 await prompt.screenshot({path:'work/earned-inazuma-bosses/ayaka-slope-prompt.png'});
 await page.keyboard.press('KeyG');
 await drive.count('ayaka-join',1);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone?.label.includes('もう一度読む'));
 assert.match(await prompt.textContent(),/お礼をもう一度読む/);
 await page.keyboard.press('KeyG');
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('木の実、どうぞ'));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/earned-inazuma-quest-overlap-browser.json',
  JSON.stringify({browser:'Chrome',activeSightPrioritized:true,sayuReadbackAfterSight:true,errors},null,2)+'\n');
 console.log('Chrome: Ayaka’s active sight takes precedence, then Sayu’s completed note can be reread.');
}finally{
 await browser.close();
}
