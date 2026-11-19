import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url = process.env.LAB_URL || 'http://127.0.0.1:8999/';
const arena = 'anemo-field-basin';
const quest = 'anemo-commission';
const boss = 'boss-20040201';
const saveKey = 'maple-lua-lab.checkpoint.v1';
const fixture = JSON.parse(await fs.readFile('work/anemo-hypostasis-field-fixture.json', 'utf8'));
const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id, node]));
const browser = await chromium.launch({channel:'chrome', headless:true});
const errors = [];
const frame = page => page.evaluate(() => window.lab.frame);

async function start(accept) {
 const context = await browser.newContext({viewport:{width:1220,height:910}});
 const page = await context.newPage();
 page.setDefaultTimeout(20000);
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame);
 const save = structuredClone(fixture);
 if(!accept) delete save.story.quests[quest];
 await page.evaluate(([key,data]) => localStorage.setItem(key,JSON.stringify(data)),[saveKey,save]);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(() => window.lab.frame.progression?.level === 16);
 const travel = waypointDriver(page,nodes,{walkTimeout:18000});
 for(const node of ['mond-road','anemo-approach',arena]) await travel.cross(node);
 await page.locator('#coopPanel summary').click();
 return {page,travel};
}

async function fight(page) {
 await page.locator('#game').scrollIntoViewIfNeeded();
 await page.evaluate(() => {
  document.activeElement.blur();
  const held = new Set();
  const moves = new Set();
  const start = window.lab.frame;
  let jumped = '', jumpUntil = 0;
  function hold(code,pressed) {
   if(held.has(code) === pressed) return;
   if(pressed) held.add(code);
   else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function tick() {
   const f = window.lab.frame;
   const b = f.fieldBoss, a = f.actors[f.active-1];
   if(!f.coop?.code || b?.hp === 0 || f.t-start.t > 110) {
    for(const code of [...held]) hold(code,false);
    window.coopAnemo = {time:f.t-start.t, hp:a.hp, moves:[...moves],
     kills:f.kills-start.kills, damage:f.damage-start.damage};
    return;
   }
   if(!b) {
    hold('KeyD',true);
    requestAnimationFrame(tick);
    return;
   }
   if(b.move) moves.add(b.move);
   const phase = {FA01:[42,96],FA02:[48,108]}[b.move];
   const retreat = phase && b.tick >= phase[0] && b.tick < phase[1];
   if(b.move !== 'FA03') jumped = '';
   if(b.move === 'FA03' && a.ground) {
    const next = b.tick>=71&&b.tick<82?'first':b.tick>=106&&b.tick<117?'second':'';
    if(next && jumped!==next) { jumped=next; jumpUntil=f.t+.68; }
   }
   const dx = b.x-a.x, desired = retreat?194:106, turn = a.dir<0;
   hold('Space',f.t < jumpUntil);
   hold('KeyA',dx<desired-7 || (turn&&dx<desired));
   hold('KeyD',dx>desired+7 || (turn&&dx>=desired));
   hold('KeyJ',!retreat && !turn && dx>0 && dx<125);
   requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
 });
}

try {
 const [a,b] = await Promise.all([start(true),start(false)]);
 await a.page.locator('#coopCreate').click();
 await a.page.waitForFunction(() => window.lab.frame.coop.code);
 const code = await a.page.evaluate(() => window.lab.frame.coop.code);
 await b.page.locator('#coopCode').fill(code);
 await b.page.locator('#coopJoin').click();
 await Promise.all([a,b].map(({page}) => page.waitForFunction(() => {
  const view = window.lab.frame.coop;
  return view.code && view.peers[0]?.online && view.enemies[0].maxhp === 870;
 })));
 await Promise.all([a,b].map(({page}) => fight(page)));
 await a.page.waitForFunction(() => window.lab.frame.fieldBoss?.move === 'FA01' &&
  window.lab.frame.fieldBoss.tick >= 42, null, {timeout:12000});
 const clap = await frame(a.page);
 assert.equal(clap.fieldBoss.maxhp,870);
 assert.equal(clap.coop.enemies[0].hp,clap.fieldBoss.hp);
 assert.ok(clap.draws.some(draw => draw.source === 'anemo-core-source-v1.png'));
 await a.page.locator('#game').screenshot({path:'evidence/coop-anemo-browser.png'});
 for(const {page} of [a,b]) {
  await page.waitForFunction(() => window.coopAnemo, null, {timeout:150000});
 }
 const results = await Promise.all([a,b].map(({page}) => page.evaluate(() => window.coopAnemo)));
 const kills = await Promise.all([a,b].map(({page}) => frame(page)));
 assert.ok(results.every(result => result.kills === 1 && result.hp > 0 && result.damage > 0),
  JSON.stringify(results));
 assert.equal(results.reduce((sum,r) => sum+r.damage,0),870);
 assert.ok(kills.every(f => f.fieldBoss.hp === 0 && f.fieldBoss.phase === 'respawn'));
 assert.equal(kills[0].story.quests[quest].count,1);
 assert.equal(quest in kills[1].story.quests,false);
 for(const {page} of [a,b]) await page.locator('#saveProgress').click();
 const saves = await Promise.all([a,b].map(async ({page}) => {
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,
   [saveKey,boss]);
  return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),saveKey);
 }));
 assert.ok(saves.every(save => save.endgame.bosses[boss].clears === 1 &&
  save.fieldBosses[boss].hp === 0 && save.fieldBosses[boss].waitTicks > 0));
 const slot = kills[1].coop.slot;
 await b.page.reload();
 await b.page.waitForFunction(([code,slot]) => window.lab?.frame.coop?.code === code &&
  window.lab.frame.coop.slot === slot,[code,slot]);
 const resumed = await frame(b.page);
 assert.equal(resumed.kills,kills[1].kills);
 assert.equal(resumed.fieldBoss.phase,'respawn');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-anemo-browser.json', JSON.stringify({
  browser:'Chrome', arena, participants:2, maxHp:clap.fieldBoss.maxhp,
  firstSharedTelegraph:{move:clap.fieldBoss.move,tick:clap.fieldBoss.tick},
  results, personalQuestCounts:[kills[0].story.quests[quest].count,null],
  savedClears:saves.map(save=>save.endgame.bosses[boss].clears),
  cooldownOnReload:resumed.fieldBoss.remaining, rejoinedSameSlot:true, errors,
 },null,2)+'\n');
 console.log('Both Chrome players reached the arena, defeated the same boss, saved and rejoined.');
} finally {
 await browser.close();
}
