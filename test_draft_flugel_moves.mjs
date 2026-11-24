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
 return {boss:f.fieldBoss,t:f.t,commands:f.commands,kills:f.kills,mora:f.mora};
});

try {
 await page.goto(url);
 assert.ok((await (await page.request.get(new URL('/api/lab-info',url).href)).json()).draftFieldMoves);
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 await page.locator('#importSave').setInputFiles('work/earned-flugel-ready.json');
 await drive.waitNode('snezhnaya-hub');
 await page.waitForFunction(() => window.lab.frame.progression?.level===145);
 await drive.accept('flugel-commission');
 await drive.cross('snezhnaya-field');
 await drive.cross('flugel-tundra-basin');
 await drive.walk(855);
 await page.waitForFunction(() => window.lab.frame.fieldBoss?.flugel?.wave?.element==='electro',
  undefined,{timeout:90000});
 const thunder=await scene();
 assert.equal(thunder.boss.move,'FL03');
 await page.locator('#fieldBossLabel').filter({hasText:'招雷'}).waitFor();
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  if(!f.fieldBoss?.flugel?.orb) return false;
  if(!f.paused) window.lab.action('pause');
  return true;
 },undefined,{timeout:90000});
 await page.waitForFunction(() => window.lab.frame.paused);
 const wind=await scene();
 const orb=wind.boss.flugel.orb;
 assert.equal(wind.boss.move,'FL03');
 assert.equal(wind.boss.maxhp,6000000);
 assert.ok(wind.boss.draftMoves&&orb.layers===2&&!wind.boss.summons);
 assert.equal(wind.boss.flugel.mode,'anemo');
 assert.equal(wind.boss.flugel.wave.element,'anemo');
 await page.locator('#fieldBossLabel').filter({hasText:'風球 あと2打'}).waitFor();
 const canvas=page.locator('#game');
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  return f.commands>5000&&!f.draws.some(draw => draw.kind==='boss_sprite');
 });
 const standard=await scene();
 await canvas.screenshot({path:'evidence/short-flugel-orb.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.deepEqual([standard.t,light.t,light.boss.tick],[wind.t,wind.t,wind.boss.tick]);
 await canvas.screenshot({path:'evidence/short-flugel-orb-light.png'});

 await page.locator('#renderMode').selectOption('sprite');
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => !window.lab.frame.paused);
 const side=Math.sign(orb.x-wind.boss.x);
 await drive.walk(orb.x-side*83);
 const facing=side===1?'KeyD':'KeyA';
 await page.keyboard.down(facing);
 try {
  await page.waitForFunction(side => window.lab.frame.actors[0].dir===side,side);
 } finally {
  await page.keyboard.up(facing);
 }
 await page.keyboard.down('KeyJ');
 try {
  await page.locator('#fieldBossLabel').filter({hasText:'風を中断・反撃の隙'}).waitFor({timeout:9000});
 } finally {
  await page.keyboard.up('KeyJ');
 }
 const stopped=await scene();
 assert.equal(stopped.boss.form,'recover');
 assert.ok(stopped.boss.flugel.interrupted&&stopped.boss.tick<=324&&!stopped.boss.flugel.orb);
 assert.equal(stopped.kills,wind.kills);
 assert.equal(stopped.mora,wind.mora);
 await canvas.screenshot({path:'evidence/short-flugel-interrupted.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-flugel-moves-browser.json',JSON.stringify({
  level:145,forecastElements:[thunder.boss.flugel.wave.element,wind.boss.flugel.wave.element],
  orbShownAt:wind.boss.tick,interruptedAt:stopped.boss.tick,normalAttackInput:true,
  ordinaryKillCountersUnchanged:true,sameFrameCommands:{standard:standard.commands,light:light.commands},errors,
 },null,2)+'\n');
 console.log('Chrome: forecast switched from electro to anemo and normal attack stopped the wind release.');
} catch(error) {
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
} finally {
 await browser.close();
}
