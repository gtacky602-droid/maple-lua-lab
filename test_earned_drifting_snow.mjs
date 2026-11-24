import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1200,height:940}});
const drive = waypointDriver(page, Object.fromEntries(graph.nodes.map(node => [node.id,node])));
const hub = 'snezhnaya-hub', road = 'snezhnaya-field', arena = 'drifting-snow-court';
const quest = 'drifting-snow-commission', boss = 'boss-25135202';
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function pause(value) {
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value => window.lab.frame.paused === value, value);
}

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9095/');
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-drifting-snow.json');
 await drive.waitNode(hub);
 await drive.cross(road);
 await drive.cross(arena);
 await drive.walk(847);

 await page.evaluate(() => {
  const held = new Set();
  let lastFrame = -1;
  window.breakCoffin = false;
  function hold(code, on) {
   if (on === held.has(code)) return;
   if (on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', {code,bubbles:true,cancelable:true}));
  }
  function play() {
   const f = window.lab.frame;
   const b = f.fieldBoss, a = f.actors[f.active-1];
   if (!b || b.phase === 'respawn' || a.hp <= 0) {
    for (const code of held) hold(code, false);
    return;
   }
   if (!f.paused && lastFrame !== f.t) {
    lastFrame = f.t;
    const dx = b.x-a.x, distance = Math.abs(dx);
    const facing = dx*a.dir >= 0;
    const move = distance > 86 || !facing ? Math.sign(dx) : distance < 64 ? -Math.sign(dx) : 0;
    hold('KeyA', move < 0);
    hold('KeyD', move > 0);
    const shield = b.driftingSnow.layers > 0;
    const skills = ['SK21','SK09','SK10'];
    const index = skills.findIndex(key => !(a.cd[key] > 0));
    hold('KeyJ', facing && distance < 118 && (!shield || window.breakCoffin));
    if (shield && window.breakCoffin && facing && distance < 150 && a.lock === 0 && index >= 0) {
     const code = 'Digit'+(index+1);
     hold(code,true);
     hold(code,false);
    }
   }
   requestAnimationFrame(play);
  }
  requestAnimationFrame(play);
 });

 await page.waitForFunction(() => window.lab.frame.fieldBoss?.driftingSnow.layers === 8);
 await pause(true);
 assert.match(await page.locator('#fieldBossLabel').textContent(), /氷の棺/);
 await page.locator('#game').screenshot({path:'evidence/earned-drifting-snow-coffin.png'});
 await page.evaluate(() => { window.breakCoffin = true; });
 await pause(false);
 await page.waitForFunction(() => {
  const b = window.lab.frame.fieldBoss;
  return b?.form === 'down' && b.driftingSnow.layers === 0 && b.hp > 0;
 });
 await page.waitForFunction(() => window.lab.frame.fieldBoss?.phase === 'respawn');
 await drive.count(quest,1);
 const killed = await page.evaluate(() => window.lab.frame.fieldBoss);
 assert.equal(killed.id,boss);
 assert.equal(killed.hp,0);
 await drive.cross(road);
 await drive.cross(hub);
 await drive.report(quest);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 const outcome = await page.evaluate(id => ({
  commission:window.lab.frame.story.quests[id].status,
  returns:window.lab.frame.returns,
 }), quest);
 assert.deepEqual(outcome,{commission:'complete',returns:0});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/earned-drifting-snow-browser.json',JSON.stringify({
  level:165, boss, secondPhaseEntered:true, coffinBroken:true, hpAfterClear:killed.hp,
  restoredCommission:outcome.commission, returns:outcome.returns, errors,
 },null,2)+'\n');
 console.log('Chrome: destroyed the coffin, defeated Drifting Snow, reported the commission, and reloaded it.');
} finally {
 await browser.close();
}
