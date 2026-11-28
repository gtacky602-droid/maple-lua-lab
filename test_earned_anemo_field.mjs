import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const source = process.env.ANEMO_EARNED_SAVE || 'work/earned-dvalin/replays/complete.json';
const output = process.env.ANEMO_OUTPUT || 'work/earned-anemo';
const original = await fs.readFile(source);
const input = JSON.parse(original);
const hash = createHash('sha256').update(original).digest('hex');
const graph = JSON.parse(await fs.readFile('content/story-graph.json', 'utf8'));
const hub = 'mond-town', road = 'mond-road', approach = 'anemo-approach', arena = 'anemo-field-basin';
const boss = 'boss-20040201', quest = 'anemo-commission';
await fs.mkdir(output,{recursive:true});

const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1200,height:940}});
page.setDefaultTimeout(20000);
const drive = waypointDriver(page,Object.fromEntries(graph.nodes.map(node=>[node.id,node])));
const read = () => page.evaluate(()=>window.lab.frame);
const canvas = page.locator('#game'), quality = page.locator('#renderMode');
const pack = page.locator('#packRectArt'), label = page.locator('#fieldBossLabel');
const errors = [];
page.on('pageerror',error=>errors.push(error.message));

async function pause(value) {
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

async function defeatDuringRecovery(generation) {
 await page.waitForFunction(generation=>{
  const b=window.lab.frame.fieldBoss;
  return b?.generation===generation&&b.recovering;
 },generation);
 const opening = (await read()).fieldBoss;
 assert.match(await label.textContent(),/核が静止・足元から攻撃（あと[\d.]+秒）/);
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.down('KeyJ');
 try {
  await page.waitForFunction(generation=>{
   const b=window.lab.frame.fieldBoss;
   return b?.generation===generation&&b.phase==='respawn';
  },generation,{timeout:15000});
 } finally { await page.keyboard.up('KeyJ'); }
 const result = await read();
 assert.ok(result.fieldBoss.remaining>0);
 assert.equal(result.fieldBoss.hp,0);
 assert.match(await label.textContent(),/再出現まで \d+秒/);
 return {generation,move:opening.move,openingTick:opening.tick,hpBefore:opening.hp,
  attackHint:opening.label,remaining:result.fieldBoss.remaining,time:result.t};
}

try {
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:51347/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(source);
 await drive.waitNode(hub);
 if(!(await read()).holdAllyFire)await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 await drive.accept(quest);
 await drive.cross(road);
 await drive.cross(approach);
 await drive.cross(arena);
 await drive.walk(715);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FA01'&&b.tick>=42&&b.tick<82;
 });
 await pause(true);
 assert.match(await label.textContent(),/挟み掌・掌の間合いから離れる/);
 const pose = (await read()).fieldBoss;
 await canvas.screenshot({path:path.join(output,'png.png')});
 const frames = {};
 for(const profile of ['h48c32','h32c16']){
  const unpacked=await captureRectTransfer(page,profile,false,async()=>{
   await quality.selectOption(profile);
   await pack.uncheck();
  });
  const packed=await captureRectTransfer(page,profile,true,()=>pack.check());
  if(packed.raster!==unpacked.raster){
   for(const [name,capture] of [['unpacked',unpacked],['packed',packed]]){
    await fs.writeFile(path.join(output,profile+'-'+name+'.png'),Buffer.from(capture.raster.split(',')[1],'base64'));
    await fs.writeFile(path.join(output,profile+'-'+name+'.json'),JSON.stringify(capture.snapshot));
   }
   assert.fail(profile+' packed raster differs from the expanded raster');
  }
  assert.equal(packed.snapshot.fieldBoss.tick,pose.tick);
  assert.equal(unpacked.snapshot.fieldBoss.tick,pose.tick);
  assert.ok(packed.snapshot.fieldBoss.drawCount<unpacked.snapshot.fieldBoss.drawCount);
  assert.ok(packed.gzipBytes<unpacked.gzipBytes);
  await canvas.screenshot({path:path.join(output,profile+'.png')});
  frames[profile]={legacyDraws:unpacked.snapshot.fieldBoss.drawCount,packedDraws:packed.snapshot.fieldBoss.drawCount,
   legacyGzip:unpacked.gzipBytes,packedGzip:packed.gzipBytes,identicalPixels:true};
 }
 await quality.selectOption('sprite');
 await pause(false);
 const first = await defeatDuringRecovery(1);
 await drive.count(quest,1);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.generation===2,null,{timeout:100000});
 const regenerated = await read();
 assert.equal(regenerated.fieldBoss.hp,regenerated.fieldBoss.maxhp);
 assert.ok(regenerated.t-first.time>=58);
 const second = await defeatDuringRecovery(2);
 await drive.count(quest,1);
 await drive.cross(approach);
 await drive.cross(road);
 await drive.cross(hub);
 await drive.report(quest);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.endgame.bosses[boss].clears,2);
 assert.equal(saved.story.quests[quest].status,'complete');
 assert.deepEqual(saved.endgame.weekly,input.endgame.weekly);
 assert.deepEqual(saved.weapons,input.weapons);
 const equipped=save=>save.inventory.items.filter(item=>item.owner>0).sort((a,b)=>a.id-b.id);
 assert.deepEqual(equipped(saved),equipped(input));
 await fs.writeFile(path.join(output,'complete.json'),JSON.stringify(saved,null,2)+'\n');
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 await drive.waitNode(hub);
 const resumed=await read();
 assert.equal(resumed.story.quests[quest].status,'complete');
 assert.equal(resumed.returns,0);
 assert.deepEqual(errors,[]);
 const result={inputSha256:hash,level:resumed.progression.level,journeys:drive.journeys,
  field:{first,respawn:{hp:regenerated.fieldBoss.hp,seconds:regenerated.t-first.time},second},
  capture:{move:pose.move,tick:pose.tick,frames},commission:resumed.story.quests[quest].status,
  fieldClears:saved.endgame.bosses[boss].clears,weeklyUnchanged:true,
  reported:Object.values(saved.story.quests).filter(q=>q.status==='complete').length,pageErrors:errors};
 await fs.writeFile(path.join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
} catch(error) {
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame?.story?.node,boss:window.lab?.frame?.fieldBoss,
  actor:window.lab?.frame?.actors?.[0]?.x,
  status:document.querySelector('#saveStatus')?.textContent,
 })));
 throw error;
} finally {
 await browser.close();
}
