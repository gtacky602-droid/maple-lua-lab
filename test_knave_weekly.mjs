import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const earned=process.argv.includes('--earned');
const expertSource=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
assert.ok(!expectedWins||expertSource);
const source=expertSource||(earned?'work/earned-fontaine-narwhal/narwhal-complete.json':'work/knave-weekly-gear.json');
const prefix=process.env.KNAVE_EVIDENCE_PREFIX||(expertSource?'work/earned-knave/knave-weekly':earned?'work/earned-fontaine-knave/knave-weekly':'evidence/knave-weekly');
await fs.mkdir(path.dirname(prefix),{recursive:true});
const rawSave=await fs.readFile(source,'utf8');
const sourceSha256=createHash('sha256').update(rawSave).digest('hex');
const checkpoint=JSON.parse(rawSave);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const drive=waypointDriver(page,nodes);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:63000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const setMode=mode=>page.evaluate(mode=>{window.knaveMode=mode},mode);
const canvas=page.locator('#game');
const hub='fontaine-hub',arena='knave-crimson-court',quest='knave-weekly-commission',id='boss-29091001';
const expert=id+':expert',narwhal='boss-29090101:expert';
const equipment=save=>save.inventory.items.filter(item=>item.owner);
const events=f=>Object.values(f?.events||{});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const raw=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(`${prefix}-${name}.png`,Buffer.from(raw,'base64'));
 return raw;
}

async function compare(name,source,baseline){
 assert.ok(baseline.draws.some(d=>d.source===source));
 const png=await capture(`${name}-png`);
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame(),normal=await capture(`${name}-standard`);
 const rawLight=expertSource&&name==='double'?
  await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16')):null;
 if(!rawLight)await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.7,standard.commands);
 const light=await frame(),reduced=await capture(`${name}-light`);
 let transfer;
 if(rawLight){
  const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
  assert.equal(rawLight.raster,packed.raster);
  assert.ok(rawLight.gzipBytes>packed.gzipBytes);
  transfer={rawGzip:rawLight.gzipBytes,packedGzip:packed.gzipBytes,pixelMatch:true};
 }
 assert.equal(new Set([png,normal,reduced]).size,3);
 assert.deepEqual([standard.t,light.t],[baseline.t,baseline.t]);
 assert.deepEqual(light.weeklyBoss,baseline.weeklyBoss);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.commands<500);
 return {png:baseline.commands,standard:standard.commands,light:light.commands,transfer};
}

