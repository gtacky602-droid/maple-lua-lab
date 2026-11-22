import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const hub='mond-town', arena='mond-gate-chess-court', boss='boss-29122000';
const quest='gate-weekly-commission', saveKey='maple-lua-lab.checkpoint.v1';
const url=process.env.LAB_URL||'http://127.0.0.1:9056/';
const fixture=await fs.readFile('work/gate-weekly-gear.json','utf8');
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const pages=[],errors=[];
const frame=page=>page.evaluate(()=>window.lab.frame);
const capture=(page,tag)=>page.locator('.game').screenshot({path:'evidence/coop-gate-'+tag+'.png'});

async function start(accept){
 const context=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await context.newPage();
 pages.push(page);
 page.setDefaultTimeout(60000);
 page.on('pageerror',e=>errors.push(e.message));
 const route=waypointDriver(page,nodes,{walkTimeout:22000});
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(([key,data])=>localStorage.setItem(key,data),[saveKey,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(hub);
 if(accept)await route.accept(quest);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function drive(page,host){
 await page.evaluate(host=>{
  document.activeElement.blur();
  const keys=new Set(), seen=new Set(), stages=[], pawns=[], freezes=[], transfers=[], lures=[];
  let damage=0,collision=false,sawReservation=false;
  const start=window.lab.frame.t;
  function setKey(code,on){
   if(keys.has(code)===on)return;
   on?keys.add(code):keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function step(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.gate,a=f.actors[f.active-1];
   for(const e of f.events){
    if(e.t<start||seen.has(e.seq))continue;
    seen.add(e.seq);
    if(e.kind==='gate:WT04:pawn')pawns.push(e.value);
    if(e.kind==='gate:WT20:complete')freezes.push(e.value);
    if(e.kind==='gate:WT17:lock')lures.push(e.value);
    if(e.kind==='gate:WT17:collision')collision=true;
    if(e.kind==='gate:WT19:transfer')transfers.push(e.value);
    if(e.kind==='hit'&&(e.target===29122001||e.target===29122002)&&e.actor===a.id)damage+=e.value;
   }
   if(!v||b.phase==='respawn'||f.returns||f.t-start>145){
    for(const code of [...keys])setKey(code,false);
    window.gateCoopResult={won:b?.phase==='respawn',returns:f.returns,damage,stages,pawns,freezes,lures,collision,transfers,sawReservation};
    return;
   }
   if(stages.at(-1)!==v.stage)stages.push(v.stage);
   if(v.frostOwner&&!v.hold&&v.hold!==0)sawReservation=true;
   let goal=a.x,target,attack=false,jump=false,hold=false;
   if(v.card==='WT03'){
    goal=host?672:760;
    if(v.run?.mine&&v.run.t>=98&&v.run.t<142)jump=true;
   }else if(v.stage!=='royal'){
    if(v.card==='WT09')goal=host?84:874;
    else if(host)target=v.bodies.find(e=>e.damageable);
    else goal=874;
   }else if(!collision&&v.card==='WT17'){
    if(v.freeze<100){
     goal=host?84:874;
     hold=Boolean(v.nearFrost)&&!v.releaseRequired&&(host?v.freeze===50:v.freeze===0);
    }else{
     goal=host?(v.run?.mine?690:396):760;
     jump=Boolean(v.run?.mine&&v.run.t>=237&&v.run.t<282);
    }
   }else if(v.stage==='royal'){
    if(host||transfers.length)target=v.bodies.find(e=>e.damageable&&e.kind===(host?'king':'queen'));
    if(!target&&transfers.length)target=v.bodies.find(e=>e.damageable);
    if(!target&&!host)goal=720;
   }
   if(target){
    const afterPair=v.stage==='royal';
    const side=afterPair&&!host?1:-1;
    goal=Math.max(57,Math.min(890,target.x+side*(afterPair?100:74)));
    const dx=target.x-a.x;
    if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*22;
    attack=Math.abs(dx)<111&&Math.sign(dx)===a.dir&&(!afterPair||transfers.length||a.x<target.x-84);
   }
   setKey('KeyA',goal<a.x-9);setKey('KeyD',goal>a.x+9);
   setKey('KeyG',hold);setKey('Space',jump);setKey('KeyJ',attack);
   requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
 },host);
}

async function saved(page,reported=false){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(([key,boss,quest,reported])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return d?.weeklyBosses?.[boss]?.hp===0&&d?.endgame?.bosses?.[boss]?.clears===1
   &&(!reported||d?.story?.quests?.[quest]?.status==='complete');
 },[saveKey,boss,quest,reported]);
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
 await Promise.all(players.map(p=>p.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.coop?.peers[0]?.actors.length>=1&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===3620;
 })));
 const before=await Promise.all(players.map(frame));
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['gateCourt','ready']);
 await Promise.all([drive(a,true),drive(b,false)]);
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.gate?.pawns?.length===3);
 await capture(a,'pawns');
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.gate?.frostOwner===2,null,{timeout:65000});
 const open=await frame(a);
 assert.equal(open.weeklyBoss.gate.hold,undefined);
 assert.match(await a.locator('#weeklyGateHint').textContent(),/旅人 2が霜印を使用中/);
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.gate?.run?.goal>=612);
 await capture(a,'lure');
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.gate?.exposure>0);
 await capture(a,'exposure');
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.gate?.transfer>0);
 await capture(a,'transfer');
 await Promise.all(players.map(p=>p.waitForFunction(()=>window.gateCoopResult,null,{timeout:60000})));
 const results=await Promise.all(players.map(p=>p.evaluate(()=>window.gateCoopResult)));
 for(const r of results){
  assert.ok(r.won&&!r.returns&&r.damage>0&&r.collision&&r.transfers[0]>0,JSON.stringify(r));
  assert.deepEqual(r.pawns,[2,1,0]);
  assert.deepEqual(r.freezes,[50,100]);
  assert.ok(r.lures[0]>=612);
  assert.deepEqual(r.stages,['king','queen','finish','royal']);
 }
 const after=await Promise.all(players.map(frame));
 const rewards=after.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.deepEqual(rewards,[[1054500,4200],[1054500,4200]]);
 const questCounts=after.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 await Promise.all(players.map(p=>saved(p)));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:570000,mora:16100});
 await saved(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-gate-browser.json',JSON.stringify({participants:2,hp:3620,scene,results,rewards,questCounts,report,errors},null,2)+'\n');
 console.log('Chrome: shared pawns, exclusive frost, queen lure, paired transfer, independent rewards and report.');
}catch(error){
 const state=await Promise.allSettled(pages.map(p=>p.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,t:f.t,actors:f.actors.map(a=>[a.x,a.y,a.hp]),
   events:f.events.filter(e=>e.kind.startsWith('gate:')).slice(-18),result:window.gateCoopResult,
   status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
