import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='natlan-hub',arena='natlan-solar-court',quest='stygian-xbalanque-commission';
const prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/stygian-xbalanque',canvas=page.locator('#game'),errors=[];
const takeHits=process.env.LAB_XBALANQUE_CLASH==='hit';
const wait=(fn,arg,timeout=65000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const bytes=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(bytes,'base64'));
 return bytes;
}

async function portal(node,x){
 await canvas.click();
 const toward=(await frame()).actors[0].x<x?'KeyD':'KeyA';
 await page.keyboard.down(toward);
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node,12000);}
 finally{await page.keyboard.up(toward);}
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8957/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/stygian-xbalanque-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await portal(arena,648);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['solarSparringCourt','ready']);
 await wait(()=>document.getElementById('stygianMode').options.length===4);
 await page.locator('#stygianMode').selectOption('extreme');
 assert.ok(await page.locator('#stygianStart').isDisabled());
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption('troupe');
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.endgameRun?.match==='xbalanque');
 assert.equal((await frame()).endgameRun.remaining,undefined);
 await wait(()=>!document.getElementById('stygianBattle').hidden);
 assert.equal(await page.locator('#stygianClock').textContent(),'');
 await capture('arrival');

 await page.evaluate(takeHits=>{
  const held=new Set();
  window.xbTrail={stages:[],cards:[],centralLeft:false,centralRight:false,groundedCentral:true,
   guard:false,punch:false,left:false,right:false};
  window.xbFinishAllowed=false;
  let goalForFinal,beamGoal;
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function leaveZone(area,x){
   const options=[area.left-24,area.right+24].filter(u=>u>=20&&u<=940);
   return options.sort((l,r)=>Math.abs(l-x)-Math.abs(r-x))[0]??x;
  }
  function loop(){
   const f=window.lab.frame,b=f.boss,v=f.endgameRun,d=window.xbTrail;
   let left=false,right=false,attack=false;
   if(v?.match==='xbalanque'&&!f.paused&&v.status==='fighting'){
    if(d.stages.at(-1)!==v.stage)d.stages.push(v.stage);
    if(v.card&&d.cards.at(-1)!==v.card){
     d.cards.push(v.card);goalForFinal=undefined;beamGoal=undefined;
    }
    for(const q of f.draws){
     const name=q.source||'';
     if(name.startsWith('xbalanque-')&&q.h===84&&!q.motionOnly){
      d.guard||=name.includes('guard');d.punch||=name.includes('punch');
      d.left||=name.includes('left');d.right||=name.includes('right');
     }
    }
    const a=f.actors[f.active-1],dx=b.x-a.x;
    let goal=a.x,t=v.tick;
    if(v.card==='XB08'&&t<420){
     if(t>=156&&t<312){
      if(v.safe){
       goal=takeHits?(t<240?v.safe.left-28:v.safe.right+28):480;
       if(t>=228&&t<240)d.centralLeft||=v.safe.inLane;
       if(t>=300&&t<312)d.centralRight||=v.safe.inLane;
       d.groundedCentral&&=a.y>=478;
      }
     }else if(v.locked&&(t<150||t>=330)){
      const index=t<150?1:4;
      const zone=v.areas?.find?.(z=>z.index===index);
      if(zone&&goalForFinal?.index!==index){
       const outside=a.x<zone.left-12||a.x>zone.right+12;
       goalForFinal={index,x:takeHits?Math.max(zone.left+24,Math.min(zone.right-24,a.x)):
        outside?a.x:leaveZone(zone,a.x)};
      }
      goal=goalForFinal?.x??a.x;
     }
    }else if(v.card==='XB04'&&v.phase!=='recover'){
     const z=v.areas?.[0];
     if(v.locked&&z)beamGoal??=(a.x>=z.left-12&&a.x<=z.right+12?leaveZone(z,a.x):a.x);
     goal=beamGoal??a.x;
    }else if(v.card==='XB06'&&v.phase!=='recover'){
     const z=v.areas?.[0];
     if(v.locked&&z)beamGoal??=(a.x>=z.left-12&&a.x<=z.right+12?leaveZone(z,a.x):a.x);
     goal=beamGoal??a.x;
    }else if(v.stage<3&&v.phase!=='enter'&&v.phase!=='phase'||
             v.card==='XB08'&&v.phase==='recover'&&window.xbFinishAllowed){
     goal=b.x-Math.sign(dx||1)*76;
     if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*19;
     attack=Math.abs(dx)<110&&Math.sign(dx)===a.dir&&a.y>422;
    }
    left=goal<a.x-8;right=goal>a.x+8;
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },takeHits);
 await wait(()=>window.lab.frame.endgameRun?.card==='XB04'&&window.lab.frame.endgameRun.tick>=78);
 await capture('beam');
 await wait(()=>window.lab.frame.endgameRun?.card==='XB08'&&window.lab.frame.endgameRun.tick>=123);
 await capture('dash');
 await wait(()=>window.lab.frame.endgameRun?.card==='XB08'&&window.lab.frame.endgameRun.tick>=192);
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame(),png=await capture('png');
 assert.equal(original.endgameRun.card,'XB08');
 assert.equal(original.endgameRun.beat,2);
 assert.ok(original.draws.some(d=>d.source?.startsWith('xbalanque-')&&d.h===84));
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(n=>window.lab.frame.commands>n*5,original.commands);
 const standard=await frame(),rect=await capture('standard');
 const expanded=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
 const light=expanded.snapshot,low=await capture('light');
 assert.ok(light.commands<standard.commands*.7);
 assert.deepEqual([original.t,standard.t,light.t],[original.t,original.t,original.t]);
 assert.deepEqual(original.endgameRun,light.endgameRun);
 assert.equal(new Set([png,rect,low]).size,3);
 const grouped=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
 const packed=grouped.snapshot;
 const body=original.draws.find(d=>d.source?.startsWith('xbalanque-')&&d.h===84);
 const batch=packed.draws.find(d=>d.kind==='rect_runs'&&d.h===body.h&&
  Math.abs(d.w-body.w)<1e-6&&Math.abs(d.y+d.h-body.y)<1e-6);
 assert.ok(batch&&packed.rectBatches[batch.batch-1].length);
 assert.equal(packed.t,light.t);
 assert.ok(grouped.gzipBytes<expanded.gzipBytes);
 assert.equal(grouped.raster,expanded.raster);
 assert.equal(await capture('packed'),low);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(n=>window.lab.frame.commands<n*2,original.commands);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#stygianBattle').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.endgameRun?.card==='XB08'&&window.lab.frame.endgameRun.phase==='recover');
 const opening=await frame();
 const hits=opening.events.filter(e=>e.kind==='stygian:xbalanque:XB08:contact'&&e.actor===1&&e.value>0);
 const finaleDamage=opening.endgameRun.finale.damage;
 assert.deepEqual(hits.map(e=>e.group),takeHits?[1,2,3,4]:[]);
 assert.deepEqual(finaleDamage,takeHits?[49,49,49,49]:[0,0,0,0]);
 const finaleHud=await page.locator('#stygianMechanic').textContent();
 assert.match(finaleHud,takeHits?/被弾 4 \/ 4・計196ダメージ/:/4段の被ダメージなし/);
 await page.locator('.game').screenshot({path:prefix+'-clash-result.png'});
 assert.deepEqual(opening.events.filter(e=>e.kind==='stygian:xbalanque:XB08:window').map(e=>e.tick),[144,228,300,390]);
 const trail=await page.evaluate(()=>window.xbTrail);
 assert.deepEqual([trail.centralLeft,trail.centralRight],[!takeHits,!takeHits]);
 assert.ok(trail.groundedCentral&&trail.guard&&trail.punch);
 assert.deepEqual(trail.stages,[1,2,3]);
 assert.ok(trail.cards.indexOf('XB06')<trail.cards.indexOf('XB08'));
 await page.evaluate(()=>{window.xbFinishAllowed=true});
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const victory=await frame();
 assert.equal(victory.endgame.stygian['xbalanque:normal'].clears,1);
 assert.equal(victory.story.quests[quest].count,1);
 assert.equal(victory.endgameRun.matchReward.mora,2530);
 assert.equal(victory.returns,0);
 await wait(()=>window.lab.frame.endgameRun?.phase==='bow'&&window.lab.frame.endgameRun.tick>=95);
 await capture('bow');
 await page.getByRole('button',{name:'挑戦入口に戻る',exact:true}).click();
 await wait(()=>window.lab.frame.stygianDesk);
 await portal(hub,84);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 assert.deepEqual((await frame()).endgame.stygian['xbalanque:normal'],victory.endgame.stygian['xbalanque:normal']);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,normalClear:true,trail,noCountdown:true,standingEnd:true,
  avoidedAllFinaleWindows:!takeHits,finaleDamage,finaleHud,questReportSaveRestore:true,viewport390:true,
  transferCompression:{profile:'h32c16',canvasIdentical:true,packed:packed.commands,plain:light.commands,
   packedGzipBytes:grouped.gzipBytes,plainGzipBytes:expanded.gzipBytes},
  commands:{png:original.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Xbalanque Chrome:',takeHits?'four hits':'central safe lane','three phases, reward and save passed');
}catch(err){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.boss,run:f?.endgameRun,
  actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),portal:f?.storyNearbyPortal,trail:await page.evaluate(()=>window.xbTrail),
  events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('stygian:xbalanque:')).slice(-28):[],errors},null,2));
 await page.screenshot({path:'work/stygian-xbalanque-failure.png'});
 throw err;
}finally{
 await browser.close();
}
