import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {driveAndrius} from './tools/browser_andrius_test.mjs';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:910}}),canvas=page.locator('#game');
const id='boss-29020101',quest='andrius-weekly-commission',prefix='evidence/andrius-weekly',errors=[];
const ranked=process.argv.includes('--ranked');
let selected;
const frame=()=>page.evaluate(()=>window.lab.frame);page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
async function approach(x,node){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.click();await page.keyboard.down(key);
 try{await page.waitForFunction(({x,east})=>{const f=window.lab.frame,a=f.actors[f.active-1];return east?a.x>=x-8:a.x<=x+8},{x,east},{timeout:90000})}
 finally{await page.keyboard.up(key)}
 await page.waitForFunction(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);
}
async function gate(x,node,rank=null){
 await approach(x,node);
 if(rank){
  const select=page.locator('#weeklyDifficulty');
  const button=page.locator('#weeklyChallengeStart');
  await page.locator('#weeklyDesk').waitFor();
  assert.deepEqual(await select.locator('option').allTextContents(),['入門','標準','上級','最上級']);
  await select.selectOption('expert');
  assert.ok(await button.isDisabled());
  assert.match(await page.locator('#weeklyChallengeDetails').textContent(),/必要Lv180/);
  await select.selectOption(rank);
  assert.ok(await button.isEnabled());
  selected=(await frame()).weeklyDesk.modes.find(option=>option.id===rank);
  assert.match(await page.locator('#weeklyChallengeDetails').textContent(),/初回追加/);
  await page.locator('#weeklyDesk').screenshot({path:'evidence/weekly-difficulty-entry.png'});
  await button.click();
  await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
  return;
 }
 await page.keyboard.press('KeyF');await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}
