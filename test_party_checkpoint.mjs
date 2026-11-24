import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url = process.env.LAB_URL || 'http://127.0.0.1:9074/';
const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
const browser = await chromium.launch({channel:'chrome', headless:true});
const errors = [];
const savedKey = 'maple-lua-lab.checkpoint.v1';

async function openGame() {
 const page = await browser.newPage({viewport:{width:1280,height:930}});
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 return page;
}

function restoreResponse(page) {
 return page.waitForResponse(response => response.url().endsWith('/api/frame') &&
  Boolean(response.request().postDataJSON()?.restore));
}

function checkRestored(frame, saved) {
 assert.equal(frame.story.node, 'mond-town');
 assert.deepEqual(frame.actors.map(actor => actor.hp),
  [saved.partyCombat.traveler.hp, saved.partyCombat.companion.hp]);
 assert.equal(frame.gauge, saved.gauge);
 const restored = frame.actors[0].cd.dodge;
 const expected = saved.partyCombat.traveler.cooldowns.dodge;
 assert.ok(restored > 0 && restored <= expected && expected - restored <= .11);
 return restored;
}

try {
 const page = await openGame();
 const driver = waypointDriver(page,nodes);
 await page.locator('#importSave').setInputFiles('work/party-checkpoint-opening.json');
 await driver.waitNode('mond-town');
 await page.waitForFunction(() => window.lab.frame.progression?.level === 16);
 await driver.cross('mond-road');
 await driver.cross('anemo-approach');
 await driver.cross('anemo-field-basin');
 await driver.walk(696);
 await page.waitForFunction(() => {
  const actor = window.lab.frame.actors[0];
  return actor.hp > 0 && actor.hp < actor.maxhp;
 });
 await page.keyboard.press('ShiftLeft');
 await page.waitForFunction(() => window.lab.frame.actors[0].cd.dodge > 1);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved = JSON.parse(await page.evaluate(key => localStorage.getItem(key),savedKey));
 assert.ok(saved.partyCombat.traveler.cooldowns.dodge > 1);
 assert.ok(saved.partyCombat.traveler.hp < (await driver.actor()).maxhp);
 assert.equal(saved.story.node,'anemo-field-basin');
 const download = page.waitForEvent('download');
 await page.locator('#exportSave').click();
 const file = await download;
 const text = await fs.readFile(await file.path(),'utf8');
 assert.deepEqual(JSON.parse(text).partyCombat,saved.partyCombat);

 await page.reload();
 await page.waitForFunction(() => window.lab?.frame);
 const reload = restoreResponse(page);
 await page.locator('#loadProgress').click();
 const reloaded = checkRestored(await (await reload).json(),saved);

 const receiver = await openGame();
 const upload = restoreResponse(receiver);
 await receiver.locator('#importSave').setInputFiles({name:'party-checkpoint.json',mimeType:'application/json',buffer:Buffer.from(text)});
 const imported = checkRestored(await (await upload).json(),saved);
 await receiver.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存'));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/party-checkpoint-browser.json',JSON.stringify({
  browser:'Chrome', savedFrom:saved.story.node, restoredAt:'mond-town',
  savedHp:[saved.partyCombat.traveler.hp,saved.partyCombat.companion.hp],
  savedDodgeSeconds:saved.partyCombat.traveler.cooldowns.dodge,
  reloadedDodgeSeconds:reloaded, importedDodgeSeconds:imported,
  loadedAfterReload:true, exportedAndImportedInSeparateContext:true, errors,
 },null,2)+'\n');
 console.log('Chrome verified HP and cooldown after reload and JSON transfer to a second context.');
} finally {
 await browser.close();
}
