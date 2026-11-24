import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes} = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1200,height:940}});
const drive = waypointDriver(page, Object.fromEntries(nodes.map(node => [node.id, node])));
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9090/');
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-kachina-climb.json');
 await drive.waitNode('white-pass-station');
 await drive.walk(330);
 await page.keyboard.press('Digit1');
 const vine = await (await page.waitForFunction(() => {
  const p = window.lab.frame.platforms.find(platform => platform.structure === 'vine');
  return p && {x:p.x+p.w/2, top:p.y};
 })).jsonValue();
 await drive.walk(vine.x);
 await page.keyboard.down('Space');
 try {
  await page.waitForFunction(top => window.lab.frame.actors[0].y <= top, vine.top);
 } finally {
  await page.keyboard.up('Space');
 }
 await page.waitForFunction(top => {
  const {actors, companion} = window.lab.frame;
  return companion.climbBoostSeconds > 0 && actors[1].y < 450 && actors[1].y > top+15;
 }, vine.top);
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => window.lab.frame.paused);
 const climbing = await page.evaluate(() => {
  const {actors, companion, draws} = window.lab.frame;
  return {heights:actors.map(actor => actor.y), boost:companion.climbBoostSeconds,
   vineDrawn:draws.some(draw => draw.color === '#67984a')};
 });
 assert.ok(climbing.boost > 0 && climbing.heights[1] < 450 && climbing.vineDrawn);
 assert.match(await page.locator('#companionStatus').textContent(), /登攀加速/);
 await page.locator('#game').screenshot({path:'evidence/earned-kachina-climb.png'});
 await page.keyboard.press('KeyP');
 await page.waitForFunction(top => window.lab.frame.actors.every(actor => actor.y === top), vine.top);
 await drive.cross('white-pass-woods');
 assert.equal(await page.evaluate(() => window.lab.frame.companion.climbBoostSeconds), 0);
 assert.deepEqual(errors, []);
 await fs.writeFile('evidence/earned-kachina-climb-browser.json', JSON.stringify({
  field:'white-pass-station', level:165, vine, climbing, reachedSameLedge:true, clearsOnExit:true, errors,
 }, null, 2) + '\n');
 console.log('Chrome: Kachina followed the Traveler to the vine ledge and cleared the boost on exit.');
} finally {
 await browser.close();
}
