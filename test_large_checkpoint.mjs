import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const url = process.env.LAB_URL || 'http://127.0.0.1:9077/';
const browser = await chromium.launch({channel:'chrome',headless:true});
const errors = [];
const fixture = await fs.readFile('work/full-atlas-checkpoint.json');
const save = JSON.parse(fixture);

async function roundTrip(file) {
 const page = await browser.newPage();
 page.on('pageerror',error => errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles(file);
 await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存'));
 const restored = await page.evaluate(() => {
  const f = window.lab.frame;
  return {
   node:f.story.node, visited:f.story.visited, discovered:f.story.discovered,
   items:f.inventory.items, ground:f.inventory.ground, presets:f.partyPresets, level:f.progression.level,
  };
 });
 assert.equal(restored.node,'mond-town');
 assert.deepEqual(restored.visited,save.story.visited);
 assert.deepEqual(restored.discovered,save.story.discovered);
 assert.deepEqual(restored.items,save.inventory.items);
 assert.deepEqual(restored.ground,save.inventory.ground);
 assert.deepEqual(restored.presets,save.partyPresets);
 assert.equal(restored.level,200);
 return page;
}

try {
 assert.ok(fixture.length>64*1024);
 const page = await roundTrip('work/full-atlas-checkpoint.json');
 const download = page.waitForEvent('download');
 await page.locator('#exportSave').click();
 const output = await fs.readFile(await (await download).path());
 await roundTrip({name:'full-atlas-export.json',mimeType:'application/json',buffer:output});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/full-atlas-checkpoint-browser.json',JSON.stringify({
  browser:'Chrome', preparedFixture:true, importedBytes:fixture.length, exportedBytes:output.length,
  visitedNodes:Object.keys(save.story.visited).length, bagItems:save.inventory.items.length,
  groundDrops:save.inventory.ground.length, exportedAndImportedInSeparateContext:true, errors,
 },null,2)+'\n');
 console.log('Chrome transferred the full atlas save between independent browser contexts.');
} finally {
 await browser.close();
}
