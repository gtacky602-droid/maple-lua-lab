import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9053/';
const hub='fontaine-hub',outer='narwhal-star-sea',inner='narwhal-inner-echo',boss='boss-29090101';
const quest='narwhal-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/narwhal-weekly-gear.json','utf8');
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const pages=[],errors=[];
const frame=page=>page.evaluate(()=>window.lab.frame);

async function start(accept){
 const context=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await context.newPage();
 pages.push(page);
 page.setDefaultTimeout(50000);
 page.on('pageerror',e=>errors.push(e.message));
 const route=waypointDriver(page,nodes,{walkTimeout:20000});
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(([key,data])=>localStorage.setItem(key,data),[key,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(hub);
 if(accept)await route.accept(quest);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function play(page,side){
 await page.evaluate(side=>{
  document.activeElement.blur();
  const held=new Set(),stages=new Set(),scenes=new Set(),seen=new Set();
  const kernels=[],returns=[];
  let damage=0,lastDodge=-10,eye=false,kernel=false;
  const start=window.lab.frame.t;
  const list=value=>Array.isArray(value)?value:[];
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.narwhal,a=f.actors[f.active-1];
   for(const e of list(f.events)){
    if(e.t<start||e.target!==29090101||seen.has(e.seq))continue;
    seen.add(e.seq);
    if(e.kind==='narwhal:WV05:broken'||e.kind==='narwhal:WV06:reserve')eye=true;
    if(e.kind==='narwhal:WV13:kernel-loss')kernel=true;
    if(e.kind==='narwhal:WV11:kernel-hit')kernels.push(e.value);
    if(e.kind==='narwhal:WV14:return-loss')returns.push(e.value);
    if(e.kind==='hit'&&e.actor===a.id)damage+=e.value;
   }
   if(b){stages.add(b.narwhalStage);scenes.add(f.story.node);}
   if(b?.phase==='respawn'||f.returns||!b||f.t-start>160){
    for(const code of [...held])key(code,false);
    window.narwhalCoopResult={won:b?.phase==='respawn',stages:[...stages],scenes:[...scenes],eye,kernel,kernels,
     returnDamage:returns,damage,returns:f.returns};
    return;
   }
   let goal=a.x,target,waitForPeer=false;
   if(v.object?.time>0){
    target=v.object.x;
    if(v.object.kind==='kernel'){
     const peer=f.coop?.peers[0]?.actors[0];
     waitForPeer=!!peer&&Math.abs(peer.x-target)>120&&v.object.time>105;
    }
   }else if(b.narwhalStage==='outer'){
    goal=480+side*140;
    if(eye&&side<0&&b.damageable&&v.h<96&&b.hp>b.maxhp*.52)target=b.x;
   }else if(b.narwhalStage==='inner'){
    if(kernel&&v.shadow.damageable)target=v.shadow.x;
    else goal=330+side*40;
   }else if(b.narwhalStage==='weak'){
    goal=b.x+side*68;
    if(window.narwhalFinish&&b.damageable)target=b.x;
   }
   if(target!==undefined){
    const approach=v.object?(a.x<target?-1:1):side;
    goal=target+approach*62;
   }
   const delta=goal-a.x,dx=target===undefined?0:target-a.x;
   const turn=target!==undefined&&dx*a.dir<0;
   const movement=Math.abs(delta)>7?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',movement<0);key('KeyD',movement>0);
   key('KeyJ',target!==undefined&&Math.abs(dx)<110&&!turn&&!waitForPeer);
   const danger=list(b.warnings).some(w=>w.starts-b.moveTick<=8&&w.starts-b.moveTick>=2
    &&a.x>w.lo&&a.x<w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
   if(!v.object&&danger&&f.t-lastDodge>2.2){lastDodge=f.t;window.lab.action('dodge');}
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },side);
}

async function save(page,reported=false){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(([key,boss,quest,reported])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return d?.weeklyBosses?.[boss]?.hp===0&&d?.endgame?.bosses?.[boss]?.clears===1
   &&(!reported||d?.story?.quests?.[quest]?.status==='complete');
 },[key,boss,quest,reported]);
 return page.evaluate(([key,boss,quest])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return {wait:d.weeklyBosses[boss].waitTicks,clears:d.endgame.bosses[boss].clears,
   xp:d.progression.killXp,mora:d.mora,quest:d.story.quests[quest]?.status??null};
 },[key,boss,quest]);
}

async function scenery(page){
 return page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
}

try{
 const [host,guest]=await Promise.all([start(true),start(false)]);
 const [a,b]=[host.page,guest.page],players=[a,b];
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await b.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([host,guest].map(({route})=>route.cross(outer)));
 for(const page of players)await page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.coop?.peers[0]?.actors.length>=1&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===2200;
 });
 const before=await Promise.all(players.map(frame));
 const sea=await scenery(a);
 assert.equal(sea.state,'ready');
 await Promise.all([play(a,-1),play(b,1)]);
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.narwhal.object?.kind==='eye',null,{timeout:35000});
 await a.locator('#game').screenshot({path:'evidence/coop-narwhal-eye.png'});
 for(const page of players)await page.waitForFunction(inner=>{
  const f=window.lab.frame;
  return f.story.node===inner&&f.coop?.map===inner&&f.coop.peers[0]?.map===inner&&f.coop.peers[0]?.actors.length>0;
 },inner,{timeout:105000});
 const belly=await scenery(a);
 assert.deepEqual([belly.key,belly.state],['narwhalInner','ready']);
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.narwhal.object?.kind==='kernel',null,{timeout:30000});
 await a.locator('#game').screenshot({path:'evidence/coop-narwhal-kernel.png'});
 for(const page of players)await page.waitForFunction(outer=>{
  const f=window.lab.frame;
  return f.story.node===outer&&f.coop?.map===outer&&f.coop.peers[0]?.map===outer&&f.weeklyBoss?.narwhal.exposure>555;
 },outer,{timeout:48000});
 assert.ok((await Promise.all(players.map(frame))).every(f=>f.weeklyBoss.narwhal.epoch===4));
 await a.locator('#game').screenshot({path:'evidence/coop-narwhal-return.png'});
 await Promise.all(players.map(page=>page.evaluate(()=>{window.narwhalFinish=true})));
 await Promise.all(players.map(page=>page.waitForFunction(()=>window.narwhalCoopResult,null,{timeout:28000})));
 const results=await Promise.all(players.map(page=>page.evaluate(()=>window.narwhalCoopResult)));
 for(const result of results){
  assert.ok(result.won&&!result.returns&&result.eye&&result.kernel&&result.kernels.length>0
   &&result.damage>0,JSON.stringify(result));
  assert.deepEqual(result.stages,['outer','swallow','inner','expel','weak']);
  assert.deepEqual(result.scenes,[outer,inner]);
  assert.deepEqual(result.returnDamage,[440]);
 }
 assert.deepEqual(results.flatMap(r=>r.kernels).sort(),[1,2,3,4]);
 const defeated=await Promise.all(players.map(frame));
 const rewards=defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===2500));
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(players.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:230000,mora:8500});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-narwhal-browser.json',JSON.stringify({
  participants:2,hp:2200,scenes:{sea,belly},results,rewards,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: Narwhal eye, shared belly/kernel, same-room return, separate rewards and report.');
}catch(error){
 const state=await Promise.allSettled(pages.map(page=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,t:f.t,actors:f.actors.map(a=>[a.x,a.y,a.hp]),
   result:window.narwhalCoopResult,events:f.events.filter(e=>e.kind.startsWith('narwhal')).slice(-20),
   peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
