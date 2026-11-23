import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.LAB_URL || 'http://127.0.0.1:9068';
const prefix = 'evidence/natlan-domain-art-compare';
const fields = ['sites-hunt-73159', 'sites-hunt-73160', 'sites-hunt-81383', 'sites-hunt-82577'];
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
    return {
      rectangles: Number(match[1].replaceAll(',', '')),
      png: await pixelHash('png'), rect: await pixelHash('rect'),
    };
  });
}

try {
  const results = [];
  for (const id of fields) {
    const node = graph.nodes.find(n => n.id === id);
    const live = spawnData.nodes[id];
    const expectedPlacements = live.map(e => [e.id, e.x, node.platforms[e.platform].y, e.art]);
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
    assert.equal(scene.count, 48);
    assert.equal(scene.diff.unchanged, scene.count);
    assert.ok(scene.grounded && !scene.backgroundFallback);
    assert.equal(scene.background, node.scenery);
    assert.deepEqual(scene.placements.map(e => [e.id, e.x, e.y, e.species]), expectedPlacements);
    assert.equal(scene.camera, 780);
    const standard = await profileView('legacy');
    const light = await profileView('h32c16');
    assert.ok(light.rectangles > 0 && light.rectangles < standard.rectangles);
    assert.equal(light.png, standard.png);
    assert.notEqual(light.rect, standard.rect);
    assert.notEqual(light.png, light.rect);
    if (!results.length) await page.locator('main').screenshot({ path: prefix + '.png' });
    results.push({
      id, name: node.name, count: scene.count, allGrounded: scene.grounded,
      background: scene.backgroundFile, camera: scene.camera,
      standardRectangles: standard.rectangles, light16Rectangles: light.rectangles,
      reductionPercent: Number((100 * (1 - light.rectangles / standard.rectangles)).toFixed(1)),
    });
  }
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => localStorage.getItem('maple-lua-lab.map-draft.v1')), null);
  const proof = { countsForWholeMap: true, originalPngUnchanged: true, savedDraft: false, fields: results };
  await fs.writeFile(prefix + '.json', JSON.stringify(proof, null, 2) + '\n');
  console.table(results);
} finally {
  await browser.close();
}
