import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const save = JSON.parse(await fs.readFile('work/earned-nod-moonfly.json', 'utf8'));
save.partyCombat.traveler.hp -= 800;
const url = process.env.LAB_URL || 'http://127.0.0.1:9101/';
const browser = await chromium.launch({headless:true, channel:'chrome'});
const page = await browser.newPage({viewport:{width:1200,height:940}});
const drive = waypointDriver(page,Object.fromEntries(graph.nodes.map(node => [node.id,node])));
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const scene = () => page.evaluate(() => {
 const f = window.lab.frame;
 return {boss:f.fieldBoss, actor:f.actors[0], mark:f.radiantCocoons?.find(m => m.actor===1),
  commands:f.commands, t:f.t, asset:f.draws.some(d => d.source==='moonfly-field-poses-source-v1.png')};
});

try {
 await page.goto(url);
 const info = await (await page.request.get(new URL('/api/lab-info', url).href)).json();
 assert.ok(info.draftFieldMoves);
 await page.waitForFunction(() => window.lab?.frame, undefined, {timeout:90000});
 await page.locator('#importSave').setInputFiles({
  name:'earned-lv130-injured.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(save)),
 });
 await drive.waitNode('nod-town');
 await drive.cross('nod-field');
 await drive.cross('nod-moonfly-hollow');
 await drive.walk(855);
 await page.waitForFunction(() => {
  const f = window.lab.frame;
  if (!f.radiantCocoons?.some(mark => mark.actor===1 && mark.bound) || !f.fieldBoss?.wingWave?.active) return false;
  if (!f.paused) window.lab.action('pause');
  return true;
 }, undefined, {timeout:90000});
 await page.waitForFunction(() => window.lab.frame.paused);
 const bound = await scene();
 assert.equal(bound.boss.move,'FMF03');
 assert.equal(bound.boss.maxhp,4100000);
 assert.ok(bound.boss.draftMoves && bound.mark.remaining>2.6 && bound.asset);
 assert.equal(bound.boss.wingWave.element,'dendro');
 await page.locator('#fieldBossLabel').filter({hasText:'回復で解除（残り3秒）'}).waitFor();

 const canvas = page.locator('#game');
 await canvas.screenshot({path:'evidence/short-moonfly-first-wing-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(() => !window.lab.frame.draws.some(d => d.source==='moonfly-field-poses-source-v1.png'));
 const standard = await scene();
 await canvas.screenshot({path:'evidence/short-moonfly-first-wing.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65, standard.commands);
 const light = await scene();
 assert.deepEqual([standard.t,light.t,light.boss.tick],[bound.t,bound.t,bound.boss.tick]);
 await canvas.screenshot({path:'evidence/short-moonfly-first-wing-light.png'});

 await page.locator('#renderMode').selectOption('sprite');
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => !window.lab.frame.paused);
 await page.keyboard.press('Digit2');
 await page.waitForFunction(hp => {
  const f = window.lab.frame;
  return f.actors[0].hp>hp && !f.radiantCocoons?.some(mark => mark.actor===1);
 },bound.actor.hp);
 const healed = await scene();
 assert.equal(healed.boss.move,'FMF03');
 assert.ok(healed.boss.tick<312 && healed.actor.hp<healed.actor.maxhp);
 await page.locator('#fieldBossLabel').filter({hasText:'回復で解除'}).waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-moonfly-moves-browser.json',JSON.stringify({
  level:130, healthFixture:'Traveler HP reduced 800 from the earned checkpoint to demonstrate partial healing',
  firstWaveTick:bound.boss.tick, healedTick:healed.boss.tick, hpBeforeHeal:bound.actor.hp,
  hpAfterHeal:healed.actor.hp, maxHp:healed.actor.maxhp, noEscapeBuff:true,
  sameFrameCommands:{standard:standard.commands,light:light.commands}, errors,
 },null,2)+'\n');
 console.log('Chrome: the first wing wave applied the cocoon and a Hydro heal cleared it below full HP.');
} catch (error) {
 console.error(await page.locator('#status').textContent(), errors, await scene().catch(() => null));
 throw error;
} finally {
 await browser.close();
}
