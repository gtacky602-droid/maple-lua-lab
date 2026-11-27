import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {holdPortalFrame} from './tools/browser_waypoint_test.mjs';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:70000});
const canvas=page.locator('#game');
const prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/signora-weekly';
const route=process.env.LAB_SIGNORA_RELEASE||'';
assert.ok(['','release','passive'].includes(route));
const node='signora-ten-shrine-arena',hub='inazuma-town',quest='signora-weekly-commission',id='boss-29050101';
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

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8945/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile(route?'work/signora-weekly-route-gear.json':'work/signora-weekly-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const row=page.locator(`[data-quest="${quest}"]`);
 if(route){
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);}
 finally{await page.keyboard.up('KeyD');}
 const releaseOpening=await holdPortalFrame(page);
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
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
  await page.keyboard.down('KeyG');
  try{await wait(()=>window.lab.frame.weeklyBoss.devices[0]>0);}
  finally{await page.keyboard.up('KeyG');}
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
  }else{
   assert.equal(result,undefined);
   assert.equal(fireFloor.length,2);
   assert.equal(rain.weeklyBoss.devices[0],0);
  }
  fireResult={route,temperature:rain.weeklyBoss.temperature,release:result,fireFloor:fireFloor.length,
   hud:await page.locator('#weeklyDevices').textContent()};
  await page.locator('.game').screenshot({path:prefix+'-fire-floor.png'});
  await resume();
  await freeze('pyro','WS14',420);
  await wait(()=>document.querySelector('#fieldBossLabel').textContent.includes('反撃の隙'));
  await page.evaluate(()=>{window.signoraFinish=true});
  await resume();
  await page.locator('#allyFire').click();
  await wait(()=>!window.lab.frame.holdAllyFire);
  await canvas.click();
 }
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const defeated=await frame();
 assert.equal(defeated.returns,0);
 assert.equal(defeated.endgame.bosses[id].clears,1);
 assert.equal(defeated.story.quests[quest].count,1);
 await page.getByRole('button',{name:'拠点へ：稲妻・城下の広場',exact:true}).click();
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
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({entry:true,deviceKeyboardHold:route!=='passive',cocoonAndPyro:true,
  normalKeyBattleAndReport:true,savedRespawn:true,remainingHp:defeated.actors[0].hp,viewport390:true,scene,
  sealResult,fireResult,transfer:{rawGzip:unpacked.gzipBytes,packedGzip:packed.gzipBytes,pixelMatch:true},
  sameStateCommands:{png:pyro.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log(`Signora Chrome (${route||'default'}): quest, portal, cocoon, two forms, clear and save passed`);
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.hp]),returns:f?.returns,errors});
 await page.screenshot({path:prefix+'-failure.png'});
 throw error;
}finally{
 await browser.close();
}
