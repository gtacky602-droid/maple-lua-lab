import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:80000});
const canvas=page.locator('#game'),controls=page.locator('#weeklyShouki');
const prefix=process.env.SHOUKI_OUTPUT||'evidence/shouki-weekly-floor-contact';
const regressionPrefix=process.env.SHOUKI_OUTPUT||'work/shouki-weekly-floor-contact';
const timeoutRoute=process.env.LAB_SHOUKI_TRIAL==='timeout';
const hub='sumeru-hub',node='shouki-godmaking-arena',quest='shouki-weekly-commission',id='boss-29070101';
const errors=[];
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const raw=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 const output=name.startsWith('upper-')?prefix:regressionPrefix;
 await fs.writeFile(output+'-'+name+'.png',Buffer.from(raw,'base64'));
 return raw;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9049/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/shouki-weekly-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const row=page.locator(`[data-quest="${quest}"]`);
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);}
 finally{await page.keyboard.up('KeyD');}
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
 await page.evaluate(()=>window.lab.action('pause'));
 await wait(()=>window.lab.frame.paused);
 const scene=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['godmakingHall','ready']);
 const opening=await frame();
 assert.deepEqual(opening.weeklyBoss.phaseHp.map(v=>v.max),[590,1040]);
 const upperParts=opening.draws.filter(d=>d.source==='shouki-idle-source-v1.png');
 assert.equal(upperParts.length,1);
 const [upper]=upperParts;
 assert.deepEqual(upper.box,[87,14,868,723]);
 assert.equal(upper.h,1160);
 assert.equal(upper.y,480);
 assert.ok(opening.actors.every(a=>a.y===480));
 assert.ok(upper.y-upper.h<0);
 assert.ok(upper.x-upper.w/2<0&&upper.x+upper.w/2>960);
 assert.equal(opening.draws[0],upper);
 assert.equal(opening.draws.filter(d=>d.kind==='text'&&['炎','風','雷A','水','氷','雷B'].includes(d.text)&&d.y<540).length,6);
 await page.locator('.game').screenshot({path:prefix+'-upper.png'});
 const upperPng=await capture('upper-png');
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.draws[0]?.kind==='rect');
 const upperStandard=await frame(),upperRect=await capture('upper-standard');
 const upperRaw=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
 const upperIndexed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
 assert.equal(upperRaw.raster,upperIndexed.raster);
 const upperLight=upperRaw.snapshot,packedTorso=upperIndexed.snapshot.draws[0];
 assert.equal(packedTorso.kind,'rect_runs');
 assert.equal(packedTorso.y+packedTorso.h,480);
 assert.ok(packedTorso.palette.length>0&&upperIndexed.gzipBytes<upperRaw.gzipBytes);
 const upperReduced=await capture('upper-light');
 assert.equal(new Set([upperPng,upperRect,upperReduced]).size,3);
 for(const rendered of [upperStandard,upperLight]){
  assert.equal(rendered.t,opening.t);
  assert.ok(rendered.draws[0].y<0);
 }
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.draws[0]?.kind==='boss_sprite');
 await page.evaluate(()=>window.lab.action('pause'));
 await wait(()=>!window.lab.frame.paused);
 await canvas.click();
 await page.evaluate(timeoutRoute=>{
  const held=new Set();
  let lastClick=-10,lastDodge=-10;
  function key(code,on){
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function button(selector,t){
   const el=document.querySelector(selector);
   if(el&&!el.disabled&&t-lastClick>.18){lastClick=t;el.click();}
  }
  const list=v=>Array.isArray(v)?v:[];
  function run(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0],v=b?.shouki;
   if(!v||b.phase==='respawn'||f.returns){
    for(const code of [...held])key(code,false);
    return;
   }
   if(f.paused){
    for(const code of [...held])key(code,false);
   }else{
    const nearest=items=>items.slice().sort((l,r)=>Math.abs(l.x-a.x)-Math.abs(r.x-a.x))[0];
    let goal=a.x,target;
    if(b.shoukiStage==='p1'){
     if(window.shoukiMain)target=b.x;
     else goal=v.charge<100?nearest(list(v.blocks))?.x??145:393;
    }else if(b.shoukiStage==='p2'){
     if(!window.shoukiRealShot)goal=v.charge<100?nearest(list(v.blocks))?.x??235:a.x;
     else if(v.charge<100&&list(v.blocks).length>0&&v.shield>0)goal=nearest(list(v.blocks)).x;
     else if(!window.shoukiTimedOut||window.shoukiFinish||b.hp===b.phaseHp[1].max)target=b.x;
    }else if(b.shoukiStage==='trial'){
     if(!timeoutRoute||window.shoukiTimedOut||v.trialLeft>2)target=nearest(list(v.targets))?.x;
    }else if(b.shoukiStage==='collapse'&&b.damageable&&window.shoukiFinish)target=b.x;
    if(target!==undefined)goal=target+(a.x<target?-65:65);
    const delta=goal-a.x,dx=target===undefined?0:target-a.x;
    const move=Math.abs(delta)>7?Math.sign(delta):dx*a.dir<0?Math.sign(dx):0;
    key('KeyA',move<0);key('KeyD',move>0);
    key('KeyJ',target!==undefined&&Math.abs(dx)<106&&dx*a.dir>=0);
    if(window.shoukiRealShot&&(b.shoukiStage==='p2'||b.shoukiStage==='trial')){
     if(v.canAim)button('#weeklyShoukiAction',f.t);
     if(v.aim&&!v.aim.fired&&!v.aim.confirmed)button('[data-action="encounter_confirm"]',f.t);
    }
    const danger=list(b.warnings).some(w=>w.starts-b.moveTick<=7&&w.starts-b.moveTick>=2
     &&a.x>w.lo&&a.x<w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
    if(danger&&f.t-lastDodge>=2.2&&v.charge<100&&!v.aim){
     lastDodge=f.t;window.lab.action('dodge');
    }
   }
   requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
 },timeoutRoute);
 await wait(()=>window.lab.frame.weeklyBoss?.shouki.device?.id==='left'&&window.lab.frame.weeklyBoss.shouki.charge===100);
 await page.keyboard.press('KeyH');
 await wait(()=>window.lab.frame.weeklyBoss?.shouki.left);
 await page.evaluate(()=>{window.shoukiMain=true;});
 await wait(()=>window.lab.frame.weeklyBoss?.shouki.canAim);
 const armored=await frame();
 const torso=armored.draws.find(d=>d.source==='shouki-idle-source-v1.png');
 assert.ok(torso?.h===1160&&torso.y===480&&torso.y-torso.h<0);
 assert.ok(armored.weeklyBoss.shouki.core.exposed);
 assert.ok(Math.abs(armored.weeklyBoss.shouki.core.y-(480-1160*113/723))<0.001);
 assert.ok(armored.weeklyBoss.shouki.core.y>21);
 assert.equal(await controls.locator('#weeklyShoukiHint').textContent(),'端末で胸部を照準');
 await page.locator('.game').screenshot({path:regressionPrefix+'-armored.png'});
 assert.ok(await controls.locator('#weeklyShoukiArmor').isVisible());
 await page.keyboard.press('KeyH');
 await wait(()=>window.lab.frame.weeklyBoss?.shouki.aim&&!window.lab.frame.weeklyBoss.shouki.aim.confirmed);
 await controls.getByRole('button',{name:'左',exact:true}).click();
 await wait(()=>window.lab.frame.weeklyBoss?.shouki.aim?.target==='left');
 await page.keyboard.press('Escape');
 await wait(()=>!window.lab.frame.weeklyBoss?.shouki.aim&&window.lab.frame.weeklyBoss.shouki.charge===100);
 await page.keyboard.press('KeyH');
 await wait(()=>window.lab.frame.weeklyBoss?.shouki.aim?.target==='core');
 await page.keyboard.press('KeyH');
 await wait(()=>window.lab.frame.events.some(e=>e.kind==='shouki:WN14:guard-hit'));
 await page.evaluate(()=>{window.shoukiRealShot=true;});
 await wait(()=>window.lab.frame.weeklyBoss?.shouki.targets.length===4);
 const trial=await frame();
 assert.ok(trial.draws.some(d=>d.source==='shouki-idle-source-v1.png'&&d.h===1160&&d.y===480));
 assert.equal(trial.weeklyBoss.shouki.core.exposed,false);
 assert.ok(Math.abs(trial.weeklyBoss.shouki.core.y-(480-1160*113/723))<0.001);
 assert.ok(trial.weeklyBoss.shouki.core.y>21&&trial.weeklyBoss.shouki.targets.every(p=>p.y===480&&p.x>0&&p.x<960));
 await page.locator('.game').screenshot({path:regressionPrefix+'-trial.png'});
 let timeoutResult;
 if(timeoutRoute){
  await wait(()=>{
   const f=window.lab.frame;
   const result=f.weeklyBoss?.shouki?.trialResult;
   if(f.paused||result?.kind!=='timeout'||result.damage===undefined)return false;
   window.lab.action('pause');return true;
  });
  await wait(()=>window.lab.frame.paused);
  const failed=await frame();
  assert.deepEqual(failed.weeklyBoss.shouki.trialResult,{kind:'timeout',remainingPods:2,damage:72,resumed:false});
  await wait(()=>document.querySelector('#weeklyShoukiHint').textContent.includes('72ダメージ'));
  timeoutResult={pulse:failed.weeklyBoss.shouki.trialResult,hud:await controls.locator('#weeklyShoukiHint').textContent()};
  await page.locator('.game').screenshot({path:regressionPrefix+'-timeout.png'});
  await page.evaluate(()=>{window.shoukiTimedOut=true;});
  await canvas.click();
  await page.keyboard.press('KeyP');
  await wait(()=>window.lab.frame.weeklyBoss?.shouki?.trialResult?.resumed&&window.lab.frame.weeklyBoss.damageable);
  assert.equal((await frame()).weeklyBoss.shouki.shield,0);
  timeoutResult.resumedArmor=0;
  await wait(()=>window.lab.frame.weeklyBoss?.shoukiStage==='p2'&&window.lab.frame.weeklyBoss.hp<1040);
  timeoutResult.resumedDamage=true;
 }
 await wait(()=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  if(f.paused||!b?.shouki.exposure||b.shoukiStage!=='collapse')return false;
  window.lab.action('pause');
  return true;
 });
 await wait(()=>window.lab.frame.paused);
 const down=await frame();
 assert.ok(down.weeklyBoss.damageable&&down.weeklyBoss.shouki.exposure>=590);
 assert.ok(down.draws.some(d=>d.source==='shouki-idle-source-v1.png'&&d.h===1160&&d.y===480));
 assert.ok(down.events.some(e=>e.kind==='shouki:WN14:core-hit'));
 assert.equal(down.events.filter(e=>e.kind==='shouki:WN15:destroyed').length,timeoutRoute?6:4);
 await wait(()=>document.querySelector('#weeklyShoukiHint').textContent.includes('胸部に命中'));
 assert.ok(await page.locator('#status').evaluate(el=>!el.classList.contains('error')));
 await page.locator('.game').screenshot({path:regressionPrefix+'-exposure.png'});
 const png=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame(),normal=await capture('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.7,standard.commands);
 const light=await frame(),reduced=await capture('light');
 assert.equal(new Set([png,normal,reduced]).size,3);
 assert.deepEqual([light.t,standard.t,light.weeklyBoss.hp],[down.t,down.t,down.weeklyBoss.hp]);
 await page.locator('#renderMode').selectOption('sprite');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await controls.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await page.evaluate(()=>{window.shoukiFinish=true;});
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>!window.lab.frame.paused);
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const finished=await frame();
 assert.equal(finished.returns,0);
 assert.equal(finished.endgame.bosses[id].clears,1);
 assert.equal(finished.story.quests[quest].count,1);
 await page.getByRole('button',{name:'拠点へ：スメール・樹陰の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({entry:true,manualMatrix:true,twoPhases:true,
  reservedAndCancelled:true,keyboardTerminal:true,terminalHitArmor:true,manualTrialParts:timeoutRoute?6:4,
  terminalHitCore:true,exposureTicks:down.weeklyBoss.shouki.exposure,timeoutResult,
  art:{upper:upper.h,upperWidth:upper.w,torsoSourceEnd:737,torsoBottom:upper.y,floor:480,waistClearance:480-upper.y,armored:torso.h,trial:1160,collapse:1160,
   upperLeft:upper.x-upper.w/2,upperTop:upper.y-upper.h,armoredTop:torso.y-torso.h,
   machineBehindParty:true,shieldCore:armored.weeklyBoss.shouki.core,trialCore:trial.weeklyBoss.shouki.core},
  clearReportRestore:true,remainingHp:finished.actors[0].hp,viewport390:true,scene,
  upperCommands:{png:opening.commands,standard:upperStandard.commands,light:upperLight.commands},
  upperTransfer:{rawGzip:upperRaw.gzipBytes,packedGzip:upperIndexed.gzipBytes,pixelMatch:true},
  commands:{png:down.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Shouki Chrome: matrix, terminal controls, four parts, collapse, clear, report and save passed');
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp]),returns:f?.returns,
  events:f?.events?.filter(e=>e.kind.startsWith('shouki:')).slice(-18),status:await page.locator('#status').textContent(),errors});
 await page.screenshot({path:regressionPrefix+'-test-failure.png'});
 throw error;
}finally{
 await browser.close();
}
