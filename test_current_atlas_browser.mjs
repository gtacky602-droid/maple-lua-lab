import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const [source, output] = process.argv.slice(2);
assert(source && output, 'Usage: node test_current_atlas_browser.mjs SAVE.json OUTPUT_DIR');
await fs.mkdir(output, {recursive:true});
const raw = await fs.readFile(source);
const save = JSON.parse(raw);
const {nodes} = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const {regions} = JSON.parse(await fs.readFile('content/world-atlas.json', 'utf8'));
const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280, height:900}});
const drive = waypointDriver(page, byId);
const atlas = page.locator('#worldAtlas');
const game = page.locator('#game');
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const frame = () => page.evaluate(() => window.lab.frame);

async function openGuide(target) {
  await game.click();
  await page.keyboard.press('KeyM');
  await atlas.waitFor();
  await page.locator('#atlasField').selectOption(target);
  await page.waitForFunction(id => window.lab.frame.worldMap?.selected?.id === id, target);
  return (await frame()).worldMap.guide;
}

async function closeMap() {
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  await page.waitForFunction(() => !window.lab.frame.worldMap);
  await game.click();
}

async function goToHub(id) {
  await page.getByRole('button', {name:'拠点へ：' + byId[id].name, exact:true}).click();
  await drive.waitNode(id);
  await game.click();
}

try {
  await page.goto(process.env.LAB_URL || 'http://127.0.0.1:19752/');
  await page.waitForFunction(() => window.lab?.frame);
  await page.locator('#importSave').setInputFiles(source);
  await drive.waitNode(save.story.node);
  await goToHub('natlan-flag-staging');
  await drive.cross('natlan-flag-ledges');
  const cleft = 'natlan-flag-cleft';
  const rock = await openGuide(cleft);
  assert.equal(rock.stops[0].id, cleft);
  assert.match(rock.stops[0].hint, /低い岩棚から二段登る/);
  assert.equal(await page.locator('#atlasRegion option[value="branch-08"]').count(), 0);
  const activeRegions = regions.filter(region => region.id !== 'branch-08');
  for (const region of activeRegions) {
    const visited = region.points.filter(point => save.story.visited[point.id]).length;
    const text = await page.locator(`#atlasRegion option[value="${region.id}"]`).textContent();
    assert.match(text, new RegExp(`${visited}\\s*[／/]\\s*${region.points.length}`));
  }
  await atlas.screenshot({path:path.join(output, 'natlan-rock-shelves-atlas.png')});
  await closeMap();
  for (const [x, y] of [[350, 390], [1007, 302]]) {
    await drive.walk(x);
    await drive.changeHeight(y);
  }
  await drive.cross(cleft);

  await goToHub('sites-sim-04');
  const train = 'sites-star-rail-out';
  const destination = 'sites-sim-05';
  const rail = await openGuide(destination);
  assert.deepEqual(rail.stops.map(stop => stop.id), [train, destination]);
  assert.equal(rail.stops[1].automaticArrival, true);
  await closeMap();
  await drive.cross(train);
  await drive.waitNode(destination);
  assert.equal((await frame()).voyage, undefined);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(() => window.lab?.frame);
  await page.locator('#loadProgress').click();
  await drive.waitNode(destination);
  const restored = await frame();
  assert.deepEqual(restored.story.visited, save.story.visited);
  assert.deepEqual(restored.story.quests, save.story.quests);
  assert.deepEqual(errors, []);
  const proof = {
    sourceSha256:createHash('sha256').update(raw).digest('hex'),
    rockShelves:{hint:rock.stops[0].hint, entered:cleft},
    train:{boarded:train, arrived:destination, automaticArrival:true},
    checkedRegionCounts:activeRegions.length, suspendedRegionHidden:true, restoredAt:destination, errors,
  };
  await fs.writeFile(path.join(output, 'current-atlas-browser.json'), JSON.stringify(proof, null, 2) + '\n');
} finally {
  await browser.close();
}