async function play(){
 if(expertSource){
  await page.locator('#importSave').setInputFiles(source);
  await wait(key=>window.lab.frame.endgame?.weekly[key]?.clears===3,narwhal);
  assert.equal((await frame()).progression.level,200);
  if(await drive.node()!==hub)await drive.warp(hub);
  if(expectedWins){
   const f=await frame();
   assert.equal(f.endgame.weekly[expert].clears,expectedWins);
   assert.equal(f.story.quests[quest].status,'complete');
   assert.equal(f.actors[0].atk,74956);
   const reported=Object.values(f.story.quests).filter(record=>record.status==='complete').length;
   assert.equal(reported,116);
   await drive.walk(186);
   await page.locator('#weeklyDesk').waitFor();
   assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
   const remaining=(await frame()).weeklyDesk.remaining;
   assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
   await page.locator('#weeklyDesk').screenshot({path:`${prefix}-restored.png`});
   assert.deepEqual(errors,[]);
   await fs.writeFile(`${prefix}-restore.json`,JSON.stringify({sourceSha256,expertWins:expectedWins,
    narwhalExpertWins:f.endgame.weekly[narwhal].clears,reported,attack:f.actors[0].atk,remaining,errors},null,2)+'\n');
   return;
  }
  assert.ok(!checkpoint.endgame.weekly[expert]);
  await page.evaluate(()=>{window.lab.action('artifact_remove:602');window.lab.action('artifact_equip:1187');});
  await wait(()=>window.lab.frame.actors[0].atk===259);
 }else{
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),rawSave);
  await page.locator('#loadProgress').click();
  await wait(hub=>window.lab.frame.story?.node===hub,hub);
 }
 if(earned){
  const f=await frame();
  assert.equal(f.story.quests['narwhal-weekly-commission'].status,'complete');
  assert.deepEqual([f.progression.level,f.progression.total],[94,checkpoint.progression.total]);
 }
 if(earned||expertSource){
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }
 const row=page.locator(`[data-quest="${quest}"]`);
 const priorReport=checkpoint.story.quests[quest]?.status==='complete';
 if(!priorReport){
  await row.getByRole('button',{name:'受注',exact:true}).click();
  await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 }
 await page.evaluate(()=>document.activeElement.blur());
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await atlas.locator('#atlasField').selectOption(arena);
 await wait(arena=>window.lab.frame.worldMap?.selected?.id===arena,arena);
 const route=(await frame()).worldMap.guide;
 assert.equal(route.status,'ready');
 assert.deepEqual(route.stops.map(s=>[s.id,s.previewX]),[[arena,186]]);
 if(earned||expertSource)await atlas.screenshot({path:`${prefix}-atlas.png`});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 let mode;
 if(expertSource){
  await drive.walk(186);
  await page.locator('#weeklyDesk').waitFor();
  await page.locator('#weeklyDifficulty').selectOption('expert');
  await wait(()=>!document.getElementById('weeklyChallengeStart').disabled);
  mode=(await frame()).weeklyDesk.modes.find(row=>row.id==='expert');
  assert.ok(mode.available&&!mode.record);
  await page.locator('#weeklyChallengeStart').click();
  await drive.waitNode(arena);
  assert.equal((await frame()).weeklyBoss.difficulty,'最上級');
 }else await drive.cross(arena,186);
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const scenery=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scenery.key,scenery.state],['crimsonMoonCourt','ready']);
 const opening=await frame();
 const first=await compare('single','knave-weekly-single-source-v1.png',opening);
 await canvas.click();
 await page.evaluate(expertRun=>{
  const keys=new Set();
  let lastStrike=-10;
  window.knaveCards=[];
  window.knaveMode='earn';
  function toggle(code,on){
   if(keys.has(code)===on)return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.weeklyBoss,k=b?.knave;
   let left=false,right=false,attack=false;
   if(k&&!f.paused){
    const a=f.actors[k.active-1],dx=k.x-a.x;
    const mode=window.knaveMode;
    let goal=a.x;
    const canReach=Math.abs(dx)<110&&Math.sign(dx)===a.dir;
    const faceBoss=()=>{
     const best=k.x-82;
     return Math.abs(best-a.x)<=11&&a.dir!==Math.sign(dx)?a.x+Math.sign(dx)*24:best;
    };
    if(k.card&&window.knaveCards.at(-1)!==k.card)window.knaveCards.push(k.card);
    if(mode==='earn'&&!k.actors[k.active-1].debt&&k.card!=='WK07'){
     if(b.hp>b.phaseHp[1].max+b.phaseHp[0].max*.65){
      goal=faceBoss();attack=canReach;
     }
    }else if(mode==='earn'||mode==='lamp')goal=49;
    else if(mode==='seek'){
     goal=faceBoss();
     const button=document.querySelector('#weeklyKnaveStrike');
     const targetFeast=!expertRun||k.card==='WK15';
     if(targetFeast&&k.interruptTicks&&k.actors[k.active-1].feather&&!button.hidden){
      window.knaveWindow??={t:f.t,ticks:k.interruptTicks,card:k.card,form:k.form,
       text:document.querySelector('#weeklyKnaveHint').textContent};
     }
     if(targetFeast&&k.window&&k.actors[k.active-1].feather&&canReach&&a.lock<=0&&(a.cd.normal||0)<=0&&f.t-lastStrike>.75){
      toggle('KeyH',true);toggle('KeyH',false);lastStrike=f.t;
     }
    }else if(mode==='finish'&&!k.airborne&&b.phase!=='transform'){
     goal=faceBoss();attack=canReach;
    }
    left=goal<a.x-11;right=goal>a.x+11;
   }
   toggle('KeyA',left);toggle('KeyD',right);toggle('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },Boolean(expertSource));
 await page.keyboard.press('KeyP');
 await wait(()=>{
  const k=window.lab.frame.weeklyBoss?.knave;
  return k?.nearLamp===1&&k.actors[0].debt>0;
 });
 await setMode('lamp');
 const lampCue=await page.locator('#weeklyKnaveHint').textContent();
 assert.match(lampCue,/左の返済灯.*完済まであと5回/);
 await page.keyboard.down('KeyG');
 await wait(()=>Object.values(window.lab.frame.events).filter(e=>e.kind==='knave:WK08:lamp').length>0);
 await page.keyboard.up('KeyG');
 await wait(()=>!window.lab.frame.weeklyBoss.knave.hold);
 const afterRelease=await frame();
 const remaining=afterRelease.weeklyBoss.knave.actors[0].debt;
 assert.ok(remaining>0);
 assert.equal(afterRelease.weeklyBoss.knave.lampCue.payments,4);
 await wait(()=>document.querySelector('#weeklyKnaveHint').textContent.includes('完済まであと4回'));
 const lamp=page.locator('#weeklyKnaveLamp');
 await lamp.scrollIntoViewIfNeeded();
 const bounds=await lamp.boundingBox();
 assert.ok(bounds);
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
 await page.mouse.down();
 await wait(()=>window.lab.frame.weeklyBoss.knave.hold>0);
 await wait(()=>window.lab.frame.weeklyBoss.knave.actors[0].feather);
 await page.mouse.up();
 const paid=await frame();
 assert.equal(events(paid).filter(e=>e.kind==='knave:WK08:lamp').length,5);
 assert.equal(paid.weeklyBoss.knave.actors[0].debt,0);
 assert.ok(await page.locator('#weeklyKnaveStrike').isHidden());
 await page.locator('.game').screenshot({path:`${prefix}-feather.png`});
 await canvas.click();
 async function interruptFeast(){
  await setMode('seek');
  await wait(()=>window.lab.frame.weeklyBoss?.phase==='exposure');
  const interrupted=await frame();
  assert.equal(events(interrupted).filter(e=>e.kind==='knave:WK09').length,1);
  assert.equal(interrupted.weeklyBoss.knave.actors[0].feather,false);
  assert.deepEqual(interrupted.weeklyBoss.knave.feastResult,{kind:'interrupted',actor:1});
  const interruptCue=await page.evaluate(()=>window.knaveWindow);
  assert.ok(interruptCue.ticks>0);
  if(expertSource)assert.deepEqual([interruptCue.form,interruptCue.card],[2,'WK15']);
  assert.match(interruptCue.text,/償還の一撃（H）で中断・残り[\d.]+秒/);
  await page.waitForFunction(()=>document.querySelector('#weeklyKnaveHint').textContent.includes('旅人が羽印で赤宴を中断'));
  await page.locator('.game').screenshot({path:`${prefix}-interrupt.png`});
  return interruptCue;
 }
 async function inspectTransformation(){
  await setMode('finish');
  await wait(()=>{
   const f=window.lab.frame,b=f.weeklyBoss;
   return b?.knave.form===2&&b.phase==='transform';
  });
  await page.keyboard.press('KeyP');
  await wait(()=>window.lab.frame.paused);
  const transformed=await frame();
  const transformCue=await page.locator('#weeklyKnaveHint').textContent();
  assert.ok(transformed.weeklyBoss.knave.transformTicks>0);
  assert.match(transformCue,/凶月の羽化.*戦闘再開まで[\d.]+秒/);
  const second=await compare('double','knave-weekly-double-source-v1.png',transformed);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('#weeklyKnave').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
  await page.setViewportSize({width:1240,height:940});
  await canvas.click();
  await page.keyboard.press('KeyP');
  return {transformCue,second};
 }
 let interruptCue,transformation;
 if(expertSource){
  transformation=await inspectTransformation();
  interruptCue=await interruptFeast();
 }else{
  interruptCue=await interruptFeast();
  transformation=await inspectTransformation();
 }
 const {transformCue,second}=transformation;
 await setMode('finish');
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const final=await frame();
 assert.equal(final.returns,0);
 let firstReward;
 if(expertSource){
  assert.equal(final.endgame.weekly[expert].clears,1);
  firstReward={xp:mode.xp+mode.firstXp,mora:mode.mora+mode.firstMora,first:true};
  assert.deepEqual(final.weeklyBoss.reward,firstReward);
  assert.equal(final.progression.overflowXp-opening.progression.overflowXp,firstReward.xp);
  assert.equal(final.mora-opening.mora,firstReward.mora);
 }else assert.equal(final.endgame.bosses[id].clears,1);
 assert.equal(final.story.quests[quest].count,1);
 await page.getByRole('button',{name:'拠点へ：フォンテーヌ・水辺の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const beforeReport=await frame();
 if(priorReport){
  assert.deepEqual(beforeReport.story.quests[quest],checkpoint.story.quests[quest]);
  assert.equal(await row.getByRole('button',{name:'報告',exact:true}).count(),0);
 }else{
  await row.getByRole('button',{name:'報告',exact:true}).click();
  await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 }
 const afterReport=await frame();
 const payout=priorReport?undefined:{xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 if(expertSource){
  await page.evaluate(()=>{window.lab.action('artifact_equip:10');window.lab.action('artifact_equip:602');});
  await wait(()=>window.lab.frame.actors[0].atk===74956);
 }
 if(earned){
  assert.deepEqual(payout,{xp:280000,mora:9600});
  assert.equal(afterReport.progression.level,95);
 }
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 assert.deepEqual(errors,[]);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 const restored=await frame();
 if(expertSource){
  assert.equal(restored.endgame.weekly[expert].clears,1);
  assert.deepEqual(saved.weapons,checkpoint.weapons);
  assert.deepEqual(equipment(saved),equipment(checkpoint));
  assert.equal(saved.companion,checkpoint.companion);
  for(const [key,record] of Object.entries(checkpoint.endgame.weekly))assert.deepEqual(saved.endgame.weekly[key],record,key);
  for(const [key,record] of Object.entries(checkpoint.story.quests)){
   if(record.status==='complete')assert.deepEqual(saved.story.quests[key],record,key);
  }
 }else assert.equal(restored.endgame.bosses[id].clears,1);
 assert.equal(restored.progression.level,afterReport.progression.level);
 if(earned||expertSource)await fs.writeFile(path.join(path.dirname(prefix),'knave-complete.json'),JSON.stringify(saved,null,2)+'\n');
 await fs.writeFile(`${prefix}-browser.json`,JSON.stringify({source,sourceSha256,priorReport,route:route.stops,scenery,declared:true,
  levels:[checkpoint.progression.level,beforeReport.progression.level,restored.progression.level],payout,
  interruptCue,transformCue,lampCue,keyboardAndPointerRepayment:true,repayments:5,
  partialBeforeRelease:remaining,manualHitInterrupted:true,forms:2,clearReportRestore:true,viewport390:true,
  remainingHp:final.actors[0].hp,commands:{first,second},
  ...(expertSource&&{expertWins:1,firstReward,trialAttack:opening.actors[0].atk,trialHp:opening.actors[0].maxhp}),errors},null,2)+'\n');
 console.log('Knave Chrome: quest, lamps, command strike, forms, defeat, report, restore, visual profiles passed');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8950/');
 await wait(()=>window.lab?.frame);
 await play();
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.atk]),
  cards:await page.evaluate(()=>window.knaveCards),events:events(f).filter(e=>e.kind.startsWith('knave:')).slice(-18),
  status:await page.locator('#status').textContent(),errors});
 await page.screenshot({path:'work/knave-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
