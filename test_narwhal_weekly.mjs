import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {checkWeeklyAtlas} from './tools/browser_weekly_atlas.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const earned=process.argv.includes('--earned');
const expertSource=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
assert.ok(!expectedWins||expertSource);
const source=expertSource||(earned?'work/earned-fontaine-access/access-complete.json':'work/narwhal-weekly-gear.json');
const output=process.env.LAB_WEEKLY_EVIDENCE||(expertSource?'work/earned-narwhal':earned?'work/earned-fontaine-narwhal':'evidence');
await fs.mkdir(output,{recursive:true});
const rawSave=await fs.readFile(source,'utf8');
const sourceSha256=createHash('sha256').update(rawSave).digest('hex');
const checkpoint=JSON.parse(rawSave);
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:85000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix=output+'/narwhal-weekly';
const hub='fontaine-hub',outer='narwhal-star-sea',inner='narwhal-inner-echo';
const quest='narwhal-weekly-commission',id='boss-29090101';
const expert=id+':expert',apep='boss-29080101:expert';
const equipped=save=>save.inventory.items.filter(item=>item.owner);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function capture(name){
 const raw=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(raw,'base64'));
 return raw;
}

async function scene(){
 return page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
}

async function openExpertSave(){
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(node=>[node.id,node])));
 await page.locator('#importSave').setInputFiles(source);
 await wait(key=>window.lab.frame.endgame?.weekly[key]?.clears===3,apep);
 assert.equal((await frame()).progression.level,200);
 if(await drive.node()!==hub)await drive.warp(hub);
 return drive;
}

async function restoreExpert(drive){
 const f=await frame();
 assert.equal(f.endgame.weekly[expert].clears,expectedWins);
 assert.equal(f.story.quests[quest].status,'complete');
 assert.equal(f.actors[0].atk,74956);
 const reported=Object.values(f.story.quests).filter(record=>record.status==='complete').length;
 assert.equal(reported,116);
 await drive.walk(700);
 await page.locator('#weeklyDesk').waitFor();
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256,expertWins:expectedWins,
  apepExpertWins:f.endgame.weekly[apep].clears,reported,attack:f.actors[0].atk,remaining,errors},null,2)+'\n');
}

