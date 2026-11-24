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
 await page.locator('#importSave').setInputFiles('work/earned-fallen-vigil-ready.json');
 await drive.waitNode('dornman-camp');
 await page.waitForFunction(() => window.lab.frame.progression?.level===18);
 await drive.accept('fallen-vigil-commission');
 await drive.cross('windrest-vigil-court');
 await page.keyboard.press('KeyE');
 await page.waitForFunction(() => window.lab.frame.active===2);
 await drive.walk(855);
 await page.waitForFunction(() => window.lab.frame.fieldBoss?.vigil?.monitor===1,undefined,{timeout:90000});
 await drive.walk((await scene()).boss.x-72);
 await page.keyboard.down('KeyD');
 try {
  await page.waitForFunction(() => window.lab.frame.actors[1].dir===1);
 } finally {
  await page.keyboard.up('KeyD');
 }
 await page.keyboard.press('KeyK');
 await page.waitForFunction(() => window.lab.frame.fieldBoss?.vigil?.records?.[0]==='pyro');
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  if (f.fieldBoss?.vigil?.stars?.length!==2) return false;
  if(!f.paused) window.lab.action('pause');
  return true;
 },undefined,{timeout:90000});
 await page.waitForFunction(() => window.lab.frame.paused);
 const opened=await scene();
 const [near,far]=opened.boss.vigil.stars;
 assert.equal(opened.boss.maxhp,700);
 assert.ok(opened.boss.draftMoves&&near.layers===2&&far.layers===2&&!opened.boss.summons);
 assert.deepEqual([near.element,far.element],opened.boss.vigil.records);
 assert.deepEqual(opened.boss.vigil.records,['pyro','none']);
 const side=Math.sign(far.x-near.x);
 assert.ok(side!==0&&Math.sign(near.x-opened.boss.x)===side);
 await page.locator('#fieldBossLabel').filter({hasText:'二星の落光'}).waitFor();
 const canvas=page.locator('#game');
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  return f.commands>5000 && !f.draws.some(draw => draw.kind==='boss_sprite');
 });
 const standard=await scene();
 await canvas.screenshot({path:'evidence/short-fallen-vigil-stars.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.deepEqual([standard.t,light.t,light.boss.tick],[opened.t,opened.t,opened.boss.tick]);
 await canvas.screenshot({path:'evidence/short-fallen-vigil-stars-light.png'});

 await page.locator('#renderMode').selectOption('sprite');
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(() => !window.lab.frame.paused);
 await page.keyboard.press('KeyE');
 await page.waitForFunction(() => window.lab.frame.active===1);
 await drive.walk(far.x-side*91);
 const facing=side===1?'KeyD':'KeyA';
 await page.keyboard.down(facing);
 try {
  await page.waitForFunction(side => window.lab.frame.actors[0].dir===side,side);
 } finally {
  await page.keyboard.up(facing);
 }
 await page.keyboard.down('KeyJ');
 try {
  await page.locator('#fieldBossLabel').filter({hasText:'元素星を破壊・反撃の好機'}).waitFor({timeout:9000});
 } finally {
  await page.keyboard.up('KeyJ');
 }
 const down=await scene();
 assert.equal(down.boss.form,'down');
 assert.ok(down.boss.hp>0&&down.boss.tick<=396&&!down.boss.vigil.stars);
 assert.equal(down.kills,opened.kills);
 assert.equal(down.mora,opened.mora);
 await canvas.screenshot({path:'evidence/short-fallen-vigil-interrupted.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-fallen-vigil-moves-browser.json',JSON.stringify({
  level:18,recordedElements:opened.boss.vigil.records,starTick:opened.boss.tick,interruptedAtTick:down.boss.tick,
  normalAttackInput:true,ordinaryKillCountersUnchanged:true,
  sameFrameCommands:{standard:standard.commands,light:light.commands},errors,
 },null,2)+'\n');
 console.log('Chrome: two short-profile stars broke from normal attack input.');
} catch(error) {
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
} finally {
 await browser.close();
}
