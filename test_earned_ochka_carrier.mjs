import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes} = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const dock = 'ochkanatlan-dock', steps = 'ochka-tide-stairs', court = 'ochka-patched-court';
const quest = 'ochka-wall-marks';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1200,height:960}});
const drive = waypointDriver(page, Object.fromEntries(nodes.map(node => [node.id, node])));
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9088/');
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-ochka-carrier-checkpoint.json');
 await drive.waitNode(dock);
 await drive.count(quest, 2);
 await drive.cross(steps);
 await drive.cross(court);
 const restoredTotal = await page.evaluate(() => window.lab.frame.total);
 assert.equal(restoredTotal, 4);
 await drive.walk(1290);
 await drive.changeHeight(393);
 await page.keyboard.press('KeyG');
 await drive.count(quest, 3);
 await page.locator('#game').screenshot({path:'evidence/earned-ochka-return-marker.png'});
 await drive.cross(steps);
 await drive.cross(dock);
 await drive.report(quest);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(id => JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1'))?.story.quests[id]?.status === 'complete', quest);
 await page.locator('#loadProgress').click();
 await drive.waitNode(dock);
 await page.waitForFunction(id => window.lab.frame.story.quests[id]?.status === 'complete', quest);
 assert.deepEqual(errors, []);
 await fs.writeFile('evidence/earned-ochka-carrier-browser.json', JSON.stringify({
  restoredAtDock:true, ordinaryEnemiesAtCourt:restoredTotal, completedAndRestored:true, errors,
 }, null, 2) + '\n');
 console.log('Chrome: four ordinary enemies remain and the return-marker quest resumes and reports.');
} finally {
 await browser.close();
}
