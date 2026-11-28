import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {holdPortalFrame,waypointDriver} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:70000});
const canvas=page.locator('#game');
const prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/signora-weekly';
const route=process.env.LAB_SIGNORA_RELEASE||'';
const earnedFile=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
assert.ok(['','release','passive'].includes(route));
assert.ok(!earnedFile||route||expectedWins);
assert.ok(!expectedWins||earnedFile);
const node='signora-ten-shrine-arena',hub='inazuma-town',quest='signora-weekly-commission',id='boss-29050101';
const expert=id+':expert',childe='boss-29030101:expert';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function freeze(stage,move,tick){
 await wait(({stage,move,tick})=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  if(f.paused||b?.signoraStage!==stage||(stage==='seal'&&!b.seal.ready))return false;
  if(move&&(b.move!==move||b.moveTick<tick))return false;
  window.lab.action('pause');
  return true;
 },{stage,move,tick});
 await wait(()=>window.lab.frame.paused);
 return frame();
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>!window.lab.frame.paused);
}

async function loadEarnedAdventure(){
 const raw=await fs.readFile(earnedFile);
 const seed=JSON.parse(raw);
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(node=>[node.id,node])));
 await page.locator('#importSave').setInputFiles(earnedFile);
 await wait(key=>window.lab.frame.endgame?.weekly[key]?.clears===4,childe);
 assert.equal((await frame()).progression.level,200);
 if((await frame()).story.node!==hub)await drive.warp(hub);
 return {seed,drive,sourceSha256:createHash('sha256').update(raw).digest('hex')};
}

async function verifyEarnedRestore(earned){
 const f=await frame();
 assert.equal(f.endgame.weekly[expert].clears,expectedWins);
 assert.equal(f.story.quests[quest].status,'complete');
 assert.equal(f.actors[0].atk,74956);
 assert.equal(f.endgame.weekly['boss-29040101:expert'].clears,5);
 const reported=Object.values(f.story.quests).filter(row=>row.status==='complete').length;
 assert.equal(reported,113);
 await earned.drive.walk(995);
 await page.locator('#weeklyDesk').waitFor();
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256:earned.sourceSha256,
  expertWins:expectedWins,childeExpertWins:4,azhdahaExpertWins:5,reported,attack:f.actors[0].atk,remaining,errors},null,2)+'\n');
}

async function startExpert(earned){
 await canvas.click();
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('boss');
 await page.locator('#atlasField').selectOption(node);
 await wait(node=>window.lab.frame.worldMap?.selected?.id===node,node);
 const guide=(await frame()).worldMap.guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),[node]);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await earned.drive.walk(995);
 await page.locator('#weeklyDesk').waitFor();
 await page.locator('#weeklyDifficulty').selectOption('expert');
 await wait(()=>!document.getElementById('weeklyChallengeStart').disabled);
 const picked=(await frame()).weeklyDesk.modes.find(choice=>choice.id==='expert');
 assert.ok(picked.available&&!picked.record);
 const releaseOpening=await holdPortalFrame(page,'weekly_start:'+expert);
 await page.locator('#weeklyChallengeStart').click();
 await earned.drive.waitNode(node);
 assert.equal((await frame()).weeklyBoss.difficulty,'最上級');
 return {picked,releaseOpening,guide:guide.stops.map(stop=>stop.id)};
}

