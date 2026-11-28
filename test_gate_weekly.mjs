import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg,timeout=78000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix=(process.env.LAB_WEEKLY_EVIDENCE || 'evidence')+'/gate-weekly';
const miss=process.env.LAB_GATE_LURE==='miss';
const hub='mond-town',node='mond-gate-chess-court',quest='gate-weekly-commission',id='boss-29122000';
const expertSource=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
assert.ok(!expectedWins||expertSource);
const expert=id+':expert',primal='boss-29091101:expert';
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
const mode=m=>page.evaluate(m=>{window.gateMode=m},m);

async function openExpertSave(){
 const raw=await fs.readFile(expertSource,'utf8');
 const checkpoint=JSON.parse(raw);
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(node=>[node.id,node])));
 await page.locator('#importSave').setInputFiles(expertSource);
 await wait(k=>window.lab.frame.endgame?.weekly[k]?.clears===3,primal);
 assert.equal((await frame()).progression.level,200);
 if(await drive.node()!==hub)await drive.warp(hub);
 return {checkpoint,drive,sourceSha256:createHash('sha256').update(raw).digest('hex')};
}

async function restoreExpert({drive,sourceSha256}){
 const f=await frame();
 assert.equal(f.endgame.weekly[expert].clears,expectedWins);
 assert.equal(f.story.quests[quest].status,'complete');
 assert.equal(f.actors[0].atk,74956);
 const reported=Object.values(f.story.quests).filter(q=>q.status==='complete').length;
 assert.equal(reported,118);
 await drive.walk(442);
 await page.locator('#weeklyDesk').waitFor();
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256,expertWins:expectedWins,
  primalExpertWins:f.endgame.weekly[primal].clears,reported,attack:f.actors[0].atk,remaining,errors},null,2)+'\n');
}

