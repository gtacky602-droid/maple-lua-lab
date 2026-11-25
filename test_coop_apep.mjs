import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9052/';
const hub='sumeru-hub',arena='apep-oasis-heart-arena',boss='boss-29080101';
const quest='apep-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/apep-weekly-gear.json','utf8');
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
  const held=new Set(),stages=new Set(),seen=new Set(),defeated=[],safe=[],struck=[];
  let damage=0,failures=0,lastJump=-10,lastDodge=-10,lastRetry=-10;
  const start=window.lab.frame.t;
  const list=value=>Array.isArray(value)?value:[];
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.apep,a=f.actors[f.active-1];
   for(const e of list(f.events)){
    if(e.t<start||e.target!==29080101||seen.has(e.seq))continue;
    seen.add(e.seq);
    if(e.kind==='apep:WP06:defeated')defeated.push(e.value);
    if(e.actor!==a.id)continue;
    if(e.kind==='apep:WP17:protected')safe.push(e.value);
    if(e.kind==='apep:WP17:hit')struck.push(e.value);
    if(e.kind==='hit')damage+=e.value;
   }
   if(b)stages.add(b.apepStage);
   if(b?.phase==='respawn'||f.returns||!b||f.t-start>140){
    for(const code of [...held])key(code,false);
    window.apepCoopResult={won:b?.phase==='respawn',stages:[...stages],defeated,safe,struck,damage,failures,returns:f.returns};
    return;
   }
   let goal=a.x,target;
   if(b.apepStage==='dark'&&b.damageable)target=b.x;
   if(b.apepStage==='defense'){
    const score=e=>Math.abs(a.x-e.x)+(e.role==='breeder'&&e.shell>0?135:0)
     -(e.role==='warden'?95:e.role==='burst'?185:0)-Math.max(0,190-Math.abs(480-e.x))*.45
     +((e.x-480)*side<0?100:0);
    const unit=list(v.units).filter(e=>!e.guarded).sort((l,r)=>score(l)-score(r))[0];
    if(unit)target=unit.x;
    else goal=480+side*105;
   }
   if(b.apepStage==='failed'&&side<0&&f.t-lastRetry>1){
    lastRetry=f.t;failures++;
    document.querySelector('#weeklyApepRetry').click();
   }
   if(b.apepStage==='prime')goal=side<0?95:880;
   if(b.apepStage==='shelter')goal=side<0?132:715;
   if(b.apepStage==='weak'){
    goal=b.x+side*63;
    if(window.apepFinish&&b.damageable)target=b.x;
   }
   if(target!==undefined){
    const approach=b.apepStage==='defense'?(a.x<target?-1:1):side;
    goal=target+approach*61;
   }
   const delta=goal-a.x,dx=target===undefined?0:target-a.x;
   const turn=target!==undefined&&dx*a.dir<0;
   const movement=Math.abs(delta)>7?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',movement<0);key('KeyD',movement>0);
   key('KeyJ',target!==undefined&&Math.abs(dx)<110&&!turn);
   if(list(v.walls).some(w=>Math.abs(a.x-w.x)<58&&Math.sign(w.x-a.x)===movement)&&a.ground&&f.t-lastJump>.65){
    lastJump=f.t;window.lab.action('jump');
   }
   key('Space',f.t-lastJump<.65);
   const danger=list(b.warnings).some(w=>w.at-b.moveTick<=7&&w.at-b.moveTick>=2
    &&a.x>w.lo&&a.x<w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
   if(danger&&f.t-lastDodge>2.2){lastDodge=f.t;window.lab.action('dodge');}
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

try{
 const [host,guest]=await Promise.all([start(true),start(false)]);
 const [a,b]=[host.page,guest.page],players=[a,b];
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await b.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([host,guest].map(({route})=>route.cross(arena)));
 for(const page of players)await page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.coop?.peers[0]?.actors.length>=1&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===1580;
 });
 const before=await Promise.all(players.map(frame));
 assert.deepEqual(before.map(f=>f.weeklyBoss.phaseHp.map(p=>p.max)),[[560,1020],[560,1020]]);
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['oasisHeart','ready']);
 await Promise.all([play(a,-1),play(b,1)]);
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.apep.units?.length>=3,null,{timeout:40000});
 await a.locator('#game').screenshot({path:'evidence/coop-apep-defense.png'});
 await a.waitForFunction(()=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  return window.apepCoopResult||b?.apepStage==='shelter'&&b.apep.protected&&b.moveTick>=543;
 },null,{timeout:110000});
 assert.equal((await frame(a)).weeklyBoss?.apepStage,'shelter');
 await b.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.events.some(e=>e.kind==='apep:WP17:hit'&&e.actor===f.active&&e.value===4);
 },null,{timeout:15000});
 const domes=(await frame(a)).weeklyBoss.apep.domes;
 assert.equal(domes.filter(d=>d.open).length,3);
 await a.locator('#game').screenshot({path:'evidence/coop-apep-domes.png'});
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.apep.exposure>445,null,{timeout:18000});
 await a.locator('#game').screenshot({path:'evidence/coop-apep-exposure.png'});
 await Promise.all(players.map(page=>page.evaluate(()=>{window.apepFinish=true})));
 await Promise.all(players.map(page=>page.waitForFunction(()=>window.apepCoopResult,null,{timeout:30000})));
 const results=await Promise.all(players.map(page=>page.evaluate(()=>window.apepCoopResult)));
 for(const result of results){
  assert.ok(result.won&&!result.returns&&result.defeated.length>0&&result.damage>0,JSON.stringify(result));
  assert.deepEqual(result.stages.filter(s=>s!=='failed'),['dark','expose','defense','rebirth','prime','shelter','weak']);
 }
 assert.ok(results[0].safe.includes(4)&&!results[0].struck.length&&results[1].struck.includes(4));
 assert.equal(new Set(results.flatMap(r=>r.defeated)).size,results.flatMap(r=>r.defeated).length);
 const defeated=await Promise.all(players.map(frame));
 const rewards=defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===1500));
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(players.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:90000,mora:5600});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-apep-browser.json',JSON.stringify({
  participants:2,hp:1580,domes:domes.length,results,scene,rewards,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: shared Apep defense, personal shelter, counterattack, separate rewards and report.');
}catch(error){
 const state=await Promise.allSettled(pages.map(page=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,t:f.t,actors:f.actors.map(a=>[a.x,a.y,a.hp]),
   result:window.apepCoopResult,events:f.events.filter(e=>e.kind.startsWith('apep')).slice(-20),
   peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