async function play(){
 const drive=expertSource&&await openExpertSave();
 if(expectedWins){
  await restoreExpert(drive);
  return;
 }
 if(!drive){
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),rawSave);
  await page.locator('#loadProgress').click();
  await wait(hub=>window.lab.frame.story.node===hub,hub);
 }
 if(earned||drive){
  const f=await frame();
  if(drive){
   assert.ok(!checkpoint.endgame.weekly[expert]);
   await page.evaluate(()=>{window.lab.action('artifact_remove:602');window.lab.action('artifact_equip:1187');});
   await wait(()=>window.lab.frame.actors[0].atk===259);
  }else{
   assert.deepEqual([f.progression.level,f.progression.total],[94,checkpoint.progression.total]);
   for(const survey of ['fon-hidden-lab-access','fon-beryl-thermal-vents']){
    assert.equal(f.story.quests[survey].status,'complete');
   }
  }
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }
 const row=page.locator(`[data-quest="${quest}"]`);
 const priorReport=checkpoint.story.quests[quest]?.status==='complete';
 if(!priorReport){
  await row.getByRole('button',{name:'受注',exact:true}).click();
  await wait(quest=>window.lab.frame.story.quests[quest]?.status==='active',quest);
 }
 const atlasEntry=await checkWeeklyAtlas(page,inner,[outer,inner],'戦闘中に移動',prefix+'-atlas-entry.png');
 let mode;
 if(drive){
  await drive.walk(700);
  await page.locator('#weeklyDesk').waitFor();
  await page.locator('#weeklyDifficulty').selectOption('expert');
  await wait(()=>!document.getElementById('weeklyChallengeStart').disabled);
  mode=(await frame()).weeklyDesk.modes.find(choice=>choice.id==='expert');
  assert.ok(mode.available&&!mode.record);
  await page.locator('#weeklyChallengeStart').click();
 }else{
  await canvas.click();
  await page.keyboard.down('KeyD');
  try{await wait(outer=>window.lab.frame.storyNearbyPortal?.to===outer&&window.lab.frame.storyNearbyPortal.available,outer);}
  finally{await page.keyboard.up('KeyD');}
  await page.keyboard.press('KeyF');
 }
 await wait(outer=>window.lab.frame.story.node===outer,outer);
 const opening=await frame();
 if(drive)assert.equal(opening.weeklyBoss.difficulty,'最上級');
 const open=await scene();
 assert.deepEqual([open.key,open.state],['starSea','ready']);
 assert.equal((await frame()).draws[0].source,'narwhal-idle-source-v1.png');
 await page.locator('.game').screenshot({path:prefix+'-outer.png'});
 await canvas.click();
 await page.evaluate(()=>{
  const held=new Set();
  const last={eye:false,kernel:false,stage:null};
  let lastDodge=-10;
  window.narwhalStages=[];
  function key(code,on){
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function run(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0],v=b?.narwhal;
   if(!v||b.phase==='respawn'||f.returns){
    for(const code of [...held])key(code,false);
    return;
   }
   if(last.stage!==b.narwhalStage){
    last.stage=b.narwhalStage;window.narwhalStages.push({stage:last.stage,t:f.t,hp:b.hp});
   }
   const hint=document.querySelector('#weeklyNarwhalHint').textContent;
   const cues=window.narwhalCues??={};
   const name=v.transitionTicks?`${b.narwhalStage}-${v.scene}`:
    v.exposureOpensIn?(v.returnLoss?'exposure-after-damage':'exposure-before-damage'):null;
   if(name&&!cues[name])cues[name]={hint,remaining:v.transitionTicks??v.exposureOpensIn,t:f.t};
   if(f.paused){
    for(const code of [...held])key(code,false);
   }else{
    last.eye||=Object.values(f.events).some(e=>e.kind==='narwhal:WV05:eye-hit'&&e.value===8);
    last.kernel||=Object.values(f.events).some(e=>e.kind==='narwhal:WV13:kernel-loss');
    let goal=a.x,target;
    if(v.object?.time>0)target=v.object.x;
    else if(b.narwhalStage==='outer'){
     if(window.narwhalFinish&&b.damageable)target=b.x;
     else if(!last.eye)goal=342;
     else if(b.damageable&&v.h<95&&b.hp>b.maxhp*.45)target=b.x;
    }else if(b.narwhalStage==='inner'){
     if(last.kernel&&v.shadow.damageable)target=v.shadow.x;
     else goal=308;
    }else if(b.narwhalStage==='weak'&&window.narwhalFinish&&b.damageable)target=b.x;
    if(target!==undefined)goal=target+(a.x<target?-64:64);
    const dx=target===undefined?0:target-a.x,delta=goal-a.x;
    const move=Math.abs(delta)>7?Math.sign(delta):dx*a.dir<0?Math.sign(dx):0;
    key('KeyA',move<0);key('KeyD',move>0);
    key('KeyJ',target!==undefined&&Math.abs(dx)<120&&dx*a.dir>=0);
    const warns=Array.isArray(b.warnings)?b.warnings:[];
    const danger=warns.some(w=>w.starts-b.moveTick<=8&&w.starts-b.moveTick>=2
     &&a.x>=w.lo&&a.x<=w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
    if(danger&&f.t-lastDodge>2.15&&!v.object){
     lastDodge=f.t;window.lab.action('dodge');
    }
   }
   requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
 });
 await wait(()=>{
  const b=window.lab.frame.weeklyBoss;
  return b?.narwhal.object?.kind==='eye'&&b.narwhal.object.hp>0;
 });
 await page.locator('.game').screenshot({path:prefix+'-eye.png'});
 await wait(inner=>window.lab.frame.story.node===inner,inner);
 const atlasReturn=await checkWeeklyAtlas(page,outer,[outer],'戦闘中に帰還');
 const belly=await scene();
 assert.deepEqual([belly.key,belly.state],['narwhalInner','ready']);
 await wait(()=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  if(!b?.narwhal.object||b.narwhal.object.kind!=='kernel'||f.paused)return false;
  window.lab.action('pause');
  return true;
 });
 await wait(()=>window.lab.frame.paused);
 const kernel=await frame();
 assert.equal(kernel.draws[0].source,'narwhal-phantom-idle-source-v1.png');
 assert.ok(kernel.weeklyBoss.narwhal.object.time>=280);
 const kernelText=await page.locator('#weeklyNarwhalObjectText').textContent();
 assert.match(kernelText,/通常攻撃をあと4回 ｜ 残り[45]\.\d秒/);
 const expectedKernelLoss=Math.round(kernel.weeklyBoss.narwhal.shadow.max*.25);
 const expectedReturnLoss=Math.round(kernel.weeklyBoss.maxhp*.20);
 assert.ok(await page.locator('#fieldBossHp').isHidden());
 assert.ok(await page.locator('#status').evaluate(el=>!el.classList.contains('error')));
 await page.locator('.game').screenshot({path:prefix+'-kernel.png'});
 const raw=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame(),normal=await capture('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(count=>window.lab.frame.commands<count*.7,standard.commands);
 const light=await frame(),reduced=await capture('light');
 assert.equal(new Set([raw,normal,reduced]).size,3);
 assert.deepEqual([standard.t,light.t,light.weeklyBoss.hp],[kernel.t,kernel.t,kernel.weeklyBoss.hp]);
 let transfer;
 if(drive){
  const unpacked=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
  const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
  assert.equal(packed.raster,unpacked.raster);
  assert.ok(packed.gzipBytes<unpacked.gzipBytes);
  transfer={rawGzip:unpacked.gzipBytes,packedGzip:packed.gzipBytes,pixelMatch:true};
 }
 await page.locator('#renderMode').selectOption('sprite');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyNarwhal').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 if(drive)await page.locator('#weeklyNarwhal').screenshot({path:prefix+'-kernel-mobile.png'});
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>Object.values(window.lab.frame.events).some(e=>e.kind==='narwhal:WV13:kernel-loss'));
 const interrupted=await frame();
 assert.equal(interrupted.events.filter(e=>e.kind==='narwhal:WV11:kernel-hit').length,4);
 assert.equal(interrupted.events.find(e=>e.kind==='narwhal:WV13:kernel-loss').value,expectedKernelLoss);
 assert.equal(interrupted.weeklyBoss.hp,kernel.weeklyBoss.hp);
 assert.match(await page.locator('#weeklyNarwhalHint').textContent(),new RegExp(`幻影に${expectedKernelLoss}ダメージ`));
 await wait(outer=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  return f.story.node===outer&&b?.narwhal.exposure>=590;
 },outer);
 const returned=await frame();
 assert.equal(returned.weeklyBoss.narwhal.epoch,4);
 assert.equal(returned.events.filter(e=>e.kind==='narwhal:WV14:return-loss').length,1);
 assert.equal(returned.events.find(e=>e.kind==='narwhal:WV14:return-loss').value,expectedReturnLoss);
 const cues=await page.evaluate(()=>window.narwhalCues);
 assert.match(cues['swallow-outer'].hint,/腹中に入るまで[12]秒/);
 assert.match(cues['swallow-inner'].hint,/腹中で動けるまで[12]秒/);
 assert.match(cues['expel-inner'].hint,/星海に戻るまで[12]秒/);
 assert.match(cues['exposure-before-damage'].hint,/星海に到着.*反撃まで[123]秒/);
 assert.match(cues['exposure-after-damage'].hint,new RegExp(`鯨に${expectedReturnLoss}ダメージ.*反撃まで[12]秒`));
 await page.locator('.game').screenshot({path:prefix+'-return.png'});
 await page.evaluate(()=>{window.narwhalFinish=true;});
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const finished=await frame();
 assert.equal(finished.returns,0);
 let firstReward;
 if(drive){
  firstReward={xp:mode.xp+mode.firstXp,mora:mode.mora+mode.firstMora,first:true};
  assert.equal(finished.endgame.weekly[expert].clears,1);
  assert.deepEqual(finished.weeklyBoss.reward,firstReward);
  assert.equal(finished.progression.overflowXp-opening.progression.overflowXp,firstReward.xp);
  assert.equal(finished.mora-opening.mora,firstReward.mora);
 }else assert.equal(finished.endgame.bosses[id].clears,1);
 assert.equal(finished.story.quests[quest].count,1);
 const stages=await page.evaluate(()=>window.narwhalStages.map(e=>e.stage));
 assert.deepEqual(stages.slice(0,5),['outer','swallow','inner','expel','weak']);
 await page.getByRole('button',{name:'拠点へ：フォンテーヌ・水辺の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 let payout;
 if(priorReport){
  assert.deepEqual((await frame()).story.quests[quest],checkpoint.story.quests[quest]);
  assert.equal(await row.getByRole('button',{name:'報告',exact:true}).count(),0);
 }else{
  const beforeReport=await frame();
  await row.getByRole('button',{name:'報告',exact:true}).click();
  await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
  const afterReport=await frame();
  const xpKey=drive?'overflowXp':'total';
  payout={xp:afterReport.progression[xpKey]-beforeReport.progression[xpKey],mora:afterReport.mora-beforeReport.mora};
  if(earned||drive)assert.deepEqual(payout,{xp:230000,mora:8500});
 }
 if(drive){
  await page.evaluate(()=>{window.lab.action('artifact_equip:10');window.lab.action('artifact_equip:602');});
  await wait(()=>window.lab.frame.actors[0].atk===74956);
 }
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(quest=>window.lab.frame.story?.quests[quest]?.status==='complete',quest);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 if(drive){
  assert.equal((await frame()).endgame.weekly[expert].clears,1);
  assert.deepEqual(saved.weapons,checkpoint.weapons);
  assert.deepEqual(equipped(saved),equipped(checkpoint));
  assert.equal(saved.companion,checkpoint.companion);
  for(const [key,record] of Object.entries(checkpoint.endgame.weekly))assert.deepEqual(saved.endgame.weekly[key],record,key);
  for(const [key,record] of Object.entries(checkpoint.story.quests)){
   if(record.status==='complete')assert.deepEqual(saved.story.quests[key],record,key);
  }
 }else assert.equal((await frame()).endgame.bosses[id].clears,1);
 if(earned||drive)await fs.writeFile(output+'/narwhal-complete.json',JSON.stringify(saved,null,2)+'\n');
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({stages,outer:open,inner:belly,atlasEntry,atlasReturn,eyeEightHits:true,
  kernelFourCastPhysical:true,kernelLoss:expectedKernelLoss,returnLoss:expectedReturnLoss,kernelText,exposure:returned.weeklyBoss.narwhal.exposure,
  source,sourceSha256,level:checkpoint.progression.level,cues,priorReport,payout,clearReportRestore:true,viewport390:true,remainingHp:finished.actors[0].hp,
  commands:{png:kernel.commands,standard:standard.commands,light:light.commands},
  ...(drive&&{expertWins:1,firstReward,transfer,trialAttack:opening.actors[0].atk,trialHp:opening.actors[0].maxhp}),errors},null,2)+'\n');
 console.log('Narwhal Chrome: eye, scene switch, corrected kernel, return, clear, report and save passed');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8949/');
 await wait(()=>window.lab?.frame);
 await play();
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.atk]),returns:f?.returns,
  events:Object.values(f?.events||{}).filter(e=>e.kind.startsWith('narwhal:')).slice(-24),stages:await page.evaluate(()=>window.narwhalStages),
  status:await page.locator('#status').textContent(),errors});
 await page.screenshot({path:'work/narwhal-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
