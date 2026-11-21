import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9050/';
const hub='inazuma-town',arena='raiden-thunder-echo-arena',boss='boss-29060201';
const quest='raiden-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/raiden-weekly-gear.json','utf8');
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
 const route=waypointDriver(page,nodes,{walkTimeout:22000});
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
  const held=new Set(),stages=new Set(),seen=new Set(),charged=[],timeline=[];
  const start=window.lab.frame.t;
  let protectedHits=0,unprotected=0,lastDodge=-10,retreat=side<0?82:900,manualDamage=0;
  let firstDome=true;
  let previousMove;
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1],flower=b?.flower;
   for(const e of Array.isArray(f.events)?f.events:[]){
    if(e.t<start||e.actor!==f.active||e.target!==29060201||seen.has(e.seq))continue;
    seen.add(e.seq);
    if(e.kind==='raiden:WR14:charge')charged.push(e.value);
    if(e.kind==='raiden:WR15:protected')protectedHits++;
    if(e.kind==='raiden:WR15:hit')unprotected++;
    if(e.kind==='hit')manualDamage+=e.value;
   }
   if(b){
    stages.add(b.raidenStage);
    const move=b.move??b.raidenStage;
    if(move!==previousMove){
     previousMove=move;
     timeline.push([move,b.hp,Math.round(b.raidenMeter.value),Math.round(f.t-start)]);
    }
   }
   if(b?.phase==='respawn'||f.returns||!b||f.t-start>175){
    for(const code of [...held])key(code,false);
    window.raidenResult={won:b?.phase==='respawn',stages:[...stages],charged,protectedHits,unprotected,manualDamage,returns:f.returns,timeline};
    return;
   }
   if(unprotected||protectedHits)firstDome=false;
   const objects=Array.isArray(b.targets)?b.targets:[];
   const eye=objects.filter(x=>x.kind==='eye').sort((x,y)=>Math.abs(x.x-a.x)-Math.abs(y.x-a.x))[0];
   const shade=b.moveTick>=126&&objects.find(x=>x.clue==='╳');
   let target,goal;
   if(flower){
    if(b.move==='WR15')goal=flower.x+(side>0&&firstDome?192:side*38);
    else if(flower.ready&&!flower.protected)target=flower.x;
    else goal=flower.x+side*58;
   }else if(eye&&b.moveTick<260)target=eye.x;
   else if(shade)target=shade.x;
   else if(b.damageable&&window.raidenCanFinish)target=b.x;
   else if(b.raidenStage==='collapse')goal=b.x+side*60;
   if(target!==undefined)goal=target+side*62;
   if(goal===undefined){
    if(Math.abs(a.x-retreat)<18&&Math.abs(a.x-b.x)<174)retreat=960-retreat;
    goal=retreat;
   }
   const delta=goal-a.x,dx=target===undefined?0:target-a.x;
   const turn=target!==undefined&&dx*a.dir<0;
   const movement=Math.abs(delta)>7?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',movement<0);key('KeyD',movement>0);
   key('KeyJ',target!==undefined&&Math.abs(dx)<106&&!turn);
   const jump=b.move==='WR12'&&[120,210,300,390].some(t=>b.moveTick>=t-8&&b.moveTick<t+36);
   key('Space',jump);
   if(jump&&a.ground)window.lab.action('jump');
   const warnings=Array.isArray(b.warnings)?b.warnings:[];
   const imminent=warnings.some(w=>w.starts-b.moveTick<=8&&w.starts-b.moveTick>=2
    &&a.x>w.lo&&a.x<w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
   if(!flower&&!jump&&!eye&&(imminent||b.phase==='active')&&f.t-lastDodge>2.2){
    lastDodge=f.t;window.lab.action('dodge');
   }
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
  return f.coop?.peers[0]?.actors.length===2&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===1500;
 });
 const before=await Promise.all(players.map(frame));
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.equal(scene.state,'ready');
 await Promise.all([play(a,-1),play(b,1)]);
 await a.waitForFunction(()=>{
  const f=window.lab.frame,v=f.weeklyBoss;
  return v?.move==='WR15'&&v.flower.protected&&v.moveTick>=62;
 },null,{timeout:130000});
 const dome=(await frame(a)).weeklyBoss.flower;
 assert.deepEqual([dome.x,dome.value],[480,5]);
 await Promise.all([
  a.locator('#game').screenshot({path:'evidence/coop-raiden-dome.png'}),
  b.waitForFunction(()=>window.lab.frame.events.some(e=>e.kind==='raiden:WR15:hit'&&e.actor===window.lab.frame.active)),
 ]);
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.down>460||window.raidenResult,null,{timeout:130000});
 assert.ok((await frame(a)).weeklyBoss?.down>410,'The encounter must finish its collapse before the finishing attacks');
 await a.locator('#game').screenshot({path:'evidence/coop-raiden-collapse.png'});
 await Promise.all(players.map(page=>page.evaluate(()=>{window.raidenCanFinish=true})));
 await Promise.all(players.map(page=>page.waitForFunction(()=>window.raidenResult,null,{timeout:25000})));
 const results=await Promise.all(players.map(page=>page.evaluate(()=>window.raidenResult)));
 assert.ok(results.every(r=>r.won&&!r.returns&&r.manualDamage>0&&r.charged.length>0
  &&['normal','awaken','armored','collapse'].every(stage=>r.stages.includes(stage))),JSON.stringify(results));
 assert.ok(results[0].protectedHits>0&&results[1].unprotected>0,JSON.stringify(results));
 const defeated=await Promise.all(players.map(frame));
 const rewards=defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===980));
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(players.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:44000,mora:3400});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-raiden-browser.json',JSON.stringify({
  participants:2,hp:1500,dome,results,scene,rewards,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: shared Raiden charges, local protection, armor collapse, separate rewards and report.');
}catch(error){
 const state=await Promise.allSettled(pages.map(page=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,actors:f.actors.map(a=>[a.x,a.y,a.hp]),t:f.t,
   result:window.raidenResult,peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
