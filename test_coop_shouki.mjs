import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9051/';
const hub='sumeru-hub',arena='shouki-godmaking-arena',boss='boss-29070101';
const quest='shouki-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/shouki-weekly-gear.json','utf8');
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
  const held=new Set(),stages=new Set(),seen=new Set(),pods=[];
  let armorShots=0,coreShots=0,damage=0,lastDodge=-10,lastButton=-10;
  const start=window.lab.frame.t;
  const list=value=>Array.isArray(value)?value:[];
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function button(selector,t){
   const el=document.querySelector(selector);
   if(el&&!el.hidden&&!el.disabled&&t-lastButton>.2){el.click();lastButton=t;}
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1],v=b?.shouki;
   for(const e of list(f.events)){
    if(e.t<start||e.actor!==f.active||e.target!==29070101||seen.has(e.seq))continue;
    seen.add(e.seq);
    if(e.kind==='shouki:WN14:guard-hit')armorShots++;
    if(e.kind==='shouki:WN14:core-hit')coreShots++;
    if(e.kind==='shouki:WN15:destroyed')pods.push(e.value);
    if(e.kind==='hit')damage+=e.value;
   }
   if(b)stages.add(b.shoukiStage);
   if(b?.phase==='respawn'||f.returns||!b||f.t-start>160){
    for(const code of [...held])key(code,false);
    window.shoukiCoopResult={won:b?.phase==='respawn',stages:[...stages],pods,armorShots,coreShots,damage,returns:f.returns};
    return;
   }
   let goal=a.x,target;
   const nearest=objects=>[...objects].sort((l,r)=>Math.abs(l.x-a.x)-Math.abs(r.x-a.x))[0];
   if(b.shoukiStage==='p1')target=b.x;
   if(b.shoukiStage==='p2'){
    const block=nearest(list(v.blocks));
    if(v.shield>0&&block&&v.charge<100)goal=block.x;
    else if(window.shoukiAuto&&v.shield>0&&!v.aim)target=b.x;
   }
   if(b.shoukiStage==='trial'){
    const remaining=list(v.targets);
    const pod=nearest(remaining.filter(p=>side<0?p.x<480:p.x>480))??nearest(remaining);
    if(pod)target=pod.x;
   }
   if(b.shoukiStage==='collapse'){
    if(window.shoukiFinish&&b.damageable)target=b.x;
    else goal=b.x+side*65;
   }
   if(window.shoukiAuto){
    if(v.canAim&&(b.shoukiStage==='p2'&&side<0||b.shoukiStage==='trial'&&side>0))button('#weeklyShoukiAction',f.t);
    if(v.aim?.mine&&!v.aim.confirmed&&!v.aim.fired)button('#weeklyShoukiAim [data-action="encounter_confirm"]',f.t);
   }
   if(target!==undefined){
    const approach=b.shoukiStage==='trial'?(a.x<target?-1:1):side;
    goal=target+approach*63;
   }
   const delta=goal-a.x,dx=target===undefined?0:target-a.x;
   const turn=target!==undefined&&dx*a.dir<0;
   const direction=Math.abs(delta)>7?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',direction<0);key('KeyD',direction>0);
   key('KeyJ',target!==undefined&&Math.abs(dx)<104&&!turn);
   const danger=list(b.warnings).some(w=>w.starts-b.moveTick>=0&&w.starts-b.moveTick<8
    &&a.x>=w.lo&&a.x<=w.hi&&a.y>=w.y-w.h&&a.y<=w.y+5);
   if(danger&&!v.aim?.mine&&f.t-lastDodge>2.2){lastDodge=f.t;window.lab.action('dodge');}
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
  return f.coop?.peers[0]?.actors.length>=1&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===1630;
 });
 const before=await Promise.all(players.map(frame));
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['sumeruCanopy','ready']);
 const upper=(await frame(a)).draws.find(d=>d.source==='shouki-idle-source-v1.png');
 assert.deepEqual([upper.y,upper.h],[480,1160]);
 await a.locator('#game').screenshot({path:'evidence/coop-shouki-upper.png'});
 await Promise.all([play(a,-1),play(b,1)]);
 const canAim=page=>page.waitForFunction(()=>window.lab.frame.weeklyBoss?.shouki.canAim);
 const myAim=page=>page.waitForFunction(()=>window.lab.frame.weeklyBoss?.shouki.aim?.mine);
 await canAim(b);
 await b.locator('#weeklyShoukiAction').click();
 await myAim(b);
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss.shouki.aim?.slot===2);
 assert.match(await a.locator('#weeklyShoukiChargeText').textContent(),/参加者2が予約中/);
 assert.ok(await b.locator('#weeklyShoukiAim').isVisible()&&await a.locator('#weeklyShoukiAim').isHidden());
 await a.evaluate(()=>window.lab.action('encounter_confirm'));
 await a.evaluate(()=>window.lab.action('encounter_cancel'));
 assert.equal((await frame(b)).weeklyBoss.shouki.aim.confirmed,false);
 await a.locator('#game').screenshot({path:'evidence/coop-shouki-terminal.png'});
 await b.locator('#weeklyShoukiAim [data-action="encounter_cancel"]').click();
 await canAim(a);
 assert.equal((await frame(a)).weeklyBoss.shouki.charge,100);
 await a.locator('#weeklyShoukiAction').click();
 await myAim(a);
 await a.locator('#weeklyShoukiAim [data-action="encounter_confirm"]').click();
 await a.waitForFunction(()=>window.lab.frame.events.some(e=>e.kind==='shouki:WN14:guard-hit'&&e.actor===1));
 await Promise.all(players.map(page=>page.evaluate(()=>{window.shoukiAuto=true})));
 await a.waitForFunction(()=>{
  const v=window.lab.frame.weeklyBoss?.shouki;
  return v?.targets.length>=3;
 },null,{timeout:95000});
 await a.locator('#game').screenshot({path:'evidence/coop-shouki-pods.png'});
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.shouki.exposure>555,null,{timeout:40000});
 await a.locator('#game').screenshot({path:'evidence/coop-shouki-exposure.png'});
 await Promise.all(players.map(page=>page.evaluate(()=>{window.shoukiFinish=true})));
 await Promise.all(players.map(page=>page.waitForFunction(()=>window.shoukiCoopResult,null,{timeout:28000})));
 const results=await Promise.all(players.map(page=>page.evaluate(()=>window.shoukiCoopResult)));
 for(const result of results){
  assert.ok(result.won&&!result.returns&&result.pods.length>0&&result.damage>0,JSON.stringify(result));
  assert.deepEqual(result.stages,['p1','rise','p2','trial','collapse']);
 }
 assert.equal(results[1].coreShots,1);
 assert.deepEqual(results.flatMap(r=>r.pods).sort(),[1,2,3,4]);
 const defeated=await Promise.all(players.map(frame));
 const rewards=defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===1370));
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(players.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:80000,mora:5200});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-shouki-browser.json',JSON.stringify({
  participants:2,hp:1630,upper:{feet:upper.y,height:upper.h},terminalOnlyOwner:true,chargePreservedOnCancel:true,
  results,scene,rewards,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: shared Shouki phase HP, owned terminal, active pods, weak point and individual rewards.');
}catch(error){
 const state=await Promise.allSettled(pages.map(page=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,t:f.t,actors:f.actors.map(a=>[a.x,a.y,a.hp]),
   result:window.shoukiCoopResult,events:f.events.filter(e=>e.kind.startsWith('shouki')).slice(-20),
   peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
