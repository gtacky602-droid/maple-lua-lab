import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url = process.env.LAB_URL || 'http://127.0.0.1:9075/';
const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
const browser = await chromium.launch({channel:'chrome', headless:true});
const errors = [];
const slot = (page, number) => page.locator('#skillSlots button').nth(number-1);

async function prepare(partner) {
 const page = await browser.newPage({viewport:{width:1280,height:930}});
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles(`work/coop-element-${partner}.json`);
 await page.waitForFunction(partner => {
  const frame = window.lab.frame;
  return frame.story?.node === 'nod-port' && frame.companion?.id === partner;
 }, partner);
 await waypointDriver(page,nodes,{walkTimeout:18000}).cross('nod-field');
 await page.locator('#coopPanel summary').click();
 return page;
}

function waitColor(page, color, visible=true) {
 return page.waitForFunction(([color,visible]) =>
  window.lab.frame.draws.some(draw => draw.color === color) === visible,
  [color,visible]);
}

function waitNotice(page, name) {
 return page.waitForFunction(name => document.querySelector('#skillCondition').textContent.includes(name), name);
}

try {
 const [host, guest] = await Promise.all([prepare('columbina'), prepare('wanderer')]);
 await host.locator('#coopCreate').click();
 await host.waitForFunction(() => window.lab.frame.coop?.code);
 const code = await host.evaluate(() => window.lab.frame.coop.code);
 await guest.locator('#coopCode').fill(code);
 await guest.locator('#coopJoin').click();
 await guest.waitForFunction(code => {
  const room = window.lab.frame.coop;
  return room?.code === code && room.peers[0]?.actors.length === 2;
 }, code);

 await slot(guest,3).click();
 await waitNotice(guest,'コロンビーナ');
 await slot(host,3).click();
 await Promise.all([waitColor(host,'#c6d0ff'),waitColor(guest,'#c6d0ff')]);
 await slot(host,2).click();
 await waitNotice(host,'放浪者');
 await slot(guest,2).click();
 await guest.waitForFunction(() => window.lab.frame.starSeed?.radius >= 180);
 await waitColor(host,'#a5e8dc');
 assert.equal(await host.evaluate(() => Boolean(window.lab.frame.starSeed)), false);
 await Promise.all([waitColor(host,'#a5e8dc',false),waitColor(guest,'#a5e8dc',false)]);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-lunar-star-browser.json',JSON.stringify({
  browser:'Chrome', twoSeparateBrowserContexts:true, map:'nod-field',
  guestCannotUseHostsColumbina:true, hostCannotUseGuestsWanderer:true,
  lunarCastVisibleOnBothViews:true, starSeedVisibleAndExpiresOnBothViews:true, errors,
 },null,2)+'\n');
 console.log('Chrome verified personal companion conditions and shared lunar/star effects.');
} finally {
 await browser.close();
}
