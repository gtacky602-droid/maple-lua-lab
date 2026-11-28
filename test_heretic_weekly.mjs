import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='sumeru-hub',arena='sumeru-heretic-lattice',quest='heretic-weekly-commission',id='boss-29150101';
const prefix=(process.env.LAB_WEEKLY_EVIDENCE || 'evidence')+'/heretic-weekly',canvas=page.locator('#game'),errors=[];
const expertSource=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
assert.ok(!expectedWins||expertSource);
const expert=id+':expert',moon='boss-29130201:expert';
const equipment=save=>save.inventory.items.filter(item=>item.owner);
const events=f=>Object.values(f?.events||{});
await fs.mkdir(path.dirname(prefix),{recursive:true});
const route=process.env.LAB_HERETIC_TRIAL || 'interrupt';
assert.ok(['interrupt','expire-open','expire-closed'].includes(route));
const wait=(fn,arg,timeout=50000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const mode=m=>page.evaluate(m=>{window.hereticMode=m},m);
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const bytes=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(bytes,'base64'));
 return bytes;
}

async function openExpertSave(){
 const raw=await fs.readFile(expertSource,'utf8');
 const checkpoint=JSON.parse(raw);
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(n=>[n.id,n])));
 await page.locator('#importSave').setInputFiles(expertSource);
 await wait(k=>window.lab.frame.endgame?.weekly[k]?.clears===4,moon);
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
 assert.equal(reported,120);
 await drive.walk(222);
 await page.locator('#weeklyDesk').waitFor();
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256,expertWins:expectedWins,
  falseMoonExpertWins:f.endgame.weekly[moon].clears,reported,attack:f.actors[0].atk,remaining,errors},null,2)+'\n');
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
 }else{
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
   await fs.readFile('work/heretic-weekly-gear.json','utf8'));
  await page.locator('#loadProgress').click();
  await wait(node=>window.lab.frame.story?.node===node,hub);
 }
 if(earned||route!=='interrupt'){
  const allyFire=page.locator('#allyFire');
  if(await allyFire.getAttribute('aria-pressed')!=='true')await allyFire.click();
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
  await atlas.locator('#atlasField').selectOption(arena);
  await wait(n=>window.lab.frame.worldMap?.selected?.id===n,arena);
  guide=(await frame()).worldMap.guide;
  assert.equal(guide.status,'ready');
  assert.deepEqual(guide.stops.map(s=>[s.id,s.previewX]),[[arena,222]]);
  await atlas.screenshot({path:prefix+'-atlas.png'});
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
  await earned.drive.walk(222);
  await page.locator('#weeklyDesk').waitFor();
  await page.locator('#weeklyDifficulty').selectOption('expert');
  await wait(()=>!document.getElementById('weeklyChallengeStart').disabled);
  rank=(await frame()).weeklyDesk.modes.find(m=>m.id==='expert');
  assert.ok(rank.available&&!rank.record);
  await page.locator('#weeklyChallengeStart').click();
 }else{
  await canvas.click();
  const toward=(await frame()).actors[0].x<222?'KeyD':'KeyA';
  await page.keyboard.down(toward);
  try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,arena,15000);}
  finally{await page.keyboard.up(toward);}
  await page.keyboard.press('KeyF');
 }
 await wait(node=>window.lab.frame.story.node===node,arena);
 const opening=await frame();
 if(earned)assert.equal(opening.weeklyBoss.difficulty,'最上級');
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['hereticLattice','ready']);

 await page.evaluate(()=>{
  const held=new Set();
  window.hereticMode='p1';
  window.hereticCards=[];
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.heretic;
   let left=false,right=false,attack=false,jump=false;
   if(v&&!f.paused&&b.phase!=='respawn'){
    if(v.card&&window.hereticCards.at(-1)!==v.card)window.hereticCards.push(v.card);
    const a=f.actors[f.active-1],mode=window.hereticMode;
    let goal=a.x,target;
    if(mode==='p1'){
     if(v.card==='WH10'||v.card==='WH11'||v.card==='WH13'){
      goal=v.card==='WH13'?475:219;
      jump=v.card==='WH11'&&Math.abs(goal-a.x)<24&&a.y>347;
     }else if(v.form===1&&b.damageable&&b.y>399) target=b.x;
    }else if((mode==='trial'||mode==='finish')&&v.card==='WH13'){
     if(v.open){target=b.x;}
     else if(Array.isArray(v.anchors))target=v.anchors[1]?.x;
     if(a.y<440&&target!==undefined&&Math.abs(target-a.x)<150){
      goal=target>480?565:350;
      target=undefined;
     }
    }else if(mode==='finish'&&b.damageable){target=b.x;}
    if(target!==undefined){
     const dx=target-a.x;
     goal=Math.max(65,Math.min(900,target-(target>610?-1:1)*74));
     if(Math.abs(goal-a.x)<12&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*21;
     attack=Math.abs(dx)<117&&Math.sign(dx)===a.dir&&a.y>399;
    }
    left=goal<a.x-10;right=goal>a.x+10;
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);key('Space',jump);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 });
 await wait(()=>window.lab.frame.weeklyBoss?.heretic.card==='WH10');
 const changing=await frame();
 assert.equal(changing.weeklyBoss.hp,0);
 assert.equal(changing.kills,opening.kills);
 assert.equal(changing.weeklyBoss.damageable,false);
 await wait(()=>window.lab.frame.weeklyBoss?.heretic.card==='WH13');
 await wait(()=>window.lab.frame.weeklyBoss?.heretic.anchors.length===2);
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame();
 const full=await capture('png');
 assert.equal(original.weeklyBoss.heretic.form,2);
 assert.ok(original.weeklyBoss.heretic.anchors.every(a=>a.hp>0));
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(n=>window.lab.frame.commands>n*5,original.commands);
 const standard=await frame(),rect=await capture('standard');
 let transfer;
 if(earned){
  const rawLight=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
  const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
  assert.equal(rawLight.raster,packed.raster);
  assert.ok(rawLight.gzipBytes>packed.gzipBytes);
  transfer={rawGzip:rawLight.gzipBytes,packedGzip:packed.gzipBytes,pixelMatch:true};
 }else await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame(),reduced=await capture('light');
 assert.deepEqual([original.t,standard.t,light.t],[original.t,original.t,original.t]);
 assert.deepEqual(original.weeklyBoss,light.weeklyBoss);
 assert.equal(new Set([full,rect,reduced]).size,3);
 const perMode={png:original.commands,standard:standard.commands,light:light.commands};

 await page.locator('#renderMode').selectOption('sprite');
 await wait(n=>window.lab.frame.commands<n*1.1,original.commands);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyHeretic').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await mode('wait');
 await page.keyboard.press('KeyP');
 const hint=page.locator('#weeklyHeretic');
 const trial={route,deadline:original.weeklyBoss.heretic.deadline};
 if(earned&&route==='interrupt'){
  await wait(()=>{
   const f=window.lab.frame, a=f.actors[0], hole=f.weeklyBoss?.heretic.hole;
   return hole?.fits&&!hole.upper&&hole.x>a.x+90&&a.ground&&a.y===480;
  });
  const before=await frame();
  const here=before.actors[0];
  const wallText=await hint.textContent();
  assert.match(wallText,/押し壁の穴は床側（今の高さで通れる）/);
  await page.locator('.game').screenshot({path:prefix+'-wall.png'});
  await wait(x=>{
   const hole=window.lab.frame.weeklyBoss?.heretic.hole;
   return hole?.fits&&!hole.upper&&hole.x<x-50;
  },here.x);
  const after=await frame();
  assert.deepEqual([after.actors[0].x,after.actors[0].y,after.actors[0].hp],[here.x,here.y,here.hp]);
  assert.ok(!events(after).some(e=>e.kind==='heretic:WH14:push'&&e.actor===1));
  trial.wall={floorPassage:true,x:here.x,text:wallText};
 }
 if(route!=='expire-closed')await mode('trial');
 if(route!=='expire-closed'){
  await wait(()=>window.lab.frame.weeklyBoss?.heretic.open);
  if(route!=='interrupt')await mode('wait');
  const opened=await frame();
  assert.equal(opened.weeklyBoss.heretic.deadline,1800);
  assert.equal(opened.weeklyBoss.heretic.anchors.length??0,0);
  assert.match(await hint.textContent(),/結合点を破壊.*詠唱中断まで本体にあと[\d]+回/);
  if(earned)assert.deepEqual(events(opened).filter(e=>e.kind==='heretic:WH13:anchor').map(e=>e.value),[2,1,0]);
  await page.locator('.game').screenshot({path:prefix+'-chant.png'});
 }
 if(route==='interrupt'){
  await wait(()=>window.lab.frame.weeklyBoss?.heretic.exposure>0);
  const staggered=await frame();
  trial.acceptedChantHits=events(staggered).filter(e=>e.kind==='heretic:WH13:chant').length;
  assert.equal(staggered.weeklyBoss.hp,original.weeklyBoss.hp);
  assert.equal(trial.acceptedChantHits,24);
  assert.match(await hint.textContent(),/詠唱を中断.+反撃できる時間/);
  await page.locator('.game').screenshot({path:prefix+'-exposure.png'});
 }else{
  await wait(()=>window.lab.frame.weeklyBoss?.heretic.card==='WH18');
  const expired=await frame();
  trial.expired=expired.weeklyBoss.heretic.trialResult;
  assert.equal(trial.expired.anchorsBroken,route==='expire-open');
  const failureHint=await hint.textContent();
  assert.match(failureHint,route==='expire-open'?/期限切れ.+詠唱残り/:/期限切れ.+結合点が残った/);
  await page.locator('.game').screenshot({path:prefix+'-expired.png'});
  await wait(()=>window.lab.frame.weeklyBoss?.heretic.failureDamage>0);
  const hit=await frame();
  trial.failureDamage=hit.weeklyBoss.heretic.failureDamage;
  assert.equal(trial.failureDamage,125);
  assert.equal(await hint.textContent(),'腐敗の衝撃が命中 ｜ 125ダメージ');
  await page.locator('.game').screenshot({path:prefix+'-shock.png'});
 }
 await mode('finish');
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const done=await frame();
 let firstReward;
 if(earned){
  firstReward={xp:rank.xp+rank.firstXp,mora:rank.mora+rank.firstMora,first:true};
  assert.equal(done.endgame.weekly[expert].clears,1);
  assert.deepEqual(done.weeklyBoss.reward,firstReward);
  assert.equal(done.progression.overflowXp-opening.progression.overflowXp,firstReward.xp);
  assert.equal(done.mora-opening.mora,firstReward.mora);
 }else assert.equal(done.endgame.bosses[id].clears,1);
 assert.equal(done.story.quests[quest].count,1);
 assert.equal(done.returns,0);
 const cards=await page.evaluate(()=>window.hereticCards);
 for(const card of ['WH10','WH11','WH13',route==='interrupt'?'WH19':'WH18'])assert.ok(cards.includes(card),card);

 await page.getByRole('button',{name:'拠点へ：スメール・樹陰の広場',exact:true}).click();
 await wait(node=>window.lab.frame.story.node===node,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 const reported=await frame();
 const payout=earned&&{xp:reported.progression.overflowXp-beforeReport.progression.overflowXp,mora:reported.mora-beforeReport.mora};
 if(earned){
  assert.deepEqual(payout,{xp:1230000,mora:26500});
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
  assert.deepEqual(equipment(saved),equipment(earned.checkpoint));
  assert.equal(saved.companion,earned.checkpoint.companion);
  for(const [key,record] of Object.entries(earned.checkpoint.endgame.weekly))assert.deepEqual(saved.endgame.weekly[key],record,key);
  for(const [key,record] of Object.entries(earned.checkpoint.story.quests)){
   if(record.status==='complete')assert.deepEqual(saved.story.quests[key],record,key);
  }
  await fs.writeFile(path.join(path.dirname(prefix),'heretic-complete.json'),JSON.stringify(saved,null,2)+'\n');
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,cards,trial,
  acceptedChantHits:trial.acceptedChantHits??0,deadline:trial.deadline,
  clearReportRestore:true,viewport390:true,commands:perMode,
  ...(earned&&{sourceSha256:earned.sourceSha256,guide:guide.stops,expertWins:1,firstReward,payout,transfer,
   trialAttack:opening.actors[0].atk,trialHp:opening.actors[0].maxhp,remainingHp:done.actors[0].hp}),errors},null,2)+'\n');
 console.log('Heretic Chrome:',route,'two forms, trial, defeat, report, and save passed');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8954/');
 await wait(()=>window.lab?.frame);
 await play();
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),
  quest:f?.story?.quests?.[quest],nearbyPortal:f?.storyNearbyPortal,cards:await page.evaluate(()=>window.hereticCards),
  events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('heretic:')).slice(-20):[],errors},null,2));
 await page.screenshot({path:'work/heretic-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
