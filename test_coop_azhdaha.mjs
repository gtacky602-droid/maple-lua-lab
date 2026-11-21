import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9047/';
const hub='liyue-harbor',arena='azhdaha-dragon-seal-arena',boss='boss-29040101';
const quest='azhdaha-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/azhdaha-weekly-gear.json','utf8');
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
 await page.locator('#azhdahaElements').getByRole('button',{name:'水＋雷',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.azhdahaLobby?.selected?.join(':')==='hydro:electro');
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function play(page,side){
 await page.evaluate(side=>{
  document.activeElement.blur();
  const held=new Set(),forms=new Set(),absorptions=new Set(),strikes=new Map(),tailStrikes=new Map();
  const start=window.lab.frame.t;
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1];
   for(const e of Array.isArray(f.events)?f.events:[]){
    if(e.t>=start&&e.kind==='hit'&&e.actor===f.active&&e.target===29040101&&!strikes.has(e.seq)){
     strikes.set(e.seq,e.value);
     if(b?.tail)tailStrikes.set(e.seq,e.value);
    }
   }
   if(b)forms.add(b.form);
   if(b?.move==='WZ09'&&!b.damageable)absorptions.add(b.form);
   if(b?.phase==='respawn'||f.returns||!b||f.t-start>140){
    for(const code of [...held])key(code,false);
    const total=hits=>[...hits.values()].reduce((sum,n)=>sum+n,0);
    window.azhdahaCoopResult={won:b?.phase==='respawn',forms:[...forms],absorptions:[...absorptions],
     hp:a.hp,manualDamage:total(strikes),tailDamage:total(tailStrikes),returns:f.returns};
    return;
   }
   const dx=b.x-a.x;
   let desired=b.x+side*75,attack=b.damageable&&(b.form<3||window.azhdahaTailAttack&&b.tail);
   if(b.move==='WZ09'&&!b.damageable)desired=b.x+side*334;
   else if(b.form===3&&!attack)desired=b.safeLane?(b.safeLane-.5)*352+side*25:side<0?106:950;
   desired=Math.max(30,Math.min(1026,desired));
   const delta=desired-a.x,turn=dx*a.dir<0&&Math.abs(dx)>8;
   const direction=Math.abs(delta)>8?Math.sign(delta):attack&&turn?Math.sign(dx):0;
   const jump=b.move==='WZ02'||b.move==='WZ11'&&b.form===3;
   if(jump&&a.ground)window.lab.action('jump');
   key('KeyA',direction<0);key('KeyD',direction>0);
   key('KeyJ',attack&&Math.abs(dx)<114&&!turn);
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
 assert.deepEqual((await frame(b)).azhdahaLobby.selected,['hydro','electro']);
 await Promise.all([host,guest].map(({route})=>route.cross(arena)));
 for(const page of pages){
  await page.waitForFunction(()=>{
   const f=window.lab.frame;
   return f.coop.peers[0]?.actors.length===2&&f.coop.enemies.length===1
    &&f.weeklyBoss.maxhp===1500&&f.weeklyBoss.elementSlots.join(':')==='hydro:electro';
  });
  assert.match(await page.locator('#coopPeers').textContent(),/水＋雷/);
 }
 const before=await Promise.all(pages.map(frame));
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['liyuequarry','ready']);
 await Promise.all([play(a,-1),play(b,1)]);
 await a.waitForFunction(()=>{
  const b=window.lab.frame.weeklyBoss;
  return b?.move==='WZ09'&&b.form===1&&b.moveTick>=70&&!b.damageable;
 },null,{timeout:65000});
 await a.locator('#game').screenshot({path:'evidence/coop-azhdaha-absorption.png'});
 await Promise.all(pages.map(page=>page.waitForFunction(()=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  return b?.tail&&b.safeLane===1&&b.moveTick>=140&&b.damageable
   &&f.coop.enemies.length===1&&f.draws.some(d=>d.text==='露出した尾');
 },null,{timeout:100000})));
 await a.locator('#game').screenshot({path:'evidence/coop-azhdaha-tail.png'});
 await Promise.all(pages.map(page=>page.evaluate(()=>{window.azhdahaTailAttack=true;})));

 await Promise.all(pages.map(page=>page.waitForFunction(()=>window.azhdahaCoopResult,null,{timeout:100000})));
 const results=await Promise.all(pages.map(page=>page.evaluate(()=>window.azhdahaCoopResult)));
 for(const r of results){
  assert.ok(r.won&&!r.returns&&r.manualDamage>0&&r.tailDamage>0,JSON.stringify(r));
  assert.deepEqual(r.forms,[1,2,3]);
  assert.deepEqual(r.absorptions,[1,2]);
 }
 const defeated=await Promise.all(pages.map(frame));
 assert.deepEqual(defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]),
  [[17700,660],[17700,660]]);
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(pages.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:24000,mora:2200});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-azhdaha-browser.json',JSON.stringify({
  participants:2,pair:['hydro','electro'],hp:1500,pairPreservedOnJoin:true,sharedTailTarget:true,
  results,scene,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: both selected Hydro + Electro, saw both absorptions, struck the tail, saved and reported.');
}catch(error){
 const state=await Promise.allSettled(players.map(({page})=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,actors:f.actors.map(a=>[a.x,a.y,a.hp]),t:f.t,
    result:window.azhdahaCoopResult,peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
