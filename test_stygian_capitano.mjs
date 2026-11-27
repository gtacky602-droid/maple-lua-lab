import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='snezhnaya-hub',arena='sne-stygian-frost-court',quest='stygian-capitano-commission';
const prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/stygian-capitano',canvas=page.locator('#game'),errors=[];
const takeHits=process.env.LAB_CAPITANO_FINALE==='hit';
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
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8956/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/stygian-capitano-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await portal(arena,650);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['frostDrillCourt','ready']);
 await wait(()=>document.getElementById('stygianMode').options.length===4);
 await page.locator('#stygianMode').selectOption('extreme');
 assert.ok(await page.locator('#stygianStart').isDisabled());
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption('troupe');
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.endgameRun?.coat);
 await capture('coat');
 await wait(()=>window.lab.frame.endgameRun?.match==='capitano'&&!window.lab.frame.endgameRun.coat);
 assert.ok((await frame()).draws.some(d=>d.source==='capitano-ice-sword-source-v1.png'));

 await page.evaluate(takeHits=>{
  const held=new Set();
  const clip=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  window.cpTrail={stage:[],cards:[],waveY:Infinity,lowY:Infinity,highY:Infinity,lowInside:false,highInside:false,strikePose:false,land:null};
  window.cpDoneWave=false;
  window.cpFinishAllowed=false;
  let position,dropIssued=false;
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.boss,v=f.endgameRun,d=window.cpTrail;
   let left=false,right=false,attack=false,jump=false,drop=false;
   if(v?.match==='capitano'&&!f.paused&&v.status==='fighting'){
    if(d.stage.at(-1)!==v.stage)d.stage.push(v.stage);
    if(v.card&&d.cards.at(-1)!==v.card)d.cards.push(v.card);
    const a=f.actors[f.active-1],dx=b.x-a.x;
    let goal=a.x,t=v.tick;
    if(v.card==='CP05'&&v.stage===2&&!window.cpDoneWave){
     if(t<49){
      position??=clip(b.x+(b.dir||-1)*133,76,884);
      goal=position;
     }else{
      goal=position??a.x;
      jump=t>=49&&t<91;
     }
     if(t>=60&&t<=96)d.waveY=Math.min(d.waveY,a.y);
     if(t>=145)window.cpDoneWave=true;
    }else if(v.card==='CP09'&&t<360){
     if(t>=48&&v.road&&!d.land){
      d.land=v.road.to;
      d.direction=Math.sign(v.road.to-v.road.from)||b.dir;
     }
     const middle=t>=144&&t<294;
     const gap=middle?118:takeHits?65:218;
     if(d.land!==null)goal=clip(d.land+d.direction*gap,42,918);
     jump=takeHits?t>=267&&t<293:t>=195&&t<225;
     if(!takeHits&&t>=234&&t<268&&!dropIssued&&v.hint.includes('S＋Space')){
      drop=true;dropIssued=true;
     }
     if(t>=210&&t<222){
      d.lowY=Math.min(d.lowY,a.y);
      d.lowInside||=v.areas.some(z=>z.index===2&&z.left+10<a.x&&a.x<z.right-10);
     }
     if(t>=282&&t<294){
      d.highY=Math.min(d.highY,a.y);
      d.highInside||=v.areas.some(z=>z.index===3&&z.left+10<a.x&&a.x<z.right-10);
     }
     d.strikePose||=f.draws.some(draw=>draw.source?.startsWith('capitano-strike-')&&!draw.motionOnly);
    }else if(v.phase!=='enter'&&v.phase!=='phase'&&v.stage<3||
             v.card==='CP09'&&v.phase==='recover'&&window.cpFinishAllowed){
     goal=b.x-Math.sign(dx||1)*88;
     if(Math.abs(goal-a.x)<12&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*21;
     attack=Math.abs(dx)<115&&Math.sign(dx)===a.dir&&a.y>420;
    }
    left=goal<a.x-9;right=goal>a.x+9;
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);key('KeyS',drop);key('Space',jump||drop);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },takeHits);
 await wait(()=>window.lab.frame.endgameRun?.card==='CP05'&&window.lab.frame.endgameRun.tick>=54);
 await capture('wave');
 await wait(()=>window.cpDoneWave);
 const wave=await frame();
 assert.ok(!wave.events.some(e=>e.kind==='stygian:capitano:CP05:contact'&&e.actor===1));
 await wait(()=>window.lab.frame.endgameRun?.card==='CP09'&&window.lab.frame.endgameRun.tick>=123);
 await capture('dash');
 await wait(()=>window.lab.frame.endgameRun?.card==='CP09'&&window.lab.frame.endgameRun.tick>=159);
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame(),png=await capture('png');
 assert.equal(original.endgameRun.card,'CP09');
 assert.ok(original.endgameRun.tick<195);
 assert.ok(original.draws.some(d=>d.source==='capitano-ice-sword-source-v1.png'&&d.rotation));
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(n=>window.lab.frame.commands>n*5,original.commands);
 const standard=await frame(),rect=await capture('standard');
 assert.ok(standard.draws.some(d=>d.kind==='rect'&&Math.abs(d.rotation)>0));
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.7,standard.commands);
 const light=await frame(),low=await capture('light');
 assert.deepEqual([original.t,standard.t,light.t],[original.t,original.t,original.t]);
 assert.deepEqual(original.endgameRun,light.endgameRun);
 assert.equal(new Set([png,rect,low]).size,3);
 const expanded=await captureRectTransfer(page,'h48c32',false,()=>page.locator('#renderMode').selectOption('h48c32'));
 const grouped=await captureRectTransfer(page,'h48c32',true,()=>page.locator('#packRectArt').check());
 assert.equal(grouped.snapshot.t,expanded.snapshot.t);
 const body=original.draws.find(d=>d.source?.startsWith('capitano-battle-'));
 const batch=grouped.snapshot.draws.find(d=>d.kind==='rect_runs'&&d.h===body.h&&
  Math.abs(d.w-body.w)<1e-6&&Math.abs(d.y+d.h-body.y)<1e-6);
 assert.ok(batch&&grouped.snapshot.rectBatches[batch.batch-1].length);
 assert.ok(grouped.snapshot.draws.some(d=>d.kind==='rect'&&Math.abs(d.rotation)>0));
 assert.ok(grouped.gzipBytes<expanded.gzipBytes&&grouped.gzipBytes>0);
 assert.equal(grouped.raster,expanded.raster);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(n=>window.lab.frame.commands<n*2,original.commands);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#stygianBattle').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.endgameRun?.card==='CP09'&&window.lab.frame.endgameRun.phase==='recover');
 const opening=await frame();
 const finaleHits=opening.events.filter(e=>e.kind==='stygian:capitano:CP09:contact'&&e.actor===1&&e.value>0);
 const finaleDamage=opening.endgameRun.finale.damage;
 assert.deepEqual(finaleDamage,takeHits?[53,53,53,53]:[0,0,0,0]);
 assert.deepEqual(finaleHits.map(e=>e.group),takeHits?[1,2,3,4]:[]);
 const finaleHud=await page.locator('#stygianMechanic').textContent();
 assert.match(finaleHud,takeHits?/被弾 4 \/ 4・計212ダメージ/:/4段の被ダメージなし/);
 await page.locator('.game').screenshot({path:prefix+'-finale-result.png'});
 assert.deepEqual(opening.events.filter(e=>e.kind==='stygian:capitano:CP09:window').map(e=>e.tick),[138,210,282,348]);
 const trail=await page.evaluate(()=>window.cpTrail);
 assert.ok(trail.waveY<420);
 assert.ok(takeHits?trail.lowY>=470&&trail.highY<420:trail.lowY<420&&trail.highY>=470);
 assert.ok(trail.lowInside&&trail.highInside&&trail.strikePose);
 assert.deepEqual(trail.stage,[1,2,3]);
 await page.evaluate(()=>{window.cpFinishAllowed=true});
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const victory=await frame();
 assert.equal(victory.endgame.stygian['capitano:normal'].clears,1);
 assert.equal(victory.story.quests[quest].count,1);
 assert.equal(victory.endgameRun.matchReward.mora,4200);
 assert.equal(victory.returns,0);
 await wait(()=>window.lab.frame.endgameRun?.phase==='defeat'&&window.lab.frame.endgameRun.tick>=100);
 await capture('lowered');
 await page.getByRole('button',{name:'挑戦入口に戻る',exact:true}).click();
 await wait(()=>window.lab.frame.stygianDesk);
 await portal(hub,85);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 assert.deepEqual((await frame()).endgame.stygian['capitano:normal'],victory.endgame.stygian['capitano:normal']);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,normalClear:true,stages:trail.stage,cards:trail.cards,
  groundWaveMinFeet:trail.waveY,finaleLowMinFeet:trail.lowY,finaleHighFeet:trail.highY,avoidedAllFinaleWindows:!takeHits,
  finaleDamage,finaleHud,lowAndHighFootworkInsideLane:true,strikePose:true,
  transferCompression:{canvasIdentical:true,packedGzipBytes:grouped.gzipBytes,plainGzipBytes:expanded.gzipBytes},
  coatOff:true,independentRotatingBlade:true,questReportSaveRestore:true,viewport390:true,
  commands:{png:original.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Capitano Chrome:',takeHits?'four hits':'no finale damage','three stages, reward and save passed');
}catch(err){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.boss,run:f?.endgameRun,
  actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),portal:f?.storyNearbyPortal,trail:await page.evaluate(()=>window.cpTrail),
  events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('stygian:capitano:')).slice(-27):[],errors},null,2));
 await page.screenshot({path:'work/stygian-capitano-failure.png'});
 throw err;
}finally{
 await browser.close();
}
