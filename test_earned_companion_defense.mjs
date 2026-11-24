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
 await page.locator('#importSave').setInputFiles('work/earned-ayaka-sifter-checkpoint.json');
 await drive.waitNode('ochkanatlan-dock');
 for (const id of ['ochka-tide-stairs', 'ochka-patched-court', 'ochka-sifting-kiln']) await drive.cross(id);
 await drive.walk(685);
 await page.waitForFunction(() => window.lab.frame.companion.dodgeSeconds > 0);
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => window.lab.frame.paused);
 const before = await page.evaluate(() => {
  const {actors, fieldBoss, companion} = window.lab.frame;
  return {partyHp:actors.map(actor => actor.hp), move:fieldBoss.move, tick:fieldBoss.tick,
   dodging:companion.dodgeSeconds, laneAt:fieldBoss.lanes[0].at, activeTicks:fieldBoss.activeTicks,
   cue:window.lab.frame.draws.some(draw => draw.color === '#ccf4ff')};
 });
 assert.equal(before.move, 'RK01');
 assert.ok(before.dodging > 0 && before.tick < before.laneAt && before.cue);
 assert.match(await page.locator('#companionStatus').textContent(), /霜影回避/);
 await page.locator('#game').screenshot({path:'evidence/earned-ayaka-sifter-dodge.png'});
 await page.keyboard.press('KeyP');
 await page.waitForFunction(end => (window.lab.frame.fieldBoss?.tick ?? 0) >= end, before.laneAt + before.activeTicks);
 const after = await page.evaluate(() => window.lab.frame.actors.map(actor => actor.hp));
 assert.equal(after[1], before.partyHp[1]);
 assert.ok(after[0] < before.partyHp[0]);
 assert.deepEqual(errors, []);
 await fs.writeFile('evidence/earned-companion-defense-browser.json', JSON.stringify({
  field:'ochka-sifting-kiln', level:200, heroDamage:before.partyHp[0]-after[0],
  companionDamage:before.partyHp[1]-after[1], before, errors,
 }, null, 2) + '\n');
 console.log('Chrome: Ayaka dodged the field attack while the Traveler took damage.');
} finally {
 await browser.close();
}
