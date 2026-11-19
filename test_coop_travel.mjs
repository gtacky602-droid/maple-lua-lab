import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url = process.env.LAB_URL || 'http://127.0.0.1:9000/';
const town = 'mond-town', road = 'mond-road', entry = 'anemo-approach', arena = 'anemo-field-basin';
const fixture = await fs.readFile('work/anemo-hypostasis-field-fixture.json','utf8');
const graph = JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id,node]));
const browser = await chromium.launch({channel:'chrome',headless:true});
const errors = [];
const room = page => page.evaluate(() => window.lab.frame.coop);

async function start() {
 const context = await browser.newContext({viewport:{width:1220,height:940}});
 const page = await context.newPage();
 page.setDefaultTimeout(20000);
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 await page.evaluate(raw => localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(() => window.lab.frame.progression?.level === 16);
 return {page,travel:waypointDriver(page,nodes,{walkTimeout:18000})};
}

async function waitPeer(page,node,sameMap) {
 await page.waitForFunction(([node,sameMap]) => {
  const p = window.lab.frame.coop?.peers?.[0];
  return p?.online && p.map === node && p.actors.length === (sameMap ? 2 : 0);
 },[node,sameMap]);
}

try {
 const [host,guest] = await Promise.all([start(),start()]);
 const a = host.page, b = guest.page;
 await a.locator('#coopPanel summary').click();
 await a.locator('#coopCreate').click();
 await a.waitForFunction(() => window.lab.frame.coop?.code);
 const code = (await room(a)).code;
 for(const node of [road,entry,arena]) await guest.travel.cross(node);
 await b.locator('#coopPanel summary').click();
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await waitPeer(a,arena,false);
 await waitPeer(b,town,false);
 const slot = (await room(b)).slot;
 assert.match(await a.locator('#coopPeers').textContent(),/風鳴りの広場/);
 await host.travel.cross(road);
 await waitPeer(b,road,false);
 assert.match(await b.locator('#coopPeers').textContent(),/南の街道/);
 const before = await Promise.all([a,b].map(room));
 await Promise.all([a,b].map((page,index) => page.waitForFunction(
  tick => window.lab.frame.coop.tick > tick+12,before[index].tick)));
 const split = await Promise.all([a,b].map(room));
 assert.deepEqual(split.map(view => view.map),[road,arena]);
 assert.deepEqual(split.map(view => view.enemies.length),[6,1]);
 await b.locator('#coopPanel').screenshot({path:'evidence/coop-travel-split.png'});

 await guest.travel.walk(690);
 await b.keyboard.down('KeyJ');
 try {
  await b.waitForFunction(() => window.lab.frame.fieldBoss?.hp < 865);
 } finally { await b.keyboard.up('KeyJ'); }
 const wounded = (await room(b)).enemies[0].hp;
 await b.reload();
 await b.waitForFunction(([code,slot]) => window.lab?.frame.coop?.code === code &&
  window.lab.frame.coop.slot === slot,[code,slot]);
 await waitPeer(b,road,false);

 await host.travel.cross(entry);
 assert.equal((await room(a)).code,code);
 await host.travel.cross(arena);
 await waitPeer(a,arena,true);
 await waitPeer(b,arena,true);
 const regroup = await Promise.all([a,b].map(room));
 assert.ok(regroup.every(view => view.code === code && view.enemies[0].hp <= wounded &&
  view.enemies[0].maxhp === 870));
 assert.ok(await a.evaluate(() => window.lab.frame.draws.some(d => d.text === '旅人 2')));
 await a.locator('#game').screenshot({path:'evidence/coop-travel-regroup.png'});
 await a.setViewportSize({width:390,height:844});
 assert.ok(await a.locator('#coopPanel').evaluate(panel => panel.scrollWidth <= panel.clientWidth+1));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-travel-browser.json',JSON.stringify({
  browser:'Chrome',crossMapJoin:[town,arena],splitMaps:[road,arena],
  ticksWhileSplit:split.map((view,i) => view.tick-before[i].tick),
  woundedBossHpBeforeRegroup:wounded,bossHpOnRegroup:regroup.map(view => view.enemies[0].hp),
  sameSlotAfterReload:true,remainingInRoomOnPortals:true,guestShownOnRegroup:true,mobileWidth:390,errors,
 },null,2)+'\n');
 console.log('Joined across maps, separate combat ticks, reload and regroup verified in Chrome.');
} finally {
 await browser.close();
}
