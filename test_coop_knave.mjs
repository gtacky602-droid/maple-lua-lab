import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9054/';
const hub='fontaine-hub',arena='knave-crimson-court',boss='boss-29091001';
const quest='knave-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/knave-weekly-gear.json','utf8');
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
  const held=new Set(),forms=new Set(),cards=new Set(),seen=new Set();
  let damage=0,payments=0,feathers=0,interrupts=0,requests=0,lastStrike=-10;
  let declared=false;
  const start=window.lab.frame.t;
  const list=v=>Array.isArray(v)?v:[];
  window.knaveCoopMode='earn';
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,k=b?.knave,a=f.actors[f.active-1];
   for(const e of list(f.events)){
    if(e.t<start||e.target!==29091001||seen.has(e.seq))continue;
    seen.add(e.seq);
    if(e.kind==='knave:WK07')declared=true;
    if(e.actor!==a.id)continue;
    if(e.kind==='knave:WK08:lamp')payments++;
    if(e.kind==='knave:WK08:feather')feathers++;
    if(e.kind==='knave:WK09')interrupts++;
    if(e.kind==='hit')damage+=e.value;
   }
   if(k){forms.add(k.form);if(k.card)cards.add(k.card);}
   if(b?.phase==='respawn'||f.returns||!k||f.t-start>150){
    for(const code of [...held])key(code,false);
    window.knaveCoopResult={won:b?.phase==='respawn',forms:[...forms],cards:[...cards],
     payments,feathers,interrupts,requests,damage,returns:f.returns};
    return;
   }
   const mine=k.actors[k.active-1];
   const dx=k.x-a.x,target=k.x+side*78;
   const facing=dx*a.dir>0,canReach=Math.abs(dx)<111&&facing;
   const mode=window.knaveCoopMode;
   let goal=a.x,attack=false;
   const face=()=>Math.abs(target-a.x)<9&&!facing?a.x+Math.sign(dx)*20:target;
   if(mode==='earn'&&!declared&&side<0&&!mine.debt&&b.hp>b.phaseHp[1].max+b.phaseHp[0].max*.65){
    goal=face();attack=canReach;
   }else if(mode==='earn'||mode==='lamp')goal=side<0?43:76;
   else if(mode==='seek'){
    goal=face();
    if(k.window&&mine.feather&&canReach&&a.lock<=0&&(a.cd.normal||0)<=0&&f.t-lastStrike>.76){
     key('KeyH',true);key('KeyH',false);lastStrike=f.t;requests++;
    }
   }else if(mode==='finish'&&b.phase!=='transform'&&!k.airborne){
    goal=face();attack=canReach;
   }
   key('KeyA',goal<a.x-8);key('KeyD',goal>a.x+8);key('KeyJ',attack);
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
  return f.coop?.peers[0]?.actors.length>=1&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===2400;
 });
 const before=await Promise.all(players.map(frame));
 assert.deepEqual(before.map(f=>f.weeklyBoss.phaseHp.map(p=>p.max)),[[1080,1320],[1080,1320]]);
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['fontaineUnderstage','ready']);
 await Promise.all([play(a,-1),play(b,1)]);
 await Promise.all(players.map(page=>page.waitForFunction(()=>{
  const k=window.lab.frame.weeklyBoss?.knave;
  return k?.nearLamp===1&&k.actors[0].debt>0;
 },null,{timeout:55000})));
 await Promise.all(players.map(page=>page.evaluate(()=>{window.knaveCoopMode='lamp'})));
 await Promise.all(players.map(page=>page.keyboard.down('KeyG')));
 try{
  await Promise.all(players.map(page=>page.waitForFunction(()=>window.lab.frame.events.some(e=>e.kind==='knave:WK08:lamp'&&e.actor===1))));
  await a.keyboard.up('KeyG');
  await a.waitForFunction(()=>!window.lab.frame.weeklyBoss.knave.hold);
  const heldDebt=(await frame(a)).weeklyBoss.knave.actors[0].debt;
  await b.waitForFunction(()=>window.lab.frame.events.filter(e=>e.kind==='knave:WK08:lamp'&&e.actor===1).length>=2);
  assert.equal((await frame(a)).weeklyBoss.knave.actors[0].debt,heldDebt);
  await a.keyboard.down('KeyG');
  await Promise.all(players.map(page=>page.waitForFunction(()=>window.lab.frame.weeklyBoss?.knave.actors[0].feather)));
  assert.ok((await Promise.all(players.map(frame))).every(f=>f.weeklyBoss.knave.actors[0].debt===0));
 }finally{
  await Promise.all(players.map(page=>page.keyboard.up('KeyG')));
 }
 await a.locator('#game').screenshot({path:'evidence/coop-knave-lamp.png'});
 await Promise.all(players.map(page=>page.evaluate(()=>{window.knaveCoopMode='seek'})));
 await Promise.all(players.map(page=>page.waitForFunction(()=>window.lab.frame.weeklyBoss?.knave.exposure>175,null,{timeout:85000})));
 const interrupt=await Promise.all(players.map(frame));
 const keepsFeather=interrupt.map(f=>f.weeklyBoss.knave.actors[0].feather);
 assert.equal(keepsFeather.filter(Boolean).length,1);
 assert.equal(interrupt.flatMap(f=>f.events.filter(e=>e.kind==='knave:WK09')).length,1);
 await a.locator('#game').screenshot({path:'evidence/coop-knave-interrupt.png'});
 await Promise.all(players.map(page=>page.evaluate(()=>{window.knaveCoopMode='finish'})));
 await a.waitForFunction(()=>window.lab.frame.weeklyBoss?.knave.form===2,null,{timeout:32000});
 await a.locator('#game').screenshot({path:'evidence/coop-knave-double.png'});
 await Promise.all(players.map(page=>page.waitForFunction(()=>window.knaveCoopResult,null,{timeout:40000})));
 const results=await Promise.all(players.map(page=>page.evaluate(()=>window.knaveCoopResult)));
 for(const result of results){
  assert.ok(result.won&&!result.returns&&result.payments>=5&&result.feathers>=1&&result.damage>0,JSON.stringify(result));
  assert.deepEqual(result.forms,[1,2]);
 }
 assert.equal(results.reduce((sum,r)=>sum+r.interrupts,0),1);
 const defeated=await Promise.all(players.map(frame));
 const rewards=defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===2800));
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(players.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:280000,mora:9600});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-knave-browser.json',JSON.stringify({
  participants:2,hp:2400,sameLamp:true,releasedIndependently:true,keepsFeather,scene,results,rewards,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: Knave same lamp, independent repayment, single interruption and personal rewards.');
}catch(error){
 const state=await Promise.allSettled(pages.map(page=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,t:f.t,actors:f.actors.map(a=>[a.x,a.y,a.hp]),
   mode:window.knaveCoopMode,result:window.knaveCoopResult,events:f.events.filter(e=>e.kind.startsWith('knave')).slice(-24),
   peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
