import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {holdPortalFrame,waypointDriver} from './tools/browser_waypoint_test.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:115000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game');
const prefix=process.env.RAIDEN_PROOF_PREFIX||'evidence/raiden-weekly';
const normal='raiden-weekly-normal-source-v1.png';
const node='raiden-thunder-echo-arena',hub='inazuma-town',quest='raiden-weekly-commission',id='boss-29060201';
const earnedFile=process.env.LAB_EARNED_SAVE;
const expectedWins=Number(process.env.LAB_EARNED_WINS||0);
const expert=id+':expert',signora='boss-29050101:expert';
assert.ok(!expectedWins||earnedFile);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function freeze(stage){
 await wait(stage=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  const ready=stage==='warning'?b?.move==='WR15'&&b.flower.protected&&b.flower.slashIn>0&&b.flower.inside:
   stage==='dome'?b?.move==='WR15'&&b.flower.protected&&b.moveTick>=64:
   b?.move==='WR16'&&b.damageable;
  if(f.paused||!ready)return false;
  window.lab.action('pause');
  return true;
 },stage);
 await wait(()=>window.lab.frame.paused);
 return frame();
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>!window.lab.frame.paused);
}

async function canvasImage(name){
 const data=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(data,'base64'));
 return data;
}

async function openEarnedSave(){
 const raw=await fs.readFile(earnedFile);
 const seed=JSON.parse(raw);
 const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const drive=waypointDriver(page,Object.fromEntries(nodes.map(node=>[node.id,node])));
 await page.locator('#importSave').setInputFiles(earnedFile);
 await wait(key=>window.lab.frame.endgame?.weekly[key]?.clears===3,signora);
 assert.equal((await frame()).progression.level,200);
 assert.equal((await frame()).story.node,hub);
 return {seed,drive,sourceSha256:createHash('sha256').update(raw).digest('hex')};
}

