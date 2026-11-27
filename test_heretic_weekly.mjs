import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='sumeru-hub',arena='sumeru-heretic-lattice',quest='heretic-weekly-commission',id='boss-29150101';
const prefix=(process.env.LAB_WEEKLY_EVIDENCE || 'evidence')+'/heretic-weekly',canvas=page.locator('#game'),errors=[];
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

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8954/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/heretic-weekly-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 if(route!=='interrupt'){
  const allyFire=page.locator('#allyFire');
  if(await allyFire.getAttribute('aria-pressed')!=='true')await allyFire.click();
 }
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await canvas.click();
 const toward=(await frame()).actors[0].x<222?'KeyD':'KeyA';
 await page.keyboard.down(toward);
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,arena,15000);}
 finally{await page.keyboard.up(toward);}
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,arena);
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
 assert.equal(changing.kills,0);
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
 await page.locator('#renderMode').selectOption('h32c16');
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
 await mode(route==='expire-closed'?'wait':'trial');
 await page.keyboard.press('KeyP');
 const hint=page.locator('#weeklyHeretic');
 const trial={route,deadline:original.weeklyBoss.heretic.deadline};
 if(route!=='expire-closed'){
  await wait(()=>window.lab.frame.weeklyBoss?.heretic.open);
  if(route!=='interrupt')await mode('wait');
  const opened=await frame();
  assert.equal(opened.weeklyBoss.heretic.deadline,1800);
  assert.equal(opened.weeklyBoss.heretic.anchors.length??0,0);
  assert.match(await hint.textContent(),/結合点を破壊/);
  await page.locator('.game').screenshot({path:prefix+'-chant.png'});
 }
 if(route==='interrupt'){
  await wait(()=>window.lab.frame.weeklyBoss?.heretic.exposure>0);
  const staggered=await frame();
  trial.acceptedChantHits=staggered.events.filter(e=>e.kind==='heretic:WH13:chant').length;
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
 assert.equal(done.endgame.bosses[id].clears,1);
 assert.equal(done.story.quests[quest].count,1);
 assert.equal(done.returns,0);
 const cards=await page.evaluate(()=>window.hereticCards);
 for(const card of ['WH10','WH11','WH13',route==='interrupt'?'WH19':'WH18'])assert.ok(cards.includes(card),card);

 await page.getByRole('button',{name:'拠点へ：スメール・樹陰の広場',exact:true}).click();
 await wait(node=>window.lab.frame.story.node===node,hub);
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
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,cards,trial,
  acceptedChantHits:trial.acceptedChantHits??0,deadline:trial.deadline,
  clearReportRestore:true,viewport390:true,commands:perMode,errors},null,2)+'\n');
 console.log('Heretic Chrome:',route,'two forms, trial, defeat, report, and save passed');
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
