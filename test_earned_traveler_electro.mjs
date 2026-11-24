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

async function captureStrike(key, color, file) {
 await page.waitForFunction(color => window.lab.frame.draws.some(d => d.color === color && d.rotation), color);
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => window.lab.frame.paused);
 const frame = await page.evaluate(({key, color}) => {
  const {draws, actors, events} = window.lab.frame;
  const cast = events.findLast(e => e.kind === 'cast:' + key && e.actor === 1);
  const hits = events.filter(e => e.kind === 'hit' && e.actor === 1 && e.element === 'electro'
   && !e.reaction && cast && e.t >= cast.t + (key === 'SK12' ? 0.99 : 0));
  const lastPulse = hits.at(-1)?.t;
  return {
   actorX:actors[0].x,
   links:draws.filter(d => d.kind === 'rect' && d.color === color && d.rotation !== undefined).length / 4,
   hasBroadRing:draws.some(d => d.kind === 'effect' && d.color === color && d.w >= 500),
   hitsAtLastPulse:hits.filter(hit => hit.t === lastPulse).length,
   stakeX:draws.find(d => d.kind === 'rect' && d.color === '#795297')?.x,
  };
 }, {key, color});
 assert.ok(frame.links > 0);
 assert.equal(frame.hitsAtLastPulse, frame.links);
 assert.equal(frame.hasBroadRing, false);
 await page.locator('#game').screenshot({path:file});
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => !window.lab.frame.paused);
 return frame;
}

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9092/');
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-traveler-electro.json');
 await drive.waitNode('white-pass-station');
 await drive.warp('dawn-crystal-field');
 await drive.walk(171);
 await page.keyboard.press('Digit2');
 const chain = await captureStrike('SK10', '#c68fff', 'evidence/earned-traveler-chain.png');
 assert.equal(chain.links, 6);
 await page.waitForFunction(() => window.lab.frame.actors[0].lock === 0);
 await drive.walk(102);
 await page.keyboard.press('Digit4');
 await page.waitForFunction(() => window.lab.frame.draws.some(d => d.kind === 'rect' && d.color === '#795297'));
 const initialStakeX = await page.evaluate(() => window.lab.frame.draws.find(d => d.color === '#795297').x);
 await drive.walk(25);
 const stake = await captureStrike('SK12', '#cb9fff', 'evidence/earned-traveler-stake.png');
 assert.equal(stake.links, 3);
 assert.equal(stake.stakeX, initialStakeX);
 assert.ok(Math.abs(stake.actorX - (stake.stakeX + 7)) > 50);
 assert.deepEqual(errors, []);
 await fs.writeFile('evidence/earned-traveler-electro-browser.json', JSON.stringify({
  field:'dawn-crystal-field', level:200, chain, stake, errors,
 }, null, 2) + '\n');
 console.log('Chrome: six links drawn for the chain and three links from the stationary stake.');
} finally {
 await browser.close();
}
