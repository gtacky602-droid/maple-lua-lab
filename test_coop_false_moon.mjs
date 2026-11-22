import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const hub='nod-town',outer='nod-false-moon-court',inner='nod-false-moon-rift';
const quest='false-moon-weekly-commission',boss='boss-29130201',saveKey='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/false-moon-weekly-gear.json','utf8');
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const pages=[],errors=[];
const frame=p=>p.evaluate(()=>window.lab.frame);
const wait=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:55000});
const mode=(p,value)=>p.evaluate(value=>{window.moonCoopMode=value},value);
const capture=(p,tag)=>p.locator('.game').screenshot({path:'evidence/coop-false-moon-'+tag+'.png'});

async function start(accept){
 const context=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await context.newPage();
 pages.push(page);
 page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(55000);
 const route=waypointDriver(page,nodes,{walkTimeout:22000});
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9057/');
 await wait(page,()=>window.lab?.frame);
 await page.evaluate(([key,raw])=>localStorage.setItem(key,raw),[saveKey,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(hub);
 if(accept)await route.accept(quest);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function scenery(page){
 return page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
}

async function drive(page,side){
 await page.evaluate(side=>{
  document.activeElement.blur();
  const held=new Set(),nodes=[];
  window.moonCoopMode='wait';
  window.moonCoopNodes=nodes;
  function setKey(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function step(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.falseMoon,a=f.actors[f.active-1];
   if(v&&nodes.at(-1)!==f.story.node)nodes.push(f.story.node);
   let goal=a.x,target;
   const mode=window.moonCoopMode;
   if(v&&b.phase!=='respawn'){
    if(mode==='cover')goal=side<0?160:710;
    if(mode==='portal')goal=480+side*24;
    if(mode==='shadow'&&v.card==='WM15'){
     const living=v.shadows.filter(e=>e.hp>0).sort((l,r)=>(l.x-r.x)*(-side));
     target=living[0]?.x;
    }
    if(mode==='finish'&&b.damageable)target=b.x;
   }
   const dx=target===undefined?0:target-a.x,turn=target!==undefined&&dx*a.dir<0;
   if(target!==undefined)goal=target+side*74;
   const delta=goal-a.x;
   const direction=Math.abs(delta)>9?Math.sign(delta):turn?Math.sign(dx):0;
   setKey('KeyA',direction<0);setKey('KeyD',direction>0);
   setKey('KeyJ',target!==undefined&&Math.abs(dx)<108&&!turn);
   requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
 },side);
}

async function save(page,complete=false){
 await page.locator('#saveProgress').click();
 await wait(page,([key,boss,quest,complete])=>{
  const data=JSON.parse(localStorage.getItem(key));
  return data?.weeklyBosses?.[boss]?.hp===0&&data?.endgame?.bosses?.[boss]?.clears===1
   &&(!complete||data?.story?.quests?.[quest]?.status==='complete');
 },[saveKey,boss,quest,complete]);
}

try{
 const [host,guest]=await Promise.all([start(true),start(false)]);
 const [a,b]=[host.page,guest.page],players=[a,b];
 await a.locator('#coopCreate').click();
 await wait(a,()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await wait(b,c=>window.lab.frame.coop?.code===c,code);
 await Promise.all([host,guest].map(({route})=>route.cross(outer)));
 await Promise.all(players.map(p=>wait(p,()=>{
  const f=window.lab.frame;
  return f.coop?.peers[0]?.actors.length>=1&&f.weeklyBoss.maxhp===3400;
 })));
 const before=await Promise.all(players.map(frame));
 const court=await scenery(a);
 assert.deepEqual([court.key,court.state],['falseMoonCourt','ready']);
 await Promise.all(players.map(p=>wait(p,()=>window.lab.frame.weeklyBoss?.falseMoon.rule?.state==='rule')));
 await b.locator('#game').click();
 await b.keyboard.down('KeyD');
 try{await wait(b,()=>window.lab.frame.weeklyBoss?.falseMoon.rule?.violated)}
 finally{await b.keyboard.up('KeyD')}
 assert.equal((await frame(a)).weeklyBoss.falseMoon.rule.violated,false);
 await capture(b,'law');
 await wait(a,()=>window.lab.frame.weeklyBoss?.falseMoon.card==='WM08');
 const rules=(await Promise.all(players.map(frame))).map(f=>f.events.filter(e=>[
  'false-moon:WM12','false-moon:WM12:hit','false-moon:WM09:success'
 ].includes(e.kind)).map(e=>e.kind.slice(11)));
 assert.deepEqual(rules[0],['WM09:success']);
 assert.ok(rules[1].includes('WM12')&&!rules[1].includes('WM09:success'));
 await Promise.all([drive(a,-1),drive(b,1)]);
 await Promise.all(players.map(p=>mode(p,'cover')));
 await wait(a,()=>window.lab.frame.events.some(e=>e.kind==='false-moon:WM08:ward'&&e.actor===1));
 await capture(a,'ward');
 await wait(a,()=>window.lab.frame.weeklyBoss?.falseMoon.card==='WM13');
 await Promise.all(players.map(p=>mode(p,'portal')));
 await Promise.all(players.map(p=>wait(p,()=>window.lab.frame.weeklyBoss?.falseMoon.canUse)));
 await a.locator('#weeklyFalseMoonUse').click();
 await wait(b,()=>window.lab.frame.weeklyBoss.falseMoon.vote?.count===1);
 assert.equal((await frame(b)).weeklyBoss.falseMoon.confirm,undefined);
 await capture(b,'vote');
 await b.locator('#weeklyFalseMoonUse').click();
 await wait(a,()=>window.lab.frame.weeklyBoss.falseMoon.confirm>0);
 await a.locator('#weeklyFalseMoonCancel').click();
 await wait(b,()=>window.lab.frame.weeklyBoss.falseMoon.vote?.count===1&&!window.lab.frame.weeklyBoss.falseMoon.confirm);
 await a.locator('#weeklyFalseMoonUse').click();
 await Promise.all(players.map(p=>wait(p,n=>window.lab.frame.story.node===n,inner)));
 const rift=await scenery(a);
 assert.deepEqual([rift.key,rift.state],['falseMoonRift','ready']);
 await Promise.all(players.map(p=>wait(p,()=>window.lab.frame.weeklyBoss?.falseMoon.shadows?.length===3)));
 const innerHp=(await frame(a)).weeklyBoss.hp;
 await capture(a,'rift');
 await Promise.all(players.map(p=>mode(p,'shadow')));
 const returned=await Promise.all(players.map(async p=>{
  const sample=await wait(p,n=>{
   const f=window.lab.frame,v=f.weeklyBoss?.falseMoon;
   return f.story.node===n&&v?.card==='WM16'&&v.tick>=96&&v.tick<120&&f;
  },outer);
  return sample.jsonValue();
 }));
 for(const f of returned){
  assert.equal(f.weeklyBoss.falseMoon.epoch,2);
  assert.equal(f.weeklyBoss.hp,innerHp-408);
  assert.equal(f.weeklyBoss.falseMoon.limit,408);
  assert.deepEqual(f.events.filter(e=>e.kind==='false-moon:WM16:loss').map(e=>e.value),[408]);
  assert.ok(f.events.some(e=>e.kind==='hit'&&e.actor===1&&e.target>=29130212&&e.target<=29130214));
 }
 await wait(a,()=>window.lab.frame.weeklyBoss?.falseMoon.exposure>0);
 await capture(a,'returned');
 await Promise.all(players.map(p=>mode(p,'finish')));
 await Promise.all(players.map(p=>wait(p,()=>window.lab.frame.weeklyBoss?.phase==='respawn')));
 const after=await Promise.all(players.map(frame));
 const rewards=after.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===5500));
 assert.deepEqual(after.map(f=>f.story.quests[quest]?.count??null),[1,null]);
 const visited=await Promise.all(players.map(p=>p.evaluate(()=>window.moonCoopNodes)));
 assert.ok(visited.every(ns=>JSON.stringify(ns)===JSON.stringify([outer,inner,outer])));
 await Promise.all(players.map(p=>save(p)));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const reportStart=await frame(a);
 await host.route.report(quest);
 const reportEnd=await frame(a);
 const report={xp:reportEnd.progression.questXp-reportStart.progression.questXp,mora:reportEnd.mora-reportStart.mora};
 assert.deepEqual(report,{xp:840000,mora:21200});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-false-moon-browser.json',JSON.stringify({
  participants:2,court,rift,rules,visited,unanimousEntry:true,cancelAndConfirmAgain:true,
  sharedShadows:3,settledLoss:408,rewards,report,errors
 },null,2)+'\n');
 console.log('Chrome: owner laws, unanimous rift, shared shadows and return, rewards and report passed.');
}catch(error){
 const state=await Promise.allSettled(pages.map(p=>p.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,t:f.t,a:f.actors.map(e=>[e.x,e.y,e.hp]),
   events:f.events.filter(e=>e.kind.startsWith('false-moon:')).slice(-17),
   status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
