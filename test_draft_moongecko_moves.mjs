import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node => [node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
const drive=waypointDriver(page,nodes);
const url=process.env.LAB_URL||'http://127.0.0.1:9101/';
const source='moongecko-field-poses-source-v1.png';
const errors=[];
page.on('pageerror',error => errors.push(error.message));

const scene=() => page.evaluate(() => {
 const f=window.lab.frame;
 return {boss:f.fieldBoss,t:f.t,commands:f.commands,kills:f.kills,mora:f.mora,cocoons:f.radiantCocoons};
});

try {
 await page.goto(url);
 assert.ok((await (await page.request.get(new URL('/api/lab-info',url).href)).json()).draftFieldMoves);
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 await page.locator('#importSave').setInputFiles('work/earned-moongecko-ready.json');
 await drive.waitNode('nod-town');
 await page.waitForFunction(() => window.lab.frame.progression?.level===133);
 await drive.accept('moongecko-commission');
 await drive.cross('nod-field');
 await drive.cross('nod-gecko-depths');
 await drive.walk(855);
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  if(!f.fieldBoss?.anchor) return false;
  if(!f.paused) window.lab.action('pause');
  return true;
 },undefined,{timeout:90000});
 await page.waitForFunction(() => window.lab.frame.paused);
 const opened=await scene();
 assert.equal(opened.boss.move,'FMG03');
 assert.equal(opened.boss.maxhp,4500000);
 assert.ok(opened.boss.draftMoves && opened.boss.anchor.layers===5 && !opened.boss.summon);
 assert.ok(opened.boss.anchor.x>opened.boss.sweep.left && opened.boss.anchor.x<opened.boss.sweep.right);
 await page.locator('#fieldBossLabel').filter({hasText:'錨月の岩'}).waitFor();
 const canvas=page.locator('#game');
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(file => !window.lab.frame.draws.some(draw => draw.source===file),source);
 const standard=await scene();
 await canvas.screenshot({path:'evidence/short-moongecko-anchor.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.equal(standard.t,light.t);
 await canvas.screenshot({path:'evidence/short-moongecko-anchor-light.png'});

 await page.locator('#renderMode').selectOption('sprite');
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => !window.lab.frame.paused);
 await drive.walk(opened.boss.anchor.x-55);
 await page.keyboard.down('KeyD');
 try {
  await page.waitForFunction(() => window.lab.frame.actors[0].dir===1);
 } finally {
  await page.keyboard.up('KeyD');
 }
 await page.keyboard.down('KeyJ');
 try {
  await page.locator('#fieldBossLabel').filter({hasText:'掃蕩を中断・反撃の隙'}).waitFor({timeout:12000});
 } finally {
  await page.keyboard.up('KeyJ');
 }
 const down=await scene();
 assert.equal(down.boss.form,'down');
 assert.ok(down.boss.tick<=300 && !down.boss.anchor && !down.cocoons?.length);
 assert.equal(down.kills,opened.kills);
 assert.equal(down.mora,opened.mora);
 await canvas.screenshot({path:'evidence/short-moongecko-interrupted.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-moongecko-moves-browser.json',JSON.stringify({
  level:133,anchorShownAtTick:opened.boss.tick,interruptedAtTick:down.boss.tick,
  usedNormalAttackInput:true,ordinaryKillCountersUnchanged:true,
  sameFrameCommands:{standard:standard.commands,light:light.commands},errors,
 },null,2)+'\n');
 console.log('Chrome: the low rock was visible and normal attack input interrupted the sweep.');
} catch(error) {
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
} finally {
 await browser.close();
}
