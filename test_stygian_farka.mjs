import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='mond-town',arena='mond-stygian-dual-court',quest='stygian-farka-commission';
const prefix='evidence/stygian-farka',canvas=page.locator('#game'),errors=[];
const wait=(fn,arg,timeout=95000)=>page.waitForFunction(fn,arg,{timeout});
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
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8961/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/stygian-farka-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await portal(arena,295);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['dualCourt','ready']);
 await wait(()=>document.getElementById('stygianMode').options.length===4);
 await page.locator('#stygianMode').selectOption('extreme');
 assert.ok(await page.locator('#stygianStart').isDisabled());
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption('troupe');
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.endgameRun?.match==='farka');
 await canvas.click();
 await capture('arrival');

 await page.evaluate(()=>{
  const held=new Set(),observed=new Set();
  const d=window.fkTrail={stages:[],cards:[],plunges:[],burstLow:false,burstHigh:false,burstContacts:[],
   firstChain:null,chainRecovery:false,landedAttack:false,dual:false,dirs:[]};
  let prior,oldTick,spot,tipLocked,clearX,dropped;
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function drop(){
   key('KeyS',true);
   key('Space',false);key('Space',true);key('Space',false);
  }
  function nearestEscape(x,z){
   const options=[z.left-25,z.right+25].filter(q=>q>24&&q<936);
   return options.sort((a,b)=>Math.abs(a-x)-Math.abs(b-x))[0]??x;
  }
  function loop(){
   const f=window.lab.frame,v=f.endgameRun,b=f.boss;
   let left=false,right=false,attack=false,jump=false,down=false;
   if(v?.match==='farka'&&!f.paused&&v.status==='fighting'){
    if(d.stages.at(-1)!==v.stage)d.stages.push(v.stage);
    const k=v.child||v.card,t=v.childTick??v.tick;
    const track=v.card+':'+k;
    if(track!==prior||t<oldTick){
     if(v.card&&d.cards.at(-1)!==v.card)d.cards.push(v.card);
     prior=track;spot=tipLocked=clearX=undefined;dropped=false;
    }
    oldTick=t;
    d.dual||=f.draws.filter(q=>q.source==='farka-sword-source-v1.png').length===2;
    d.dirs=Array.from(new Set([...d.dirs,...f.draws.filter(q=>q.source?.startsWith('farka-body-')&&!q.motionOnly).map(q=>q.source)]));
    if(v.variant&&!d.firstChain)d.firstChain=v.variant;
    if(v.card==='FK07'&&v.child==='FK03'&&t>=114&&t<204&&v.phase==='recover')d.chainRecovery=true;

    const a=f.actors[f.active-1],dx=b.x-a.x;
    const zones=Array.isArray(v.areas)?v.areas:[];
    let goal=a.x;
    const follow=()=>{
     goal=b.x-Math.sign(dx||1)*73;
     if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*18;
     attack=Math.abs(dx)<110&&Math.sign(dx)===a.dir&&Math.abs(a.y-b.y)<68;
    };
    if(v.phase==='phase'||v.phase==='enter'){
     // Keep the player in place during the short change of stance.
    }else if(k==='FK05'&&t<177){
     if(t>=42){
      const lo=zones.find(z=>z.index===1),hi=zones.find(z=>z.index===2);
      if(spot===undefined&&lo&&hi)spot=(Math.max(lo.left,hi.left)+Math.min(lo.right,hi.right))/2;
      goal=spot??a.x;
      jump=t>=88&&t<127;
      if(t>=121&&t<160&&a.ground&&a.y<479&&!dropped){dropped=true;drop();}
      if(v.card==='FK05'&&lo&&t>=105&&t<111&&lo.left+12<a.x&&a.x<lo.right-12&&a.y<lo.top)d.burstLow=true;
      if(v.card==='FK05'&&hi&&t>=171&&t<177&&hi.left+12<a.x&&a.x<hi.right-12&&a.y>=479&&a.ground)d.burstHigh=true;
     }
    }else if(k==='FK03'&&t<114){
     const z=zones[0];
     if(t>=30&&z){
      tipLocked??=v.destination;
      clearX??=a.x>z.left-12&&a.x<z.right+12?nearestEscape(a.x,z):a.x;
      goal=clearX;
      if(t>=102&&t<108&&(a.x<z.left-8||a.x>z.right+8)&&v.destination===tipLocked&&!d.plunges.includes(v.card))d.plunges.push(v.card);
     }
    }else if(k==='FK04'&&t<72){
     const z=zones[0];
     if(z&&t>=18){
      clearX??=a.x>z.left-15&&a.x<z.right+15?nearestEscape(a.x,z):a.x;
      goal=clearX;
     }
    }else if(k==='FK01'&&t<139){
     const z=zones[0];
     if(z&&t>=24){
      clearX??=a.x>z.left-12&&a.x<z.right+12?nearestEscape(a.x,z):a.x;
      goal=clearX;
     }
    }else if(k==='FK02'&&t<96){
     const z=zones[0];
     if(z&&t>=24){
      clearX??=a.x>z.left-12&&a.x<z.right+12?nearestEscape(a.x,z):a.x;
      goal=clearX;
     }
    }else follow();

    for(const e of Object.values(f.events||{})){
     if(observed.has(e.seq))continue;
     observed.add(e.seq);
     if(e.kind==='stygian:farka:FK05:contact'&&e.actor===1)d.burstContacts.push(e.tick);
     if(e.kind==='hit'&&e.actor===1&&e.target===990001&&v.phase==='recover')d.landedAttack=true;
    }
    left=goal<a.x-6;right=goal>a.x+6;
   }
   key('KeyA',left);key('KeyD',right);key('KeyS',down);key('Space',jump);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 });
 await wait(()=>window.lab.frame.endgameRun?.card==='FK03'&&window.lab.frame.endgameRun.tick>=83);
 await capture('plunge');
 await wait(()=>window.lab.frame.endgameRun?.card==='FK04'&&window.lab.frame.endgameRun.tick>=48);
 await capture('cross');
 await wait(()=>window.lab.frame.endgameRun?.card==='FK05'&&window.lab.frame.endgameRun.tick>=122);
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame(),png=await capture('high');
 assert.equal(original.endgameRun.card,'FK05');
 assert.equal(original.draws.filter(q=>q.source==='farka-sword-source-v1.png').length,2);
 await page.locator('#renderMode').selectOption('rect');
 await wait(n=>window.lab.frame.commands>n*4,original.commands);
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
 await wait(()=>window.lab.frame.endgameRun?.card==='FK07'&&window.lab.frame.endgameRun.child==='FK04');
 await capture('chain');
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const victory=await frame(),trail=await page.evaluate(()=>window.fkTrail);
 assert.deepEqual(trail.stages,[1,2,3]);
 assert.ok(trail.dual&&trail.landedAttack&&trail.burstLow&&trail.burstHigh&&trail.chainRecovery);
 assert.equal(trail.dirs.length,2);
 assert.equal(trail.firstChain,'A');
 assert.deepEqual(trail.burstContacts,[]);
 assert.ok(trail.plunges.includes('FK03')&&trail.plunges.includes('FK07'));
 assert.equal(victory.endgame.stygian['farka:normal'].clears,1);
 assert.equal(victory.story.quests[quest].count,1);
 assert.equal(victory.returns,0);
 assert.equal(victory.endgameRun.matchReward.mora,2400);
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
 assert.deepEqual((await frame()).endgame.stygian['farka:normal'],victory.endgame.stygian['farka:normal']);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,normalClear:true,trail,questReportSaveRestore:true,
  viewport390:true,commands:{png:original.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Farka Chrome: locked plunge, physical low/high dodge, chained recovery, two swords, reward and save passed');
}catch(err){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.boss,run:f?.endgameRun,
  actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),portal:f?.storyNearbyPortal,trail:await page.evaluate(()=>window.fkTrail),
  events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('stygian:farka:')).slice(-14):[],errors},null,2));
 await page.screenshot({path:'work/stygian-farka-failure.png'});
 throw err;
}finally{await browser.close()}
