import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:95000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/apep-weekly';
const outside=process.env.LAB_APEP_DOME==='outside';
const hub='sumeru-hub',node='apep-oasis-heart-arena',quest='apep-weekly-commission',id='boss-29080101';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function capture(name){
 const raw=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(raw,'base64'));
 return raw;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8948/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/apep-weekly-gear.json','utf8'));
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
 const scene=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['oasisHeart','ready']);
 const opening=await frame();
 assert.deepEqual(opening.weeklyBoss.phaseHp.map(v=>v.max),[560,1020]);
 assert.equal(opening.draws[0].source,'apep-dark-idle-source-v1.png');
 await page.locator('.game').screenshot({path:prefix+'-dark.png'});
 await canvas.click();
 await page.evaluate(outside=>{
  const held=new Set();
  const arr=v=>Array.isArray(v)?v:[];
  let lastJump=-10,lastDodge=-10,retreat=145;
  let lastFailure=0;
  let exitX;
  window.apepStages=[];
  window.apepFailures=0;
  function key(code,on){
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function run(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.apep,a=f.actors[0];
   if(!v||b.phase==='respawn'||f.returns){
    for(const code of [...held])key(code,false);
    return;
   }
   if(window.apepStages.at(-1)?.stage!==b.apepStage)window.apepStages.push({stage:b.apepStage,t:f.t,hp:b.hp});
   if(f.paused){
    for(const code of [...held])key(code,false);
   }else{
    let goal=a.x,enemy;
    if(b.apepStage==='dark'&&b.damageable)enemy=b.x;
    if(b.apepStage==='defense'){
     const score=e=>Math.abs(a.x-e.x)+(e.role==='breeder'&&e.shell>0?135:0)
      -(e.role==='warden'?95:e.role==='burst'?185:0)-Math.max(0,190-Math.abs(480-e.x))*.45;
     const unit=arr(v.units).filter(e=>!e.guarded).sort((l,r)=>score(l)-score(r))[0];
     if(unit)enemy=unit.x;
     else goal=480;
    }
    if(b.apepStage==='failed'&&f.t-lastFailure>1){
     lastFailure=f.t;window.apepFailures++;
     document.querySelector('#weeklyApepRetry').click();
    }
    if(b.apepStage==='prime'&&!window.apepFinish){
     if(Math.abs(a.x-retreat)<11&&Math.abs(a.x-b.x)<194)retreat=960-retreat;
     goal=retreat;
    }
    if(b.apepStage==='shelter'){
     const nearest=arr(v.domes).slice().sort((l,r)=>Math.abs(a.x-l.x)-Math.abs(a.x-r.x))[0];
     if(outside&&b.moveTick>=427){
      exitX??=nearest.x+(nearest.x>480?-112:112);
      goal=exitX;
     }else goal=a.y<416?480:nearest.x;
    }
    if((b.apepStage==='weak'||b.apepStage==='prime')&&window.apepFinish&&b.damageable)enemy=b.x;
    if(enemy!==undefined)goal=enemy+(a.x<enemy?-62:62);
    const dx=enemy===undefined?0:enemy-a.x,delta=goal-a.x;
    const move=Math.abs(delta)>7?Math.sign(delta):dx*a.dir<0?Math.sign(dx):0;
    key('KeyA',move<0);key('KeyD',move>0);
    key('KeyJ',enemy!==undefined&&Math.abs(dx)<120&&dx*a.dir>=0);
    if(arr(v.walls).some(w=>Math.abs(a.x-w.x)<60&&Math.sign(w.x-a.x)===move)&&a.ground&&f.t-lastJump>.65){
     lastJump=f.t;window.lab.action('jump');
    }
    key('Space',f.t-lastJump<.65);
    const danger=arr(b.warnings).some(w=>w.at-b.moveTick<=7&&w.at-b.moveTick>=2
     &&a.x>w.lo&&a.x<w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
    if(danger&&f.t-lastDodge>=2.15&&b.apepStage!=='shelter'){
     lastDodge=f.t;window.lab.action('dodge');
    }
   }
   requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
 },outside);
 await wait(()=>{
  const f=window.lab.frame;
  if(f.paused || !(f.weeklyBoss?.apep.units?.length>=3))return false;
  window.lab.action('pause');return true;
 });
 await wait(()=>window.lab.frame.paused);
 assert.ok(await page.locator('#weeklyApepProgress').isVisible());
 assert.ok(await page.locator('#fieldBossHp').isHidden());
 assert.ok(new Set((await frame()).weeklyBoss.apep.units.map(unit=>unit.x)).size>=3);
 await page.locator('.game').screenshot({path:prefix+'-defense.png'});
 const defense=await frame();
 const units=defense.weeklyBoss.apep.units.map(u=>[u.id,u.x,u.role]);
 const meter=defense.draws.find(d=>d.kind==='rect' && d.color==='#f3df8e');
 assert.equal(meter.w,Math.floor(54*defense.weeklyBoss.apep.progress/defense.weeklyBoss.apep.max));
 const defenseRaw=await capture('defense-original');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(()=>window.lab.frame.draws.some(draw=>draw.kind==='rect_runs'&&draw.h===44));
 const defenseLight=await frame();
 assert.notEqual(defenseRaw,await capture('defense-16colors'));
 assert.equal(defenseLight.t,defense.t);
 assert.deepEqual(defenseLight.weeklyBoss.apep.units.map(u=>[u.id,u.x,u.role]),units);
 assert.deepEqual(defenseLight.draws.find(d=>d.kind==='rect' && d.color==='#f3df8e'),meter);
 const defenseComparison={t:defense.t,units,progress:defense.weeklyBoss.apep.progress,meterWidth:meter.w,
  commands:{png:defense.commands,light:defenseLight.commands}};
 await page.locator('#renderMode').selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,defense.commands);
 await canvas.click();await page.keyboard.press('KeyP');

 await wait(outside=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  const pulse=b?.apep?.finalPulse;
  if(f.paused||b?.apepStage!=='shelter'||pulse?.protected!==!outside)return false;
  window.lab.action('pause');
  return true;
 },outside);
 await wait(()=>window.lab.frame.paused);
 const dome=await frame();
 assert.equal(dome.weeklyBoss.apep.domes.filter(d=>d.open).length,3);
 assert.equal(dome.draws[0].source,'apep-prime-idle-source-v1.png');
 const pulse=dome.weeklyBoss.apep.finalPulse;
 assert.equal(pulse.protected,!outside);
 assert.equal(pulse.damage,outside?54:0);
 assert.deepEqual(dome.events.filter(e=>e.kind==='apep:WP17:protected'&&e.actor===1).map(e=>e.value),
  outside?[1,2,3]:[1,2,3,4]);
 const hint=page.locator('#weeklyApepHint');
 await wait(outside=>document.querySelector('#weeklyApepHint').textContent.includes(
  outside?'54ダメージ':'ドームで最後の余波を防いだ'),outside);
 const pulseText=await hint.textContent();
 assert.ok(await page.locator('#status').evaluate(el=>!el.classList.contains('error')));
 await page.locator('.game').screenshot({path:prefix+'-dome.png'});
 const raw=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>1000&&!window.lab.frame.draws.some(draw=>draw.kind==='rect_runs'));
 const standard=await frame(),standardImage=await capture('standard');
 const lightRaw=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
 const lightPacked=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
 assert.equal(lightRaw.raster,lightPacked.raster);
 assert.ok(lightPacked.gzipBytes<lightRaw.gzipBytes);
 assert.ok(lightPacked.snapshot.draws.some(draw=>draw.kind==='rect_runs'&&draw.h===222));
 const light=lightPacked.snapshot,lightImage=await capture('light');
 assert.equal(new Set([raw,standardImage,lightImage]).size,3);
 assert.deepEqual([light.t,standard.t,light.weeklyBoss.hp],[dome.t,dome.t,dome.weeklyBoss.hp]);
 await page.locator('#renderMode').selectOption('sprite');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyApep').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.weeklyBoss?.apep.exposure>=470);
 assert.deepEqual((await frame()).weeklyBoss.apep.finalPulse,pulse);
 await page.evaluate(()=>{window.apepFinish=true;});
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const finished=await frame();
 assert.equal(finished.returns,0);
 assert.equal(finished.endgame.bosses[id].clears,1);
 assert.equal(finished.story.quests[quest].count,1);
 const phases=await page.evaluate(()=>window.apepStages.map(e=>e.stage));
 assert.deepEqual([...new Set(phases)].filter(p=>p!=='failed'),['dark','expose','defense','rebirth','prime','shelter','weak']);
 const defenseRetries=await page.evaluate(()=>window.apepFailures);
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
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({entered:true,phases,defenseRetries,defenseComparison,
  finalPulse:pulse,pulseText,eightSecondOpening:true,clearReportRestore:true,remainingHp:finished.actors[0].hp,
  transfer:{rawGzip:lightRaw.gzipBytes,packedGzip:lightPacked.gzipBytes,pixelMatch:true},
  viewport390:true,scene,commands:{png:dome.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log(`Apep Chrome (${outside?'outside':'covered'}): defense, final pulse, recovery, report and save passed`);
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp]),returns:f?.returns,
  events:f?.events?.filter(e=>e.kind.startsWith('apep:')).slice(-20),stages:await page.evaluate(()=>window.apepStages),
  status:await page.locator('#status').textContent(),errors});
 await page.screenshot({path:prefix+'-failure.png'});
 throw error;
}finally{
 await browser.close();
}
