import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const read = async path => JSON.parse(await fs.readFile(path,'utf8'));
const graph = await read('content/story-graph.json');
const nodes = Object.fromEntries(graph.nodes.map(n => [n.id,n]));
const prefix = 'evidence/coop-original-field-bosses';
const key = 'maple-lua-lab.checkpoint.v1';
const cases = [
  ['original-rime-hare','spine-ridge-record',95000007,1040,380],
  ['original-tea-boulder','chenyu-tea-with-friends',95000008,984,472],
];
const browser = await chromium.launch({channel:'chrome',headless:true});
const readFrame = page => page.evaluate(() => window.lab.frame);
const errors = [];
const results = {};
let currentPlayers = [];

async function fight(page, side) {
  await page.evaluate(side => {
    const held = new Set();
    const start = window.lab.frame.t;
    const hold = (code, on) => {
      if (held.has(code) === on) return;
      on ? held.add(code) : held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    };
    function tick() {
      const f = window.lab.frame;
      const b = f.fieldBoss;
      const a = f.actors.find(actor => actor.id===f.active);
      if (!b || b.phase==='respawn' || f.returns || f.t-start>120) {
        for (const code of [...held]) hold(code,false);
        window.coopResult = {won:b?.phase==='respawn',returns:f.returns,seconds:f.t-start};
        return;
      }
      const lanes = b.lane ? [b.lane] : Object.values(b.lanes??{});
      const choices = [b.x+side*65,b.x-side*65,b.x-31,b.x+31];
      for (const lane of lanes) choices.push(lane.left-25,lane.right+25);
      const cost = x => Math.abs(x-a.x)+0.7*Math.abs(x-(b.x+side*65));
      const safe = choices.filter(x => lanes.every(l => x<=l.left-18 || x>=l.right+18));
      safe.sort((a,b) => cost(a)-cost(b));
      const dx = (safe[0]??b.x)-a.x;
      const aim = b.x-a.x;
      const turn = Math.abs(dx)<=8 && Math.abs(aim)>5 && aim*a.dir<0;
      hold('KeyA',dx<-8 || turn&&aim<0);
      hold('KeyD',dx>8 || turn&&aim>0);
      hold('KeyJ',Math.abs(aim)<107 && aim*a.dir>0);
      requestAnimationFrame(tick);
    }
    document.activeElement.blur();
    requestAnimationFrame(tick);
  },side);
}

try {
  for (const [boss,questId,entity,hp,mora] of cases) {
    const quest = graph.quests.find(q => q.id===questId);
    const players = await Promise.all([0,1].map(async () => {
      const page = await browser.newPage({viewport:{width:1200,height:920}});
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',r=>{if (r.url().endsWith('/api/frame')&&!r.ok()) errors.push('Frame HTTP '+r.status());});
      const route = waypointDriver(page,nodes,{walkTimeout:20000});
      await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9068/');
      await page.waitForFunction(()=>window.lab?.frame);
      await page.locator('#importSave').setInputFiles('work/coop-'+boss+'-fixture.json');
      await route.waitNode(quest.hub);
      return {page,route};
    }));
    const [host,guest] = players;
    currentPlayers = players;
    await host.route.accept(questId);
    await Promise.all(players.map(({page})=>page.locator('#coopPanel summary').click()));
    await host.page.locator('#coopCreate').click();
    await host.page.waitForFunction(()=>window.lab.frame.coop?.code);
    const code = (await readFrame(host.page)).coop.code;
    await guest.page.locator('#coopCode').fill(code);
    await guest.page.locator('#coopJoin').click();
    await guest.page.waitForFunction(c=>window.lab.frame.coop?.code===c,code);
    await Promise.all(players.map(({route})=>route.cross(quest.target)));
    await Promise.all(players.map(({route})=>route.walk(820)));
    await Promise.all(players.map(({page})=>page.waitForFunction(id=>window.lab.frame.fieldBoss?.id===id,boss)));
    const before = await Promise.all(players.map(({page})=>readFrame(page)));
    assert.ok(before.every(f=>f.fieldBoss.maxhp===hp&&f.fieldBoss.hp===hp));
    await host.page.waitForFunction(()=>window.lab.frame.fieldBoss?.lane||window.lab.frame.fieldBoss?.lanes);
    await host.page.locator('#game').screenshot({path:prefix+'-'+boss+'.png'});
    await Promise.all(players.map(({page},i)=>fight(page,i?1:-1)));
    await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.coopResult,undefined,{timeout:140000})));
    const clear = await Promise.all(players.map(async ({page},i)=>{
      const run = await page.evaluate(()=>window.coopResult);
      assert.ok(run.won&&!run.returns,JSON.stringify(run));
      const frame = await readFrame(page);
      assert.ok(Object.values(frame.events??{}).some(e=>e.kind==='hit'&&e.target===entity));
      assert.equal(frame.mora-before[i].mora,mora);
      return run;
    }));
    assert.equal((await readFrame(host.page)).story.quests[questId].count,1);
    assert.equal((await readFrame(guest.page)).story.quests[questId],undefined);
    for (const [index,objective] of quest.itinerary.entries()) {
      if (!index) continue;
      if (await host.route.node()!==objective.node) await host.route.cross(objective.node);
      await host.route.walk(objective.x);
      await host.route.changeHeight(objective.y);
      await host.page.keyboard.press('KeyG');
      await host.route.count(questId,index+1);
    }
    await host.route.report(questId);
    await guest.route.cross(quest.hub);
    await Promise.all(players.map(async ({page},i)=>{
      await page.locator('#saveProgress').click();
      await page.waitForFunction(({key,boss,questId,i})=>{
        const s=JSON.parse(localStorage.getItem(key));
        return s?.endgame?.bosses?.[boss]?.clears===1 &&
          (i ? !s.story.quests[questId] : s.story.quests[questId]?.status==='complete');
      },{key,boss,questId,i});
      await page.reload();
      await page.waitForFunction(()=>window.lab?.frame);
      await page.locator('#loadProgress').click();
    }));
    await Promise.all(players.map(({route})=>route.waitNode(quest.hub)));
    assert.equal((await readFrame(host.page)).story.quests[questId].status,'complete');
    results[boss]={hp,moraPerPlayer:mora,clear,hostReported:true,bothSavedAndReloaded:true};
    await Promise.all(players.map(({page})=>page.close()));
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(prefix+'-browser.json',JSON.stringify({results,errors},null,2)+'\n');
  console.log('Chrome: two independent players, both victories, one quest report per fight, and reloads passed.');
} catch (error) {
  console.error(await Promise.allSettled(currentPlayers.map(({page})=>page.evaluate(()=>{
    const f=window.lab.frame;
    return {story:f.story.node,boss:f.fieldBoss,peers:f.coop?.peers,actor:f.actors[f.active-1],
      result:window.coopResult,notice:f.storyNotice};
  }))));
  throw error;
} finally {
  await browser.close();
}
