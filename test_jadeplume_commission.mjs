import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id,node]));
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1260,height:970}});
const drive = waypointDriver(page,nodes);
const quest = 'jadeplume-commission';
const boss = 'boss-26110101';
const hub = 'sumeru-hub';
const arena = 'sumeru-jadeplume-grove';
const trail = 'sumeru-field';
const frame = () => page.evaluate(() => window.lab.frame);
const currentFight = () => page.evaluate(() => {
 const f=window.lab.frame;
 return {actor:f.actors[f.active-1],boss:f.fieldBoss,t:f.t,returns:f.returns};
});
const errors = [];
page.on('pageerror',error => errors.push(error.message));

try {
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9099/');
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 await page.locator('#importSave').setInputFiles('work/earned-jadeplume-ready.json');
 await drive.waitNode(hub);
 assert.equal((await frame()).progression.level,60);
 await drive.accept(quest);
 assert.equal((await frame()).storyGraph.bossNodes.jadeplume,arena);
 await drive.cross(trail);
 await drive.cross(arena);
 await drive.walk(762);
 await page.waitForFunction(() => window.lab.frame.fieldBoss?.recovering);
 await page.locator('#fieldBossLabel').filter({hasText:'反撃の隙'}).waitFor();
 await page.locator('.game').screenshot({path:'evidence/jadeplume-commission-recovery.png'});

 await page.locator('#game').click();
 const started = await currentFight();
 let movement = '';
 await page.keyboard.down('KeyJ');
 try {
  for(let turn=0;turn<340;turn++){
   const current=await currentFight();
   if(current.boss.phase==='respawn')break;
   assert.equal(current.returns,started.returns);
   const dx=current.boss.x-current.actor.x;
   const key=dx>88||(dx>64&&current.actor.dir<0)?'KeyD':dx<64?'KeyA':'';
   if(key!==movement){
    if(movement)await page.keyboard.up(movement);
    if(key)await page.keyboard.down(key);
    movement=key;
   }
   await page.waitForFunction(t => window.lab.frame.t>=t+.10 || window.lab.frame.fieldBoss?.phase==='respawn',current.t);
  }
 }finally{
  await page.keyboard.up('KeyJ');
  if(movement)await page.keyboard.up(movement);
 }
 const defeated = await currentFight();
 assert.equal(defeated.boss.phase,'respawn');
 await drive.count(quest,1);
 await drive.cross(trail);
 await drive.cross(hub);
 const before=await frame();
 await drive.report(quest);
 const reported=await frame();
 assert.equal(reported.progression.questXp-before.progression.questXp,4000);
 assert.equal(reported.mora-before.mora,300);

 await page.locator('#saveProgress').click();
 await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('保存しました'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('再開しました'));
 const restored=await frame();
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.equal(restored.endgame.bosses[boss].clears,1);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/jadeplume-commission-browser.json',JSON.stringify({
  level:60,quest,arena,recoveryShown:true,defeatedAfterSeconds:Number((defeated.t-started.t).toFixed(3)),
  reportXp:4000,reportMora:300,savedAndReopened:true,errors,
 },null,2)+'\n');
 console.log('Chrome: earned Lv60 commission accepted, fought, reported and reopened.');
}finally{
 await browser.close();
}
