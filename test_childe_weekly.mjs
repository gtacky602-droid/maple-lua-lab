import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:52000});
const canvas=page.locator('#game'),arena='childe-golden-house-arena',hub='liyue-harbor';
const id='boss-29030101',quest='childe-weekly-commission';
const route=process.env.LAB_CHILDE_DROP;
const earnedFile=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
const expert=id+':expert';
const azhdaha='boss-29040101:expert';
assert.ok(!route||['early','late-evade'].includes(route));
assert.ok(!earnedFile||route||expectedWins);
assert.ok(!expectedWins||earnedFile);
const prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/childe-weekly';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function walk(key,predicate,arg){
 await canvas.click();
 await page.keyboard.down(key);
 try{await wait(predicate,arg)}finally{await page.keyboard.up(key)}
}

async function freeze(form){
 await wait(form=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  if(!b?.damageable||b.form!==form||f.paused)return false;
  window.lab.action('pause');
  return true;
 },form);
 await wait(()=>window.lab.frame.paused);
 return frame();
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>!window.lab.frame.paused);
}

async function openEarnedSave(){
 const raw=await fs.readFile(earnedFile);
 const seed=JSON.parse(raw);
 await page.locator('#importSave').setInputFiles(earnedFile);
 await wait(key=>window.lab.frame.endgame?.weekly[key]?.clears===5,azhdaha);
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(node=>[node.id,node])));
 assert.equal(seed.story.node,hub);
 assert.equal((await frame()).progression.level,200);
 return {seed,drive,sourceSha256:createHash('sha256').update(raw).digest('hex')};
}

async function openExpert(drive){
 await canvas.click();
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('boss');
 await page.locator('#atlasField').selectOption(arena);
 await wait(id=>window.lab.frame.worldMap?.selected?.id===id,arena);
 const guide=(await frame()).worldMap.guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>stop.id),[arena]);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await drive.walk(1040);
 await page.locator('#weeklyDesk').waitFor();
 await page.locator('#weeklyDifficulty').selectOption('expert');
 await wait(()=>!document.getElementById('weeklyChallengeStart').disabled);
 const picked=(await frame()).weeklyDesk.modes.find(choice=>choice.id==='expert');
 assert.ok(picked.available&&!picked.record);
 await page.locator('#weeklyChallengeStart').click();
 await drive.waitNode(arena);
 assert.equal((await frame()).weeklyBoss.difficulty,'最上級');
 return picked;
}

async function verifyRestoredAdventure(earned){
 const current=await frame();
 assert.equal(current.endgame.weekly[expert].clears,expectedWins);
 assert.equal(current.story.quests[quest].status,'complete');
 assert.equal(current.actors[0].atk,74956);
 assert.deepEqual(current.azhdahaLobby.selected,['hydro','electro']);
 await earned.drive.walk(1040);
 await page.locator('#weeklyDesk').waitFor();
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 const reported=Object.values(current.story.quests).filter(row=>row.status==='complete').length;
 assert.equal(reported,112);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256:earned.sourceSha256,
  reported,expertWins:expectedWins,azhdahaExpertWins:5,attack:current.actors[0].atk,remaining,errors},null,2)+'\n');
}

