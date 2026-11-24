import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1200,height:940}});
const drive = waypointDriver(page,Object.fromEntries(graph.nodes.map(node => [node.id,node])));
const errors = [];
page.on('pageerror',error => errors.push(error.message));

async function paused(value) {
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value => window.lab.frame.paused === value,value);
}

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9098/');
 await page.waitForFunction(() => window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-nod-moonfly.json');
 await drive.waitNode('nod-town');
 await drive.cross('nod-field');
 await drive.cross('nod-moonfly-hollow');
 await drive.walk(855);
 await page.waitForFunction(() => window.lab.frame.radiantCocoons?.some(mark => mark.actor === 1 && mark.bound));
 await paused(true);
 const bound = await page.evaluate(() => {
  const {actors, fieldBoss} = window.lab.frame;
  return {hp:actors[0].hp,maxHp:actors[0].maxhp,bossHp:fieldBoss.maxhp,move:fieldBoss.move,draft:fieldBoss.draftHp};
 });
 assert.equal(bound.move,'FMF03');
 assert.ok(bound.draft && bound.bossHp === 4100000 && bound.hp < bound.maxHp);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/集光の繭/);
 await page.locator('#game').screenshot({path:'evidence/nod-draft-moonfly-cocoon.png'});
 await paused(false);
 await page.keyboard.press('Digit2');
 await page.waitForFunction(() => {
  const frame = window.lab.frame;
  return frame.radiantCocoons?.some(mark => mark.actor === 1 && !mark.bound) &&
   frame.actors[0].hp === frame.actors[0].maxhp;
 });
 const escaped = await drive.actor();
 assert.equal(escaped.hp,bound.maxHp);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-nod-boss-hp-browser.json',JSON.stringify({
  boss:'boss-26301101',level:130,playerHpWhileBound:bound.hp,playerHpAfterHealing:escaped.hp,
  draftBossMaxHp:bound.bossHp,cocoonReleasedByWaterField:true,errors,
 },null,2)+'\n');
 console.log('Chrome: the earned Lv130 Traveler escaped the Moonfly cocoon after healing.');
} finally {
 await browser.close();
}
