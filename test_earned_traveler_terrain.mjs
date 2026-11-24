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

async function capture(color, file, element) {
 await page.waitForFunction(color => window.lab.frame.draws.some(d => d.kind === 'rect' && d.color === color), color);
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => window.lab.frame.paused);
 const shown = await page.evaluate(({color, element}) => {
  const {draws, events} = window.lab.frame;
  const markers = draws.filter(d => d.kind === 'rect' && d.color === color);
  const hits = events.filter(e => e.kind === 'hit' && e.actor === 1 && e.element === element && !e.reaction);
  return {
   markers:markers.length,
   lowest:Math.max(...markers.map(d => d.y+d.h)),
   highest:Math.min(...markers.map(d => d.y)),
   hitsAtLastPulse:hits.filter(e => e.t === hits.at(-1)?.t).length,
  };
 }, {color, element});
 assert.ok(shown.markers > 0 && shown.hitsAtLastPulse > 0);
 await page.locator('#game').screenshot({path:file});
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => !window.lab.frame.paused);
 return shown;
}

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9093/');
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-traveler-terrain.json');
 await drive.waitNode('white-pass-station');
 await drive.warp('dawn-crystal-field');
 await drive.walk(171);
 await page.keyboard.press('Digit1');
 const wave = await capture('#dcbf7c', 'evidence/earned-ground-wave.png', 'geo');
 assert.equal(wave.lowest, 480);
 assert.ok(wave.highest >= 470);
 await page.waitForFunction(() => window.lab.frame.actors[0].lock === 0);
 await page.keyboard.press('Digit4');
 const seeds = await capture('#d2ed8d', 'evidence/earned-homing-seeds.png', 'dendro');
 assert.equal(seeds.hitsAtLastPulse, 6);
 assert.equal(seeds.markers, 4*seeds.hitsAtLastPulse);
 assert.ok(seeds.highest < 365 && seeds.lowest > 430);
 assert.deepEqual(errors, []);
 await fs.writeFile('evidence/earned-traveler-terrain-browser.json', JSON.stringify({
  field:'dawn-crystal-field', level:200, wave, seeds, errors,
 }, null, 2)+'\n');
 console.log('Chrome: the shockwave sat on the ground and the tracked seeds appeared on both tiers.');
} finally {
 await browser.close();
}