async function freeze(move,tick){
 await page.waitForFunction(({move,tick})=>{const f=window.lab.frame,b=f.weeklyBoss;
  if(b?.move!==move||b.tick<tick||f.paused)return false;window.lab.action('pause');return true;
 },{move,tick},{timeout:180000});await page.waitForFunction(()=>window.lab.frame.paused);return frame();
}
async function resume(){await canvas.click();await page.keyboard.press('KeyP');await page.waitForFunction(()=>!window.lab.frame.paused)}
const progress=setInterval(async()=>{try{await fs.writeFile('work/andrius-browser-progress.json',JSON.stringify({at:new Date().toISOString(),frame:await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.andriusResult}))},null,2))}catch{}},5000);progress.unref();
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8849/');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile(ranked?'work/andrius-weekly-ranked-fixture.json':'work/andrius-weekly-fixture.json','utf8'));
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town');
 const row=page.locator(`[data-quest="${quest}"]`);await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(1380,'mond-road');await gate(940,'andrius-wolf-ring',ranked?'entry':null);const before=await frame();
 assert.match(before.weeklyBoss.resistance,/風・氷 無効/);
 const scenery=await page.evaluate(async()=>{const {sceneryStatus,backgroundReady}=await import('./scenery.js');await backgroundReady;return sceneryStatus(window.lab.frame)});
 assert.deepEqual(scenery,{key:'andriusWeekly',file:'andrius-weekly-background-v1.png',state:'ready'});
 if(ranked)assert.equal(before.weeklyBoss.difficulty,'入門');
 await driveAndrius(page);
 if(ranked){
  await page.evaluate(()=>{window.andriusFight=true});
  await page.waitForFunction(()=>window.andriusResult,undefined,{timeout:300000});
  const play=await page.evaluate(()=>window.andriusResult);
  assert.ok(play.won&&play.transitions===1&&play.returns===0,JSON.stringify(play));
  const defeated=await frame(),reward=defeated.weeklyBoss.reward;
  assert.deepEqual(reward,{xp:selected.xp+selected.firstXp,mora:selected.mora+selected.firstMora,first:true});
  assert.equal(defeated.progression.killXp-before.progression.killXp,reward.xp);
  assert.equal(defeated.mora-before.mora,reward.mora);
  assert.equal(defeated.story.quests[quest].count,1);
  await page.locator('#weeklyChallengeResult').waitFor();
  await page.locator('#fieldBoss').screenshot({path:'evidence/weekly-difficulty-result.png'});
  await gate(35,'mond-road');
  await approach(940,'andrius-wolf-ring');
  await page.locator('#weeklyDifficulty').selectOption('expert');
  const remaining=(await frame()).weeklyDesk.remaining;
  await page.waitForFunction(seconds=>window.lab.frame.weeklyDesk?.remaining<seconds-1,remaining);
  assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
  await page.locator('#weeklyDifficulty').selectOption('entry');
  assert.doesNotMatch(await page.locator('#weeklyChallengeDetails').textContent(),/初回追加/);
  assert.match(await page.locator('#weeklyChallengeRecord').textContent(),/1勝/);
  await gate(60,'mond-town');
  const ready=await frame();
  await row.getByRole('button',{name:'報告',exact:true}).click();
  await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
  const reported=await frame();
  assert.deepEqual([reported.progression.questXp-ready.progression.questXp,reported.mora-ready.mora],[1600,390]);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
  const restored=await frame();
  assert.equal(restored.endgame.weekly[id+':entry'].clears,1);
  assert.deepEqual(errors,[]);
  await fs.writeFile('evidence/weekly-difficulty-browser.json',JSON.stringify({
   boss:id,rank:'entry',entry: selected,play,reward,questReport:{xp:1600,mora:390},
   selectionHeldDuringCooldown:true,recordAfterReload:true,errors,
  },null,2)+'\n');
  console.log('Andrius Chrome: ranked portal, fight, first payout, commission and save passed.');
 }else{
 const normal=await freeze('WA01',38);assert.equal(normal.weeklyBoss.maxhp,900);await canvas.screenshot({path:prefix+'-normal.png'});
 await page.evaluate(()=>{window.andriusFight=true});await resume();
 const interlude=await freeze('WA06',120);assert.equal(interlude.weeklyBoss.transitions,1);await canvas.screenshot({path:prefix+'-interlude.png'});await resume();
 const png=await freeze('WA08',80);assert.ok(png.weeklyBoss.awakened&&png.weeklyBoss.stage==='P2');await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');await page.locator('#packRectArt').uncheck();
 await page.waitForFunction(()=>window.lab.frame.commands>1000);const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);const light=await frame();
 assert.deepEqual([standard.t,light.t],[png.t,png.t]);await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');await page.evaluate(()=>{window.andriusFight=false});await resume();
 await freeze('WA09',145);await canvas.screenshot({path:prefix+'-rain.png'});await resume();
 await freeze('WA10',96);await canvas.screenshot({path:prefix+'-howl.png'});await resume();
 const swipe=await freeze('WA01',38);assert.ok(swipe.weeklyBoss.awakened&&swipe.draws.some(d=>d.source==='andrius-weekly-awake-actions-source-v1.png'));
 await canvas.screenshot({path:prefix+'-awake-swipe.png'});await resume();
 const tail=await freeze('WA02',50);assert.ok(tail.weeklyBoss.awakened&&tail.draws.some(d=>d.source==='andrius-weekly-awake-actions-source-v1.png'));
 await canvas.screenshot({path:prefix+'-awake-tail.png'});await page.evaluate(()=>{window.andriusFight=true});await resume();
 await page.waitForFunction(()=>window.andriusResult,undefined,{timeout:300000});const play=await page.evaluate(()=>window.andriusResult);
 assert.ok(play.won&&play.aiUpper&&play.manualUpper&&play.immuneEvent&&play.transitions===1&&play.returns===0&&play.falls===0,JSON.stringify(play));
 const defeated=await frame();assert.equal(defeated.mora-before.mora,330);assert.equal(defeated.story.quests[quest].count,1);
 await gate(35,'mond-road');await gate(60,'mond-town');const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[1600,390]);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));assert.equal(save.weeklyBosses[id].hp,0);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({browser:'Chrome',companion:'amber',play,scenery,uiQuestAccepted:true,
  questReport:{xp:1600,mora:390},savedWeeklyRespawn:true,awakenedActionShots:true,sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},viewport390:true,errors},null,2)+'\n');
 console.log('Andrius Chrome: two phases, interlude upper route, immunity, comparison, report and save passed.');
 }
}catch(e){console.error(await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.andriusResult})),errors);throw e}
finally{clearInterval(progress);await browser.close()}
