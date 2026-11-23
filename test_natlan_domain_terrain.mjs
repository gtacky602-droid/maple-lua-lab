import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
const fields = [
  { name: 'waterfall', host: 'nat-wp-72414', stage: 'sites-hunt-73159',
    beyond: 'tepeacac-waterfall-wall', x: 650, y: 421 },
  { name: 'cave', host: 'nat-wp-72422', stage: 'sites-hunt-73160',
    beyond: 'toyac-rainbow-key-cave', x: 2480, y: 406 },
  { name: 'cliff', host: 'nat-wp-79051', stage: 'sites-hunt-81383',
    beyond: 'sites-hunt-81383-pocket-1', x: 2380, y: 394, fixture: 'natlan-western-domain-terrain-fixture.json' },
  { name: 'shore', host: 'nat-wp-82564', stage: 'sites-hunt-82577',
    beyond: 'atocpan-domain-side-clearing', x: 2350, y: 434, fixture: 'natlan-western-domain-terrain-fixture.json' },
  { name: 'central', host: 'nat-wp-72445', stage: 'sites-hunt-73161',
    beyond: 'sites-hunt-73161-pocket-1', x: 2380, y: 348, fixture: 'natlan-western-domain-terrain-fixture.json',
    existing: true },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const proof = {};
const errors = [];

async function visit(field) {
  const page = await browser.newPage({ viewport: { width: 1240, height: 900 } });
  page.setDefaultTimeout(20000);
  const drive = waypointDriver(page, nodes, { walkTimeout: 20000 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().endsWith('/api/frame') && !response.ok()) errors.push('Frame HTTP ' + response.status());
  });
  try {
    await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9068/');
    await page.waitForFunction(() => window.lab?.frame);
    await page.locator('#importSave').setInputFiles('work/' + (field.fixture || 'natlan-domain-terrain-fixture.json'));
    await drive.waitNode('natlan-hub');
    await drive.warp(field.host);
    await drive.cross(field.stage);
    const runtimePlatforms = await page.evaluate(() =>
      window.lab.frame.platforms.map(({ x, y, w }) => ({ x, y, w })));
    assert.deepEqual(runtimePlatforms, nodes[field.stage].platforms);

    await page.keyboard.press('KeyM');
    const atlas = page.locator('#worldAtlas');
    await atlas.waitFor();
    await page.waitForFunction(id => {
      const map = window.lab.frame.worldMap;
      return map?.selected?.id === id && map.selected.current && map.points.some(p => p.id === id && p.current);
    }, field.stage);
    const map = await page.evaluate(() => {
      const view = window.lab.frame.worldMap;
      const { x, y } = view.points.find(p => p.current);
      return { region: view.region, x, y, adjacent: view.routes.map(r => r.id) };
    });
    assert.ok(map.adjacent.includes(field.host) && map.adjacent.includes(field.beyond));
    await page.locator('#atlasRoutes button').filter({ hasText: nodes[field.beyond].name }).click();
    await page.waitForFunction(id => {
      const guide = window.lab.frame.worldMap?.guide;
      return guide?.status === 'ready' && guide.stops.length === 1 && guide.stops[0].id === id;
    }, field.beyond);
    map.next = await page.evaluate(() => window.lab.frame.worldMap.guide.stops[0].id);
    await page.keyboard.press('Escape');
    await atlas.waitFor({ state: 'hidden' });

    await drive.walk(field.x);
    await drive.changeHeight(480);
    const start = await drive.actor();
    assert.equal(start.y, 480);
    await drive.changeHeight(field.y);
    const landed = await drive.actor();
    assert.ok(landed.ground && landed.y === field.y);
    const scenery = await page.evaluate(async () => {
      const { loadScenery, sceneryStatus } = await import('./scenery.js');
      await loadScenery(window.lab.frame);
      return sceneryStatus(window.lab.frame);
    });
    assert.equal(scenery.state, 'ready');
    assert.equal(scenery.key, nodes[field.stage].scenery);
    if (!field.existing) {
      await page.locator('#game').screenshot({ path: 'evidence/natlan-domain-' + field.name + '-terrain.png' });
    }
    await drive.cross(field.beyond);
    await drive.cross(field.stage);
    const returned = await drive.actor();
    const returnGate = nodes[field.beyond].exits.find(exit => exit.to === field.stage);
    assert.equal(returned.y, returnGate.arrivalY ?? 480);
    await drive.cross(field.host);
    return { stage: field.stage, ...(field.existing ? { existingTerrain: true } : {}), scenery, atlas: map, jump: [start.y, landed.y],
      returnHeight: returned.y, journeys: drive.journeys };
  } catch (error) {
    console.error(field.name, await page.evaluate(() => {
      const f = window.lab?.frame;
      return { node: f?.story?.node, actor: f?.actors[f.active - 1], portal: f?.storyNearbyPortal,
        atlas: f?.worldMap?.selected, platforms: f?.platforms };
    }));
    throw error;
  } finally {
    await page.close();
  }
}

try {
  for (const field of fields) proof[field.name] = await visit(field);
  const results = Object.values(proof);
  assert.equal(new Set(results.map(({ atlas }) => [atlas.x, atlas.y].join(','))).size, fields.length);
  assert.equal(new Set(results.map(({ scenery }) => scenery.file)).size, fields.length);
  assert.deepEqual(errors, []);
  await fs.writeFile('evidence/natlan-domain-terrain-browser.json', JSON.stringify({ ...proof, errors }, null, 2) + '\n');
  console.log('Chrome confirmed ' + fields.length + ' domain approaches, landings, atlas routes and returns.');
} finally {
  await browser.close();
}
