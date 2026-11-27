import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg,timeout=78000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix=(process.env.LAB_WEEKLY_EVIDENCE || 'evidence')+'/gate-weekly';
const miss=process.env.LAB_GATE_LURE==='miss';
const hub='mond-town',node='mond-gate-chess-court',quest='gate-weekly-commission',id='boss-29122000';
const errors=[];
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const bytes=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(bytes,'base64'));
 return bytes;
}
const mode=m=>page.evaluate(m=>{window.gateMode=m},m);

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8952/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/gate-weekly-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(hub=>window.lab.frame.story?.node===hub,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(n=>window.lab.frame.storyNearbyPortal?.to===n&&window.lab.frame.storyNearbyPortal.available,node);}
 finally{await page.keyboard.up('KeyD');}
 await page.keyboard.press('KeyF');
 await wait(n=>window.lab.frame.story.node===n,node);
 const scenery=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scenery.key,scenery.state],['gateCourt','ready']);

 await page.evaluate(miss=>{
  const keys=new Set();
  window.gateMode='front';
  window.gateStages=[];
  let jumped=false;
  function key(code,on){
   if(keys.has(code)===on)return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.gate;
   let left=false,right=false,attack=false,jump=false;
   if(v?.bodies?.length&&!f.paused&&b.phase!=='respawn'){
    if(window.gateStages.at(-1)!==v.stage)window.gateStages.push(v.stage);
    const a=f.actors[f.active-1],mode=window.gateMode;
    let goal=a.x,target;
    if(v.card==='WT03')goal=738;
    else if(mode==='front'&&v.stage!=='royal'){
     if(v.card==='WT09')goal=84;
     else target=v.bodies.find(e=>e.damageable);
    }else if(mode==='frost')goal=84;
    else if(mode==='lure'){
     goal=miss?437:686;
     if(v.run?.t>=237&&v.run?.t<284){jump=true;jumped=true}
     if(jumped&&v.exposure)goal=a.x;
    }else if(mode==='takeKing')target=v.bodies.find(e=>e.kind==='king'&&e.damageable);
    else if(mode==='finish'){
     const living=v.bodies.filter(e=>e.damageable).sort((a,b)=>a.hp-b.hp);
     target=living[0];
    }
    if(target){
     goal=Math.max(58,target.x-(mode==='takeKing'?105:74));
     const dx=target.x-a.x;
     if(Math.abs(goal-a.x)<11&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*23;
     attack=Math.abs(dx)<112&&Math.sign(dx)===a.dir;
     if(mode==='takeKing')attack&&=a.x<target.x-87;
    }
    left=goal<a.x-10;right=goal>a.x+10;
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);key('Space',jump);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },miss);
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.pawns?.length===3);
 await page.locator('.game').screenshot({path:prefix+'-pawns.png'});
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.card==='WT17');
 const started=await frame();
 assert.deepEqual(started.events.filter(e=>e.kind==='gate:WT04:pawn').map(e=>e.value),[2,1,0]);
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const royal=await frame();
 assert.ok(royal.draws.some(d=>d.source==='gate-weekly-king-source-v1.png'));
 assert.ok(royal.draws.some(d=>d.source==='gate-weekly-queen-source-v1.png'));
 const png=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>14000);
 const standard=await frame(),normal=await capture('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.7,standard.commands);
 const reduced=await frame(),light=await capture('light');
 assert.deepEqual([standard.t,reduced.t],[royal.t,royal.t]);
 assert.deepEqual(reduced.weeklyBoss,royal.weeklyBoss);
 assert.equal(new Set([png,normal,light]).size,3);

 async function packing(packed, change){
  const pending=page.waitForResponse(res=>{
   if(!res.url().endsWith('/api/frame'))return false;
   const request=res.request().postDataJSON();
   return request?.profile==='h48c32'&&request.packRectArt===packed;
  });
  await change();
  const response=await pending;
  assert.ok(response.ok());
  assert.equal(response.headers()['content-encoding'],'gzip');
  const snapshot=await response.json();
  await wait(n=>window.lab.frame.draws.length===n,snapshot.draws.length);
  return {snapshot,raster:await canvas.evaluate(el=>el.toDataURL()),gzipBytes:Number(response.headers()['content-length'])};
 }
 const expanded=await packing(false,()=>page.locator('#renderMode').selectOption('h48c32'));
 const grouped=await packing(true,()=>page.locator('#packRectArt').check());
 const bodies=royal.draws.filter(d=>d.source?.startsWith('gate-weekly-'));
 assert.equal(bodies.length,2);
 for(const body of bodies){
  const batch=grouped.snapshot.draws.find(d=>d.kind==='rect_runs'&&d.h===body.h&&
   Math.abs(d.w-body.w)<1e-6&&Math.abs(d.y+d.h-body.y)<1e-6);
  assert.ok(batch&&grouped.snapshot.rectBatches[batch.batch-1].length);
 }
 assert.equal(grouped.snapshot.t,expanded.snapshot.t);
 assert.ok(grouped.gzipBytes<expanded.gzipBytes&&grouped.gzipBytes>0);
 assert.equal(grouped.raster,expanded.raster);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.commands<500);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyGate').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await mode('frost');
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.nearFrost===1);
 await page.keyboard.down('KeyG');
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.freeze===50);
 await page.keyboard.up('KeyG');
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.releaseRequired===false,null,8000);
 const frostButton=page.locator('#weeklyGateFrost');
 await frostButton.scrollIntoViewIfNeeded();
 const box=await frostButton.boundingBox();
 assert.ok(box);
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();
 await wait(()=>window.lab.frame.weeklyBoss?.gate?.freeze===100,null,10000);
 await page.mouse.up();
 const frozen=await frame();
 assert.equal(frozen.weeklyBoss.gate.card,'WT17');
 assert.deepEqual(frozen.events.filter(e=>e.kind==='gate:WT20:complete').map(e=>e.value),[50,100]);
 await canvas.click();
 await mode('lure');
 await wait(miss=>{
  const goal=window.lab.frame.weeklyBoss?.gate?.run?.goal;
  return goal!==undefined&&(miss?goal<612:goal>=612);
 },miss);
 await page.locator('.game').screenshot({path:prefix+'-lure.png'});
 const hint=page.locator('#weeklyGateHint');
 if(miss){
  await wait(()=>window.lab.frame.weeklyBoss?.gate?.tsunamiDamage>0);
  const hit=await frame();
  assert.equal(hit.weeklyBoss.gate.tsunamiDamage,90);
  assert.equal(hit.events.filter(e=>e.kind==='gate:WT17:collision').length,0);
  assert.equal(await hint.textContent(),'津波が命中 ｜ 90ダメージ');
  await page.locator('.game').screenshot({path:prefix+'-tsunami.png'});
 }else{
  await wait(()=>window.lab.frame.weeklyBoss?.gate?.exposure>0);
  const exposed=await frame();
  assert.equal(exposed.events.filter(e=>e.kind==='gate:WT17:collision').length,1);
  assert.ok(exposed.weeklyBoss.gate.bodies.every(e=>e.damageable));
  assert.match(await hint.textContent(),/津波を中断.+反撃できる時間/);
  await page.locator('.game').screenshot({path:prefix+'-exposed.png'});
 }
 await mode('takeKing');
 await wait(()=>window.lab.frame.events.some(e=>e.kind==='gate:WT19:transfer'));
 const revived=await frame();
 assert.ok(revived.events.find(e=>e.kind==='gate:WT19:transfer').value>0);
 const transfer=await hint.textContent();
 assert.match(transfer,/クイーンからキングへ \d+ HP/);
 await mode('finish');
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const finished=await frame();
 assert.equal(finished.endgame.bosses[id].clears,1);
 assert.equal(finished.story.quests[quest].count,1);
 assert.equal(finished.returns,0);
 const stages=await page.evaluate(()=>window.gateStages);
 assert.deepEqual(stages,['king','queen','finish','royal']);
 await page.getByRole('button',{name:'拠点へ：モンド・城門広場',exact:true}).click();
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
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({scenery,stages,pawnsPerCharge:[2,1,0],keyboardAndPointerFrost:true,
  actualPositionAndCollision:!miss,tsunamiDamage:miss?90:0,transfer,
  reviveTransfer:revived.events.find(e=>e.kind==='gate:WT19:transfer').value,
  transferCompression:{twoSpriteBatches:true,canvasIdentical:true,plainGzipBytes:expanded.gzipBytes,packedGzipBytes:grouped.gzipBytes},
  clearReportRestore:true,viewport390:true,commands:{png:royal.commands,standard:standard.commands,light:reduced.commands},errors},null,2)+'\n');
 console.log('Gate Chrome:',miss?'miss and tsunami':'collision and exposure','pawns, frost, two packed sprites, transfer, report and save passed');
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp]),
  stages:await page.evaluate(()=>window.gateStages),events:f?.events?.filter(e=>e.kind.startsWith('gate:')).slice(-24),
  status:await page.locator('#status').textContent(),errors},null,2));
 await page.screenshot({path:'work/gate-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
