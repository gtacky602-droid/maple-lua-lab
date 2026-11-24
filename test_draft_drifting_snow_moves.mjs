import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:940}});
const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(node => [node.id,node])));
const url=process.env.LAB_URL||'http://127.0.0.1:9101/';
const id='boss-25135202',arena='drifting-snow-court',hub='snezhnaya-hub';
const errors=[];
page.on('pageerror',error => errors.push(error.message));

const scene=() => page.evaluate(() => {
 const f=window.lab.frame;
 return {boss:f.fieldBoss,actor:f.actors[f.active-1],t:f.t,commands:f.commands,kills:f.kills,mora:f.mora};
});

async function enter() {
 await drive.cross('snezhnaya-field');
 await drive.cross(arena);
 await drive.walk(855);
}

try {
 await page.goto(url);
 assert.ok((await (await page.request.get(new URL('/api/lab-info',url).href)).json()).draftFieldMoves);
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 await page.locator('#importSave').setInputFiles('work/earned-drifting-snow-short-ready.json');
 await drive.waitNode(hub);
 await page.waitForFunction(() => window.lab.frame.progression?.level===160);
 await drive.accept('drifting-snow-commission');
 await enter();
 await page.evaluate(() => {
  const held=new Set();
  window.snowPlay=true;
  function hold(code,on) {
   if (on===held.has(code)) return;
   if (on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function play() {
   const f=window.lab.frame,boss=f.fieldBoss,a=f.actors[f.active-1];
   if(!window.snowPlay||f.paused||boss?.phase==='respawn') {
    for (const code of [...held]) hold(code,false);
    return;
   }
   if(boss?.form==='coffin') {
    for (const code of [...held]) hold(code,false);
    window.lab.action('pause');
    return;
   }
   if(boss?.hp>0) {
    const dx=boss.x-a.x;
    const turn=dx*a.dir<0&&Math.abs(dx)>8;
    const goal=boss.x-Math.sign(dx||a.dir)*75;
    const steer=turn?Math.sign(dx):(Math.abs(a.x-goal)>10?Math.sign(goal-a.x):0);
    hold('KeyA',steer<0);
    hold('KeyD',steer>0);
    hold('KeyJ',!turn&&Math.abs(dx)<120);
   }
   requestAnimationFrame(play);
  }
  requestAnimationFrame(play);
 });
 await page.waitForFunction(() => window.lab.frame.paused&&window.lab.frame.fieldBoss?.form==='coffin',
  undefined,{timeout:100000});
 const opened=await scene();
 assert.equal(opened.boss.move,'FDS03');
 assert.equal(opened.boss.maxhp,5000000);
 assert.ok(opened.boss.hp<=2750000&&opened.boss.draftMoves&&opened.boss.driftingSnow.coffinUsed);
 assert.equal(opened.boss.driftingSnow.hitsLeft,3);
 await page.locator('#fieldBossLabel').filter({hasText:'本体にあと3打'}).waitFor();
 const canvas=page.locator('#game');
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(() => {
  const f=window.lab.frame;
  return f.commands>5000&&!f.draws.some(draw => draw.kind==='boss_sprite');
 });
 const standard=await scene();
 await canvas.screenshot({path:'evidence/short-drifting-snow-coffin.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.deepEqual([standard.t,light.t,light.boss.tick],[opened.t,opened.t,opened.boss.tick]);
 await canvas.screenshot({path:'evidence/short-drifting-snow-coffin-light.png'});

 await page.locator('#saveProgress').click();
 await page.locator('#saveStatus').filter({hasText:'冒険を保存しました'}).waitFor();
 const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')).fieldBosses[id],id);
 assert.equal(saved.hp,opened.boss.hp);
 assert.equal(saved.flags.coffinUsed,true);

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
  await page.locator('#fieldBossLabel').filter({hasText:'氷の棺を中断・反撃の隙'}).waitFor({timeout:12000});
 } finally {
  await page.keyboard.up('KeyJ');
 }
 const down=await scene();
 assert.ok(down.boss.hp<opened.boss.hp&&down.boss.driftingSnow.interrupted&&down.boss.tick<300);
 assert.equal(down.kills,opened.kills);
 assert.equal(down.mora,opened.mora);
 await canvas.screenshot({path:'evidence/short-drifting-snow-interrupted.png'});

 await page.locator('#loadProgress').click();
 await drive.waitNode(hub);
 await enter();
 await page.waitForFunction(()=>/^FDS0[12]$/.test(window.lab.frame.fieldBoss?.move||''));
 const returned=await scene();
 assert.ok(returned.boss.driftingSnow.coffinUsed&&!returned.boss.driftingSnow.hitsLeft);
 assert.ok(returned.boss.hp<=saved.hp&&returned.boss.generation===saved.generation);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-drifting-snow-moves-browser.json',JSON.stringify({
  level:160,coffinShownAt:opened.boss.tick,interruptedAt:down.boss.tick,
  normalAttackInput:true,savedWhileCoffinOpen:true,coffinUsedRestored:true,resumedMove:returned.boss.move,
  sameFrameCommands:{standard:standard.commands,light:light.commands},errors,
 },null,2)+'\n');
 console.log('Chrome: normal attacks interrupted the coffin and reloading kept it spent.');
} catch(error) {
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
} finally {
 await browser.close();
}
