import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id,node]));
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1260,height:1000}});
const drive = waypointDriver(page,nodes);
const url = process.env.LAB_URL||'http://127.0.0.1:9100/';
const id='boss-20081001', quest='frostnight-herra-commission';
const move='FHR03', source='frostnight-herra-field-poses-source-v1.png';
const errors=[];
page.on('pageerror',error => errors.push(error.message));

const scene = () => page.evaluate(() => {
 const f=window.lab.frame;
 return {mode:f.fieldBoss,actor:f.actors[f.active-1],commands:f.commands,t:f.t,paused:f.paused};
});
const tick = (min,max) => page.waitForFunction(([id,low,high]) => {
 const boss=window.lab.frame.fieldBoss;
 return boss?.move===id && boss.tick>=low && boss.tick<high;
},[move,min,max]);

async function pause(value) {
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(want => window.lab.frame.paused===want,value);
}

try {
 await page.goto(url);
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 assert.equal((await (await page.request.get(new URL('/api/lab-info',url).href)).json()).draftFieldMoves,true);
 await page.locator('#importSave').setInputFiles('work/nod-fresh-route-draft/earned-lv128.json');
 await drive.waitNode('nod-town');
 assert.equal(await page.evaluate(() => window.lab.frame.progression.level),128);
 await drive.accept(quest);
 await drive.cross('nod-field');
 await drive.cross('nod-herra-terrace');
 await drive.walk(840);
 await tick(61,114);
 const locked=(await scene()).mode;
 assert.equal(locked.id,id);
 assert.equal(locked.form,'shadow');
 assert.equal(locked.maxhp,4500000);
 assert.ok(locked.draftMoves);
 assert.equal(locked.gloom,undefined);
 const {left,right}=locked.lockedWave;
 await drive.walk((left+right)/2);
 await pause(true);
 await page.locator('#fieldBossLabel').filter({hasText:'薄闇の二連波・一波目'}).waitFor();
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(file => !window.lab.frame.draws.some(draw => draw.source===file),source);
 const standard=await scene();
 await page.locator('.game').screenshot({path:'evidence/short-herra-wave.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.equal(standard.t,light.t);
 assert.equal(standard.mode.tick,light.mode.tick);
 await page.locator('.game').screenshot({path:'evidence/short-herra-wave-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);

 await tick(163,173);
 const hp=(await scene()).actor.hp;
 await page.keyboard.down('Space');
 try{
  await tick(198,215);
 }finally{await page.keyboard.up('Space')}
 const first=await scene();
 assert.equal(first.actor.hp,hp);
 assert.ok(first.actor.x>left && first.actor.x<right);
 await drive.walk(right+70);
 await tick(286,324);
 const second=await scene();
 assert.equal(second.actor.hp,hp);
 assert.ok(second.actor.x-10>right);
 assert.deepEqual(second.mode.lockedWave,locked.lockedWave);
 await tick(324,384);
 await page.locator('#fieldBossLabel').filter({hasText:'反撃の隙'}).waitFor();
 assert.equal((await scene()).mode.form,'recover');
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-herra-moves-browser.json',JSON.stringify({
  level:128,maxHp:locked.maxhp,bounds:locked.lockedWave,hpBeforeWave:hp,hpAfterSecondWave:second.actor.hp,
  firstWaveJump:true,secondWaveExit:true,visibleCounterWindow:true,
  sameFrameCommands:{standard:standard.commands,light:light.commands},
  errors,
 },null,2)+'\n');
 console.log('Chrome: Lv128 jump, sidestep, shared telegraph and same-frame render comparison passed.');
}catch(error){
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
}finally{
 await browser.close();
}
