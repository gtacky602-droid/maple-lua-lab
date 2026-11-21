import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9055/';
const hub='natlan-hub',arena='primal-fire-sundered-forge',boss='boss-29091101';
const quest='primal-fire-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/primal-fire-weekly-gear.json','utf8');
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
  const held=new Set(),seen=new Set(),trials=new Set(),floors=[],initialGate=[];
  const start=window.lab.frame.t;
  let damage=0,falls=0,marks=0,lastDodge=-10;
  const list=v=>Array.isArray(v)?v:[];
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.primal,a=f.actors[f.active-1];
   for(const e of list(f.events)){
    if(e.t<start||e.target!==29091101||e.actor!==a.id||seen.has(e.seq))continue;
    seen.add(e.seq);
    if(e.kind==='primal:WG18:fall')falls++;
    if(e.kind==='primal:WG18:mark')marks++;
    if(e.kind==='primal:WG05:gate'&&floors.length===1)initialGate.push(e.value);
    if(e.kind==='hit')damage+=e.value;
   }
   const floor=f.platforms?.find(p=>p.y===480);
   if(v&&floors.at(-1)?.left!==v.left)floors.push({left:v.left,x:floor?.x,width:floor?.w});
   if(b?.phase==='respawn'||f.returns||!v||f.t-start>185){
    for(const code of [...held])key(code,false);
    window.primalCoopResult={won:b?.phase==='respawn',floors,trials:[...trials],initialGate,damage,falls,marks,returns:f.returns};
    return;
   }
   const objects=list(v.objects).filter(o=>o.units>0);
   if(objects.length)trials.add(v.card);
   const object=objects.sort((l,r)=>Math.abs(l.x-a.x)-Math.abs(r.x-a.x))[0];
   const limit=[.725,.475,.225,0][v.cuts];
   const direct=window.primalBattle&&b.damageable&&b.hp>b.maxhp*limit&&(side<0||v.cuts===3);
   let target=object?.x??(direct?b.x:undefined);
   let goal=v.cuts===0&&!window.primalBattle?Math.max(v.left+40,b.x+side*95):
    Math.abs(a.x-v.left)<Math.abs(a.x-v.right)?v.left+70:v.right-44;
   if(target!==undefined){
    const approach=object?(a.x<target?-1:1):side;
    goal=target+approach*73;
   }
   if(v.card==='WG09'&&v.tick<v.cutAt){
    target=undefined;
    goal=side>0&&v.cuts===0?v.left+38:Math.max(goal,v.left+147);
   }
   goal=Math.max(v.left+15,Math.min(v.right-20,goal));
   const delta=goal-a.x,dx=target===undefined?0:target-a.x;
   const turn=target!==undefined&&dx*a.dir<0;
   const direction=Math.abs(delta)>7?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',direction<0);key('KeyD',direction>0);
   key('KeyJ',target!==undefined&&Math.abs(dx)<112&&!turn);
   const danger=list(v.warnings).some(w=>w.at-v.tick<=7&&w.at-v.tick>=2
    &&a.x>w.lo&&a.x<w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
   if(danger&&v.card!=='WG09'&&f.t-lastDodge>2.25){lastDodge=f.t;window.lab.action('dodge');}
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
  return f.coop?.peers[0]?.actors.length>=1&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===2900;
 });
 const before=await Promise.all(players.map(frame));
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['lavaDragonField','ready']);
 await Promise.all([play(a,-1),play(b,1)]);
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.primal.objects?.[0]?.kind==='gate',null,{timeout:33000});
 await a.locator('#game').screenshot({path:'evidence/coop-primal-fire-gate.png'});
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.primal.exposure>435,null,{timeout:36000});
 await Promise.all(players.map(page=>page.evaluate(()=>{window.primalBattle=true})));
 await Promise.all(players.map(page=>page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.weeklyBoss?.primal.cuts===1&&f.platforms[0].x===128&&f.platforms[0].w===792;
 },null,{timeout:48000})));
 await a.locator('#game').screenshot({path:'evidence/coop-primal-fire-cut.png'});
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.primal.objects?.some?.(o=>o.kind==='pillar'),null,{timeout:70000});
 await a.locator('#game').screenshot({path:'evidence/coop-primal-fire-pillars.png'});
 await Promise.all(players.map(page=>page.waitForFunction(()=>{
  const f=window.lab.frame;
  return window.primalCoopResult||f.weeklyBoss?.primal.cuts===3&&f.platforms[0].x===304&&f.platforms[0].w===616;
 },null,{timeout:150000})));
 for(const page of players)assert.equal((await frame(page)).weeklyBoss.primal.cuts,3);
 await a.locator('#game').screenshot({path:'evidence/coop-primal-fire-narrow.png'});
 await Promise.all(players.map(page=>page.waitForFunction(()=>window.primalCoopResult,null,{timeout:50000})));
 const results=await Promise.all(players.map(page=>page.evaluate(()=>window.primalCoopResult)));
 for(const result of results){
  assert.ok(result.won&&!result.returns&&result.initialGate.length>0&&result.damage>0,JSON.stringify(result));
  assert.deepEqual(result.floors,[[40,880],[128,792],[216,704],[304,616]].map(([left,width])=>({left,x:left,width})));
  assert.ok(result.trials.includes('WG05')&&result.trials.includes('WG14'));
 }
 const defeated=await Promise.all(players.map(frame));
 const rewards=defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===3400));
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(players.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:420000,mora:12800});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-primal-fire-browser.json',JSON.stringify({
  participants:2,hp:2900,scene,results,rewards,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: shared Primal Fire barrier, all floor cuts, pillars, personal rewards and report.');
}catch(error){
 const state=await Promise.allSettled(pages.map(page=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,t:f.t,actors:f.actors.map(a=>[a.x,a.y,a.hp]),
   result:window.primalCoopResult,events:f.events.filter(e=>e.kind.startsWith('primal')).slice(-21),
   peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
