import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:9068/';
const capitano=process.argv.includes('--capitano');
const xbalanque=process.argv.includes('--xbalanque');
const rerir=process.argv.includes('--rerir');
const beidou=process.argv.includes('--beidou');
const cfg=beidou
 ? {name:'beidou',hub:'liyue-harbor',arena:'liyue-stygian-deck',entity:990002,hp:1250,mora:2270,mode:'hard',card:'baited',lock:10,hit:41}
 : rerir
 ? {name:'rerir',hub:'nod-town',arena:'nod-stygian-hunt',entity:990005,hp:2180,mora:22300,card:'RR01',lock:18,hit:42}
 : xbalanque
 ? {name:'xbalanque',hub:'natlan-hub',arena:'natlan-solar-court',entity:990004,hp:1780,mora:2530,card:'XB01',lock:12,hit:36}
 : capitano
 ? {name:'capitano',hub:'snezhnaya-hub',arena:'sne-stygian-frost-court',entity:990003,hp:2430,mora:4200,card:'CP01',lock:12,hit:36}
 : {name:'farka',hub:'mond-town',arena:'mond-stygian-dual-court',entity:990001,hp:670,mora:2400,card:'FK01',lock:24,hit:48};
const key='maple-lua-lab.checkpoint.v1';
const prefix=`evidence/coop-stygian-${cfg.name}`;
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const errors=[];
const frame=page=>page.evaluate(()=>window.lab.frame);

async function open(set){
 const context=await browser.newContext({viewport:{width:1230,height:940}});
 const page=await context.newPage();
 page.setDefaultTimeout(25000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{
  if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
 });
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(`work/coop-stygian-${cfg.name}-fixture.json`);
 const route=waypointDriver(page,nodes);
 await route.waitNode(cfg.hub);
 await route.cross(cfg.arena);
 await page.locator('#coopPanel summary').click();
 await page.locator('#stygianMode').selectOption(cfg.mode||'normal');
 await page.locator('#stygianSet').selectOption(set);
 return {page,route};
}

