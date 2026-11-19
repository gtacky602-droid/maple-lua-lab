import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const base = process.env.LAB_URL || 'http://127.0.0.1:8969';
const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const nodes = Object.fromEntries(graph.nodes.map(n => [n.id, n]));
const quest = graph.quests.find(q => q.id === 'sne-mapped-four-tower-floors');
const browser = await chromium.launch({headless:true, channel:'chrome', args:['--disable-gpu']});
const page = await browser.newPage({viewport:{width:1200, height:960}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const {walk, changeHeight, cross, warp, report, count, choices, journeys, waitNode} = waypointDriver(page, nodes);
const from = quest.itinerary[0].from;
const towerGate = nodes[from].exits.find(edge => edge.to === quest.itinerary[0].node);

try {
  await page.goto(base);
  await page.waitForFunction(() => window.lab?.frame);
  await page.locator('#importSave').setInputFiles('work/snezhnaya-waypoint-browser-save.json');
  await waitNode(quest.hub);
  await warp(from);
  await walk(towerGate.x);
  await changeHeight(towerGate.y);
  await page.waitForFunction(id => {
    const gate = window.lab.frame.storyNearbyPortal;
    return gate?.to === id && !gate.available;
  }, towerGate.to, {timeout:16000});
  await page.keyboard.press('KeyF');
  assert.equal(await page.evaluate(() => window.lab.frame.story.node), from);
  await page.locator('#game').screenshot({path:'evidence/snezhnaya-waypoint-wind.png'});

  for (const [index, step] of quest.itinerary.entries()) {
    if (step.kind === 'arrive') {
      await cross(step.node);
    } else {
      await walk(step.x);
      await page.keyboard.press('KeyG');
    }
    await count(quest.id, index + 1);
  }
  const scenery = await page.evaluate(async () => {
    const {sceneryStatus} = await import('./scenery.js');
    return sceneryStatus(window.lab.frame).key;
  });
  assert.equal(scenery, 'auroraGlass');
  await page.locator('#game').screenshot({path:'evidence/snezhnaya-waypoint-tower.png'});
  await warp(quest.hub);
  await report(quest.id);

  const groups = await choices.locator('optgroup').evaluateAll(list => list.map(group => group.label));
  for (const expected of ['雪の町と白虹峠','北の氷塔','北の氷塔・別階層']) {
    assert.ok(groups.includes(expected), expected);
  }
  await page.locator('#saveProgress').click();
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(() => window.lab?.frame);
  await page.locator('#loadProgress').click();
  await waitNode(quest.hub);
  await page.waitForFunction(id => window.lab.frame.story.quests[id]?.status === 'complete', quest.id);
  await warp(quest.target);
  assert.deepEqual(errors, []);
  await fs.writeFile('evidence/snezhnaya-waypoint-browser.json', JSON.stringify({
    blockedWindGateRejectsInput:true, journeys, waypointGroups:groups,
    reportedQuest:quest.id, restoredQuestAndTowerWarp:true, scenery, pageErrors:errors
  }, null, 2) + '\n');
  console.log('Chrome passed the wind gate, four tower layers, quest report and restored warp.');
} catch (error) {
  console.error('Last completed crossings:', journeys);
  console.error('Last browser state:', await page.evaluate(() => {
    const f = window.lab?.frame;
    return {node:f?.story?.node, notice:f?.storyNotice, gate:f?.storyNearbyPortal, ride:f?.storyLift};
  }));
  throw error;
} finally {
  await browser.close();
}
