import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg,timeout=65000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix=process.env.LAB_WEEKLY_EVIDENCE || 'evidence/primal-fire-weekly';
const hub='natlan-hub',node='primal-fire-sundered-forge',quest='primal-fire-weekly-commission',id='boss-29091101';
const expertSource=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
assert.ok(!expectedWins||expertSource);
const expert=id+':expert',knave='boss-29091001:expert';
const existingGear=save=>save.inventory.items.filter(item=>item.owner);
const events=f=>Object.values(f?.events||{});
await fs.mkdir(path.dirname(prefix),{recursive:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const bytes=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(bytes,'base64'));
 return bytes;
}

async function openExpertSave(){
 const raw=await fs.readFile(expertSource,'utf8');
 const seed=JSON.parse(raw);
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(n=>[n.id,n])));
 await page.locator('#importSave').setInputFiles(expertSource);
 await wait(key=>window.lab.frame.endgame?.weekly[key]?.clears===3,knave);
 assert.equal((await frame()).progression.level,200);
 if(await drive.node()!==hub)await drive.warp(hub);
 return {seed,drive,sourceSha256:createHash('sha256').update(raw).digest('hex')};
}

async function restoreExpert({drive,sourceSha256}){
 const f=await frame();
 assert.equal(f.endgame.weekly[expert].clears,expectedWins);
 assert.equal(f.story.quests[quest].status,'complete');
 assert.equal(f.actors[0].atk,74956);
 const reported=Object.values(f.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,117);
 await drive.walk(351);
 await page.locator('#weeklyDesk').waitFor();
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256,expertWins:expectedWins,
  knaveExpertWins:f.endgame.weekly[knave].clears,reported,attack:f.actors[0].atk,remaining,errors},null,2)+'\n');
}

