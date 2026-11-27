import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const [save, output, boss = 'raiden'] = process.argv.slice(2);
const encounters = new Map([
  ['raiden', {id:'boss-29060201', hub:'inazuma-town', gateX:1305, spritePrefix:'raiden-weekly-normal-'}],
  ['andrius', {id:'boss-29020101', hub:'mond-town', approach:'mond-road', gateX:940, spritePrefix:'andrius-weekly-normal-'}],
  ['narwhal', {id:'boss-29090101', hub:'fontaine-hub', gateX:700, spritePrefix:'narwhal-idle-'}],
  ['primal', {id:'boss-29091101', hub:'natlan-hub', gateX:351, spritePrefix:'gosoythoth-idle-'}],
  ['false-moon', {id:'boss-29130201', hub:'nod-town', gateX:210, spritePrefix:'false-moon-weekly-idle-'}],
]);
const encounter = encounters.get(boss);
assert(save && output && encounter, 'Usage: node test_weekly_rect_transfer.mjs SAVE OUTPUT_JSON [raiden|andrius|narwhal|primal|false-moon]');
const {nodes} = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const browser = await chromium.launch({headless:true, channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1320, height:900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.LAB_URL || 'http://127.0.0.1:19752/');
  const drive = waypointDriver(page, Object.fromEntries(nodes.map(node => [node.id, node])));
  await page.getByRole('button', {name:'本編ルートへ', exact:true}).click();
  await page.locator('#importSave').setInputFiles(save);
  await page.waitForFunction(() => window.lab.frame.progression?.level === 200);
  await drive.warp(encounter.hub);
  if (encounter.approach) await drive.cross(encounter.approach);
  await drive.walk(encounter.gateX);
  await page.locator('#weeklyDifficulty').selectOption('expert');
  await page.locator('#weeklyChallengeStart').click();
  await page.waitForFunction(id => window.lab.frame.weeklyBoss?.id === id, encounter.id);
  await page.locator('#pause').click();
  await page.waitForFunction(() => window.lab.frame.paused);
  const {time, sprite} = await page.evaluate(async prefix => {
    const {loadScenery} = await import('./scenery.js');
    const frame = window.lab.frame;
    await loadScenery(frame);
    return {time:frame.t, sprite:frame.draws.find(draw => draw.source?.startsWith(prefix))};
  }, encounter.spritePrefix);
  assert(sprite);

  async function capture(packed, change) {
    const next = page.waitForResponse(response => {
      if (!response.url().endsWith('/api/frame')) return false;
      const request = response.request().postDataJSON();
      return request?.profile === 'h48c32' && request.packRectArt === packed;
    });
    await change();
    const response = await next;
    assert(response.ok());
    const frame = await response.json();
    await page.waitForFunction(count => window.lab.frame.draws.length === count, frame.draws.length);
    const image = await page.locator('#game').evaluate(canvas => canvas.toDataURL());
    return {frame, image, bytes:Number(response.headers()['content-length']),
      encoding:response.headers()['content-encoding']};
  }

  const packed = await capture(true, () => page.locator('#renderMode').selectOption('h48c32'));
  const plain = await capture(false, () => page.locator('#packRectArt').uncheck());
  assert.equal(packed.frame.t, time);
  assert.equal(plain.frame.t, time);
  const batch = packed.frame.draws.find(draw => draw.kind === 'rect_runs' && draw.h === sprite.h
    && Math.abs(draw.w - sprite.w) < 1e-6 && Math.abs(draw.y + draw.h - sprite.y) < 1e-6);
  assert(batch && packed.frame.rectBatches[batch.batch - 1].length > 0, 'Weekly boss sprite should use a rectangle batch');
  assert(packed.frame.draws.length < plain.frame.draws.length);
  assert.equal(packed.encoding, 'gzip');
  assert.equal(plain.encoding, 'gzip');
  assert(packed.bytes > 0 && packed.bytes < plain.bytes);
  assert.equal(packed.image, plain.image, 'Switching grouping on the frozen frame changes the canvas');
  assert.deepEqual(errors, []);
  const proof = {boss:packed.frame.weeklyBoss.id, profile:'h48c32', time, canvasIdentical:true,
    packed:{gzipBytes:packed.bytes, draws:packed.frame.draws.length},
    plain:{gzipBytes:plain.bytes, draws:plain.frame.draws.length}};
  await fs.writeFile(output, JSON.stringify(proof, null, 2) + '\n');
  console.log(proof);
} finally {
  await browser.close();
}
