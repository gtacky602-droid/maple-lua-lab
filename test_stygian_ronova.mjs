import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureRectTransfer} from './tools/browser_rect_transfer.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='snezhnaya-hub',arena='sne-stygian-last-gate',quest='stygian-ronova-commission';
const spendLamp=process.env.LAB_RONOVA_VERDICT==='return';
const prefix=(process.env.LAB_WEEKLY_EVIDENCE||'evidence')+'/stygian-ronova'+(spendLamp?'-return':'');
const canvas=page.locator('#game'),mechanic=page.locator('#stygianMechanic'),errors=[];
const wait=(fn,arg,timeout=110000)=>page.waitForFunction(fn,arg,{timeout});
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
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8959/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/stygian-ronova-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await portal(arena,1080);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['lastJudgment','ready']);
 await wait(()=>document.getElementById('stygianMode').options.length===4);
 await page.locator('#stygianMode').selectOption('extreme');
 assert.ok(await page.locator('#stygianStart').isDisabled());
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption('troupe');
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.endgameRun?.match==='ronova');
 await wait(()=>document.getElementById('stygianFuel').textContent==='復活の灯 5 / 5');
 await canvas.click();
 await capture('arrival');

 await page.evaluate(spendLamp=>{
  const held=new Set(),marked=new Set();
  const d=window.rnTrail={stages:[],moves:[],authority:0,lamps:0,returns:0,pickups:{},down:0,road:0,lifeMin:100,lifeMax:0,gate:false,wing:false};
  let current,priorTick,aim,untilJump=0;
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,v=f.endgameRun,b=f.boss;
   let left=false,right=false,jump=false,attack=false;
   if(v?.match==='ronova'&&!f.paused&&v.status==='fighting'){
    if(d.stages.at(-1)!==v.stage)d.stages.push(v.stage);
    if(current!==v.card||v.tick<priorTick){
     if(v.card)d.moves.push(v.card);
     current=v.card;aim=undefined;untilJump=-1;
    }
    priorTick=v.tick;
    d.lifeMin=Math.min(d.lifeMin,v.life);d.lifeMax=Math.max(d.lifeMax,v.life);
    d.wing||=f.draws.some(p=>p.source==='ronova-wings-source-v1.png'&&p.h>=96);
    for(const e of Object.values(f.events||{})){
     if(marked.has(e.seq))continue;
     marked.add(e.seq);
     if(e.kind==='stygian:ronova:authority_lethal')d.authority++;
     if(e.kind==='stygian:ronova:lamp-spent')d.lamps++;
     if(e.kind==='stygian:ronova:returned')d.returns++;
     if(e.kind==='stygian:ronova:hp-down'||e.kind==='stygian:ronova:life-zero')d.down++;
     if(e.kind==='stygian:ronova:RN12:road')d.road=Math.max(d.road,e.value);
     if(e.kind==='stygian:ronova:RN08:verdict-safe')d.gate=true;
    }
    const a=f.actors[f.active-1],dx=b.x-a.x,t=v.tick;
    let goal=a.x,point;
    if(v.phase==='phase'||v.phase==='enter'||v.phase==='returning'){
     // No input during the phase change or the reserved return.
    }else if(v.card==='RN05'&&t<138){
     if(t>=84&&v.areas?.length){
      const z=v.areas[0],lo=z.left-32,hi=z.right+32;
      aim??=(a.x<z.left-16||a.x>z.right+16)?a.x:hi>925||Math.abs(lo-a.x)<Math.abs(hi-a.x)&&lo>35?lo:hi;
      goal=aim;
     }
    }else if(v.card==='RN08'&&t<864){
     if(v.gate)goal=spendLamp&&!d.returns?(v.gate.x<650?860:108):v.gate.x;
     else if(t>=252&&v.found<2)point=v.shadows?.[0];
     else if(t<240)goal=b.dir>0?170:790;
    }else if(v.card==='RN12'&&v.road&&v.road.x!==undefined){
     point=v.road;
    }else if((v.card==='RN03'||v.card==='RN06')&&v.shadows?.length){
     point=v.shadows[0];
    }else if(v.card==='RN07'&&v.safe){
     goal=v.safe.x;
    }else{
     goal=b.x-Math.sign(dx||1)*76;
     if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*19;
     attack=Math.abs(dx)<110&&Math.sign(dx)===a.dir&&a.y>420;
    }
    if(v.found!==undefined)d.pickups[v.card]=Math.max(d.pickups[v.card]||0,v.found);
    if(point){
     goal=point.x;
     if(point.y<406&&a.y>407&&Math.abs(a.x-point.x)<127&&t>untilJump){
      untilJump=t+42;
     }
     jump=t<untilJump;
    }
    left=goal<a.x-6;right=goal>a.x+6;
    if(spendLamp&&v.stage===4&&!d.gate)attack=false;
   }
   key('KeyA',left);key('KeyD',right);key('Space',jump);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },spendLamp);
 await wait(()=>window.lab.frame.endgameRun?.card==='RN05'&&window.lab.frame.endgameRun.tick>=100);
 await capture('verdict');
 await wait(()=>window.lab.frame.endgameRun?.card==='RN12'&&window.lab.frame.endgameRun.road?.passed>=2);
 await capture('road');
 console.log('Ronova Chrome: first judgment and upper platform route passed');
 const allyFire=page.locator('#allyFire');
 if(spendLamp){
  await wait(()=>window.lab.frame.endgameRun?.stage===4);
  await allyFire.click();
  await wait(()=>window.lab.frame.holdAllyFire);
  await canvas.click();
 }
 await wait(spendLamp=>{
  const v=window.lab.frame.endgameRun;
  return v?.gate&&v.gate.inside!==spendLamp&&v.tick>=658;
 },spendLamp);
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame(),png=await capture('gate');
 assert.equal(original.endgameRun.card,'RN08');
 assert.equal(original.endgameRun.gate.inside,!spendLamp);
 assert.ok(original.draws.some(d=>d.source?.startsWith('ronova-idle-')&&d.h===144));
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
 assert.ok(packed.snapshot.draws.some(d=>d.kind==='rect_runs'&&d.h===112));
 assert.ok(packed.snapshot.draws.length<light.draws.length&&packed.gzipBytes<plain.gzipBytes);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.draws.some(d=>d.source?.startsWith('ronova-idle-')));
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#stygianBattle').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await page.keyboard.press('KeyP');
 if(spendLamp){
  await wait(()=>document.getElementById('stygianMechanic').textContent==='終告の裁定で戦闘不能');
  await page.locator('#stygianBattle').screenshot({path:prefix+'-down.png'});
  await wait(()=>window.lab.frame.endgameRun?.protection>0&&window.lab.frame.endgameRun.lamps===4);
  await page.locator('#stygianBattle').screenshot({path:prefix+'-returned.png'});
  await page.keyboard.press('KeyE');
  await wait(()=>window.lab.frame.active===1);
 }
 await wait(()=>document.getElementById('stygianMechanic').textContent==='安全門で裁定をしのいだ');
 const verdictText=await mechanic.textContent();
 await page.locator('#stygianBattle').screenshot({path:prefix+'-safe.png'});
 if(spendLamp)await allyFire.click();
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const victory=await frame(),trail=await page.evaluate(()=>window.rnTrail);
 assert.deepEqual(trail.stages,[1,2,3,4]);
 assert.ok(trail.gate&&trail.wing);
 assert.ok(trail.road===4&&trail.pickups.RN03===3&&trail.pickups.RN06>=2&&trail.pickups.RN08>=2);
 assert.equal(trail.authority,spendLamp?2:0);
 assert.equal(trail.lamps,spendLamp?1:0);
 assert.equal(trail.returns,spendLamp?1:0);
 assert.equal(victory.endgameRun.lamps,spendLamp?4:5);
 assert.equal(victory.endgame.stygian['ronova:normal'].clears,1);
 assert.equal(victory.story.quests[quest].count,1);
 assert.equal(victory.returns,0);
 assert.equal(victory.endgameRun.matchReward.mora,54300);
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
 assert.deepEqual((await frame()).endgame.stygian['ronova:normal'],victory.endgame.stygian['ronova:normal']);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,normalClear:true,trail,questReportSaveRestore:true,
  lampsAtWin:victory.endgameRun.lamps,viewport390:true,verdictText,
  commands:{png:original.commands,standard:standard.commands,light:light.commands},
  transfer:{plainDraws:light.draws.length,packedDraws:packed.snapshot.draws.length,plainGzip:plain.gzipBytes,
   packedGzip:packed.gzipBytes,identicalCanvas:true},errors},null,2)+'\n');
 console.log(`Ronova Chrome: four phases, final safe gate, lamps ${victory.endgameRun.lamps}, reward and save passed`);
}catch(err){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.boss,run:f?.endgameRun,
  actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),portal:f?.storyNearbyPortal,trail:await page.evaluate(()=>window.rnTrail),
  events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('stygian:ronova:')).slice(-14):[],errors},null,2));
 await page.screenshot({path:prefix+'-failure.png'});
 throw err;
}finally{await browser.close()}