async function play(){
 const earned=expertSource&&await openExpertSave();
 if(expectedWins){
  await restoreExpert(earned);
  return;
 }
 if(earned){
  assert.ok(!earned.checkpoint.endgame.weekly[expert]&&!earned.checkpoint.story.quests[quest]);
  await page.evaluate(()=>{window.lab.action('artifact_remove:602');window.lab.action('artifact_equip:1187');});
  await wait(()=>window.lab.frame.actors[0].atk===259);
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }else{
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
   await fs.readFile('work/gate-weekly-gear.json','utf8'));
  await page.locator('#loadProgress').click();
  await wait(hub=>window.lab.frame.story?.node===hub,hub);
 }
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 let rank,guide;
 if(earned){
  await canvas.click();
  await page.keyboard.press('KeyM');
  const atlas=page.locator('#worldAtlas');
  await atlas.waitFor();
  await atlas.locator('#atlasLayer').selectOption('boss');
  await atlas.locator('#atlasField').selectOption(node);
  await wait(n=>window.lab.frame.worldMap?.selected?.id===n,node);
  guide=(await frame()).worldMap.guide;
  assert.equal(guide.status,'ready');
  assert.deepEqual(guide.stops.map(s=>[s.id,s.previewX]),[[node,442]]);
  await atlas.screenshot({path:prefix+'-atlas.png'});
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  await earned.drive.walk(442);
  await page.locator('#weeklyDesk').waitFor();
  await page.locator('#weeklyDifficulty').selectOption('expert');
  await wait(()=>!document.getElementById('weeklyChallengeStart').disabled);
  rank=(await frame()).weeklyDesk.modes.find(m=>m.id==='expert');
  assert.ok(rank.available&&!rank.record);
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
 assert.deepEqual([scenery.key,scenery.state],['gateCourt','ready']);

 await page.evaluate(miss=>{
  const keys=new Set();
  window.gateMode='front';
  window.gateStages=[];
  window.gateCues={};
  let jumped=false;
  function key(code,on){
   if(keys.has(code)===on)return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.gate;
   let left=false,right=false,attack=false,jump=false;
   if(v?.bodies?.length&&!f.paused&&b.phase!=='respawn'){
    if(window.gateStages.at(-1)!==v.stage)window.gateStages.push(v.stage);
    const hint=document.querySelector('#weeklyGateHint').textContent;
    const cues=window.gateCues;
    if(v.releaseRequired&&hint.includes('離す'))cues.release??=hint;
    if(!v.releaseRequired&&v.frostReady&&hint.includes('再使用'))cues.cooldown??=hint;
    if(v.lure&&v.run?.lockIn&&hint.includes('走路固定まで')){
     if(v.run.ready&&hint.includes('この位置を維持'))cues.position??=hint;
     else if(!v.run.ready&&hint.includes('青い線の右へ'))cues.move??=hint;
    }
    const a=f.actors[f.active-1],mode=window.gateMode;
    let goal=a.x,target;
    if(v.card==='WT03')goal=738;
    else if(mode==='front'&&v.stage!=='royal'){
     if(v.card==='WT09')goal=84;
     else target=v.bodies.find(e=>e.damageable);
    }else if(mode==='frost')goal=84;
    else if(mode==='lure'){
     goal=miss?437:686;
     if(v.run?.t>=237&&v.run?.t<284){jump=true;jumped=true}
     if(jumped&&v.exposure)goal=a.x;
    }else if(mode==='takeKing')target=v.bodies.find(e=>e.kind==='king'&&e.damageable);
    else if(mode==='finish'){
     const living=v.bodies.filter(e=>e.damageable).sort((a,b)=>a.hp-b.hp);
     target=living[0];
    }
    if(target){
     goal=Math.max(58,target.x-(mode==='takeKing'?105:74));
     const dx=target.x-a.x;
     if(Math.abs(goal-a.x)<11&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*23;
     attack=Math.abs(dx)<112&&Math.sign(dx)===a.dir;
     if(mode==='takeKing')attack&&=a.x<target.x-87;
    }
    left=goal<a.x-10;right=goal>a.x+10;
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);key('Space',jump);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },miss);
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.pawns?.length===3);
 await page.locator('.game').screenshot({path:prefix+'-pawns.png'});
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.card==='WT17');
 const started=await frame();
 assert.deepEqual(events(started).filter(e=>e.kind==='gate:WT04:pawn').map(e=>e.value),[2,1,0]);
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const royal=await frame();
 assert.ok(royal.draws.some(d=>d.source==='gate-weekly-king-source-v1.png'));
 assert.ok(royal.draws.some(d=>d.source==='gate-weekly-queen-source-v1.png'));
 const png=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>14000);
 const standard=await frame(),normal=await capture('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.7,standard.commands);
 const reduced=await frame(),light=await capture('light');
 assert.deepEqual([standard.t,reduced.t],[royal.t,royal.t]);
 assert.deepEqual(reduced.weeklyBoss,royal.weeklyBoss);
 assert.equal(new Set([png,normal,light]).size,3);

 const expanded=await captureRectTransfer(page,'h48c32',false,()=>page.locator('#renderMode').selectOption('h48c32'));
 const grouped=await captureRectTransfer(page,'h48c32',true,()=>page.locator('#packRectArt').check());
 const bodies=royal.draws.filter(d=>d.source?.startsWith('gate-weekly-'));
 assert.equal(bodies.length,2);
 for(const body of bodies){
  const batch=grouped.snapshot.draws.find(d=>d.kind==='rect_runs'&&d.h===body.h&&
   Math.abs(d.w-body.w)<1e-6&&Math.abs(d.y+d.h-body.y)<1e-6);
  assert.ok(batch&&grouped.snapshot.rectBatches[batch.batch-1].length);
 }
 assert.equal(grouped.snapshot.t,expanded.snapshot.t);
 assert.ok(grouped.gzipBytes<expanded.gzipBytes&&grouped.gzipBytes>0);
 assert.equal(grouped.raster,expanded.raster);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.commands<500);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyGate').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await mode('frost');
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.nearFrost===1);
 await page.keyboard.down('KeyG');
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.freeze===50);
 await page.keyboard.up('KeyG');
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.releaseRequired===false,null,8000);
 const frostButton=page.locator('#weeklyGateFrost');
 await frostButton.scrollIntoViewIfNeeded();
 const box=await frostButton.boundingBox();
 assert.ok(box);
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.freeze===100,null,10000);
 await page.mouse.up();
 const frozen=await frame();
 assert.equal(frozen.weeklyBoss.gate.card,'WT17');
 assert.deepEqual(events(frozen).filter(e=>e.kind==='gate:WT20:complete').map(e=>e.value),[50,100]);
 await canvas.click();
 await mode('lure');
 await wait(miss=>{
  const goal=window.lab.frame.weeklyBoss?.gate?.run?.goal;
  return goal!==undefined&&(miss?goal<612:goal>=612);
 },miss);
 await page.locator('.game').screenshot({path:prefix+'-lure.png'});
 const hint=page.locator('#weeklyGateHint');
 if(miss){
  await wait(()=>window.lab.frame.weeklyBoss?.gate?.tsunamiDamage>0);
  const hit=await frame();
  assert.equal(hit.weeklyBoss.gate.tsunamiDamage,90);
  assert.equal(events(hit).filter(e=>e.kind==='gate:WT17:collision').length,0);
  assert.equal(await hint.textContent(),'津波が命中 ｜ 90ダメージ');
  await page.locator('.game').screenshot({path:prefix+'-tsunami.png'});
 }else{
  await wait(()=>window.lab.frame.weeklyBoss?.gate?.exposure>0);
  const exposed=await frame();
  assert.equal(events(exposed).filter(e=>e.kind==='gate:WT17:collision').length,1);
  assert.ok(exposed.weeklyBoss.gate.bodies.every(e=>e.damageable));
  assert.match(await hint.textContent(),/津波を中断.+反撃できる時間/);
  await page.locator('.game').screenshot({path:prefix+'-exposed.png'});
 }
 await mode('takeKing');
 await wait(()=>Object.values(window.lab.frame.events).some(e=>e.kind==='gate:WT19:transfer'));
 const revived=await frame();
 assert.ok(events(revived).find(e=>e.kind==='gate:WT19:transfer').value>0);
 const transfer=await hint.textContent();
 assert.match(transfer,/クイーンからキングへ \d+ HP/);
 await mode('finish');
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const finished=await frame();
 let firstReward;
 if(earned){
  firstReward={xp:rank.xp+rank.firstXp,mora:rank.mora+rank.firstMora,first:true};
  assert.equal(finished.endgame.weekly[expert].clears,1);
  assert.deepEqual(finished.weeklyBoss.reward,firstReward);
  assert.equal(finished.progression.overflowXp-opening.progression.overflowXp,firstReward.xp);
  assert.equal(finished.mora-opening.mora,firstReward.mora);
 }else assert.equal(finished.endgame.bosses[id].clears,1);
 assert.equal(finished.story.quests[quest].count,1);
 assert.equal(finished.returns,0);
 const stages=await page.evaluate(()=>window.gateStages);
 assert.deepEqual(stages,['king','queen','finish','royal']);
 const cues=await page.evaluate(()=>window.gateCues);
 assert.match(cues.cooldown,/再使用まで[\d.]+秒/);
 assert.match(cues.move,/青い線の右へ.*走路固定まで[\d.]+秒/);
 if(!miss)assert.match(cues.position,/この位置を維持.*走路固定まで[\d.]+秒/);
 await page.getByRole('button',{name:'拠点へ：モンド・城門広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 const reported=await frame();
 const payout=earned&&{xp:reported.progression.overflowXp-beforeReport.progression.overflowXp,mora:reported.mora-beforeReport.mora};
 if(earned){
  assert.deepEqual(payout,{xp:570000,mora:16100});
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
  assert.deepEqual(saved.weapons,earned.checkpoint.weapons);
  assert.deepEqual(existingGear(saved),existingGear(earned.checkpoint));
  assert.equal(saved.companion,earned.checkpoint.companion);
  for(const [key,record] of Object.entries(earned.checkpoint.endgame.weekly))assert.deepEqual(saved.endgame.weekly[key],record,key);
  for(const [key,record] of Object.entries(earned.checkpoint.story.quests)){
   if(record.status==='complete')assert.deepEqual(saved.story.quests[key],record,key);
  }
  await fs.writeFile(path.join(path.dirname(prefix),'gate-complete.json'),JSON.stringify(saved,null,2)+'\n');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({scenery,stages,cues,pawnsPerCharge:[2,1,0],keyboardAndPointerFrost:true,
  actualPositionAndCollision:!miss,tsunamiDamage:miss?90:0,transfer,
  reviveTransfer:events(revived).find(e=>e.kind==='gate:WT19:transfer').value,
  transferCompression:{twoSpriteBatches:true,canvasIdentical:true,plainGzipBytes:expanded.gzipBytes,packedGzipBytes:grouped.gzipBytes},
  clearReportRestore:true,viewport390:true,commands:{png:royal.commands,standard:standard.commands,light:reduced.commands},
  ...(earned&&{sourceSha256:earned.sourceSha256,guide:guide.stops,expertWins:1,firstReward,payout,
   trialAttack:opening.actors[0].atk,trialHp:opening.actors[0].maxhp}),errors},null,2)+'\n');
 console.log('Gate Chrome:',miss?'miss and tsunami':'collision and exposure','pawns, frost, two packed sprites, transfer, report and save passed');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8952/');
 await wait(()=>window.lab?.frame);
 await play();
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp]),
  stages:await page.evaluate(()=>window.gateStages),events:events(f).filter(e=>e.kind.startsWith('gate:')).slice(-24),
  status:await page.locator('#status').textContent(),errors},null,2));
 await page.screenshot({path:'work/gate-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
