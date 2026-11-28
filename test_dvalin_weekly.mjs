import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {dvalinGate,driveDvalin} from './tools/browser_dvalin_test.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:910}});
const canvas=page.locator('#game'),id='boss-29010101',quest='dvalin-weekly-commission';
const prefix=process.env.DVALIN_EVIDENCE_PREFIX||'evidence/dvalin-weekly',errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
const expertSource=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
assert.ok(!expectedWins||expertSource);
const expert=id+':expert',heretic='boss-29150101:expert',hub='mond-town',road='mond-road',arena='dvalin-sky-arena';
const equipment=save=>save.inventory.items.filter(item=>item.owner);
await fs.mkdir(path.dirname(prefix),{recursive:true});
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
const gate=(x,node)=>dvalinGate(page,x,node);
async function freeze(move,tick,onStep=false){
 await page.waitForFunction(({move,tick,onStep})=>{
  const f=window.lab.frame,b=f.weeklyBoss;if(b?.move!==move||b.tick<tick||f.paused||onStep&&!b.crystal?.onStep)return false;
  window.lab.action('pause');return true;
 },{move,tick,onStep},{timeout:180000});
 await page.waitForFunction(()=>window.lab.frame.paused);return frame();
}
async function resume(){await canvas.click();await page.keyboard.press('KeyP');await page.waitForFunction(()=>!window.lab.frame.paused)}
const progress=setInterval(async()=>{try{await fs.writeFile(prefix+'-progress.json',JSON.stringify({at:new Date().toISOString(),frame:await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.dvalinResult}))},null,2))}catch{}},5000);progress.unref();
async function openExpertSave(){
 const raw=await fs.readFile(expertSource,'utf8');
 const checkpoint=JSON.parse(raw);
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(n=>[n.id,n])));
 await page.locator('#importSave').setInputFiles(expertSource);
 await page.waitForFunction(k=>window.lab.frame.endgame?.weekly[k]?.clears===4,heretic);
 assert.equal((await frame()).progression.level,200);
 if(await drive.node()!==hub)await drive.warp(hub);
 return {checkpoint,drive,sourceSha256:createHash('sha256').update(raw).digest('hex')};
}

async function restoreExpert({checkpoint,drive,sourceSha256}){
 const f=await frame();
 assert.equal(f.endgame.weekly[expert].clears,expectedWins);
 assert.equal(f.story.quests[quest].status,'complete');
 assert.equal(f.actors[0].atk,74956);
 const catalog=JSON.parse(await fs.readFile('content/weekly-boss-spawns.json','utf8'));
 const canonical=catalog.weeklyBosses.filter(b=>b.id.startsWith('boss-'));
 const weeklyExpert=canonical.map(b=>({id:b.id,name:b.name,clears:f.endgame.weekly[b.id+':expert']?.clears??0}));
 assert.equal(weeklyExpert.length,14);
 assert.ok(weeklyExpert.every(b=>b.clears>0));
 const reported=Object.values(f.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,121);
 await gate(1380,road);
 await drive.walk(1280);
 await page.locator('#weeklyDesk').waitFor();
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256,expertWins:expectedWins,
  weeklyExpert,reported,attack:f.actors[0].atk,remaining,pendingArtifacts:checkpoint.inventory.ground.length,errors},null,2)+'\n');
}

