import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const [source, output, mode] = process.argv.slice(2);
assert.ok(source && output, 'Usage: node test_earned_azhdaha_rematch.mjs SAVE OUTPUT [restore]');
const raw = await fs.readFile(source);
const seed = JSON.parse(raw);
const sourceSha256 = createHash('sha256').update(raw).digest('hex');
const {nodes} = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const hub = 'liyue-harbor', arena = 'azhdaha-dragon-seal-arena';
const quest = 'azhdaha-weekly-commission', id = 'boss-29040101', expert = id + ':expert';
const wolf = 'boss-29020101:expert', pair = ['hydro', 'electro'];
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:390, height:844}});
const drive = waypointDriver(page, Object.fromEntries(nodes.map(node => [node.id, node])));
const frame = () => page.evaluate(() => window.lab.frame);
const wait = (predicate, arg, timeout = 15000) => page.waitForFunction(predicate, arg, {timeout});
const desk = page.locator('#weeklyDesk'), select = page.locator('#weeklyDifficulty');
const start = page.locator('#weeklyChallengeStart');
const row = page.locator(`[data-quest="${quest}"]`);
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function saveAndReload() {
  await page.locator('#saveProgress').click();
  await wait(() => document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
  await page.reload();
  await wait(() => window.lab?.frame);
  await page.locator('#loadProgress').click();
  await drive.waitNode(hub);
  return saved;
}

try {
  await fs.mkdir(output, {recursive:true});
  await page.goto(process.env.LAB_URL || 'http://127.0.0.1:8944/');
  await wait(() => window.lab?.frame);
  await page.locator('#importSave').setInputFiles(source);
  await wait(key => window.lab.frame.progression?.level === 200 && window.lab.frame.endgame?.weekly[key]?.clears === 2, wolf);
  if ((await frame()).story.node !== hub) await drive.warp(hub);

  if (mode === 'restore') {
    await wait(key => window.lab.frame.endgame.weekly[key]?.clears === 5, expert);
    const restored = await frame();
    assert.deepEqual(restored.azhdahaLobby.selected, pair);
    assert.equal(restored.story.quests[quest].status, 'complete');
    const reported = Object.values(restored.story.quests).filter(q => q.status === 'complete').length;
    assert.equal(reported, 111);
    assert.equal(restored.actors[0].atk, 74956);
    await drive.walk(635);
    await desk.waitFor();
    assert.equal(await select.inputValue(), 'expert');
    const lobby = (await frame()).weeklyDesk;
    assert.ok(lobby.remaining > 0 && await start.isDisabled());
    assert.match(await page.locator('#weeklyChallengeRecord').textContent(), /最上級の戦績.*5勝/);
    await desk.screenshot({path:path.join(output, 'expert-restored.png')});
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'rematch-browser.json'), JSON.stringify({
      sourceSha256, expertWins:5, andriusExpertWins:2, reported, pair,
      attack:restored.actors[0].atk, remaining:lobby.remaining, errors
    }, null, 2) + '\n');
  } else {
    await row.getByRole('button', {name:'受注', exact:true}).click();
    await wait(q => window.lab.frame.story.quests[q]?.status === 'active', quest);
    await page.locator('#azhdahaElements').getByRole('button', {name:'水＋雷', exact:true}).click();
    await wait(() => window.lab.frame.azhdahaLobby?.selected.join(':') === 'hydro:electro');
    const selectionSave = await saveAndReload();
    assert.deepEqual(selectionSave.azhdahaPair, pair);
    assert.deepEqual((await frame()).azhdahaLobby.selected, pair);
    assert.equal((await frame()).story.quests[quest].status, 'active');

    await page.locator('#game').click();
    await page.keyboard.press('KeyM');
    const atlas = page.locator('#worldAtlas');
    await atlas.waitFor();
    await page.locator('#atlasLayer').selectOption('boss');
    await page.locator('#atlasField').selectOption(arena);
    await wait(node => window.lab.frame.worldMap?.selected?.id === node, arena);
    const guide = (await frame()).worldMap.guide;
    assert.equal(guide.status, 'ready');
    assert.deepEqual(guide.stops.map(stop => stop.id), [arena]);
    await page.keyboard.press('Escape');
    await atlas.waitFor({state:'hidden'});
    await drive.walk(635);
    await desk.waitFor();
    assert.equal(await page.locator('#nearbyPortalGo').textContent(), 'F：本編戦へ');
    assert.ok(await desk.evaluate(el => el.getBoundingClientRect().right <= 390 && el.scrollWidth <= el.clientWidth));
    await select.selectOption('expert');
    await wait(() => !document.getElementById('weeklyChallengeStart').disabled);
    const selected = (await frame()).weeklyDesk.modes.find(choice => choice.id === 'expert');
    assert.ok(selected.available && !selected.record);
    await start.click();
    await drive.waitNode(arena);
    const before = await frame();
    assert.equal(before.weeklyBoss.difficulty, '最上級');
    assert.deepEqual(before.weeklyBoss.elementSlots, pair);
    await page.evaluate(() => {
      const held = new Set();
      function key(code, pressed) {
        if (held.has(code) === pressed) return;
        if (pressed) held.add(code);
        else held.delete(code);
        window.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', {code, bubbles:true, cancelable:true}));
      }
      document.activeElement.blur();
      const move = () => {
        const f = window.lab.frame, b = f.weeklyBoss, actor = f.actors[0];
        if (!b || b.phase === 'respawn' || f.returns) {
          for (const code of held) key(code, false);
          return;
        }
        const offset = b.x - actor.x;
        const left = offset < -105 || Math.abs(offset) <= 105 && offset < -8 && actor.dir > 0;
        const right = offset > 105 || Math.abs(offset) <= 105 && offset > 8 && actor.dir < 0;
        key('KeyA', left);
        key('KeyD', right);
        key('KeyJ', b.damageable && Math.abs(offset) <= 118);
        requestAnimationFrame(move);
      };
      requestAnimationFrame(move);
    });
    await wait(() => window.lab.frame.weeklyBoss?.phase === 'respawn', undefined, 60000);
    const after = await frame();
    const reward = {xp:selected.xp + selected.firstXp, mora:selected.mora + selected.firstMora, first:true};
    assert.deepEqual(after.weeklyBoss.reward, reward);
    assert.equal(after.progression.overflowXp - before.progression.overflowXp, reward.xp);
    assert.equal(after.mora - before.mora, reward.mora);
    assert.equal(after.endgame.weekly[expert].clears, 1);
    assert.equal(after.returns, 0);
    assert.equal(after.story.quests[quest].count, 1);
    const result = page.locator('#weeklyChallengeResult');
    await result.screenshot({path:path.join(output, 'first-expert-result.png')});

    await drive.cross(hub);
    const reportStart = await frame();
    await row.getByRole('button', {name:'報告', exact:true}).click();
    await wait(q => window.lab.frame.story.quests[q]?.status === 'complete', quest);
    const reported = await frame();
    const questReward = {xp:reported.progression.overflowXp - reportStart.progression.overflowXp,
      mora:reported.mora - reportStart.mora};
    assert.deepEqual(questReward, {xp:24000, mora:2200});
    const saved = await saveAndReload();
    await wait(key => window.lab.frame.endgame.weekly[key]?.clears === 1, expert);
    assert.deepEqual((await frame()).azhdahaLobby.selected, pair);
    assert.equal(saved.endgame.weekly[wolf].clears, 2);
    assert.ok(saved.weeklyBosses[id].waitTicks > 0);
    for (const [key, value] of Object.entries(seed.story.quests)) {
      if (value.status === 'complete') assert.deepEqual(saved.story.quests[key], value, key);
    }
    assert.equal(saved.companion, seed.companion);
    assert.deepEqual(saved.weapons, seed.weapons);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'first-expert-save.json'), JSON.stringify(saved) + '\n');
    const proof = {sourceSha256, level:200, guide:guide.stops.map(stop => stop.id), pair, attack:before.actors[0].atk,
      firstReward:reward, questReward, repeatReward:{xp:selected.xp,mora:selected.mora},
      firstExpertClear:1, andriusExpertWins:2, remainingTicks:saved.weeklyBosses[id].waitTicks,
      pairAfterReload:true, reportedAfterReload:(await frame()).story.quests[quest].status, errors};
    await fs.writeFile(path.join(output, 'first-expert-browser.json'), JSON.stringify(proof, null, 2) + '\n');
    console.log(proof);
  }
} catch (error) {
  const f = await frame().catch(() => null);
  console.error({node:f?.story?.node, boss:f?.weeklyBoss, desk:f?.weeklyDesk,
    nearby:f?.storyNearbyPortal, notice:f?.storyNotice, actors:f?.actors?.map(({x,hp,atk}) => [x,hp,atk]), errors});
  await page.screenshot({path:path.join(output, 'expert-failure.png')});
  throw error;
} finally {
  await browser.close();
}
