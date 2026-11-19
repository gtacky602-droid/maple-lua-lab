import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='sumeru-hub',arena='sumeru-stygian-windcourt',quest='stygian-wanderer-commission';
const prefix='evidence/stygian-wanderer',canvas=page.locator('#game'),errors=[];
const wait=(fn,arg,timeout=105000)=>page.waitForFunction(fn,arg,{timeout});
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
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node,14000);}
 finally{await page.keyboard.up(toward);}
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8960/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/stygian-wanderer-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await portal(arena,443);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['windcourt','ready']);
 await wait(()=>document.getElementById('stygianMode').options.length===4);
 await page.locator('#stygianMode').selectOption('extreme');
 assert.ok(await page.locator('#stygianStart').isDisabled());
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption('troupe');
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.endgameRun?.match==='wanderer');
 await canvas.click();
 await capture('arrival');

 await page.evaluate(()=>{
  const held=new Set(),marked=new Set();
  const d=window.wdTrail={stages:[],cards:[],updrafts:0,marks:{},heightAtLastMark:0,
   floorGlide:false,firstAirHit:false,airOpening:false,safeFinal:false,finalContacts:[],directions:[]};
  let current,oldTick=-1,jumpEnd=-1,jumpUse,side=0,dropped=false;
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,v=f.endgameRun,b=f.boss;
   let left=false,right=false,attack=false,jump=false,down=false;
   if(v?.match==='wanderer'&&!f.paused&&v.status==='fighting'){
    if(d.stages.at(-1)!==v.stage)d.stages.push(v.stage);
    if(current!==v.card||v.tick<oldTick){
     if(v.card)d.cards.push(v.card);
     current=v.card;jumpEnd=-1;jumpUse=undefined;dropped=false;
    }
    oldTick=v.tick;
    d.directions=Array.from(new Set([...d.directions,...f.draws.filter(q=>q.source?.startsWith('wanderer-idle-')&&q.h===108&&!q.motionOnly).map(q=>q.source)]));
    const a=f.actors[f.active-1],dx=b.x-a.x,t=v.tick;
    let goal=a.x,p=v.markers?.[0];
    function hop(use){
     if(a.ground&&t>jumpEnd+1){jumpUse=use;jumpEnd=t+48;return true}
     return false;
    }
    function markRoute(p){
     if(p.y===372){
      goal=p.x;
      if(a.y>374&&Math.abs(a.x-goal)<20)hop('side');
      return;
     }
     if(a.ground&&(a.y===372||a.y===290))side=a.x<480?-1:1;
     if(!side)side=a.x<480?-1:1;
     if(a.y<=291&&a.ground||jumpUse==='center'&&!a.ground){
      goal=p.x;
     }else if(a.ground&&a.y===372){
      goal=side<0?307:653;
      if(Math.abs(a.x-goal)<10&&hop('center'))goal=p.x;
     }else{
      goal=side<0?210:750;
      if(a.y>473&&Math.abs(a.x-goal)<20)hop('pad-for-center');
     }
    }
    if(v.windMarks!==undefined)d.marks[v.card]=Math.max(d.marks[v.card]||0,v.windMarks);
    if(v.card==='WD03'&&v.phase==='recover'&&b.y===372)d.airOpening=true;
    if(v.card==='WD02'&&t>=83&&t<124&&a.y===480)d.floorGlide=true;
    if(v.card==='WD06'&&t<600){
     if(v.safe){
      goal=v.safe.x;
      if(t>=560&&t<574&&v.safe.inside)d.safeFinal=true;
     }else if(p&&t<438){markRoute(p);}
     else if(t>=49&&t<69&&a.y>472){hop('first-gust');}
     if(t>=574&&a.y<479){
      down=true;
      if(a.ground&&!dropped){dropped=true;key('KeyS',true);key('Space',false);key('Space',true);key('Space',false);}
     }
    }else if(p){markRoute(p);}
    else if(v.card==='WD03'&&t<399&&v.phase!=='recover'){
     // Keep the landing area clear until the marks or approach cue appears.
    }else if(v.phase!=='enter'&&v.phase!=='phase'){
     goal=b.x-Math.sign(dx||1)*76;
     if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*19;
     attack=Math.abs(dx)<108&&Math.sign(dx)===a.dir&&Math.abs(a.y-b.y)<68;
     if(v.card==='WD02'&&t<124){attack=false;if(a.ground&&a.y<480){goal=a.x<480?49:915;}}
    }
    jump=t<jumpEnd;
    left=goal<a.x-6;right=goal>a.x+6;
    for(const e of Object.values(f.events||{})){
     if(marked.has(e.seq))continue;
     marked.add(e.seq);
     if(e.kind==='stygian:wanderer:updraft'&&e.actor===1)d.updrafts++;
     if(e.kind==='stygian:wanderer:WD06:mark'&&e.value===2)d.heightAtLastMark=a.y;
     if(e.kind==='stygian:wanderer:WD06:contact'&&e.actor===1)d.finalContacts.push(e.tick);
     if(e.kind==='hit'&&e.actor===1&&e.target===990007&&v.card==='WD03'&&b.y===372&&a.y===372)d.firstAirHit=true;
    }
   }
   key('KeyA',left);key('KeyD',right);key('KeyS',down);key('Space',jump);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 });
 await wait(()=>window.lab.frame.endgameRun?.card==='WD02'&&window.lab.frame.endgameRun.tick>=90);
 await capture('glide');
 await wait(()=>window.lab.frame.endgameRun?.card==='WD03'&&window.lab.frame.endgameRun.phase==='recover');
 await capture('landing');
 console.log('Wanderer Chrome: ground route through the glide and both mid-level marks passed');
 await wait(()=>window.lab.frame.endgameRun?.safe?.inside&&window.lab.frame.endgameRun.tick>=470);
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame(),png=await capture('gate');
 assert.equal(original.endgameRun.card,'WD06');
 assert.equal(original.endgameRun.windMarks,2);
 assert.equal(original.endgameRun.safe.half,80);
 assert.ok(Math.abs(original.boss.x-original.actors[0].x)>100);
 assert.ok(original.draws.some(d=>d.source?.startsWith('wanderer-idle-')&&d.h===108));
 await page.locator('#renderMode').selectOption('rect');
 await wait(n=>window.lab.frame.commands>n*5,original.commands);
 const standard=await frame(),rect=await capture('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.7,standard.commands);
 const light=await frame(),low=await capture('light');
 assert.deepEqual([original.t,standard.t,light.t],[original.t,original.t,original.t]);
 assert.deepEqual(original.endgameRun,light.endgameRun);
 assert.equal(new Set([png,rect,low]).size,3);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(n=>window.lab.frame.commands<n*2,original.commands);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#stygianBattle').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const victory=await frame(),trail=await page.evaluate(()=>window.wdTrail);
 assert.deepEqual(trail.stages,[1,2,3]);
 assert.deepEqual(trail.marks,{WD03:2,WD06:2});
 assert.ok(trail.updrafts>=2&&trail.floorGlide&&trail.firstAirHit&&trail.airOpening&&trail.safeFinal);
 assert.equal(trail.heightAtLastMark,290);
 assert.deepEqual(trail.finalContacts,[]);
 assert.equal(victory.endgame.stygian['wanderer:normal'].clears,1);
 assert.equal(victory.story.quests[quest].count,1);
 assert.equal(victory.returns,0);
 assert.equal(victory.endgameRun.matchReward.mora,8400);
 await capture('clear');
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
 assert.deepEqual((await frame()).endgame.stygian['wanderer:normal'],victory.endgame.stygian['wanderer:normal']);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,normalClear:true,trail,questReportSaveRestore:true,
  viewport390:true,commands:{png:original.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Wanderer Chrome: physical wind-ring jumps, upper platform, safe finale, reward, and save passed');
}catch(err){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.boss,run:f?.endgameRun,
  actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),portal:f?.storyNearbyPortal,trail:await page.evaluate(()=>window.wdTrail),
  events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('stygian:wanderer:')).slice(-14):[],errors},null,2));
 await page.screenshot({path:'work/stygian-wanderer-failure.png'});
 throw err;
}finally{await browser.close()}
