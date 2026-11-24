import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
const browser = await chromium.launch({channel:'chrome', headless:true});
const url = process.env.LAB_URL || 'http://127.0.0.1:9072/';
const errors = [];

async function prepare() {
 const context = await browser.newContext({viewport:{width:1280,height:930}});
 const page = await context.newPage();
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/shared-water-field-lv84.json');
 await page.waitForFunction(() => window.lab.frame.progression?.level === 84);
 await waypointDriver(page,nodes).cross('mond-road');
 await page.locator('#coopPanel summary').click();
 return page;
}

function waitForField(page, own) {
 return page.waitForFunction(own => {
  const frame = window.lab.frame;
  return Boolean(frame.healingField) === own && frame.draws.some(draw => draw.color === '#70cce9');
 }, own);
}

try {
 const [host, guest] = await Promise.all([prepare(), prepare()]);
 await host.locator('#coopCreate').click();
 await host.waitForFunction(() => window.lab.frame.coop?.code);
 const code = await host.evaluate(() => window.lab.frame.coop.code);
 await guest.locator('#coopCode').fill(code);
 await guest.locator('#coopJoin').click();
 await guest.waitForFunction(code => {
  const room = window.lab.frame.coop;
  return room?.code === code && room.peers[0]?.actors.length === 2;
 }, code);
 await host.locator('#skillSlots button').first().click();
 await Promise.all([waitForField(host, true), waitForField(guest, false)]);
 await guest.waitForFunction(() => !window.lab.frame.draws.some(draw => draw.color === '#70cce9'));
 assert.deepEqual(errors, []);
 await fs.writeFile('evidence/shared-water-field-browser.json', JSON.stringify({
  browser:'Chrome', usedLoadoutInField:true, guestSawHostField:true, guestSawExpiration:true, errors,
 }, null, 2)+'\n');
 console.log('Chrome verified casting a shared water field and its expiration in both views.');
} finally {
 await browser.close();
}
