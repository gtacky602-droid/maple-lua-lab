import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node => [node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:1010}});
const drive=waypointDriver(page,nodes);
const url=process.env.LAB_URL||'http://127.0.0.1:9101/';
const source='knuckle-duckle-field-poses-source-v1.png';
const errors=[];
page.on('pageerror',error => errors.push(error.message));

const scene=() => page.evaluate(() => {
 const f=window.lab.frame;
 return {boss:f.fieldBoss,actor:f.actors[f.active-1],t:f.t,commands:f.commands,kills:f.kills,mora:f.mora};
});
async function pause(value) {
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(want => window.lab.frame.paused===want,value);
}

try {
 await page.goto(url);
 assert.equal((await (await page.request.get(new URL('/api/lab-info',url).href)).json()).draftFieldMoves,true);
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 await page.locator('#importSave').setInputFiles('work/earned-duckle-ready.json');
 await drive.waitNode('nod-town');
 await page.waitForFunction(() => window.lab.frame.progression?.level===122);
 await drive.accept('knuckle-duckle-commission');
 await drive.cross('nod-field');
 await drive.cross('nod-duckle-workyard');
 await drive.walk(842);

 await page.waitForFunction(() => window.lab.frame.fieldBoss?.summons?.length===2);
 const spawned=await scene();
 assert.equal(spawned.boss.maxhp,4250000);
 assert.ok(spawned.boss.draftMoves && !spawned.boss.repairWard);
 assert.deepEqual(spawned.boss.summons.map(unit => unit.maxhp),[55000,55000]);
 assert.ok(spawned.boss.summons.every(unit => Math.sign(unit.x-spawned.boss.x)===
  Math.sign(spawned.boss.summons[0].x-spawned.boss.x)));
 await page.waitForFunction(() => {
  const boss=window.lab.frame.fieldBoss;
  return boss?.move==='FDK03'&&boss.tick>=110&&boss.summons?.length===2;
 });
 await pause(true);
 const rolled=await scene();
 assert.ok(rolled.boss.summons.every((unit,index) =>
  Math.abs(unit.x-rolled.boss.x)<Math.abs(spawned.boss.summons[index].x-spawned.boss.x)));
 await page.locator('#fieldBossLabel').filter({hasText:'補修メカ'}).waitFor();
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await page.waitForFunction(file => !window.lab.frame.draws.some(draw => draw.source===file),source);
 const standard=await scene();
 await page.locator('.game').screenshot({path:'evidence/short-duckle-mechas.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.equal(standard.t,light.t);
 await page.locator('.game').screenshot({path:'evidence/short-duckle-mechas-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);

 for(let turn=0;turn<13;turn++){
  const at=await scene();
  if(at.boss.form==='down')break;
  assert.ok(at.boss.tick<300 && at.boss.summons?.length,JSON.stringify(at.boss));
  const target=at.boss.summons.reduce((best,unit) =>
   Math.abs(unit.x-at.actor.x)<Math.abs(best.x-at.actor.x)?unit:best);
  await drive.walk(target.x-48);
  await page.keyboard.down('KeyD');
  try{await page.waitForFunction(() => window.lab.frame.actors[0].dir===1);}
  finally{await page.keyboard.up('KeyD')}
  await page.keyboard.press(['Digit1','Digit2','Digit3'][turn%3]);
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(([id,t]) => {
    const f=window.lab.frame;
    return f.t>=t+.32 || !f.fieldBoss?.summons?.some(unit => unit.id===id);
   },[target.id,(await scene()).t]);
  }finally{await page.keyboard.up('KeyJ')}
 }
 const down=await scene();
 assert.equal(down.boss.form,'down');
 assert.equal(down.boss.repairSequence.defeated,2);
 assert.ok(down.boss.tick<=300 && down.boss.hp>0);
 assert.equal(down.kills,spawned.kills);
 assert.equal(down.mora,spawned.mora);
 await page.locator('#fieldBossLabel').filter({hasText:'放電を中断・反撃の隙'}).waitFor();
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-duckle-moves-browser.json',JSON.stringify({
  level:122,twoMovingMechas:true,interruptedBy:down.boss.tick,ordinaryKillCountersUnchanged:true,
  sameFrameCommands:{standard:standard.commands,light:light.commands},errors,
 },null,2)+'\n');
 console.log('Chrome: the two mechas rolled toward the boss and were defeated before the discharge.');
}catch(error){
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
}finally{
 await browser.close();
}