async function fightAndReport(earned){
 if(!earned){
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
   await fs.readFile(route?'work/signora-weekly-route-gear.json':'work/signora-weekly-gear.json','utf8'));
  await page.locator('#loadProgress').click();
  await wait(hub=>window.lab.frame.story.node===hub,hub);
 }else{
  assert.ok(!earned.seed.endgame.weekly[expert]&&!earned.seed.story.quests[quest]);
  await page.evaluate(()=>{window.lab.action('artifact_remove:602');window.lab.action('artifact_equip:1187')});
  await wait(()=>window.lab.frame.actors[0].atk===259&&window.lab.frame.actors[0].maxhp>500);
 }
 const row=page.locator(`[data-quest="${quest}"]`);
 if(route){
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 let picked,releaseOpening,guide;
 if(earned)({picked,releaseOpening,guide}=await startExpert(earned));
 else{
  await canvas.click();
  await page.keyboard.down('KeyD');
  try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);}
  finally{await page.keyboard.up('KeyD');}
  releaseOpening=await holdPortalFrame(page);
  await page.keyboard.press('KeyF');
  await wait(node=>window.lab.frame.story.node===node,node);
 }
 const scene=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['tenshukakuDuel','ready']);
 const first=await frame();
 assert.deepEqual(first.weeklyBoss.phaseHp.map(p=>[p.name,p.hp]),[['氷',480],['炎',800]]);
 assert.ok(first.draws.some(draw=>draw.source==='signora-idle-source-v1.png'));
 await canvas.screenshot({path:prefix+'-cryo.png'});
 await releaseOpening();
 await canvas.click();
 if(!route){
  await page.keyboard.down('KeyA');
  try{await wait(()=>window.lab.frame.actors[0].x<=105);}
  finally{await page.keyboard.up('KeyA');}
  await page.setViewportSize({width:390,height:844});
  const button=page.locator('#weeklyDeviceButton');
  await wait(()=>!document.getElementById('weeklyDeviceButton').disabled);
  assert.match(await button.textContent(),/左の炎心を放出/);
  await button.scrollIntoViewIfNeeded();
  const bounds=await button.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();
  try{await wait(()=>window.lab.frame.weeklyBoss.devices[0]>0);}
  finally{await page.mouse.up();}
  assert.ok(await button.isDisabled());
  await page.setViewportSize({width:1240,height:940});
  assert.equal((await frame()).weeklyBoss.devices[1],0);
 }
 await page.evaluate(route=>{
  const held=new Set();
  let coolingGoal=0,rainOver=false;
  function set(code,on){
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function run(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0];
   if(!b||b.phase==='respawn'||f.returns){
    for(const code of [...held])set(code,false);
    return;
   }
   if(f.paused){
    for(const code of [...held])set(code,false);
   }else{
    const dx=b.x-a.x;
    let goal=b.x+(dx>0?-74:74),strike=b.damageable;
    let release=false;
    if(b.temperature>=55&&!coolingGoal)coolingGoal=!b.devices[0]&&(b.devices[1]||a.x<480)?70:890;
    if(b.temperature<5||!b.deviceEnabled)coolingGoal=0;
    if(coolingGoal){
     goal=coolingGoal;strike=false;
    }else if(b.signoraStage==='seal'&&!b.seal.carrying){
     const moths=Array.isArray(b.seal.moths)?b.seal.moths:[];
     const nearest=moths.slice().sort((l,r)=>Math.abs(l.x-a.x)-Math.abs(r.x-a.x))[0];
     goal=nearest?.x??(a.x<480?70:890);strike=false;
    }
    release=Boolean(coolingGoal);
    if(route&&b.signoraStage==='pyro'&&!window.signoraFinish){
     if(b.move==='WS12'&&b.moveTick>=215)rainOver=true;
     goal=rainOver?70:203;
     if(b.move==='WS14'&&b.moveTick>=400)goal=400;
     strike=false;
     release=route==='release'&&rainOver&&b.move==='WS12';
    }
    const delta=goal-a.x;
    const move=Math.abs(delta)>7?Math.sign(delta):strike&&dx*a.dir<0?Math.sign(dx):0;
    set('KeyA',move<0);set('KeyD',move>0);
    set('KeyJ',strike&&Math.abs(dx)<112&&dx*a.dir>=0);
    set('KeyG',release&&Math.abs(delta)<10);
    if(b.signoraStage==='pyro'&&b.deviceHold>0&&b.deviceCue?.inRange&&!window.signoraDeviceHold){
     const button=document.getElementById('weeklyDeviceButton');
     window.signoraDeviceHold={side:b.deviceCue.side,ticks:b.deviceHold,total:b.deviceTotal,
      text:button.textContent,enabled:!button.disabled};
    }
   }
   requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
 },route);
 const cocoon=await freeze('seal');
 assert.ok(cocoon.weeklyBoss.seal.hp<=100&&cocoon.weeklyBoss.seal.moths.length>0);
 await wait(()=>document.querySelector('#weeklySealText').textContent.includes('紅蓮蛾'));
 await page.locator('.game').screenshot({path:prefix+'-seal.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#fieldBoss').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await resume();
 let sealResult,fireResult;
 if(route){
  const result=await freeze('transform','WS09',0);
  assert.deepEqual(result.weeklyBoss.sealStrike,{source:'moth',damage:25,remaining:0});
  assert.deepEqual(result.events.filter(e=>e.kind==='signora:seal-hit').map(e=>e.value),[25,25,25,25]);
  await wait(()=>document.querySelector('#weeklySealResult').textContent.includes('氷の繭が割れた'));
  sealResult={strike:result.weeklyBoss.sealStrike,hud:await page.locator('#weeklySealResult').textContent()};
  await page.locator('.game').screenshot({path:prefix+'-seal-finish.png'});
  await resume();
 }
 const pyro=await freeze('pyro');
 assert.equal(pyro.weeklyBoss.temperatureLabel,'灼熱');
 assert.ok(pyro.draws.some(draw=>draw.source==='signora-flame-idle-source-v1.png'));
 await canvas.screenshot({path:prefix+'-png.png'});
 if(earned){
  const button=page.locator('#weeklyDeviceButton');
  assert.ok(await button.isDisabled());
  assert.match(await button.textContent(),/霜眼へ近づく/);
 }
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>1000&&!window.lab.frame.draws.some(d=>d.kind==='rect_runs'));
 const standard=await frame();
 await canvas.screenshot({path:prefix+'-standard.png'});
 const unpacked=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
 const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
 assert.equal(packed.raster,unpacked.raster);
 assert.ok(packed.gzipBytes<unpacked.gzipBytes&&packed.snapshot.draws.some(d=>d.kind==='rect_runs'&&d.h===144));
 const light=packed.snapshot;
 assert.deepEqual([standard.t,light.t],[pyro.t,pyro.t]);
 assert.equal(light.weeklyBoss.hp,pyro.weeklyBoss.hp);
 await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await resume();
 if(route){
  const rain=await freeze('pyro','WS12',299);
  const result=rain.weeklyBoss.deviceRelease;
  const fireFloor=rain.draws.filter(d=>d.kind==='rect'&&d.color==='#ff864d'&&d.y===473&&d.h===7);
  if(route==='release'){
   assert.deepEqual(result,{side:1,floors:1});
   assert.equal(fireFloor.length,1);
   await wait(()=>document.querySelector('#weeklyDevices').textContent.includes('火床を1か所消した'));
   const hold=await page.evaluate(()=>window.signoraDeviceHold);
   assert.ok(hold?.enabled&&hold.side===1&&hold.ticks>0&&hold.ticks<hold.total);
   assert.match(hold.text,/左の霜眼を放出/);
   assert.equal(rain.weeklyBoss.deviceCue.side,2);
   assert.ok(await page.locator('#weeklyDeviceButton').isDisabled());
   assert.match(await page.locator('#weeklyDeviceButton').textContent(),/右の霜眼へ近づく/);
   fireResult={hold};
  }else{
   assert.equal(result,undefined);
   assert.equal(fireFloor.length,2);
   assert.equal(rain.weeklyBoss.devices[0],0);
  }
  fireResult={...fireResult,route,temperature:rain.weeklyBoss.temperature,release:result,fireFloor:fireFloor.length,
   hud:await page.locator('#weeklyDevices').textContent()};
  await page.locator('.game').screenshot({path:prefix+'-fire-floor.png'});
  await resume();
  await freeze('pyro','WS14',420);
  await wait(()=>document.querySelector('#fieldBossLabel').textContent.includes('反撃の隙'));
  await page.evaluate(()=>{window.signoraFinish=true});
  await resume();
  if(!earned){
   await page.locator('#allyFire').click();
   await wait(()=>!window.lab.frame.holdAllyFire);
  }
  await canvas.click();
 }
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const defeated=await frame();
 assert.equal(defeated.returns,0);
 const reward=earned&&{xp:picked.xp+picked.firstXp,mora:picked.mora+picked.firstMora,first:true};
 if(earned){
  assert.equal(defeated.endgame.weekly[expert].clears,1);
  assert.deepEqual(defeated.weeklyBoss.reward,reward);
  assert.equal(defeated.progression.overflowXp-first.progression.overflowXp,reward.xp);
  assert.equal(defeated.mora-first.mora,reward.mora);
 }else assert.equal(defeated.endgame.bosses[id].clears,1);
 assert.equal(defeated.story.quests[quest].count,1);
 await page.getByRole('button',{name:'拠点へ：稲妻・城下の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 const reported=await frame();
 const questReward=earned&&{xp:reported.progression.overflowXp-beforeReport.progression.overflowXp,
  mora:reported.mora-beforeReport.mora};
 if(earned){
  assert.deepEqual(questReward,{xp:36000,mora:3000});
  await page.evaluate(()=>{window.lab.action('artifact_equip:10');window.lab.action('artifact_equip:602')});
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
  assert.equal(saved.endgame.weekly[childe].clears,4);
  assert.deepEqual(saved.azhdahaPair,earned.seed.azhdahaPair);
  assert.deepEqual(saved.weapons,earned.seed.weapons);
  assert.equal(saved.companion,earned.seed.companion);
  assert.ok(saved.weeklyBosses[id].waitTicks>0);
  const equipped=save=>save.inventory.items.filter(item=>item.owner);
  assert.deepEqual(equipped(saved),equipped(earned.seed));
  for(const [key,value] of Object.entries(earned.seed.story.quests)){
   if(value.status==='complete')assert.deepEqual(saved.story.quests[key],value,key);
  }
  await fs.writeFile(prefix+'-save.json',JSON.stringify(saved)+'\n');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({entry:true,deviceKeyboardHold:route==='release',deviceButtonHold:!route,cocoonAndPyro:true,
  normalKeyBattleAndReport:true,savedRespawn:true,remainingHp:defeated.actors[0].hp,viewport390:true,scene,
  sealResult,fireResult,transfer:{rawGzip:unpacked.gzipBytes,packedGzip:packed.gzipBytes,pixelMatch:true},
  sameStateCommands:{png:pyro.commands,standard:standard.commands,light:light.commands},
  ...(earned&&{sourceSha256:earned.sourceSha256,guide,firstReward:reward,questReward,expertWins:1,
   trialAttack:first.actors[0].atk,trialHp:first.actors[0].maxhp}),errors},null,2)+'\n');
 console.log(`Signora Chrome (${route||'default'}): quest, portal, cocoon, two forms, clear and save passed`);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8945/');
 await wait(()=>window.lab?.frame);
 const earned=earnedFile&&await loadEarnedAdventure();
 if(expectedWins)await verifyEarnedRestore(earned);
 else await fightAndReport(earned);
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.hp]),returns:f?.returns,errors});
 await page.screenshot({path:prefix+'-failure.png'});
 throw error;
}finally{
 await browser.close();
}
