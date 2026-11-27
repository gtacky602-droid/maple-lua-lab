import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {dvalinGate,driveDvalin} from './tools/browser_dvalin_test.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:910}});
const canvas=page.locator('#game'),id='boss-29010101',quest='dvalin-weekly-commission';
const prefix=process.env.DVALIN_EVIDENCE_PREFIX||'evidence/dvalin-weekly',errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
const gate=(x,node)=>dvalinGate(page,x,node);
async function freeze(move,tick){
 await page.waitForFunction(({move,tick})=>{
  const f=window.lab.frame,b=f.weeklyBoss;if(b?.move!==move||b.tick<tick||f.paused)return false;
  window.lab.action('pause');return true;
 },{move,tick},{timeout:180000});
 await page.waitForFunction(()=>window.lab.frame.paused);return frame();
}
async function resume(){await canvas.click();await page.keyboard.press('KeyP');await page.waitForFunction(()=>!window.lab.frame.paused)}
const progress=setInterval(async()=>{try{await fs.writeFile('work/dvalin-browser-progress.json',JSON.stringify({at:new Date().toISOString(),frame:await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.dvalinResult}))},null,2))}catch{}},5000);progress.unref();
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8847/');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/dvalin-weekly-party-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town');
 const starting=await frame();
 assert.ok(starting.story.quests['amber-join']?.status==='complete'&&starting.companion.id==='amber'&&starting.actors[1].hp>0,'The browser fixture must have Amber available');
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
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await gate(1380,'mond-road');await gate(1280,'dvalin-sky-arena');
 const scenery=await page.evaluate(async()=>{const {sceneryStatus,backgroundReady}=await import('./scenery.js');await backgroundReady;return sceneryStatus(window.lab.frame)});
 assert.equal(scenery.key,'dvalinWeekly');assert.equal(scenery.state,'ready');
 const before=await frame();
 await driveDvalin(page);
 const perch=await freeze('WD02',50);assert.equal(perch.weeklyBoss.maxhp,600);
 await canvas.screenshot({path:prefix+'-perch.png'});await page.evaluate(()=>{window.dvalinFight=true});await resume();
 const png=await freeze('WD08',170);assert.ok(png.weeklyBoss.exposed);
 assert.equal(png.weeklyBoss.crystal.remaining,462-png.weeklyBoss.tick);
 await page.waitForFunction(()=>document.querySelector('#fieldBossLabel').textContent.includes('残り'));
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');await page.waitForFunction(()=>window.lab.frame.commands>1000);const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);const light=await frame();
 assert.deepEqual([standard.t,light.t],[png.t,png.t]);await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');await resume();
 const landing=await freeze('WD08',462);
 assert.ok(landing.weeklyBoss.crystal.damage>0);
 await page.waitForFunction(()=>document.querySelector('#fieldBossLabel').textContent.includes('踏み場が降下'));
 await page.locator('.game').screenshot({path:prefix+'-crystal-result.png'});await resume();
 const floor=await freeze('WD05',100);assert.ok(floor.draws.some(d=>d.text==='SAFE'));
 await canvas.screenshot({path:prefix+'-floor.png'});await resume();
 await page.waitForFunction(()=>window.dvalinResult,undefined,{timeout:300000});
 const play=await page.evaluate(()=>window.dvalinResult);assert.ok(play.won&&play.aiLanded&&play.manualLanded&&play.returns===0&&play.falls===0,JSON.stringify(play));
 const defeated=await frame();assert.equal(defeated.mora-before.mora,300);assert.equal(defeated.story.quests[quest].count,1);
 await gate(35,'mond-road');await gate(60,'mond-town');const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[1400,360]);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));assert.equal(save.weeklyBosses[id].hp,0);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({browser:'Chrome',companion:'amber',play,scenery,mapRoute,uiQuestAccepted:true,questReport:{xp:1400,mora:360},savedWeeklyRespawn:true,
  sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},viewport390:true,errors},null,2)+'\n');
 console.log('Dvalin Chrome: actual pads, guard/crystal, floor warning, quest, comparison and saved respawn passed.');
}catch(e){console.error(await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.dvalinResult})),errors);throw e}
finally{clearInterval(progress);await browser.close()}
