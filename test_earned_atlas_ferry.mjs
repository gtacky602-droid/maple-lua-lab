import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280,height:940}});
const drive = waypointDriver(page, Object.fromEntries(graph.nodes.map(node => [node.id,node])));
const atlas = page.locator('#worldAtlas');
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
 if (response.url().endsWith('/api/frame') && !response.ok()) errors.push(`Frame HTTP ${response.status()}`);
});

const boarding = 'nod-port', deck = 'natlan-voyage-return', landing = 'natlan-port';

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9094/');
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-natlan-ferry.json');
 await drive.waitNode(boarding);
 await drive.cross(deck);
 const duration = await page.evaluate(() => window.lab.frame.voyage.total);
 assert.equal(duration, 90);

 await drive.walk(1380);
 await page.getByText(/着岸後に自動で移動/).waitFor();
 assert.ok(await page.locator('#nearbyPortalGo').isHidden());
 await page.keyboard.press('KeyF');
 await page.waitForFunction(() => window.lab.frame.storyNotice === '到着待ち');
 assert.equal(await drive.node(), deck);

 await page.keyboard.press('KeyM');
 await atlas.waitFor();
 await page.locator('#atlasRegion').selectOption('region-06');
 await page.waitForFunction(() => window.lab.frame.worldMap.region === 'region-06');
 await page.locator('#atlasField').selectOption(landing);
 await page.waitForFunction(id => window.lab.frame.worldMap.selected?.id === id, landing);
 const first = await page.evaluate(() => window.lab.frame.worldMap.guide.stops[0]);
 assert.ok(first.automaticArrival && first.secondsRemaining > 0 && first.secondsRemaining < 90);
 assert.equal(first.id, landing);
 const mapText = await page.locator('#atlasItineraryStops button').first().textContent();
 assert.match(mapText, /到着まで .+秒・到着後に自動で移動/);
 assert.match(await page.locator('#atlasItineraryNote').textContent(), /地図を閉じると移動を再開/);
 await atlas.screenshot({path:'evidence/earned-natlan-ferry-atlas.png'});
 assert.equal(await page.evaluate(() => window.lab.frame.voyage.seconds), first.secondsRemaining);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});

 await page.waitForFunction(() => window.lab.frame.voyage?.stopover, null, {timeout:50000});
 assert.equal(await drive.node(), deck);
 await page.waitForFunction(id => window.lab.frame.story.node === id, landing, {timeout:120000});
 const arrived = await drive.actor();
 assert.equal(arrived.x, 720);
 assert.equal(arrived.y, 480);
 assert.equal(await page.evaluate(() => window.lab.frame.voyage), undefined);
 await drive.cross('natlan-field');
 assert.deepEqual(errors, []);

 await fs.writeFile('evidence/earned-atlas-ferry-browser.json', JSON.stringify({
  boarding, deck, duration, mapText, mapPausedVoyage:true, stopoverPassedWithoutDisembarking:true,
  automaticArrival:landing, landingPosition:[arrived.x,arrived.y], nextMap:await drive.node(), errors,
 }, null, 2)+'\n');
 console.log('Chrome: M showed the paused countdown, then the ferry docked without input and the next route opened.');
} finally {
 await browser.close();
}
