import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node => [node.id,node])));
const url=process.env.LAB_URL||'http://127.0.0.1:9101/';
const errors=[];
page.on('pageerror',error => errors.push(error.message));

const scene=() => page.evaluate(() => {
 const f=window.lab.frame;
 return {boss:f.fieldBoss,actor:f.actors[f.active-1],t:f.t,commands:f.commands,kills:f.kills,mora:f.mora};
});

try {
 await page.goto(url);
 assert.ok((await (await page.request.get(new URL('/api/lab-info',url).href)).json()).draftFieldMoves);
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 await page.locator('#importSave').setInputFiles('work/earned-immortal-short-ready.json');
 await drive.waitNode('snezhnaya-hub');
 await page.waitForFunction(() => window.lab.frame.progression?.level===145);
 await drive.accept('immortal-construct-commission');
 await drive.cross('snezhnaya-field');
 await drive.cross('immortal-construct-root-hollow');
 await drive.walk(855);
 await page.waitForFunction(() => {
  const b=window.lab.frame.fieldBoss;
  return b?.move==='IC03'&&b.form==='life'&&b.tick>=60&&b.tick<120;
 },undefined,{timeout:90000});
 const glow=await scene();
 assert.equal(glow.boss.maxhp,6500000);
 assert.ok(glow.boss.draftMoves&&!glow.boss.immortalConstruct.hitsLeft);
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  if(!f.fieldBoss?.immortalConstruct?.hitsLeft) return false;
  if(!f.paused) window.lab.action('pause');
  return true;
 },undefined,{timeout:90000});
 await page.waitForFunction(() => window.lab.frame.paused);
 const opened=await scene();
 assert.equal(opened.boss.move,'IC03');
 assert.equal(opened.boss.immortalConstruct.required,3);
 assert.ok(opened.boss.tick>=120&&opened.boss.tick<144);
 await page.locator('#fieldBossLabel').filter({hasText:'灼焔の華・本体にあと'}).waitFor();
 const canvas=page.locator('#game');
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  return f.commands>5000&&!f.draws.some(draw => draw.kind==='boss_sprite');
 });
 const standard=await scene();
 await canvas.screenshot({path:'evidence/short-immortal-construct-bloom.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.deepEqual([standard.t,light.t,light.boss.tick],[opened.t,opened.t,opened.boss.tick]);
 await canvas.screenshot({path:'evidence/short-immortal-construct-bloom-light.png'});

 await page.locator('#renderMode').selectOption('sprite');
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => !window.lab.frame.paused);
 const side=Math.sign(opened.boss.x-opened.actor.x)||1;
 await drive.walk(opened.boss.x-side*78);
 const facing=side===1?'KeyD':'KeyA';
 await page.keyboard.down(facing);
 try {
  await page.waitForFunction(side=>window.lab.frame.actors[window.lab.frame.active-1].dir===side,side);
 } finally {
  await page.keyboard.up(facing);
 }
 await page.keyboard.down('KeyJ');
 try {
  await page.locator('#fieldBossLabel').filter({hasText:'開花を中断・反撃の隙'}).waitFor({timeout:12000});
 } finally {
  await page.keyboard.up('KeyJ');
 }
 const down=await scene();
 assert.ok(down.boss.hp<opened.boss.hp&&down.boss.immortalConstruct.interrupted&&down.boss.tick<300);
 assert.equal(down.kills,opened.kills);
 assert.equal(down.mora,opened.mora);
 await canvas.screenshot({path:'evidence/short-immortal-construct-interrupted.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-immortal-construct-moves-browser.json',JSON.stringify({
  level:145,glowWithoutCounterAt:glow.boss.tick,counterShownAt:opened.boss.tick,hitsLeftAtOpening:opened.boss.immortalConstruct.hitsLeft,
  interruptedAt:down.boss.tick,normalAttackInput:true,ordinaryKillCountersUnchanged:true,
  sameFrameCommands:{standard:standard.commands,light:light.commands},errors,
 },null,2)+'\n');
 console.log('Chrome: the glow preceded the counter prompt and normal attacks stopped the bloom.');
} catch(error) {
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
} finally {
 await browser.close();
}