async function verifyEarnedRestore(earned){
 const f=await frame();
 assert.equal(f.endgame.weekly[expert].clears,expectedWins);
 assert.equal(f.story.quests[quest].status,'complete');
 assert.equal(f.actors[0].atk,74956);
 assert.equal(f.endgame.weekly['boss-29030101:expert'].clears,4);
 const reported=Object.values(f.story.quests).filter(record=>record.status==='complete').length;
 assert.equal(reported,114);
 await earned.drive.walk(1305);
 await page.locator('#weeklyDesk').waitFor();
 assert.equal(await page.locator('#weeklyDifficulty').inputValue(),'expert');
 const remaining=(await frame()).weeklyDesk.remaining;
 assert.ok(remaining>0&&await page.locator('#weeklyChallengeStart').isDisabled());
 await page.locator('#weeklyDesk').screenshot({path:prefix+'-restored.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-restore.json',JSON.stringify({sourceSha256:earned.sourceSha256,
  expertWins:expectedWins,signoraExpertWins:3,childeExpertWins:4,reported,attack:f.actors[0].atk,remaining,errors},null,2)+'\n');
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
 await earned.drive.walk(1305);
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
 if(earned){
  assert.ok(!earned.seed.endgame.weekly[expert]&&!earned.seed.story.quests[quest]);
  await page.evaluate(()=>{window.lab.action('artifact_remove:602');window.lab.action('artifact_equip:1187')});
  await wait(()=>window.lab.frame.actors[0].atk===259&&window.lab.frame.actors[0].maxhp>500);
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }else{
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
   await fs.readFile('work/raiden-weekly-gear.json','utf8'));
  await page.locator('#loadProgress').click();
  await wait(hub=>window.lab.frame.story.node===hub,hub);
 }
 const row=page.locator(`[data-quest="${quest}"]`);
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
 assert.deepEqual([scene.key,scene.state],['euthymiaDuel','ready']);
 const opening=await frame();
 assert.equal(opening.weeklyBoss.formName,'薙刀');
 assert.ok(opening.draws.some(draw=>draw.source===normal));
 await page.locator('.game').screenshot({path:prefix+'-normal.png'});
 await releaseOpening();
 await canvas.click();
 await page.evaluate(()=>{
  const held=new Set();
  function key(code,on){
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  let lastDodge=-10,retreat=905;
  window.raidenLog=[];
  window.raidenArmorHits=new Map();
  let previousMove;
  function run(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0],flower=b?.flower;
   if(!b||b.phase==='respawn'||f.returns){
    for(const code of [...held])key(code,false);
    return;
   }
   if(previousMove!==b.move){
    previousMove=b.move;window.raidenLog.push([Math.round(f.t),b.move,b.hp,a.hp,Math.round(a.x),b.raidenMeter.value,b.flower?.value]);
   }
   for(const event of Array.isArray(f.events)?f.events:[]){
    if(event.kind==='raiden:WR18:hit')window.raidenArmorHits.set(event.seq,event.value);
   }
   if(f.paused){
    for(const code of [...held])key(code,false);
   }else{
    const targets=Array.isArray(b.targets)?b.targets:[];
    const eye=targets.filter(x=>x.kind==='eye').sort((l,r)=>Math.abs(l.x-a.x)-Math.abs(r.x-a.x))[0];
    const shade=b.moveTick>=126&&targets.find(x=>x.clue==='╳');
    let target,goal;
    if(flower){
     if(flower.protected||!flower.ready)goal=flower.x;
     else target=flower.x;
    }else if(eye&&b.moveTick<260)target=eye.x;
    else if(shade)target=shade.x;
    else if(b.damageable&&(window.raidenFinish||b.raidenStage==='armored'&&b.hp>950))target=b.x;
    if(target!==undefined)goal=target+(a.x<target?-65:65);
    if(goal===undefined){
     if(Math.abs(a.x-retreat)<15&&Math.abs(a.x-b.x)<174)retreat=960-retreat;
     goal=retreat;
    }
    const delta=goal-a.x,dx=target===undefined?0:target-a.x;
    const movement=Math.abs(delta)>7?Math.sign(delta):dx*a.dir<0?Math.sign(dx):0;
    key('KeyA',movement<0);key('KeyD',movement>0);
    key('KeyJ',target!==undefined&&Math.abs(dx)<109&&dx*a.dir>=0);
    const jump=b.move==='WR12'&&[120,210,300,390].some(t=>b.moveTick>=t-8&&b.moveTick<t+32);
    key('Space',jump);
    if(jump&&a.ground)window.lab.action('jump');
    const warnings=Array.isArray(b.warnings)?b.warnings:[];
    const imminent=warnings.some(w=>w.starts-b.moveTick<=8&&w.starts-b.moveTick>=2
     &&a.x>w.lo&&a.x<w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
    const danger=!flower&&!jump&&!eye&&(imminent||b.phase==='active');
    if(danger&&f.t-lastDodge>2.2){lastDodge=f.t;window.lab.action('dodge');}
   }
   requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
 });
 await wait(()=>window.lab.frame.weeklyBoss?.raidenStage==='armored');
 const warning=await freeze('warning');
 assert.ok(warning.weeklyBoss.flower.protected&&warning.weeklyBoss.flower.slashIn>0);
 await wait(()=>document.getElementById('weeklyFlowerText').textContent.includes('大太刀まで'));
 const warningText=await page.locator('#weeklyFlowerText').textContent();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyRaiden').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.locator('.game').screenshot({path:prefix+'-warning.png'});
 await page.setViewportSize({width:1240,height:940});
 await resume();
 const dome=await freeze('dome');
 assert.equal(dome.weeklyBoss.flower.value,5);
 assert.equal(dome.weeklyBoss.flower.slashResult,'protected');
 assert.equal(await page.locator('#weeklyFlowerText').textContent(),'花蕊で大太刀を防いだ');
 assert.ok(await page.locator('#status').evaluate(el=>!el.classList.contains('error')));
 assert.ok(dome.events.some(e=>e.kind==='raiden:WR15:protected'&&e.actor===1));
 assert.ok(dome.draws.some(draw=>draw.source==='raiden-boss-idle-source-v1.png'&&draw.h===166));
 const spritePixels=await canvasImage('png');
 await page.locator('.game').screenshot({path:prefix+'-dome.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 const standardPixels=await canvasImage('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(count=>window.lab.frame.commands<count*.7,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[dome.t,dome.t]);
 assert.equal(light.weeklyBoss.hp,dome.weeklyBoss.hp);
 const lightPixels=await canvasImage('light');
 assert.equal(new Set([spritePixels,standardPixels,lightPixels]).size,3);
 await page.locator('#renderMode').selectOption('sprite');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#fieldBoss').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await resume();
 const collapse=await freeze('down');
 assert.ok(collapse.weeklyBoss.down>=470);
 assert.ok(await page.locator('#status').evaluate(el=>!el.classList.contains('error')));
 await canvas.evaluate(el=>el.getContext('2d').getImageData(0,0,el.width,el.height));
 await page.locator('.game').screenshot({path:prefix+'-collapse.png'});
 await page.evaluate(()=>{window.raidenFinish=true;});
 await resume();
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const defeated=await frame();
 assert.equal(defeated.returns,0);
 const reward=earned&&{xp:picked.xp+picked.firstXp,mora:picked.mora+picked.firstMora,first:true};
 const armorHits=await page.evaluate(()=>[...window.raidenArmorHits.values()]);
 if(earned){
  assert.ok(armorHits.length>0);
  assert.equal(defeated.endgame.weekly[expert].clears,1);
  assert.deepEqual(defeated.weeklyBoss.reward,reward);
  assert.equal(defeated.progression.overflowXp-opening.progression.overflowXp,reward.xp);
  assert.equal(defeated.mora-opening.mora,reward.mora);
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
  assert.deepEqual(questReward,{xp:44000,mora:3400});
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
  assert.equal(saved.endgame.weekly[signora].clears,3);
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
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({questEntry:true,ordinaryAndArmored:true,fivePhysicalFlowerHits:true,
  protectedAtSlash:true,attackableArmorDown:true,clears:1,reportAndRestore:true,viewport390:true,scene,
  warning:{text:warningText,ticks:warning.weeklyBoss.flower.slashIn},armorHits,
  remainingHp:defeated.actors[0].hp,sameStateCommands:{png:dome.commands,standard:standard.commands,light:light.commands},
  ...(earned&&{sourceSha256:earned.sourceSha256,guide,firstReward:reward,questReward,expertWins:1,
   trialAttack:opening.actors[0].atk,trialHp:opening.actors[0].maxhp}),errors},null,2)+'\n');
 console.log('Raiden Chrome: portal, two forms, flower, down, clear, report and save passed');
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8946/');
 await wait(()=>window.lab?.frame);
 const earned=earnedFile&&await openEarnedSave();
 if(expectedWins)await verifyEarnedRestore(earned);
 else await fightAndReport(earned);
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.hp]),returns:f?.returns,
  stages:await page.evaluate(()=>window.raidenLog),errors});
 await page.screenshot({path:prefix+'-failure.png'});
 throw error;
}finally{
 await browser.close();
}
