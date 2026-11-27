import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280,height:1020}});
const drive = waypointDriver(page,{});
const status = page.locator('#endgameRunStatus');
const upper = page.locator('#abyssUpper');
const output = process.env.ABYSS_TEST_DIR || 'work/abyss-upper-standard';
const errors = [];
page.on('pageerror',error => errors.push(error.message));

async function importTown(file, level) {
 await page.locator('#importSave').setInputFiles(file);
 await page.waitForFunction(lv => window.lab.frame.progression?.level === lv,level);
 if(await drive.node() !== 'mond-town') {
  await page.getByRole('button',{name:'拠点へ：モンド・城門広場',exact:true}).click();
 }
 await drive.waitNode('mond-town');
}

async function liveTargets() {
 return page.evaluate(() => {
  const frame = window.lab.frame;
  const actor = frame.actors.find(a => a.id === frame.active);
  const enemies = frame.draws.filter(draw => draw.kind === 'sprite' && (draw.asset === 5 || draw.asset === 7));
  return {actor,enemies,run:frame.endgameRun};
 });
}

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9099/');
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 await importTown(path.join(output,'locked-browser-save.json'),140);
 await upper.waitFor();
 assert.ok(await upper.isDisabled());
 assert.match(await upper.textContent(),/Lv160/);
 await importTown(path.join(output,'upper-browser-save.json'),200);
 await page.locator('#abyssUpper:enabled').waitFor();
 assert.match(await upper.textContent(),/上層（試作）/);
 await page.locator('#abyssSet').selectOption('troupe');
 await upper.click();
 await page.waitForFunction(() => window.lab.frame.endgameRun?.room === 1);
 await status.filter({hasText:/上層 1\/3・二段の前哨/}).waitFor();
 await page.locator('.game').screenshot({path:path.join(output,'abyss-upper-room-browser.png')});

 for(let turn=0;turn<30;turn++){
  const {actor,enemies,run} = await liveTargets();
  if(run.status === 'between')break;
  assert.equal(run.status,'fighting');
  const distance = enemy => Math.abs(enemy.x-actor.x) + Math.abs(enemy.y-actor.y)*2;
  const target = enemies.reduce((best,enemy) => distance(enemy)<distance(best)?enemy:best);
  const side = target.x>=actor.x?1:-1;
  const bounds = target.y===480?[20,930]:[315,650];
  await drive.walk(Math.max(bounds[0],Math.min(bounds[1],target.x-side*48)));
  if((await liveTargets()).run.status === 'between')break;
  await drive.changeHeight(target.y);
  await page.keyboard.press(side>0?'KeyD':'KeyA');
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Digit1');
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(t => window.lab.frame.t >= t+.8 || window.lab.frame.endgameRun.status !== 'fighting',
    await page.evaluate(() => window.lab.frame.t));
  }finally{await page.keyboard.up('KeyJ')}
 }
 const next = page.locator('#abyssNext');
 await next.waitFor();
 await next.click();
 await page.waitForFunction(() => window.lab.frame.endgameRun?.room === 2);
 await status.filter({hasText:/上層 2\/3・棚を渡る回廊/}).waitFor();
 await page.locator('button[data-action="endgame_exit"]').click();
 await page.waitForFunction(() => !window.lab.frame.endgameRun && window.lab.frame.story.node === 'mond-town');
 await page.locator('#abyssUpper:enabled').waitFor();
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'abyss-upper-browser.json'),JSON.stringify({
  profile:'standard',blockedAt:140,enteredAt:200,clearedFirstRoom:true,enteredSecondRoom:true,returnedToTown:true,errors,
 },null,2)+'\n');
 console.log('Chrome passed the upper abyss lock, first room, next-room control and return.');
}catch(error){
 console.error(await page.locator('#status').textContent(),errors,await page.evaluate(() => ({
  node:window.lab?.frame.story?.node,level:window.lab?.frame.progression?.level,
  upper:window.lab?.frame.endgameDesk?.abyss?.upper,
  button:document.getElementById('abyssUpper').outerHTML,
 })));
 throw error;
}finally{
 await browser.close();
}
