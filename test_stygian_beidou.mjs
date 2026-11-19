import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const hub='liyue-harbor',deck='liyue-stygian-deck',quest='stygian-beidou-commission';
const prefix='evidence/stygian-beidou',canvas=page.locator('#game'),errors=[];
const wait=(fn,arg,timeout=65000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const mode=m=>page.evaluate(m=>{window.beidouMode=m},m);
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
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8955/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/stygian-beidou-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story?.node===node,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await portal(deck,300);
 const background=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([background.key,background.state],['cruxDuelDeck','ready']);
 await wait(()=>document.getElementById('stygianMode').options.length===4);
 await page.locator('#stygianMode').selectOption('extreme');
 assert.ok(await page.locator('#stygianStart').isDisabled());
 assert.match(await page.locator('#stygianReward').textContent(),/Lv165/);
 await page.locator('#stygianMode').selectOption('normal');
 await page.locator('#stygianSet').selectOption('troupe');
 const prepared=await frame();
 const payout=prepared.stygianDesk.modes.find(entry=>entry.id==='normal');
 const selection=await page.locator('#stygianReward').textContent();
 assert.match(selection,/EXP.*初回は.*EXP/);
 await page.locator('#stygianDesk').screenshot({path:'evidence/stygian-clear-rewards-selection.png'});
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.endgameRun?.phase==='guard'&&window.lab.frame.endgameRun.tick>=40);
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const original=await frame(),png=await capture('png');
 assert.equal(original.endgameRun.phase,'guard');
 assert.ok(original.draws.some(draw=>draw.source==='beidou-stygian-left-source-v1.png'));
 await wait(()=>document.getElementById('endgameRunStatus').textContent.includes('攻撃を止めて待つ'));
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

 await page.evaluate(()=>{
  const held=new Set();
  window.beidouMode='evade';
  let previousPhase,escape;
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.boss,v=f.endgameRun;
   let left=false,right=false,attack=false;
   if(v?.match==='beidou'&&!f.paused&&v.status==='fighting'){
    const a=f.actors[f.active-1],mode=window.beidouMode;
    const dx=b.x-a.x;
    let goal=a.x;
    if(mode==='bait'&&['intro','approach','guard'].includes(v.phase)){
     goal=b.x+82;
     if(v.phase==='guard'&&a.x>b.x+45){
      if(a.dir!==-1&&Math.abs(goal-a.x)<12)goal=a.x-20;
      attack=a.dir===-1&&a.x-b.x<112&&a.y>420;
     }
    }else if(mode==='finish'&&v.phase==='recover'){
     goal=b.x-Math.sign(dx||1)*76;
     if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*21;
     attack=Math.abs(dx)<115&&Math.sign(dx)===a.dir&&a.y>420;
    }else if(v.area&&(v.phase==='tell'||v.phase==='strike')){
     if(previousPhase!=='tell'&&previousPhase!=='strike'){
      if(a.x>=v.area.left-9&&a.x<=v.area.right+9){
       const options=[v.area.left-23,v.area.right+23].filter(x=>x>=20&&x<=940);
       escape=options.sort((l,r)=>Math.abs(l-a.x)-Math.abs(r-a.x))[0];
      }
     }
     goal=escape??a.x;
    }
    if(!v.area)escape=undefined;
    left=goal<a.x-8;right=goal>a.x+8;previousPhase=v.phase;
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 });
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.endgameRun?.phase==='tell');
 await page.locator('.game').screenshot({path:prefix+'-tell.png'});
 await wait(()=>window.lab.frame.endgameRun?.phase==='recover');
 const dodged=await frame();
 assert.equal(dodged.actors[0].hp,original.actors[0].hp);
 assert.ok(dodged.events.some(e=>e.kind==='stygian:beidou:waited'));
 assert.ok(!dodged.events.some(e=>e.kind==='stygian:beidou:impact:quiet'&&e.actor===1));
 await mode('finish');
 await wait(()=>window.lab.frame.endgameRun?.status==='clear');
 const victory=await frame();
 assert.equal(victory.story.quests[quest].count,1);
 assert.equal(victory.endgame.stygian['beidou:normal'].clears,1);
 assert.equal(victory.endgameRun.matchReward.mora,1210);
 assert.equal(victory.endgameRun.matchReward.set,'黄金の劇団');
 const awarded=payout.xp+payout.firstXp;
 assert.equal(victory.endgameRun.matchReward.xp,awarded);
 assert.equal(victory.progression.baseXp-prepared.progression.baseXp,awarded);
 await wait(()=>document.getElementById('endgameRunStatus').textContent.includes('勝利'));
 assert.ok((await page.locator('#endgameRunStatus').textContent()).includes(`${awarded.toLocaleString()}EXP`));
 await page.locator('#endgameRun').screenshot({path:'evidence/stygian-clear-rewards-result.png'});
 assert.ok(victory.events.some(e=>e.kind==='stygian:beidou:opening-hit'));
 await page.getByRole('button',{name:'挑戦入口に戻る',exact:true}).click();
 await wait(()=>window.lab.frame.stygianDesk);
 await wait(()=>document.getElementById('stygianRecord').textContent.includes('1勝'));
 assert.doesNotMatch(await page.locator('#stygianReward').textContent(),/初回/);
 await mode('bait');
 await page.locator('#stygianStart').click();
 await wait(()=>window.lab.frame.events.filter(e=>e.kind==='stygian:beidou:baited').length===1);
 const baited=await frame();
 assert.equal(baited.events.filter(e=>e.kind==='stygian:beidou:baited')[0].actor,1);
 await wait(()=>window.lab.frame.draws.some(draw=>draw.source==='beidou-stygian-right-source-v2.png'));
 await capture('right');
 await mode('evade');
 await page.getByRole('button',{name:'挑戦入口に戻る',exact:true}).click();
 await wait(()=>window.lab.frame.stygianDesk);
 assert.equal((await frame()).endgame.stygian['beidou:normal'].clears,1);
 await portal(hub,85);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 const stored=(await frame()).endgame.stygian['beidou:normal'];
 assert.deepEqual(stored,victory.endgame.stygian['beidou:normal']);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({background,mode:'normal',levels:[30,58,103,165],
  commands:{png:original.commands,standard:standard.commands,light:light.commands},viewport390:true,
  avoidedCounter:true,manualBaited:true,independentLeftAndRight:true,firstReward:victory.endgameRun.matchReward,questReportSaveRestore:true,record:stored,errors},null,2)+'\n');
 await fs.writeFile('evidence/stygian-clear-rewards-browser.json',JSON.stringify({
  encounter:'beidou:normal',repeatXp:payout.xp,firstXp:payout.firstXp,award:victory.endgameRun.matchReward,
  baseExpIncrease:awarded,bonusHiddenAfterWin:true,recordSurvivesBrowserReload:true,errors},null,2)+'\n');
 console.log('Beidou Chrome: navigation, rank gates, art modes, waiting or baiting, normal clear, rewards, report and restore passed');
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.boss,duel:f?.endgameRun,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),
  quest:f?.story?.quests?.[quest],portal:f?.storyNearbyPortal,events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('stygian:beidou:')).slice(-18):[],errors},null,2));
 await page.screenshot({path:'work/stygian-beidou-failure.png'});
 throw error;
}finally{
 await browser.close();
}