async function drive(page,side){
 await page.evaluate(({side,cfg})=>{
  const pressed=new Set();
  const seen={stages:[],hits:0};
  window.coopStygianTrail=seen;
  const event=(code,on)=>{
   if(pressed.has(code)===on)return;
   if(on)pressed.add(code);else pressed.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  let lastHit=0;
  function loop(){
   const f=window.lab.frame,v=f.endgameRun,b=f.boss;
   if(v?.status!=='fighting'){
    for(const code of [...pressed])event(code,false);
    return;
   }
   if(!seen.stages.includes(v.stage))seen.stages.push(v.stage);
   for(const hit of Object.values(f.events||{}))if(hit.kind==='hit'&&hit.target===cfg.entity&&hit.seq>lastHit){
    lastHit=hit.seq;seen.hits++;
   }
   const a=f.actors[f.active-1],dx=b.x-a.x;
   const target=v.safe?(v.safe.left+v.safe.right)/2:side<0?Math.max(38,b.x-65):Math.min(918,b.x+65);
   const move=target-a.x;
   if(v.card==='XB08'&&v.phase==='recover')seen.finalRecovery=true;
   const holdingForFinale=cfg.name==='xbalanque'&&v.stage===3&&!seen.finalRecovery;
   const attack=!holdingForFinale&&!['phase','enter'].includes(v.phase)&&Math.abs(dx)<105&&a.dir===Math.sign(dx)&&Math.abs(a.y-b.y)<72;
   event('KeyA',move< -12||(!attack&&Math.abs(move)<=12&&a.dir>0&&dx<0&&Math.abs(dx)>17));
   event('KeyD',move>12||(!attack&&Math.abs(move)<=12&&a.dir<0&&dx>0&&Math.abs(dx)>17));
   const fkJump=(v.child||v.card)==='FK05'&&(v.childTick??v.tick)>=86&&(v.childTick??v.tick)<120;
   const cpJump=(v.card==='CP05'&&v.tick>=49&&v.tick<108)||(v.card==='CP09'&&v.tick>=195&&v.tick<231);
   event('Space',fkJump||cpJump);
   event('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },{side,cfg});
}

async function driveRerir(page,first){
 await page.evaluate(first=>{
  const pressed=new Set(),lamps=new Set();
  let trial,jumpUntil=0;
  const trail=window.coopStygianTrail={stages:[],lamps:[],protected:{},interlude:false};
  const key=(code,on)=>{
   if(pressed.has(code)===on)return;
   if(on)pressed.add(code);else pressed.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  function loop(){
   const f=window.lab.frame,v=f.endgameRun,b=f.boss;
   if(v?.status!=='fighting'){
    for(const code of [...pressed])key(code,false);
    return;
   }
   if(!trail.stages.includes(v.stage))trail.stages.push(v.stage);
   if(v.phase==='interlude')trail.interlude=b.hp===0&&!v.matchReward;
   const a=f.actors[f.active-1],dx=b.x-a.x,t=v.tick;
   let goal=a.x,attack=false,jump=false;
   if(v.card==='RR05'){
    if(v.lampReady&&!lamps.has(v.fogAttempt)&&first===(v.fogAttempt%2===1)){
     lamps.add(v.fogAttempt);trail.lamps.push(v.fogAttempt);
     key('KeyH',true);key('KeyH',false);
    }
   }else if(v.trial&&t<1080){
    if(trial!==v.trial){trial=v.trial;jumpUntil=0;}
    const collects=first?v.trial===1:v.trial===2;
    if(collects&&t>=120&&t<960){
     const p=v.pickups?.find(p=>!p.owner);
     if(p){
      goal=p.x;
      if(p.y<400&&a.y>400&&Math.abs(a.x-p.x)<122&&t>jumpUntil+10)jumpUntil=t+39;
      jump=t<jumpUntil;
     }
    }else if(!collects)goal=first?50:910;
    if(t>=1008)trail.protected[v.trial]=v.protected===true;
   }else if(v.trial===2&&t>=1080||v.stage===1||b.hp>b.maxhp*.234){
    if(!['enter','fog-entry','blessing','interlude'].includes(v.phase)){
     goal=b.x-Math.sign(dx||1)*74;
     if(Math.abs(goal-a.x)<11&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*20;
     attack=Math.abs(dx)<107&&Math.sign(dx)===a.dir&&a.y>422;
    }
   }else goal=first?50:910;
   key('KeyA',goal<a.x-7);key('KeyD',goal>a.x+7);key('Space',jump);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },first);
}

async function driveBeidou(page,bait){
 await page.evaluate(bait=>{
  const held=new Set(),seen=new Set();
  const trail=window.coopStygianTrail={baited:0,wake:false,hits:0};
  const key=(code,pressed)=>{
   if(held.has(code)===pressed)return;
   if(pressed)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  function loop(){
   const f=window.lab.frame,v=f.endgameRun,b=f.boss;
   if(v?.status!=='fighting'){
    for(const code of [...held])key(code,false);
    return;
   }
   for(const event of Object.values(f.events||{})){
    if(seen.has(event.seq))continue;
    seen.add(event.seq);
    if(event.kind==='stygian:beidou:baited')trail.baited++;
    if(event.kind==='stygian:beidou:opening-hit')trail.hits++;
   }
   const a=f.actors[f.active-1],dx=b.x-a.x;
   let goal=a.x,attack=false;
   if(v.card==='wake')trail.wake=true;
   if(v.phase==='recover'&&trail.wake){
    const dir=Math.sign(dx||1);
    goal=b.x-dir*66;
    if(Math.abs(goal-a.x)<10&&a.dir!==dir)goal=a.x+dir*20;
    attack=Math.abs(dx)<109&&a.dir===dir&&a.y>420;
   }else if(v.area&&['tell','strike'].includes(v.phase)){
    const area=v.area;
    if(a.x>=area.left-10&&a.x<=area.right+10){
     const lo=area.left-28,hi=area.right+28;
     goal=hi>940||(lo>=20&&a.x-lo<hi-a.x)?lo:hi;
    }
   }else if(!trail.wake){
    goal=b.x-(bait?66:193);
    if(bait&&v.phase==='guard'&&!trail.baited){
     if(Math.abs(goal-a.x)<10&&a.dir!==1)goal=a.x+20;
     attack=dx>32&&dx<107&&a.dir===1&&a.y>420;
    }
   }
   key('KeyA',goal<a.x-7);key('KeyD',goal>a.x+7);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },bait);
}

try{
 const players=await Promise.all([open('troupe'),open('gladiator')]);
 const [{page:host},{page:guest}]=players;
 await host.locator('#coopCreate').click();
 await host.waitForFunction(()=>window.lab.frame.coop.code);
 const code=(await frame(host)).coop.code;
 await guest.locator('#coopCode').fill(code);
 await guest.locator('#coopJoin').click();
 await guest.waitForFunction(c=>window.lab.frame.coop.code===c,code);
 await host.locator('#stygianStart').click();
 await host.waitForFunction(()=>window.lab.frame.endgameRun?.gathering>0);
 await guest.locator('#stygianStart').click();
 await guest.waitForFunction(()=>window.lab.frame.endgameRun?.gathering>0);
 if(beidou)await Promise.all([driveBeidou(host,false),driveBeidou(guest,true)]);
 else await Promise.all(players.map(({route})=>route.walk(510)));
 const telegraphs=await Promise.all(players.map(async({page})=>{
  const value=await page.waitForFunction(cfg=>{
   const f=window.lab.frame,v=f.endgameRun;
   const areas=v.areas||(v.area&&[v.area]);
   return v.card===cfg.card&&v.phase!=='strike'&&v.tick>=cfg.lock&&v.tick<cfg.hit&&areas?.length>0&&
    {direction:f.boss.dir,maxhp:f.boss.maxhp,areas,targetSlot:v.targetSlot};
  },cfg);
  return value.jsonValue();
 }));
 assert.deepEqual(telegraphs[0],telegraphs[1]);
 assert.equal(telegraphs[0].maxhp,cfg.hp);
 if(capitano||xbalanque)assert.ok([1,2].includes(telegraphs[0].targetSlot));
 if(beidou)assert.equal(telegraphs[0].targetSlot,(await frame(guest)).coop.slot);
 await host.locator('#game').screenshot({path:prefix+'-warning.png'});
 if(rerir)await Promise.all([driveRerir(host,true),driveRerir(guest,false)]);
 else if(!beidou)await Promise.all([drive(host,-1),drive(guest,1)]);
 let safeLane;
 if(beidou){
  await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.lab.frame.endgameRun?.card==='wake')));
  await guest.locator('#game').screenshot({path:prefix+'-wake.png'});
 }
 if(xbalanque){
  const lanes=await Promise.all(players.map(async({page})=>{
   const value=await page.waitForFunction(()=>{
    const f=window.lab.frame,v=f.endgameRun,a=f.actors[f.active-1];
    return v.card==='XB08'&&v.tick>=228&&v.tick<240&&v.safe&&a.x>v.safe.left&&a.x<v.safe.right&&v.safe;
   },null,{timeout:95000});
   return value.jsonValue();
  }));
  assert.deepEqual(lanes[0],lanes[1]);
  safeLane=lanes[0];
  await host.locator('#game').screenshot({path:prefix+'-safe-lane.png'});
 }
 if(rerir){
  await Promise.all(players.map(({page})=>page.waitForFunction(
   ()=>window.lab.frame.endgameRun?.lampReady||window.lab.frame.endgameRun?.lampOwner)));
  await host.locator('#game').screenshot({path:prefix+'-fog.png'});
  await guest.waitForFunction(()=>{
   const v=window.lab.frame.endgameRun;
   return v?.trial===2&&v.collected===3&&v.tick<960;
  },null,{timeout:125000});
  const trial=await frame(host);
  assert.equal(trial.endgameRun.trial,2);
  assert.equal(trial.endgameRun.collected,0);
  await guest.locator('#game').screenshot({path:prefix+'-trial.png'});
 }
 await Promise.all(players.map(({page})=>page.waitForFunction(
  ()=>window.lab.frame.endgameRun?.status==='clear',null,{timeout:rerir?130000:110000})));
 const settled=await Promise.all(players.map(({page})=>frame(page)));
 const rewards=settled.map(f=>f.endgameRun.matchReward);
 assert.deepEqual(rewards.map(r=>r.set),['黄金の劇団','剣闘士のフィナーレ']);
 const matchKey=`${cfg.name}:${cfg.mode||'normal'}`;
 assert.ok(settled.every(f=>f.boss.hp===0&&f.endgame.stygian[matchKey].clears===1));
 assert.ok(rewards.every(reward=>reward.first&&reward.mora===cfg.mora));
 const trails=await Promise.all(players.map(({page})=>page.evaluate(()=>window.coopStygianTrail)));
 if(rerir){
  assert.deepEqual(trails.map(t=>t.lamps),[[1],[2]]);
  assert.deepEqual(trails.map(t=>t.protected),[{1:true,2:false},{1:false,2:true}]);
  assert.ok(trails.every(t=>t.interlude&&t.stages.join()==='1,2'));
 }else assert.ok(trails.every(trail=>trail.hits>0));
 if(beidou)assert.ok(trails.every((trail,index)=>trail.wake&&trail.baited===index));
 if(xbalanque)assert.ok(trails.every(trail=>trail.finalRecovery));
 await host.locator('#game').screenshot({path:prefix+'-clear.png'});
 await Promise.all(players.map(async({page})=>{
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.stygian?.[id]?.clears===1,
   [key,matchKey]);
 }));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({players:2,warning:telegraphs[0],safeLane,trails,rewards,
  clearsSavedForBoth:true,errors},null,2)+'\n');
 console.log('Chrome: shared telegraph, phases, personal sets and saved clears passed.');
}finally{
 await browser.close();
}
