import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const [input, output] = process.argv.slice(2);
assert(input && output, 'Usage: node test_standard_adventure_save.mjs SAVE.json OUTPUT_DIR');
await fs.mkdir(output, {recursive:true});
const raw = await fs.readFile(input);
const save = JSON.parse(raw);
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280, height:900}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const atlas = page.locator('#worldAtlas');
const progress = page.locator('#questStoryProgress');
const destination = 'natlan-iansan-training';

async function waitForAdventure() {
  await page.waitForFunction(node => window.lab?.frame.story?.node === node &&
    window.lab.frame.progression?.level === 200, save.story.node);
  await progress.waitFor({state:'attached'});
  assert.match(await progress.textContent(), /報告済み 276 ／ 276件/);
}

async function checkpoint() {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('保存しました'));
  return page.evaluate(() => JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
}

try {
  await page.goto(process.env.LAB_URL || 'http://127.0.0.1:19750/');
  await page.waitForFunction(() => window.lab?.frame);
  await page.locator('#importSave').setInputFiles(input);
  await waitForAdventure();
  await progress.screenshot({path:path.join(output, 'quest-journal.png')});
  assert.equal(await page.locator('#questFilter optgroup[label="受注地域別の未報告依頼"]').count(), 0);
  await page.locator('#game').click();
  await page.keyboard.press('KeyM');
  await atlas.waitFor();
  await page.locator('#atlasRegion').selectOption('region-06');
  await page.locator('#atlasField').selectOption(destination);
  await page.waitForFunction(id => window.lab.frame.worldMap?.selected?.id === id, destination);
  const guide = await page.evaluate(() => window.lab.frame.worldMap.guide);
  assert.equal(guide.status, 'ready');
  assert.equal(guide.stops.at(-1).id, destination);
  await atlas.screenshot({path:path.join(output, 'festival-atlas.png')});
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  const previous = await checkpoint();
  await page.reload();
  await page.waitForFunction(() => window.lab?.frame);
  await page.locator('#loadProgress').click();
  await waitForAdventure();
  const restored = await checkpoint();
  assert.deepEqual(restored.story.quests, save.story.quests);
  assert.deepEqual(restored.progression, previous.progression);
  assert.deepEqual(restored.inventory.items, previous.inventory.items);
  for (const group of ['bosses', 'weekly', 'stygian']) {
    assert.deepEqual(restored.endgame[group], save.endgame[group]);
  }
  assert.equal(Object.keys(restored.endgame.weekly).length, 56);
  assert.equal(Object.keys(restored.endgame.stygian).length, 28);
  assert.deepEqual(errors, []);
  const proof = {
    sourceSha256:createHash('sha256').update(raw).digest('hex'),
    checkpoint:restored.story.node, level:restored.progression.level,
    reports:Object.keys(restored.story.quests).length, weeklyRecords:56, stygianRecords:28,
    guide:guide.stops.map(({from, id, label}) => ({from, id, label})),
    restoredFromBrowserSave:true, errors,
  };
  await fs.writeFile(path.join(output, 'standard-adventure-browser.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log('Chrome restored all 276 reports and 84 difficulty records.');
} finally {
  await browser.close();
}
