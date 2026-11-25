import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {checkWeeklyAtlas} from './tools/browser_weekly_atlas.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:85000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/narwhal-weekly';
const hub='fontaine-hub',outer='narwhal-star-sea',inner='narwhal-inner-echo';
const quest='narwhal-weekly-commission',id='boss-29090101';
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

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8949/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/narwhal-weekly-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const row=page.locator(`[data-quest="${quest}"]`);
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='active',quest);
 const atlasEntry=await checkWeeklyAtlas(page,inner,[outer,inner],'戦闘中に移動',prefix+'-atlas-entry.png');
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(outer=>window.lab.frame.storyNearbyPortal?.to===outer&&window.lab.frame.storyNearbyPortal.available,outer);}
 finally{await page.keyboard.up('KeyD');}
 await page.keyboard.press('KeyF');
 await wait(outer=>window.lab.frame.story.node===outer,outer);
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
   if(f.paused){
    for(const code of [...held])key(code,false);
   }else{
    last.eye||=f.events.some(e=>e.kind==='narwhal:WV05:eye-hit'&&e.value===8);
    last.kernel||=f.events.some(e=>e.kind==='narwhal:WV13:kernel-loss');
    let goal=a.x,target;
    if(v.object?.time>0)target=v.object.x;
    else if(b.narwhalStage==='outer'){
     if(window.narwhalFinish&&b.damageable)target=b.x;
     else if(!last.eye)goal=342;
     else if(b.damageable&&v.h<95&&b.hp>b.maxhp*.27)target=b.x;
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
 assert.ok(kernel.weeklyBoss.narwhal.object.time>=290);
 assert.ok(await page.locator('#fieldBossHp').isHidden());
 assert.ok(await page.locator('#status').evaluate(el=>!el.classList.contains('error')));
 await page.locator('.game').screenshot({path:prefix+'-kernel.png'});
 const raw=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame(),normal=await capture('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(count=>window.lab.frame.commands<count*.7,standard.commands);
 const light=await frame(),reduced=await capture('light');
 assert.equal(new Set([raw,normal,reduced]).size,3);
 assert.deepEqual([standard.t,light.t,light.weeklyBoss.hp],[kernel.t,kernel.t,kernel.weeklyBoss.hp]);
 await page.locator('#renderMode').selectOption('sprite');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyNarwhal').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.events.some(e=>e.kind==='narwhal:WV13:kernel-loss'));
 const interrupted=await frame();
 assert.equal(interrupted.events.filter(e=>e.kind==='narwhal:WV11:kernel-hit').length,4);
 assert.equal(interrupted.events.find(e=>e.kind==='narwhal:WV13:kernel-loss').value,190);
 assert.equal(interrupted.weeklyBoss.hp,kernel.weeklyBoss.hp);
 await wait(outer=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  return f.story.node===outer&&b?.narwhal.exposure>=590;
 },outer);
 const returned=await frame();
 assert.equal(returned.weeklyBoss.narwhal.epoch,4);
 assert.equal(returned.events.filter(e=>e.kind==='narwhal:WV14:return-loss').length,1);
 assert.equal(returned.events.find(e=>e.kind==='narwhal:WV14:return-loss').value,440);
 await page.locator('.game').screenshot({path:prefix+'-return.png'});
 await page.evaluate(()=>{window.narwhalFinish=true;});
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const finished=await frame();
 assert.equal(finished.returns,0);
 assert.equal(finished.endgame.bosses[id].clears,1);
 assert.equal(finished.story.quests[quest].count,1);
 const stages=await page.evaluate(()=>window.narwhalStages.map(e=>e.stage));
 assert.deepEqual(stages.slice(0,5),['outer','swallow','inner','expel','weak']);
 await page.getByRole('button',{name:'拠点へ：フォンテーヌ・水辺の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(quest=>window.lab.frame.story?.quests[quest]?.status==='complete',quest);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({stages,outer:open,inner:belly,atlasEntry,atlasReturn,eyeEightHits:true,
  kernelFourCastPhysical:true,kernelLoss:190,returnLoss:440,exposure:returned.weeklyBoss.narwhal.exposure,
  clearReportRestore:true,viewport390:true,remainingHp:finished.actors[0].hp,
  commands:{png:kernel.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Narwhal Chrome: eye, scene switch, corrected kernel, return, clear, report and save passed');
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.atk]),returns:f?.returns,
  events:f?.events?.filter(e=>e.kind.startsWith('narwhal:')).slice(-24),stages:await page.evaluate(()=>window.narwhalStages),
  status:await page.locator('#status').textContent(),errors});
 await page.screenshot({path:'work/narwhal-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
