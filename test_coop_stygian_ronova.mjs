import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
const base = process.env.LAB_URL || 'http://127.0.0.1:9068/';
const prefix = 'evidence/coop-stygian-ronova';
const saveKey = 'maple-lua-lab.checkpoint.v1';
const errors = [];
const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--disable-gpu']});
const frame = page => page.evaluate(() => window.lab.frame);

async function open(set) {
 const context = await browser.newContext({viewport: {width: 1230, height: 940}});
 const page = await context.newPage();
 page.setDefaultTimeout(25000);
 page.on('pageerror', error => errors.push(error.message));
 page.on('response', response => {
  if (response.url().endsWith('/api/frame') && !response.ok()) errors.push(`Frame HTTP ${response.status()}`);
 });
 await page.goto(base);
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/coop-stygian-ronova-fixture.json');
 const route = waypointDriver(page, nodes);
 await route.waitNode('snezhnaya-hub');
 await route.cross('sne-stygian-last-gate');
 await page.locator('#coopPanel summary').click();
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption(set);
 return page;
}

async function drive(page, left) {
 await page.evaluate(left => {
  const held = new Set(), seen = new Set();
  const trail = window.ronovaTrail = {stages: [], judgment: null, gates: [], approved: 0, lampSpends: 0, road: 0};
  let card, priorTick, jumpUntil = 0;
  function key(code, pressed) {
   if (held.has(code) === pressed) return;
   if (pressed) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', {code, bubbles: true, cancelable: true}));
  }
  function loop() {
   const f = window.lab.frame, v = f.endgameRun, b = f.boss;
   let rightward = false, leftward = false, jump = false, attack = false;
   if (v?.status === 'fighting' && !v.gathering) {
    if (trail.stages.at(-1) !== v.stage) trail.stages.push(v.stage);
    if (v.card !== card || v.tick < priorTick) jumpUntil = -1;
    card = v.card;
    priorTick = v.tick;
    for (const event of Object.values(f.events || {})) {
     if (seen.has(event.seq)) continue;
     seen.add(event.seq);
     if (event.kind === 'stygian:ronova:RN08:verdict-safe') trail.approved++;
     if (event.kind === 'stygian:ronova:lamp-spent') trail.lampSpends++;
    }
    const a = f.actors[f.active - 1], dx = b.x - a.x, t = v.tick;
    let goal = a.x, point;
    if (['phase', 'enter', 'returning'].includes(v.phase)) {
     // Wait for the timeline or for this pair to return.
    } else if (v.card === 'RN05' && t < 138) {
     const area = v.areas?.[0];
     if (t >= 84 && area) {
      trail.judgment ??= [area.left, area.right];
      if (a.x > area.left - 19 && a.x < area.right + 19) {
       const lo = area.left - 35, hi = area.right + 35;
       goal = hi > 925 || (lo > 35 && Math.abs(a.x-lo) < Math.abs(a.x-hi)) ? lo : hi;
      }
     }
    } else if (v.card === 'RN08' && t < 864) {
     if (v.gate) {
      goal = v.gate.x;
      if (!trail.gates.includes(goal)) trail.gates.push(goal);
     } else if (t >= 252 && v.found < 2) {
      const shadows = v.shadows || [];
      point = left ? shadows[0] : shadows.at(-1);
     } else goal = left ? 224 : 736;
    } else if (v.card === 'RN12' && v.road && t < 690) {
     trail.road = Math.max(trail.road, v.road.passed);
     if (v.road.x !== undefined) point = v.road;
    } else if ((v.card === 'RN03' || v.card === 'RN06') && v.shadows?.length && v.found < v.goal) {
     point = left ? v.shadows[0] : v.shadows.at(-1);
    } else if (v.card === 'RN07' && v.safe) {
     goal = v.safe.x;
    } else {
     goal = b.x - Math.sign(dx || 1) * 76;
     if (Math.abs(goal-a.x) < 10 && Math.sign(dx) !== a.dir) goal = a.x + Math.sign(dx) * 19;
     attack = Math.abs(dx) < 110 && Math.sign(dx) === a.dir && a.y > 420;
    }
    if (point) {
     goal = point.x;
     if (point.y < 406 && a.y > 407 && Math.abs(a.x-point.x) < 127 && t > jumpUntil) jumpUntil = t + 42;
     jump = t < jumpUntil;
    }
    leftward = goal < a.x - 6;
    rightward = goal > a.x + 6;
   }
   key('KeyA', leftward); key('KeyD', rightward); key('Space', jump); key('KeyJ', attack);
   if (v?.status === 'fighting') requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 }, left);
}

try {
 const [host, guest] = await Promise.all([open('troupe'), open('gladiator')]);
 await host.locator('#coopCreate').click();
 const code = await (await host.waitForFunction(() => window.lab.frame.coop.code)).jsonValue();
 await guest.locator('#coopCode').fill(code);
 await guest.locator('#coopJoin').click();
 await guest.waitForFunction(code => window.lab.frame.coop.code === code, code);
 await host.locator('#stygianStart').click();
 await host.waitForFunction(() => window.lab.frame.endgameRun?.gathering > 0);
 await guest.locator('#stygianStart').click();
 await guest.waitForFunction(() => window.lab.frame.endgameRun?.gathering > 0);
 assert.deepEqual((await Promise.all([frame(host), frame(guest)])).map(f => f.boss.maxhp), [5460, 5460]);
 await Promise.all([drive(host, true), drive(guest, false)]);
 await Promise.all([host, guest].map(page => page.waitForFunction(() => window.ronovaTrail.judgment, null, {timeout: 90000})));
 await host.locator('#game').screenshot({path: prefix + '-judgment.png'});
 const gates = await Promise.all([host, guest].map(async page => {
  await page.waitForFunction(() => {
   const v = window.lab.frame.endgameRun;
   return v?.card === 'RN08' && v.gate?.inside && v.tick >= 675;
  }, null, {timeout: 105000});
  const {endgameRun: v} = await frame(page);
  return {x: v.gate.x, life: v.life, lamps: v.lamps};
 }));
 assert.deepEqual(gates.map(g => g.x), [224, 736]);
 await Promise.all([host, guest].map((page, i) => page.locator('#game').screenshot({path: `${prefix}-gate-${i+1}.png`})));
 await Promise.all([host, guest].map(page => page.waitForFunction(() => window.lab.frame.endgameRun?.status === 'clear')));
 const settled = await Promise.all([frame(host), frame(guest)]);
 const rewards = settled.map(f => f.endgameRun.matchReward);
 assert.deepEqual(rewards.map(r => r.set), ['黄金の劇団', '剣闘士のフィナーレ']);
 assert.ok(rewards.every(r => r.first && r.mora === 54300));
 const trails = await Promise.all([host, guest].map(page => page.evaluate(() => window.ronovaTrail)));
 assert.deepEqual(trails[0].judgment, trails[1].judgment);
 assert.ok(trails.every(t => t.approved === 1 && t.lampSpends === 0 && t.road === 4));
 assert.ok(trails.every(t => JSON.stringify(t.stages) === '[1,2,3,4]'));
 await host.locator('#game').screenshot({path: prefix + '-clear.png'});
 await Promise.all([host, guest].map(async page => {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.endgame?.stygian?.['ronova:normal']?.clears === 1, saveKey);
 }));
 assert.deepEqual(errors, []);
 const proof = {players: 2, mode: 'normal', hp: 5460, gates, trails, rewards, savedClears: 1, errors};
 await fs.writeFile(prefix + '-browser.json', JSON.stringify(proof, null, 2) + '\n');
 console.log('Ronova Chrome: shared warning, individual gates, four stages and two saves passed');
} finally {
 await browser.close();
}
