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
 await page.locator('#importSave').setInputFiles('work/earned-wavebinder-short-ready.json');
 await drive.waitNode('novokichev-camp');
 await page.waitForFunction(() => window.lab.frame.progression?.level===160);
 await drive.accept('wavebinder-commission');
 await drive.cross('novokichev-depth');
 await drive.cross('wavebinder-tide-cavern');
 await drive.walk(795);

 const canvas=page.locator('#game');
 await page.waitForFunction(() => {
  const b=window.lab.frame.fieldBoss,a=b?.wavebinder?.anchor;
  return b?.move==='WB02'&&a&&a.y<440&&!a.returning;
 },undefined,{timeout:90000});
 const airborne=await scene();
 await page.waitForFunction(() => {
  const b=window.lab.frame.fieldBoss;
  return b?.move==='WB02'&&b.wavebinder?.anchor?.returning&&b.tick>=190;
 });
 const returning=await scene();
 assert.equal(airborne.boss.x,returning.boss.x);
 assert.equal(returning.boss.wavebinder.anchor.y,480);
 await canvas.screenshot({path:'evidence/short-wavebinder-returning-anchor.png'});

 await page.waitForFunction(() => {
  const f=window.lab.frame;
  if(!f.fieldBoss?.wavebinder?.drinkOpen) return false;
  if(!f.paused) window.lab.action('pause');
  return true;
 },undefined,{timeout:90000});
 await page.waitForFunction(() => window.lab.frame.paused);
 const opened=await scene();
 assert.equal(opened.boss.move,'WB03');
 assert.equal(opened.boss.maxhp,6800000);
 assert.ok(opened.boss.draftMoves&&opened.boss.wavebinder.drinkHits===0);
 assert.ok(opened.boss.wavebinder.drinkRequired===4&&!opened.boss.wavebinder.valiant);
 await page.locator('#fieldBossLabel').filter({hasText:'中断 0 / 4'}).waitFor();
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  return f.commands>5000&&!f.draws.some(draw => draw.kind==='boss_sprite');
 });
 const standard=await scene();
 await canvas.screenshot({path:'evidence/short-wavebinder-drink.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.deepEqual([standard.t,light.t,light.boss.tick],[opened.t,opened.t,opened.boss.tick]);
 await canvas.screenshot({path:'evidence/short-wavebinder-drink-light.png'});

 await page.locator('#renderMode').selectOption('sprite');
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => !window.lab.frame.paused);
 const side=Math.sign(opened.boss.x-opened.actor.x)||1;
 await drive.walk(opened.boss.x-side*76);
 const facing=side===1?'KeyD':'KeyA';
 await page.keyboard.down(facing);
 try {
  await page.waitForFunction(side=>window.lab.frame.actors[window.lab.frame.active-1].dir===side,side);
 } finally {
  await page.keyboard.up(facing);
 }
 await page.keyboard.down('KeyJ');
 try {
  await page.locator('#fieldBossLabel').filter({hasText:'飲み物を中断・反撃の隙'}).waitFor({timeout:12000});
 } finally {
  await page.keyboard.up('KeyJ');
 }
 const down=await scene();
 assert.ok(down.boss.hp<opened.boss.hp&&down.boss.wavebinder.interrupted&&down.boss.tick<240);
 assert.equal(down.boss.wavebinder.drinkHits,4);
 assert.ok(!down.boss.wavebinder.valiant&&!down.boss.wavebinder.drinkOpen);
 assert.equal(down.kills,opened.kills);
 assert.equal(down.mora,opened.mora);
 await canvas.screenshot({path:'evidence/short-wavebinder-interrupted.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-wavebinder-moves-browser.json',JSON.stringify({
  level:160,anchorOutboundAt:airborne.boss.tick,anchorReturningAt:returning.boss.tick,
  drinkShownAt:opened.boss.tick,interruptedAt:down.boss.tick,normalAttackInput:true,
  sameFrameCommands:{standard:standard.commands,light:light.commands},errors,
 },null,2)+'\n');
 console.log('Chrome: anchor flight and return were visible, and normal attacks interrupted the drink.');
} catch(error) {
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
} finally {
 await browser.close();
}
