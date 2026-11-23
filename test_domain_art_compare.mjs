import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.LAB_URL || 'http://127.0.0.1:9068';
const regions = {
  natlan: { fields: [73159, 73160, 81383, 82577], screenshot: 73159 },
  sumeru: {
    fields: [36703, 36704, 36705, 41694, 41817, 41818], screenshot: 36704,
    backgrounds: { 36703: 'asimonField', 36704: 'sumeruDesertTombApproach', 36705: 'asimonField',
      41694: 'tunigiExcavation', 41817: 'wenutField', 41818: 'tunigi' },
    sideRooms: { 36703: 'asimonField', 36704: 'wenutField', 36705: 'asimonField',
      41694: 'asimonField', 41817: 'wenutField' },
  },
  fontaine: {
    fields: [50034, 50057, 50067, 56792, 63738, 68347], screenshot: 50034,
    backgrounds: { 50034: 'fontaineScentShore', 50057: 'fontaineDelivery', 50067: 'bygone',
      56792: 'bygoneResonance', 63738: 'tideCalibration', 68347: 'coastalLookout' },
  },
};
const region = process.argv[2] ?? 'natlan';
assert.ok(Object.hasOwn(regions, region), 'Expected natlan, sumeru or fontaine');
const prefix = 'evidence/' + region + '-domain-art-compare';
const { fields, screenshot, backgrounds, sideRooms = {} } = regions[region];
const aliases = { 'hydro-slime': 'hydro-slime-reference', 'pyro-slime': 'pyro-slime-reference' };
const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const spawnData = JSON.parse(await fs.readFile('content/enemy-spawns.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1980, height: 1080 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(60000);

async function profileView(profile) {
  await page.selectOption('#profile', profile);
  await page.waitForFunction(value => window.mapArt?.profile === value, profile);
  return page.evaluate(async () => {
    async function pixelHash(id) {
      const canvas = document.getElementById(id);
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash), part => part.toString(16).padStart(2, '0')).join('');
    }
    const match = document.getElementById('status').textContent.match(/矩形([\d,]+)個/);
    const viewport = document.getElementById('viewportCost').textContent.match(/矩形\s+([\d,]+)個/);
    return {
      rectangles: Number(match[1].replaceAll(',', '')),
      viewportRectangles: Number(viewport[1].replaceAll(',', '')),
      png: await pixelHash('png'), rect: await pixelHash('rect'),
    };
  });
}

try {
  const results = [];
  for (const marker of fields) {
    const id = 'sites-hunt-' + marker;
    const node = graph.nodes.find(n => n.id === id);
    const live = spawnData.nodes[id];
    const expectedPlacements = live.map(e => [e.id, e.x, node.platforms[e.platform].y, aliases[e.art] ?? e.art]);
    if (!results.length) {
      await page.goto(new URL('/map-art.html?node=' + id, base).href);
    } else {
      await page.selectOption('#node', id);
    }
    await page.waitForFunction(id => window.mapArt?.node === id && window.mapArt.backgroundState === 'ready', id);
    await page.getByRole('button', { name: 'この地点の本編配置を読み込む' }).click();
    await page.waitForFunction(id => window.mapArt.node === id &&
      (!document.getElementById('loadLive').disabled && (window.mapArt.diff || document.getElementById('fileStatus').textContent.includes('中止'))), id);
    assert.ok((await page.locator('#fileStatus').textContent()).includes('本編配置を編集案にコピー'));
    await page.locator('#camera').fill('780');
    await page.locator('#camera').dispatchEvent('input');
    const scene = await page.evaluate(() => window.mapArt);
    assert.equal(scene.count, live.length);
    assert.equal(scene.diff.unchanged, scene.count);
    assert.ok(scene.grounded && !scene.backgroundFallback);
    assert.equal(scene.background, node.scenery);
    if (backgrounds) assert.equal(scene.background, backgrounds[marker]);
    assert.deepEqual(scene.placements.map(e => [e.id, e.x, e.y, e.species]), expectedPlacements);
    assert.equal(scene.camera, 780);
    const standard = await profileView('legacy');
    const light = await profileView('h32c16');
    assert.ok(light.rectangles > 0 && light.rectangles < standard.rectangles);
    assert.ok(light.viewportRectangles > 0 && light.viewportRectangles < standard.viewportRectangles);
    assert.ok(light.viewportRectangles < light.rectangles && standard.viewportRectangles < standard.rectangles);
    assert.equal(light.png, standard.png);
    assert.notEqual(light.rect, standard.rect);
    assert.notEqual(light.png, light.rect);
    if (marker === screenshot) await page.locator('main').screenshot({ path: prefix + '.png' });
    results.push({
      id, name: node.name, count: scene.count, allGrounded: scene.grounded,
      background: scene.backgroundFile, camera: scene.camera,
      standardRectangles: standard.rectangles, light16Rectangles: light.rectangles,
      visibleStandardRectangles: standard.viewportRectangles, visibleLight16Rectangles: light.viewportRectangles,
      reductionPercent: Number((100 * (1 - light.rectangles / standard.rectangles)).toFixed(1)),
    });
  }
  const checkedRooms = [];
  for (const [marker, background] of Object.entries(sideRooms)) {
    const id = 'sites-hunt-' + marker + '-pocket-1';
    await page.selectOption('#node', id);
    await page.waitForFunction(id => window.mapArt?.node === id && window.mapArt.backgroundState === 'ready', id);
    await page.locator('#loadLive').click();
    await page.waitForFunction(() => !document.getElementById('loadLive').disabled);
    const scene = await page.evaluate(() => window.mapArt);
    assert.equal(scene.background, background);
    assert.equal(scene.count, spawnData.nodes[id].length);
    assert.ok(scene.count > 0 && scene.grounded && !scene.backgroundFallback);
    assert.equal(scene.diff?.unchanged, scene.count);
    checkedRooms.push({ id, count: scene.count, allGrounded: true, background: scene.backgroundFile });
  }
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => localStorage.getItem('maple-lua-lab.map-draft.v1')), null);
  const proof = { countsForWholeMap: true, originalPngUnchanged: true, savedDraft: false, fields: results };
  if (checkedRooms.length) proof.sideRooms = checkedRooms;
  await fs.writeFile(prefix + '.json', JSON.stringify(proof, null, 2) + '\n');
  console.table(results);
} finally {
  await browser.close();
}
