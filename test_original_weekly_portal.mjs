import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const url = process.env.LAB_URL || 'http://127.0.0.1:8769/';
const fixtures = process.env.WEEKLY_FIXTURES || 'work';
const browser = await chromium.launch({headless: true, channel: 'chrome'});
const encounters = [
  {id: 'original-tide-surveyor', arena: 'tide-calibration-hall', x: 1120,
    viewport: {width: 1160, height: 1000}, screenshot: 'original-weekly-portal-desktop.png'},
  {id: 'original-twin-shuttle-loom', arena: 'buried-weaving-room', x: 1240,
    viewport: {width: 412, height: 915}, screenshot: 'original-weekly-portal-narrow.png'},
];

async function play({id, arena, x, viewport, screenshot}) {
  const page = await browser.newPage({viewport});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.lab?.frame);
    const saved = JSON.parse(await fs.readFile(path.join(fixtures, id + '-replay-fixture.json'), 'utf8'));
    assert.ok(saved.weeklyBosses[id].waitTicks > 1200);
    // Start closer to the end of the existing cooldown so the browser test stays short.
    saved.weeklyBosses[id].waitTicks = 1200;
    await page.evaluate(raw => localStorage.setItem('maple-lua-lab.checkpoint.v1', raw), JSON.stringify(saved));
    await page.locator('#loadProgress').click();
    await page.waitForFunction(() => window.lab.frame.story?.node === 'liyue-harbor');
    await page.locator('#game').click();
    await page.keyboard.down('KeyD');
    try {
      await page.waitForFunction(x => {
        const f = window.lab.frame;
        return f.actors[f.active - 1].x >= x - 8;
      }, x);
    } finally {
      await page.keyboard.up('KeyD');
    }
    const label = page.locator('#nearbyPortalCooldown');
    await page.waitForFunction(arena => {
      const portal = window.lab.frame.storyNearbyPortal;
      return portal?.to === arena && portal.weeklyRespawnSeconds > 0;
    }, arena);
    await page.locator('#weeklyDesk').waitFor({state: 'hidden'});
    assert.ok(await page.locator('#nearbyPortalGo').isEnabled());
    await page.keyboard.press('KeyP');
    await page.waitForFunction(() => window.lab.frame.paused);
    await label.waitFor({state: 'visible'});
    const pausedLabel = await label.textContent();
    assert.match(pausedLabel, /再出現まで [1-9][0-9]*秒/);
    await label.scrollIntoViewIfNeeded();
    await page.screenshot({path: path.join('evidence', screenshot)});
    assert.equal(await label.textContent(), pausedLabel);
    await page.keyboard.press('KeyP');
    await page.waitForFunction(arena => {
      const frame = window.lab.frame;
      return !frame.paused && frame.storyNearbyPortal?.to === arena
        && frame.storyNearbyPortal.weeklyRespawnSeconds === undefined;
    }, arena);
    await label.waitFor({state: 'hidden'});
    await page.keyboard.press('KeyF');
    await page.waitForFunction(({id, arena}) => {
      const frame = window.lab.frame;
      const boss = frame.weeklyBoss;
      return frame.story.node === arena && boss?.id === id && boss.generation === 2
        && boss.hp === boss.maxhp && boss.hp > 0;
    }, {id, arena});
    assert.deepEqual(errors, []);
    const boss = await page.evaluate(() => window.lab.frame.weeklyBoss);
    return {arena, viewport, pausedLabel, screenshot, replayHp: boss.hp,
      rankedDeskHidden: true, enteredWithF: true, errors};
  } finally {
    await page.close();
  }
}

try {
  // Each page runs a separate Lua world. Close it before starting the next one.
  const cases = {};
  for (const encounter of encounters) cases[encounter.id] = await play(encounter);
  await fs.writeFile('evidence/original-weekly-portal-browser.json',
    JSON.stringify({fixtureCooldownSeconds: 20, cases}, null, 2) + '\n');
  console.log('Both original weekly gates show the saved cooldown and allow a full-HP replay.');
} finally {
  await browser.close();
}
