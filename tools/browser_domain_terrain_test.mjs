import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { waypointDriver } from './browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));

async function loadedScenery(page, expected) {
  const scenery = await page.evaluate(async () => {
    const { loadScenery, sceneryStatus } = await import('./scenery.js');
    await loadScenery(window.lab.frame);
    return sceneryStatus(window.lab.frame);
  });
  assert.equal(scenery.state, 'ready');
  assert.equal(scenery.key, expected);
  return scenery;
}

async function visit(browser, suite, field, errors) {
  const destination = field.beyond || field.host;
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
    await page.locator('#importSave').setInputFiles('work/' + (field.fixture || suite.prefix + '-terrain-fixture.json'));
    await drive.waitNode(suite.hub);
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
    if (suite.compareBackgrounds) {
      const link = page.locator('#atlasBackgroundCompare');
      assert.equal(await link.isVisible(),true);
      assert.equal(await link.getAttribute('href'),'map-art.html?node='+field.stage+'&placements=live&compare=background');
      map.backgroundComparison = await link.getAttribute('href');
    }
    assert.ok(map.adjacent.includes(field.host) && map.adjacent.includes(destination));
    if (field.pocketRoles) {
      assert.equal(await page.locator('#atlasRareLegend').isVisible(),true);
      map.pockets = {};
      for (const [id, role, height] of field.pocketRoles) {
        const button = page.locator('#atlasRoutes button').filter({hasText:nodes[id].name});
        const label = await button.innerText();
        assert.ok(label.includes(role === 'rare_pocket' ? '希少遭遇' : '精鋭'));
        assert.ok(label.includes(height < 480 ? '上の足場の門' : '地上の門'));
        const route = await page.evaluate(id=>window.lab.frame.worldMap.routes.find(r=>r.id===id),id);
        assert.equal(route.pocketRole,role);
        assert.equal(route.entryHeight,height);
        await button.click();
        await page.waitForFunction(id => window.lab.frame.worldMap?.selected?.id === id,id);
        assert.ok((await page.locator('#atlasPlaceLevel').innerText()).includes(role === 'rare_pocket' ? '希少遭遇' : '精鋭'));
        await page.locator('#atlasCurrent').click();
        await page.waitForFunction(id => window.lab.frame.worldMap?.selected?.id === id,field.stage);
        map.pockets[id] = label;
      }
    }
    await page.locator('#atlasRoutes button').filter({ hasText: nodes[destination].name }).click();
    await page.waitForFunction(id => {
      const guide = window.lab.frame.worldMap?.guide;
      return guide?.status === 'ready' && guide.stops.length === 1 && guide.stops[0].id === id;
    }, destination);
    map.next = await page.evaluate(() => window.lab.frame.worldMap.guide.stops[0].id);
    if (field.weeklyPreview) {
      const [preview] = await Promise.all([page.waitForEvent('popup'), page.locator('#atlasBackgroundCompare').click()]);
      try {
        await preview.waitForFunction(id=>window.mapArt?.liveView && window.mapArt.node===id && window.mapArt.count===1,destination);
        const [boss] = await preview.evaluate(()=>window.mapArt.placements);
        assert.equal(boss.species,field.weeklyPreview);
        assert.ok((await preview.locator('#status').innerText()).includes('開戦時のボス位置'));
        map.openingPose = boss;
      } finally { await preview.close(); }
    }
    await page.keyboard.press('Escape');
    await atlas.waitFor({ state: 'hidden' });

    await drive.walk(field.x);
    await drive.changeHeight(480);
    const start = await drive.actor();
    assert.equal(start.y, 480);
    await drive.changeHeight(field.y);
    const landed = await drive.actor();
    assert.ok(landed.ground && landed.y === field.y);
    const scenery = await loadedScenery(page, nodes[field.stage].scenery);
    if (field.screenshot) {
      await page.locator('#game').screenshot({ path: 'evidence/' + suite.prefix + '-' + field.name + '-terrain.png' });
    }
    const detours = field.detours || (field.beyond ? [{ id: field.beyond, scenery: field.pocketScenery }] : []);
    const returns = [];
    for (const detour of detours) {
      await drive.cross(detour.id);
      const pocketScenery = detour.scenery ? await loadedScenery(page, detour.scenery) : undefined;
      await drive.cross(field.stage);
      const returnHeight = (await drive.actor()).y;
      const returnGate = nodes[detour.id].exits.find(exit => exit.to === field.stage);
      assert.equal(returnHeight, returnGate.arrivalY ?? 480);
      returns.push({ id: detour.id, returnHeight, pocketScenery });
    }
    await drive.cross(field.host);
    const { returnHeight, pocketScenery } = returns[0] || {};
    return { stage: field.stage, ...(field.existing ? { existingTerrain: true } : {}), scenery, atlas: map, jump: [start.y, landed.y],
      returnHeight, pocketScenery, journeys: drive.journeys, ...(field.detours ? { detours: returns } : {}) };
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

export async function testDomainTerrain(chromium, suite, fields) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const proof = {};
  const errors = [];
  try {
    for (let i = 0; i < fields.length; i += 2) {
      const pair = fields.slice(i, i + 2);
      const results = await Promise.all(pair.map(field => visit(browser, suite, field, errors)));
      pair.forEach((field, index) => { proof[field.name] = results[index]; });
    }
    const results = Object.values(proof);
    assert.equal(new Set(results.map(({ atlas }) => [atlas.x, atlas.y].join(','))).size, fields.length);
    if (suite.uniqueBackgrounds) assert.equal(new Set(results.map(({ scenery }) => scenery.file)).size, fields.length);
    assert.deepEqual(errors, []);
    await fs.writeFile('evidence/' + suite.prefix + '-terrain-browser.json', JSON.stringify({ ...proof, errors }, null, 2) + '\n');
    console.log('Chrome confirmed ' + fields.length + ' domain approaches, landings, atlas routes and returns.');
  } finally {
    await browser.close();
  }
}