async function fightAndReport(earned){
 if(!earned){
  const fixture=await fs.readFile(route?'work/childe-riptide-gear.json':'work/childe-weekly-gear.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.locator('#loadProgress').click();
  await wait(node=>window.lab.frame.story.node===node,hub);
 }else{
  assert.ok(!earned.seed.endgame.weekly[expert]&&!earned.seed.story.quests[quest]);
  await page.evaluate(()=>{window.lab.action('artifact_remove:602');window.lab.action('artifact_equip:1187')});
  await wait(()=>window.lab.frame.actors[0].atk===259&&window.lab.frame.actors[0].maxhp>500);
 }
 if(route){
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }
 const row=page.locator(`[data-quest="${quest}"]`);
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='active',quest);
 let picked;
 if(earned)picked=await openExpert(earned.drive);
 else{
  await walk('KeyD',node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,arena);
  await page.keyboard.press('KeyF');
  await wait(node=>window.lab.frame.story.node===node,arena);
 }
 const encounterStart=await frame();
 const backdrop=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([backdrop.file,backdrop.state],['li-golden-vault-background-v1.png','ready']);
 assert.deepEqual((await frame()).weeklyBoss.phaseHp.map(phase=>phase.max),[240,300,420]);
 if(!route){
  await wait(()=>window.lab.frame.weeklyBoss.mark==='hydro');
  await page.keyboard.press('KeyE');
  await wait(()=>window.lab.frame.active===2);
  assert.equal((await frame()).weeklyBoss.mark,'hydro');
  await walk('KeyA',()=>window.lab.frame.actors[1].x<=43);
  await wait(()=>!window.lab.frame.weeklyBoss.mark);
  await wait(()=>window.lab.frame.t>4.4);
  await page.keyboard.press('KeyE');
  await wait(()=>window.lab.frame.active===1);
 }
 await canvas.click();
 await page.evaluate(route=>{
  const trail=window.childeDropTrail={mark:false,lock:null,cleanse:null,resumeAttack:false};
  const held=new Set();
  const set=(code,on)=>{
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  const drive=()=>{
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0];
   if(!b||b.phase==='respawn'||f.returns){
    for(const code of [...held])set(code,false);
    return;
   }
   if(!f.paused){
    const dx=b.x-a.x;
    let left=dx<0&&(Math.abs(dx)>62||dx*a.dir<0);
    let right=dx>0&&(Math.abs(dx)>62||dx*a.dir<0);
    let attack=b.damageable&&Math.abs(dx)<120&&dx*a.dir>=0;
    let jump=(b.move==='WC03'||b.move==='WC09'||b.move==='WC01'&&b.moveTick>=50&&b.moveTick<208)&&a.ground;
    const shiftingToSecond=b.move==='WC14'&&b.phaseHp[0].hp===0&&b.phaseHp[1].hp===b.phaseHp[1].max;
    if(route&&!trail.resumeAttack&&(shiftingToSecond||b.form===2)){
     const drop=b.riptideDrop;
     if(b.mark==='electro'&&b.move==='WC07')trail.mark=true;
     if(drop?.phase==='locked'&&!trail.lock)trail.lock={x:drop.x,tick:b.moveTick};
     if(drop?.cleansed)trail.cleanse=drop.cleansed;
     let target=trail.mark?133:410;
     if(drop&&(route==='early'||trail.lock))target=29;
     left=a.x>target+5;
     right=a.x<target-5;
     attack=jump=false;
     if(a.ground&&a.y<470&&drop?.phase!=='landed')window.lab.action('drop');
    }
    if(jump)window.lab.action('jump');
    set('KeyA',left);set('KeyD',right);set('KeyJ',attack);
   }else for(const code of [...held])set(code,false);
   requestAnimationFrame(drive);
  };
  requestAnimationFrame(drive);
 },route);
 const second=await freeze(2);
 await page.locator('#fieldBoss').waitFor({state:'visible'});
 await wait(()=>document.getElementById('fieldBossLabel').textContent.includes('邪眼'));
 assert.equal(await page.locator('#weeklyPhases progress').count(),3);
 assert.equal(second.weeklyBoss.phaseHp[0].hp,0);
 await page.locator('.game').screenshot({path:prefix+'-electro.png'});
 await resume();
 let riptide,transfer,lampGuide;
 if(route){
  if(earned){
   await wait(()=>{
    const f=window.lab.frame,b=f.weeklyBoss;
    if(f.paused||b?.riptideDrop?.phase!=='tracking'||b.cleanseSide!=='left')return false;
    window.lab.action('pause');
    return true;
   });
   await wait(()=>window.lab.frame.paused);
   const cue=(await frame()).weeklyBoss;
   assert.ok(cue.riptideDrop.lockIn>0);
   await wait(()=>document.querySelector('#weeklyChilde').textContent.includes('左の金灯で追雷を止める'));
   await page.setViewportSize({width:390,height:844});
   const hud=page.locator('#weeklyChilde');
   assert.ok(await hud.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
   lampGuide={side:cue.cleanseSide,lockIn:cue.riptideDrop.lockIn,hud:await hud.textContent()};
   await page.locator('.game').screenshot({path:prefix+'-lamp.png'});
   await page.setViewportSize({width:1240,height:940});
   await resume();
  }
  await wait(()=>{
   const f=window.lab.frame;
   if(!f.paused&&f.weeklyBoss?.riptideDrop?.recovery>0){
    window.lab.action('pause');
    return true;
   }
   return false;
  });
  await wait(()=>window.lab.frame.paused);
  const {weeklyBoss:{riptideDrop:drop}}=await frame();
  const trail=await page.evaluate(()=>window.childeDropTrail);
  assert.ok(trail.mark);
  if(route==='early'){
   assert.equal(trail.lock,null);
   assert.deepEqual([drop.phase,drop.cleansed,drop.damage],['cancelled','before',undefined]);
   assert.ok(drop.recovery<=60);
   await wait(()=>document.querySelector('#weeklyChilde').textContent.includes('追雷中止'));
  }else{
   assert.ok(trail.lock&&trail.lock.tick>=84);
   assert.deepEqual([drop.phase,drop.cleansed,drop.x,drop.damage],['landed','after',trail.lock.x,0]);
   assert.ok(drop.recovery<=120);
   await wait(()=>document.querySelector('#weeklyChilde').textContent.includes('被ダメージなし'));
  }
  const hud=page.locator('#weeklyChilde');
  await hud.screenshot({path:prefix+'-riptide.png'});
  riptide={route,trail,drop,hud:await hud.textContent()};
  await page.evaluate(()=>{window.childeDropTrail.resumeAttack=true});
  await resume();
  if(!earned){
   await page.locator('#allyFire').click();
   await wait(()=>!window.lab.frame.holdAllyFire);
  }
  await canvas.click();
 }

 const third=await freeze(3);
 await wait(()=>document.getElementById('fieldBossLabel').textContent.includes('魔王武装'));
 assert.deepEqual(third.weeklyBoss.phaseHp.slice(0,2).map(phase=>phase.hp),[0,0]);
 assert.ok(third.draws.some(draw=>draw.source==='childe-foul-idle-source-v1.png'));
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.75,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[third.t,third.t]);
 assert.equal(light.weeklyBoss.hp,third.weeklyBoss.hp);
 await canvas.screenshot({path:prefix+'-light.png'});
 if(route){
  const raw=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#packRectArt').uncheck());
  const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
  assert.deepEqual([packed.snapshot.t,raw.snapshot.t],[third.t,third.t]);
  assert.equal(packed.raster,raw.raster);
  assert.ok(packed.snapshot.draws.some(draw=>draw.kind==='rect_runs'&&draw.h===144));
  assert.ok(packed.gzipBytes<raw.gzipBytes&&packed.snapshot.draws.length<raw.snapshot.draws.length);
  transfer={profile:'h32c16',pixelMatch:true,packedBytes:packed.gzipBytes,rawBytes:raw.gzipBytes,
   packedRecords:packed.snapshot.draws.length,rawRecords:raw.snapshot.draws.length};
 }
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyPhases').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await page.locator('#renderMode').selectOption('sprite');
 await resume();
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const defeated=await frame();
 assert.equal(defeated.returns,0);
 const reward=earned&&{xp:picked.xp+picked.firstXp,mora:picked.mora+picked.firstMora,first:true};
 if(earned){
  assert.equal(defeated.endgame.weekly[expert].clears,1);
  assert.deepEqual(defeated.weeklyBoss.reward,reward);
  assert.equal(defeated.progression.overflowXp-encounterStart.progression.overflowXp,reward.xp);
  assert.equal(defeated.mora-encounterStart.mora,reward.mora);
 }else assert.equal(defeated.endgame.bosses[id].clears,1);
 assert.equal(defeated.story.quests[quest].count,1);
 await page.getByRole('button',{name:'拠点へ：璃月・港の広場',exact:true}).click();
 await wait(node=>window.lab.frame.story.node===node,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 const reported=await frame();
 const questReward=earned&&{xp:reported.progression.overflowXp-beforeReport.progression.overflowXp,
  mora:reported.mora-beforeReport.mora};
 if(earned){
  assert.deepEqual(questReward,{xp:18000,mora:1800});
  await page.evaluate(()=>{window.lab.action('artifact_equip:10');window.lab.action('artifact_equip:602')});
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
 if(earned){
  assert.equal((await frame()).endgame.weekly[expert].clears,1);
  assert.equal(saved.endgame.weekly[azhdaha].clears,5);
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
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({entry:true,threeForms:true,...(!route&&{markLeftAfterSwapAndCleanse:true}),
  actualBattleAndReport:true,endedHp:defeated.actors[0].hp,storedBestAndRespawn:true,viewport390:true,
  sameStateCommands:{png:third.commands,standard:standard.commands,light:light.commands},riptide,transfer,backdrop,
  ...(earned&&{sourceSha256:earned.sourceSha256,firstReward:reward,questReward,lampGuide,
   expertWins:1,trialAttack:encounterStart.actors[0].atk,trialHp:encounterStart.actors[0].maxhp}),errors},null,2)+'\n');
 console.log('Childe Chrome: entrance, mark and boundary, three forms, same-frame sprite comparison, report and reload passed');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8943/');
 await wait(()=>window.lab?.frame);
 const earned=earnedFile&&await openEarnedSave();
 if(expectedWins)await verifyRestoredAdventure(earned);
 else await fightAndReport(earned);
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,turn:f?.active,actors:f?.actors?.map(a=>[a.x,a.hp]),errors});
 await page.screenshot({path:route?prefix+'-failure.png':'work/childe-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
