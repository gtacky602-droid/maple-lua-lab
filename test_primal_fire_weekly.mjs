import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg,timeout=65000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix=process.env.LAB_WEEKLY_EVIDENCE || 'evidence/primal-fire-weekly';
const hub='natlan-hub',node='primal-fire-sundered-forge',quest='primal-fire-weekly-commission',id='boss-29091101';
const errors=[];
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const bytes=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(bytes,'base64'));
 return bytes;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8951/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/primal-fire-weekly-gear.json','utf8'));
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
 assert.deepEqual([scenery.key,scenery.state],['sunderedForge','ready']);
 await wait(()=>window.lab.frame.weeklyBoss?.primal?.objects?.[0]?.kind==='gate');
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const gate=await frame();
 assert.equal(gate.weeklyBoss.primal.objects[0].max,12);
 assert.ok(gate.draws.some(d=>d.source==='gosoythoth-idle-source-v1.png'));
 assert.ok((await page.locator('#weeklyPrimalHint').textContent()).includes('障壁'));
 const png=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>12000);
 const standard=await frame(),legacy=await capture('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.6,standard.commands);
 const reduced=await frame(),light=await capture('light');
 assert.deepEqual([standard.t,reduced.t],[gate.t,gate.t]);
 assert.deepEqual(reduced.weeklyBoss,gate.weeklyBoss);
 assert.equal(new Set([png,legacy,light]).size,3);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.commands<500);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyPrimal').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();

 await page.evaluate(()=>{
  const keys=new Set();
  window.primalCuts=[];
  window.primalTrials=[];
  window.primalStage='first';
  function key(code,on){
   if(keys.has(code)===on)return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.primal;
   let left=false,right=false,attack=false;
   if(v?.actors?.length&&!f.paused&&b.phase!=='respawn'){
    const a=f.actors[f.active-1],objects=Array.isArray(v.objects)?v.objects.filter(o=>o.units>0):[];
    const floor=f.platforms.find(p=>p.y===480);
    if(window.primalCuts.at(-1)?.left!==v.left)window.primalCuts.push({left:v.left,width:floor?.w,collisionLeft:floor?.x});
    if(objects.length&&window.primalTrials.at(-1)!==v.card)window.primalTrials.push(v.card);
    const object=objects[0],target=object?.x??b.x;
    let goal=Math.max(v.left+30,target-78);
    const facing=Math.sign(target-a.x),reachable=Math.abs(target-a.x)<115&&facing===a.dir;
    const threshold=[.725,.475,.225,0][v.cuts];
    if(Math.abs(goal-a.x)<11&&facing!==a.dir)goal=a.x+facing*24;
    if(v.card==='WG09'&&v.tick<v.cutAt)goal=Math.max(goal,v.left+139);
    left=goal<a.x-11;right=goal>a.x+11;
    attack=reachable&&(!!object||window.primalStage==='battle'&&b.damageable&&b.hp>b.maxhp*threshold);
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 });
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='exposed');
 const exposed=await frame();
 assert.equal(exposed.weeklyBoss.hp,gate.weeklyBoss.hp);
 const trialStatus=await page.locator('#weeklyPrimalHint').textContent();
 assert.match(trialStatus,/障壁を破壊.+反撃できる時間/);
 assert.ok(exposed.events.some(e=>e.kind==='primal:WG05:gate'&&e.actor===1&&e.value===1));
 assert.equal(exposed.events.filter(e=>e.kind==='primal:WG17').length,1);
 await page.locator('.game').screenshot({path:prefix+'-exposed.png'});
 await page.evaluate(()=>{window.primalStage='battle'});
 await wait(()=>window.lab.frame.weeklyBoss?.primal.cuts>=1);
 const first=await frame();
 assert.deepEqual([first.weeklyBoss.primal.left,first.platforms[0].x,first.platforms[0].w],[128,128,792]);
 await page.locator('.game').screenshot({path:prefix+'-cut.png'});
 await wait(()=>window.lab.frame.weeklyBoss?.primal.cuts===3,null,130000);
 const third=await frame();
 assert.deepEqual([third.weeklyBoss.primal.left,third.platforms[0].x,third.platforms[0].w],[304,304,616]);
 await page.locator('.game').screenshot({path:prefix+'-narrow.png'});
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn',null,65000);
 const finished=await frame();
 assert.equal(finished.returns,0);
 assert.equal(finished.endgame.bosses[id].clears,1);
 assert.equal(finished.story.quests[quest].count,1);
 const cuts=await page.evaluate(()=>window.primalCuts);
 const trials=await page.evaluate(()=>window.primalTrials);
 assert.deepEqual(cuts.map(c=>c.left),[40,128,216,304]);
 assert.ok(cuts.every(c=>c.left===c.collisionLeft));
 assert.ok(trials.includes('WG05')&&trials.includes('WG14'));
 await page.getByRole('button',{name:'拠点へ：ナタ・谷の集落',exact:true}).click();
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
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({scenery,trials,cuts,physicalBarrierConfirmed:true,
  trialStatus,firstExposedTicks:exposed.weeklyBoss.primal.exposure,commands:{png:gate.commands,standard:standard.commands,light:reduced.commands},
  viewport390:true,clearReportRestore:true,remainingHp:finished.actors[0].hp,errors},null,2)+'\n');
 console.log('Primal Fire Chrome: gate, three real cuts, defeat, report, save and visual profiles passed');
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,boss:f?.weeklyBoss,t:f?.t,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.atk]),
  cuts:await page.evaluate(()=>window.primalCuts),trials:await page.evaluate(()=>window.primalTrials),
  evidence:f?.events?.filter(e=>e.kind.startsWith('primal:')).slice(-16),
  status:await page.locator('#status').textContent(),errors},null,2));
 await page.screenshot({path:'work/primal-fire-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
