import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='nod-town',arena='nod-stygian-hunt',quest='stygian-rerir-commission';
const short=process.env.LAB_RERIR_TRIAL==='short';
const target=short?2:3;
const prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/stygian-rerir'+(short?'-short':'');
const canvas=page.locator('#game'),mechanic=page.locator('#stygianMechanic'),errors=[];
const wait=(fn,arg,timeout=85000)=>page.waitForFunction(fn,arg,{timeout});
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
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8958/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/stygian-rerir-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await portal(arena,750);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['mistHunt','ready']);
 await wait(()=>document.getElementById('stygianMode').options.length===4);
 await page.locator('#stygianMode').selectOption('extreme');
 assert.ok(await page.locator('#stygianStart').isDisabled());
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption('troupe');
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.endgameRun?.match==='rerir');
 await canvas.click();
 await capture('arrival');

 await page.evaluate(target=>{
  const held=new Set(), lamps=new Set(), marked=new Set();
  const trail=window.rrTrail={stages:[],lamps:[],air:[],pickups:{},bursts:{},endGauges:{},firstMiss:false,arts:[]};
  let lastTrial,jumpUntil=0,turnAttempt=0;
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function press(code){key(code,true);key(code,false);}
  function loop(){
   const f=window.lab.frame,b=f.boss,v=f.endgameRun;
   let left=false,right=false,attack=false,jump=false;
   if(v?.match==='rerir'&&!f.paused&&v.status==='fighting'){
    if(trail.stages.at(-1)!==v.stage){
     trail.stages.push(v.stage);trail.endGauges[v.stage]=b.maxhp;
    }
    trail.arts=Array.from(new Set([...trail.arts,...f.draws.filter(d=>d.source?.startsWith('rerir-')&&d.h===144).map(d=>d.source)]));
    if(v.phase==='interlude')trail.interlude=b.hp===0&&!v.matchReward;
    const a=f.actors[f.active-1],dx=b.x-a.x,t=v.tick;
    let goal=a.x;
    if(v.card==='RR05'){
     if(v.fogAttempt===1&&t>=134)trail.firstMiss=true;
     if(v.lampReady&&v.fogAttempt>1&&!lamps.has(v.fogAttempt)){
      lamps.add(v.fogAttempt);press('KeyH');
     }
    }else if(v.trial&&t<1080){
     if(lastTrial!==v.trial){lastTrial=v.trial;jumpUntil=0;turnAttempt=0;}
     if(t>=120&&b.y<200&&!trail.air.includes(v.trial))trail.air.push(v.trial);
     if(t>=120&&t<960){
      const p=v.collected<target&&v.pickups.find(p=>!p.owner);
      if(p){
       goal=p.x;
       if(p.y<400&&a.y>400&&Math.abs(a.x-p.x)<122&&t>jumpUntil+10){
        jumpUntil=t+39;turnAttempt++;
       }
       jump=t<jumpUntil;
      }
      const doc=trail.pickups[v.trial]??={count:0,high:false,jumps:0};
      doc.count=Math.max(doc.count,v.collected);doc.jumps=turnAttempt;
      doc.high||=!!v.pickups[1].owner&&a.y<=373;
     }
     if(target===2&&v.collected===2&&t>=960)goal=v.trial===1?305:655;
     if(v.trialResult)trail.bursts[v.trial]=v.trialResult;
    }else if(v.stage===1||b.hp>b.maxhp*.235||trail.secondResolved){
     if(v.phase!=='enter'&&v.phase!=='fog-entry'&&v.phase!=='blessing'&&v.phase!=='interlude'){
      goal=b.x-Math.sign(dx||1)*74;
      if(Math.abs(goal-a.x)<11&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*20;
      attack=Math.abs(dx)<107&&Math.sign(dx)===a.dir&&a.y>422;
     }
    }else{
     goal=b.x>480?74:884;
    }
    if(v.trial===2&&t>=1080){
     trail.secondResolved=true;
     goal=b.x-Math.sign(dx||1)*74;
     attack=Math.abs(dx)<109&&Math.sign(dx)===a.dir&&a.y>422;
    }
    for(const e of f.events||[]){
     if(e.kind==='stygian:rerir:RR05:lamp'&&!marked.has(e.seq)){
      marked.add(e.seq);trail.lamps.push(e.value);
     }
    }
    left=goal<a.x-7;right=goal>a.x+7;
   }
   key('KeyA',left);key('KeyD',right);key('Space',jump);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },target);

 await wait(()=>window.lab.frame.endgameRun?.lampReady);
 await wait(()=>document.getElementById('stygianMechanic').textContent==='結界 2 / 2');
 assert.equal(await page.locator('#stygianMechanic').textContent(),'結界 2 / 2');
 assert.ok(await page.locator('#stygianLamp').isVisible());
 await capture('fog');
 await wait(()=>window.lab.frame.endgameRun?.ward===0);
 await wait(()=>{const r=window.lab.frame.endgameRun;return r?.status==='clear'||r?.trial===1&&r.tick>=1008});
 const mid=await frame();
 assert.equal(mid.endgameRun.collected,target);
 assert.equal(mid.endgameRun.trialResult.protected,!short);
 console.log('Rerir Chrome: two lamps and first physical collection route passed');
 await wait(target=>{const r=window.lab.frame.endgameRun;return r?.trial===2&&r.collected===target&&
  document.getElementById('stygianMechanic').textContent===`第2局面 ｜ 光 ${target} / 3`;},target);
 console.log('Rerir Chrome: second physical collection route passed');
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame(),png=await capture('upper');
 assert.equal(original.endgameRun.card,'RR13');
 assert.ok(original.draws.some(d=>d.source?.startsWith('rerir-')&&d.h===144));
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(n=>window.lab.frame.commands>n*5,original.commands);
 const standard=await frame(),rect=await capture('standard');
 const plain=await captureRectTransfer(page,'h32c16',false,()=>page.locator('#renderMode').selectOption('h32c16'));
 const light=plain.snapshot,low=await capture('light');
 assert.deepEqual([original.t,standard.t,light.t],[original.t,original.t,original.t]);
 assert.deepEqual(original.endgameRun,light.endgameRun);
 assert.equal(new Set([png,rect,low]).size,3);
 const packed=await captureRectTransfer(page,'h32c16',true,()=>page.locator('#packRectArt').check());
 assert.equal(packed.snapshot.t,light.t);
 assert.equal(packed.raster,plain.raster);
 assert.ok(packed.snapshot.draws.some(d=>d.kind==='rect_runs'&&d.h===144));
 assert.ok(packed.snapshot.draws.length<light.draws.length&&packed.gzipBytes<plain.gzipBytes);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.draws.some(d=>d.source?.startsWith('rerir-')));
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#stygianBattle').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 const message=short?'最終衝撃が命中':'最終衝撃を防いだ';
 await wait(message=>document.getElementById('stygianMechanic').textContent.includes(message),message);
 const resultText=await mechanic.textContent();
 const result=(await frame()).endgameRun.trialResult;
 assert.equal(result.protected,!short);
 if(short)assert.ok(result.damage>0&&resultText.includes(`${result.damage}ダメージ`));
 else assert.equal(result.damage,0);
 await page.locator('#stygianBattle').screenshot({path:prefix+'-result.png'});
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const victory=await frame(),trail=await page.evaluate(()=>window.rrTrail);
 assert.deepEqual(trail.stages,[1,2]);
 assert.deepEqual(trail.endGauges,{1:2180,2:2470});
 assert.deepEqual(trail.lamps,[1,0]);
 assert.ok(trail.firstMiss&&trail.interlude);
 assert.deepEqual(trail.air,[1,2]);
 assert.deepEqual(Object.values(trail.bursts).map(outcome=>outcome.protected),[!short,!short]);
 assert.ok(trail.pickups[1].high&&trail.pickups[2].high&&trail.pickups[1].jumps&&trail.pickups[2].jumps);
 assert.equal(trail.arts.length,2);
 assert.equal(victory.endgame.stygian['rerir:normal'].clears,1);
 assert.equal(victory.story.quests[quest].count,1);
 assert.equal(victory.returns,0);
 assert.equal(victory.endgameRun.matchReward.mora,22300);
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
 assert.deepEqual((await frame()).endgame.stygian['rerir:normal'],victory.endgame.stygian['rerir:normal']);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,normalClear:true,trail,questReportSaveRestore:true,
  viewport390:true,target,resultText,commands:{png:original.commands,standard:standard.commands,light:light.commands},
  transfer:{plainDraws:light.draws.length,packedDraws:packed.snapshot.draws.length,plainGzip:plain.gzipBytes,
   packedGzip:packed.gzipBytes,identicalCanvas:true},errors},null,2)+'\n');
 console.log(`Rerir Chrome: two lamps, both paths with ${target} lights, result HUD, clear and save passed`);
}catch(err){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.boss,run:f?.endgameRun,
  actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),portal:f?.storyNearbyPortal,trail:await page.evaluate(()=>window.rrTrail),
  events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('stygian:rerir:')).slice(-14):[],errors},null,2));
 await page.screenshot({path:prefix+'-failure.png'});
 throw err;
}finally{await browser.close()}
