import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9048/';
const hub='inazuma-town',arena='signora-ten-shrine-arena',boss='boss-29050101';
const quest='signora-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/signora-weekly-gear.json','utf8');
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const errors=[],players=[];
const frame=page=>page.evaluate(()=>window.lab.frame);

async function start(accept){
 const context=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await context.newPage();
 page.setDefaultTimeout(45000);
 page.on('pageerror',e=>errors.push(e.message));
 const route=waypointDriver(page,nodes,{walkTimeout:22000});
 players.push({page,route});
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
  const held=new Set(),stages=new Set(),moths=new Set(),strikes=new Map();
  const start=window.lab.frame.t;
  let cooling=0,sealDamage=0;
  const sealEvents=new Set();
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1];
   for(const e of Array.isArray(f.events)?f.events:[]){
    if(e.t<start||e.actor!==f.active||e.target!==29050101)continue;
    if(e.kind==='hit')strikes.set(e.seq,e.value);
    if(e.kind==='signora:moth-used')moths.add(e.value);
    if(e.kind==='signora:seal-hit'&&!sealEvents.has(e.seq)){
     sealEvents.add(e.seq);sealDamage+=e.value;
    }
   }
   if(b)stages.add(b.signoraStage);
   if(b?.phase==='respawn'||f.returns||!b||f.t-start>125){
    for(const code of [...held])key(code,false);
    window.signoraCoopResult={won:b?.phase==='respawn',stages:[...stages],moths:[...moths],sealDamage,hp:a.hp,
     manualDamage:[...strikes.values()].reduce((sum,n)=>sum+n,0),returns:f.returns};
    return;
   }
   const dx=b.x-a.x;
   let goal=b.x+side*68,attack=b.damageable;
   if(b.temperature>=53&&!cooling)cooling=!b.devices[0]&&(b.devices[1]||a.x<480)?70:890;
   if(b.temperature<5||!b.deviceEnabled)cooling=0;
   if(cooling){
    goal=cooling;attack=false;
   }else if(b.signoraStage==='seal'&&!b.seal.carrying){
    const available=Array.isArray(b.seal.moths)?b.seal.moths:[];
    const own=available.find(m=>(m.x<480)===(side<0));
    goal=own?.x??(side<0?152:808);attack=false;
   }
   const delta=goal-a.x;
   const turn=attack&&dx*a.dir<0&&Math.abs(dx)>8;
   const direction=Math.abs(delta)>7?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',direction<0);key('KeyD',direction>0);
   key('KeyG',Boolean(cooling)&&Math.abs(delta)<10);
   key('KeyJ',attack&&Math.abs(dx)<112&&!turn);
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
 const [a,b]=[host.page,guest.page],pages=[a,b];
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await b.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([host,guest].map(({route})=>route.cross(arena)));
 for(const page of pages)await page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.coop?.peers[0]?.actors.length===2&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===1280;
 });
 const before=await Promise.all(pages.map(frame));
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['inazuma','ready']);
 await Promise.all([host.route.walk(95),guest.route.walk(388)]);
 await b.waitForFunction(()=>window.lab.frame.weeklyBoss.temperature>0.65);
 await a.keyboard.down('KeyG');
 try{await a.waitForFunction(()=>window.lab.frame.weeklyBoss.devices[0]>0);}
 finally{await a.keyboard.up('KeyG')}
 await b.waitForFunction(()=>{
  const v=window.lab.frame.weeklyBoss;
  return v.devices[0]>0&&v.devices[1]===0&&v.temperature>0.65;
 });
 const localTemperature=(await frame(a)).weeklyBoss.temperature;
 const remoteTemperature=(await frame(b)).weeklyBoss.temperature;
 assert.ok(localTemperature<0.5&&remoteTemperature>0.65);

 await Promise.all([play(a,-1),play(b,1)]);
 await a.waitForFunction(()=>{
  const f=window.lab.frame,v=f.weeklyBoss;
  return v?.signoraStage==='seal'&&v.seal.ready&&f.draws.some(d=>d.text==='紅蓮蛾');
 },null,{timeout:45000});
 await a.locator('#game').screenshot({path:'evidence/coop-signora-cocoon.png'});
 await a.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.weeklyBoss?.signoraStage==='pyro'&&f.draws.some(d=>d.source==='signora-flame-idle-source-v1.png');
 },null,{timeout:75000});
 await a.locator('#game').screenshot({path:'evidence/coop-signora-flame.png'});
 await Promise.all(pages.map(page=>page.waitForFunction(()=>window.signoraCoopResult,null,{timeout:115000})));
 const results=await Promise.all(pages.map(page=>page.evaluate(()=>window.signoraCoopResult)));
 for(const r of results){
  assert.ok(r.won&&!r.returns&&r.manualDamage>0&&r.sealDamage>0&&r.moths.length>0,JSON.stringify(r));
  assert.deepEqual(r.stages,['cryo','seal','transform','pyro']);
 }
 assert.equal(new Set(results.flatMap(r=>r.moths)).size,4);
 const defeated=await Promise.all(pages.map(frame));
 assert.deepEqual(defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]),
  [[44850,860],[44850,860]]);
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(pages.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:36000,mora:3000});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-signora-browser.json',JSON.stringify({
  participants:2,hp:1280,localTemperature,remoteTemperature,sharedDeviceCooldown:true,
  results,scene,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: local release, independent moths, shared cocoon and flame, separate rewards and report.');
}catch(error){
 const state=await Promise.allSettled(players.map(({page})=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,actors:f.actors.map(a=>[a.x,a.y,a.hp]),t:f.t,
    result:window.signoraCoopResult,peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
