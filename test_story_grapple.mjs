import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const {nodes} = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const station = 'white-pass-station', field = 'aurora-ice-cut';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1200,height:940}});
const drive = waypointDriver(page, Object.fromEntries(nodes.map(node => [node.id, node])));
const toggle = page.locator('#grappleNext');
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function cast(){
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('Digit1');
}

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9089/');
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-story-grapple.json');
 await drive.waitNode(station);
 await page.waitForFunction(() => window.lab.frame.progression.level === 165 && window.lab.frame.loadout[0][0] === 'SK46');
 await toggle.waitFor({state:'hidden'});
 await cast();
 await page.waitForFunction(() => window.lab.frame.skillNotice?.includes('結節点はありません'));
 await drive.cross(field);
 await toggle.waitFor();
 await toggle.click();
 await page.waitForFunction(() => window.lab.frame.selectedGrapple === 2);
 await cast();
 await page.waitForFunction(() => window.lab.frame.skillNotice?.includes('近づくか'));
 await toggle.click();
 await page.waitForFunction(() => window.lab.frame.selectedGrapple === 1);
 await cast();
 await page.waitForFunction(() => window.lab.frame.draws.filter(draw => draw.color === '#c1f4dc').length === 16);
 await page.waitForFunction(() => {
  const traveler = window.lab.frame.actors[0];
  return traveler.x === 440 && traveler.y === 387 && traveler.ground;
 });
 await page.locator('#game').screenshot({path:'evidence/story-grapple-aurora.png'});
 await drive.cross(station);
 await toggle.waitFor({state:'hidden'});
 assert.deepEqual(errors, []);
 await fs.writeFile('evidence/story-grapple-browser.json', JSON.stringify({
  level:165, field, selectedByButton:true, rejectedAtStation:true, rejectedFarTarget:true,
  landing:[440,387], tetherDrawn:true, returnedByGate:true, errors,
 }, null, 2) + '\n');
 console.log('Chrome: the selected story knot, tether and landing worked through the loadout.');
} finally {
 await browser.close();
}