async function play(){
 const earned=expertSource&&await openExpertSave();
 if(expectedWins){
  await restoreExpert(earned);
  return;
 }
 if(earned){
  assert.ok(!earned.seed.endgame.weekly[expert]&&!earned.seed.story.quests[quest]);
  await page.evaluate(()=>{window.lab.action('artifact_remove:602');window.lab.action('artifact_equip:1187');});
  await wait(()=>window.lab.frame.actors[0].atk===259);
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }else{
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
   await fs.readFile('work/primal-fire-weekly-gear.json','utf8'));
  await page.locator('#loadProgress').click();
  await wait(hub=>window.lab.frame.story?.node===hub,hub);
 }
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 let mode,guide;
 if(earned){
  await canvas.click();
  await page.keyboard.press('KeyM');
  const atlas=page.locator('#worldAtlas');
  await atlas.waitFor();
  await atlas.locator('#atlasField').selectOption(node);
  await wait(n=>window.lab.frame.worldMap?.selected?.id===n,node);
  guide=(await frame()).worldMap.guide;
  assert.equal(guide.status,'ready');
  assert.deepEqual(guide.stops.map(s=>[s.id,s.previewX]),[[node,351]]);
  await atlas.screenshot({path:prefix+'-atlas.png'});
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  await earned.drive.walk(351);
  await page.locator('#weeklyDesk').waitFor();
  await page.locator('#weeklyDifficulty').selectOption('expert');
  await wait(()=>!document.getElementById('weeklyChallengeStart').disabled);
  mode=(await frame()).weeklyDesk.modes.find(m=>m.id==='expert');
  assert.ok(mode.available&&!mode.record);
  await page.locator('#weeklyChallengeStart').click();
 }else{
  await canvas.click();
  await page.keyboard.down('KeyD');
  try{await wait(n=>window.lab.frame.storyNearbyPortal?.to===n&&window.lab.frame.storyNearbyPortal.available,node);}
  finally{await page.keyboard.up('KeyD');}
  await page.keyboard.press('KeyF');
 }
 await wait(n=>window.lab.frame.story.node===n,node);
 const opening=await frame();
 if(earned)assert.equal(opening.weeklyBoss.difficulty,'最上級');
 const scenery=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scenery.key,scenery.state],['sunderedForge','ready']);
 await wait(()=>window.lab.frame.weeklyBoss?.primal?.objects?.[0]?.kind==='gate');
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const gate=await frame();
 assert.equal(gate.weeklyBoss.primal.objects[0].max,12);
 assert.ok(gate.draws.some(d=>d.source==='gosoythoth-idle-source-v1.png'));
 const gatePrompt=await page.locator('#weeklyPrimalHint').textContent();
 assert.match(gatePrompt,/障壁.*受付終了まで\d+\.\d秒/);
 const png=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>12000);
 const standard=await frame(),legacy=await capture('standard');
 let transfer;
 if(earned){
  const rawLight=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
  const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
  assert.equal(rawLight.raster,packed.raster);
  assert.ok(rawLight.gzipBytes>packed.gzipBytes);
  transfer={rawGzip:rawLight.gzipBytes,packedGzip:packed.gzipBytes,pixelMatch:true};
 }else await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.6,standard.commands);
 const reduced=await frame(),light=await capture('light');
 assert.deepEqual([standard.t,reduced.t],[gate.t,gate.t]);
 assert.deepEqual(reduced.weeklyBoss,gate.weeklyBoss);
 assert.equal(new Set([png,legacy,light]).size,3);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.commands<500);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyPrimal').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();

 await page.evaluate(()=>{
  const keys=new Set();
  window.primalCuts=[];
  window.primalTrials=[];
  window.primalPillarBreaks={};
  window.primalCutCue=null;
  window.primalPillarCue=null;
  window.primalStage='first';
  function key(code,on){
   if(keys.has(code)===on)return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.primal;
   let left=false,right=false,attack=false;
   if(v?.actors?.length&&!f.paused&&b.phase!=='respawn'){
    const a=f.actors[f.active-1],objects=Array.isArray(v.objects)?v.objects.filter(o=>o.units>0):[];
    const floor=f.platforms.find(p=>p.y===480);
    if(window.primalCuts.at(-1)?.left!==v.left)window.primalCuts.push({left:v.left,width:floor?.w,collisionLeft:floor?.x});
    if(objects.length&&window.primalTrials.at(-1)!==v.card)window.primalTrials.push(v.card);
    const hint=document.querySelector('#weeklyPrimalHint').textContent;
    if(v.cutCue&&!v.cutCue.needsMove&&hint.includes('白線の右側を維持'))window.primalCutCue??={text:hint,x:a.x};
    if(v.card==='WG14'&&objects.length===3&&hint.includes('中央の柱'))window.primalPillarCue??=hint;
    for(const e of Object.values(f.events)){
     if(e.kind==='primal:WG14:broken')window.primalPillarBreaks[e.value]=true;
    }
    const object=objects[0],target=object?.x??b.x;
    let goal=Math.max(v.left+30,target-78);
    const facing=Math.sign(target-a.x),reachable=Math.abs(target-a.x)<115&&facing===a.dir;
    const threshold=[.725,.475,.225,0][v.cuts];
    if(Math.abs(goal-a.x)<11&&facing!==a.dir)goal=a.x+facing*24;
    if(v.card==='WG09'&&v.tick<v.cutAt)goal=Math.max(goal,v.left+139);
    left=goal<a.x-11;right=goal>a.x+11;
    attack=reachable&&(!!object||window.primalStage==='battle'&&b.damageable&&b.hp>b.maxhp*threshold);
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 });
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='exposed');
 const exposed=await frame();
 assert.equal(exposed.weeklyBoss.hp,gate.weeklyBoss.hp);
 const trialStatus=await page.locator('#weeklyPrimalHint').textContent();
 assert.match(trialStatus,/障壁を破壊.+反撃できる時間/);
 assert.ok(events(exposed).some(e=>e.kind==='primal:WG05:gate'&&e.actor===1&&e.value===1));
 assert.equal(events(exposed).filter(e=>e.kind==='primal:WG17').length,1);
 await page.locator('.game').screenshot({path:prefix+'-exposed.png'});
 await page.evaluate(()=>{window.primalStage='battle'});
 await wait(()=>window.lab.frame.weeklyBoss?.primal.cuts>=1);
 const first=await frame();
 assert.deepEqual([first.weeklyBoss.primal.left,first.platforms[0].x,first.platforms[0].w],[128,128,792]);
 await page.locator('.game').screenshot({path:prefix+'-cut.png'});
 await wait(()=>window.lab.frame.weeklyBoss?.primal.cuts===3,null,130000);
 const third=await frame();
 assert.deepEqual([third.weeklyBoss.primal.left,third.platforms[0].x,third.platforms[0].w],[304,304,616]);
 await page.locator('.game').screenshot({path:prefix+'-narrow.png'});
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn',null,65000);
 const finished=await frame();
 assert.equal(finished.returns,0);
 let firstReward;
 if(earned){
  firstReward={xp:mode.xp+mode.firstXp,mora:mode.mora+mode.firstMora,first:true};
  assert.equal(finished.endgame.weekly[expert].clears,1);
  assert.deepEqual(finished.weeklyBoss.reward,firstReward);
  assert.equal(finished.progression.overflowXp-opening.progression.overflowXp,firstReward.xp);
  assert.equal(finished.mora-opening.mora,firstReward.mora);
 }else assert.equal(finished.endgame.bosses[id].clears,1);
 assert.equal(finished.story.quests[quest].count,1);
 const cuts=await page.evaluate(()=>window.primalCuts);
 const trials=await page.evaluate(()=>window.primalTrials);
 assert.deepEqual(cuts.map(c=>c.left),[40,128,216,304]);
 assert.ok(cuts.every(c=>c.left===c.collisionLeft));
 assert.ok(trials.includes('WG05')&&trials.includes('WG14'));
 const cues=await page.evaluate(()=>({cut:window.primalCutCue,pillars:window.primalPillarCue,
  brokenPillars:Object.keys(window.primalPillarBreaks).map(Number)}));
 assert.match(cues.cut.text,/白線の右側を維持.*床切断まで\d+\.\d秒/);
 assert.match(cues.pillars,/左の柱.*中央の柱.*右の柱/);
 assert.equal(cues.brokenPillars.length,3);
 await page.getByRole('button',{name:'拠点へ：ナタ・谷の集落',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 const reported=await frame();
 const payout=earned&&{xp:reported.progression.overflowXp-beforeReport.progression.overflowXp,mora:reported.mora-beforeReport.mora};
 if(earned){
  assert.deepEqual(payout,{xp:420000,mora:12800});
  await page.evaluate(()=>{window.lab.action('artifact_equip:10');window.lab.action('artifact_equip:602');});
  await wait(()=>window.lab.frame.actors[0].atk===74956);
 }
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 if(earned){
  assert.equal((await frame()).endgame.weekly[expert].clears,1);
  assert.deepEqual(saved.weapons,earned.seed.weapons);
  assert.deepEqual(existingGear(saved),existingGear(earned.seed));
  assert.equal(saved.companion,earned.seed.companion);
  for(const [key,record] of Object.entries(earned.seed.endgame.weekly))assert.deepEqual(saved.endgame.weekly[key],record,key);
  for(const [key,record] of Object.entries(earned.seed.story.quests)){
   if(record.status==='complete')assert.deepEqual(saved.story.quests[key],record,key);
  }
  await fs.writeFile(path.join(path.dirname(prefix),'primal-complete.json'),JSON.stringify(saved,null,2)+'\n');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({scenery,trials,cuts,cues,gatePrompt,physicalBarrierConfirmed:true,
  trialStatus,firstExposedTicks:exposed.weeklyBoss.primal.exposure,commands:{png:gate.commands,standard:standard.commands,light:reduced.commands},
  viewport390:true,clearReportRestore:true,remainingHp:finished.actors[0].hp,
  ...(earned&&{sourceSha256:earned.sourceSha256,guide:guide.stops,expertWins:1,firstReward,payout,transfer,
   trialAttack:opening.actors[0].atk,trialHp:opening.actors[0].maxhp}),errors},null,2)+'\n');
 console.log('Primal Fire Chrome: gate, three real cuts, defeat, report, save and visual profiles passed');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8951/');
 await wait(()=>window.lab?.frame);
 await play();
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,boss:f?.weeklyBoss,t:f?.t,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.atk]),
  cuts:await page.evaluate(()=>window.primalCuts),trials:await page.evaluate(()=>window.primalTrials),
  evidence:events(f).filter(e=>e.kind.startsWith('primal:')).slice(-16),
  status:await page.locator('#status').textContent(),errors},null,2));
 await page.screenshot({path:'work/primal-fire-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