async function play(){
 const earned=expertSource&&await openExpertSave();
 if(expectedWins){
  await restoreExpert(earned);
  return;
 }
 if(earned){
  assert.ok(!earned.checkpoint.endgame.weekly[expert]&&!earned.checkpoint.story.quests[quest]);
  await page.evaluate(()=>{
   window.lab.action('artifact_remove:602');
   window.lab.action('artifact_equip:1187');
   window.lab.action('weapon_equip:traveler:SW04');
  });
  await page.waitForFunction(()=>window.lab.frame.actors[0].atk===7);
  await page.locator('#allyFire').click();
  await page.waitForFunction(()=>window.lab.frame.holdAllyFire);
 }else{
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/dvalin-weekly-party-fixture.json','utf8'));
  await page.locator('#loadProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
  await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town');
  const starting=await frame();
  assert.ok(starting.story.quests['amber-join']?.status==='complete'&&starting.companion.id==='amber'&&starting.actors[1].hp>0,'The browser fixture must have Amber available');
 }
 const row=page.locator(`[data-quest="${quest}"]`);await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('boss');
 await page.locator('#atlasSearch').fill('トワリン');
 await page.locator('#atlasField').selectOption('dvalin-sky-arena');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='dvalin-sky-arena');
 const map=(await frame()).worldMap;
 const mapRoute=map.guide.stops.map(stop=>stop.id);
 assert.equal(map.guide.status,'ready');
 assert.deepEqual(mapRoute,['mond-road','dvalin-sky-arena']);
 if(earned)await atlas.screenshot({path:prefix+'-atlas.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await gate(1380,road);
 let rank;
 if(earned){
  await earned.drive.walk(1280);
  await page.locator('#weeklyDesk').waitFor();
  await page.locator('#weeklyDifficulty').selectOption('expert');
  await page.waitForFunction(()=>!document.getElementById('weeklyChallengeStart').disabled);
  rank=(await frame()).weeklyDesk.modes.find(m=>m.id==='expert');
  assert.ok(rank.available&&!rank.record);
  await page.locator('#weeklyChallengeStart').click();
  await earned.drive.waitNode(arena);
  assert.equal((await frame()).weeklyBoss.difficulty,'最上級');
 }else await gate(1280,arena);
 const scenery=await page.evaluate(async()=>{const {sceneryStatus,backgroundReady}=await import('./scenery.js');await backgroundReady;return sceneryStatus(window.lab.frame)});
 assert.equal(scenery.key,'dvalinWeekly');assert.equal(scenery.state,'ready');
 const before=await frame();
 await driveDvalin(page,earned?{firstCrystalLimit:300}:{});
 const perch=await freeze('WD02',50);assert.equal(perch.weeklyBoss.maxhp,600);
 await canvas.screenshot({path:prefix+'-perch.png'});await page.evaluate(()=>{window.dvalinFight=true});await resume();
 const png=await freeze('WD08',170,true);assert.ok(png.weeklyBoss.exposed);
 assert.equal(png.weeklyBoss.crystal.remaining,462-png.weeklyBoss.tick);
 await page.waitForFunction(()=>document.querySelector('#fieldBossLabel').textContent.includes('残り'));
 const crystalCue=await page.locator('#fieldBossLabel').textContent();
 assert.match(crystalCue,/首の結晶を攻撃（J）.*残り[\d.]+秒/);
 assert.ok(png.weeklyBoss.crystal.onStep);
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await page.waitForFunction(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 let transfer;
 if(earned){
  const rawLight=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
  const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
  assert.equal(rawLight.raster,packed.raster);
  assert.ok(rawLight.gzipBytes>packed.gzipBytes);
  transfer={rawGzip:rawLight.gzipBytes,packedGzip:packed.gzipBytes,pixelMatch:true};
 }else await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[png.t,png.t]);await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');await resume();
 const landing=await freeze('WD08',462);
 assert.ok(landing.weeklyBoss.crystal.damage>0);
 await page.waitForFunction(()=>document.querySelector('#fieldBossLabel').textContent.includes('踏み場が降下'));
 await page.locator('.game').screenshot({path:prefix+'-crystal-result.png'});await resume();
 const floor=await freeze('WD05',100);assert.ok(floor.draws.some(d=>d.text==='SAFE'));
 await canvas.screenshot({path:prefix+'-floor.png'});await resume();
 await page.waitForFunction(()=>window.dvalinResult,undefined,{timeout:300000});
 const play=await page.evaluate(()=>window.dvalinResult);
 assert.ok(play.won&&(earned||play.aiLanded)&&play.manualLanded&&play.returns===0&&play.falls===0,JSON.stringify(play));
 const defeated=await frame();
 let firstReward;
 if(earned){
  firstReward={xp:rank.xp+rank.firstXp,mora:rank.mora+rank.firstMora,first:true};
  assert.equal(defeated.endgame.weekly[expert].clears,1);
  assert.deepEqual(defeated.weeklyBoss.reward,firstReward);
  assert.equal(defeated.progression.overflowXp-before.progression.overflowXp,firstReward.xp);
  assert.equal(defeated.mora-before.mora,firstReward.mora);
 }else assert.equal(defeated.mora-before.mora,300);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(35,'mond-road');await gate(60,'mond-town');const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 const payout={xp:report.progression.questXp-beforeReport.progression.questXp,mora:report.mora-beforeReport.mora};
 assert.deepEqual(payout,{xp:1400,mora:360});
 if(earned){
  await page.evaluate(()=>{
   window.lab.action('artifact_equip:10');
   window.lab.action('artifact_equip:602');
   window.lab.action('weapon_equip:traveler:SW07');
  });
  await page.waitForFunction(()=>window.lab.frame.actors[0].atk===74956);
 }
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 if(earned){
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 }
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.weeklyBosses[id].hp,0);
 if(earned){
  assert.equal((await frame()).endgame.weekly[expert].clears,1);
  assert.deepEqual(save.weapons,earned.checkpoint.weapons);
  assert.deepEqual(equipment(save),equipment(earned.checkpoint));
  assert.equal(save.companion,earned.checkpoint.companion);
  for(const [key,record] of Object.entries(earned.checkpoint.endgame.weekly))assert.deepEqual(save.endgame.weekly[key],record,key);
  for(const [key,record] of Object.entries(earned.checkpoint.story.quests)){
   if(record.status==='complete')assert.deepEqual(save.story.quests[key],record,key);
  }
  await fs.writeFile(path.join(path.dirname(prefix),'dvalin-complete.json'),JSON.stringify(save,null,2)+'\n');
 }
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({browser:'Chrome',companion:save.companion,play,scenery,mapRoute,crystalCue,firstCrystalDamage:landing.weeklyBoss.crystal.damage,
  uiQuestAccepted:true,questReport:payout,savedWeeklyRespawn:true,sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},viewport390:true,
  ...(earned&&{sourceSha256:earned.sourceSha256,expertWins:1,firstReward,transfer,
   trialAttack:before.actors[0].atk,trialHp:before.actors[0].maxhp}),errors},null,2)+'\n');
 console.log('Dvalin Chrome: actual pads, guard/crystal, floor warning, quest, comparison and saved respawn passed.');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8847/');
 await page.waitForFunction(()=>window.lab?.frame);
 await play();
}catch(e){console.error(await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.dvalinResult})),errors);throw e}
finally{clearInterval(progress);await browser.close()}
