import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const hub='sumeru-hub',arena='sumeru-heretic-lattice',boss='boss-29150101';
const quest='heretic-weekly-commission',saveKey='maple-lua-lab.checkpoint.v1';
const url=process.env.LAB_URL||'http://127.0.0.1:9058/';
const fixture=await fs.readFile('work/heretic-weekly-gear.json','utf8');
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const pages=[],errors=[];
const frame=p=>p.evaluate(()=>window.lab.frame);
const wait=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:85000});
const mode=(p,action)=>p.evaluate(action=>{window.hereticCoopMode=action},action);
const capture=(p,tag)=>p.locator('.game').screenshot({path:'evidence/coop-heretic-'+tag+'.png'});

async function start(accept){
 const profile=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await profile.newPage();
 pages.push(page);
 page.setDefaultTimeout(55000);
 page.on('pageerror',e=>errors.push(e.message));
 const route=waypointDriver(page,nodes,{walkTimeout:22000});
 await page.goto(url);
 await wait(page,()=>window.lab?.frame);
 await page.evaluate(([key,data])=>localStorage.setItem(key,data),[saveKey,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(hub);
 if(accept)await route.accept(quest);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function drive(page,side){
 await page.evaluate(side=>{
  document.activeElement.blur();
  const held=new Set(),cards=[];
  let lastDrop=-1;
  window.hereticCoopMode='first';
  window.hereticCoopCards=cards;
  window.hereticCoopBaseline={};
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function update(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.heretic,a=f.actors[f.active-1];
   const mode=window.hereticCoopMode;
   let goal=a.x,target,attack=false;
   if(v&&b.phase!=='respawn'){
    if(v.card&&cards.at(-1)!==v.card)cards.push(v.card);
    if(v.open)window.hereticCoopBaseline[v.trial]??=b.hp;
    if(mode==='first'){
     if(v.card==='WH10'||v.card==='WH11'||v.card==='WH13'){
      goal=v.card==='WH13'?(side<0?147:281):413+side*28;
     }else if(v.form===1&&b.damageable&&b.y>399)target=b.x;
    }else if(mode==='trial'&&v.card==='WH13'){
     target=v.open?b.x:Array.isArray(v.anchors)?v.anchors[0]?.x:undefined;
     if(a.y<440&&a.ground&&f.t-lastDrop>.35){
      window.lab.action('drop');
      lastDrop=f.t;
     }
    }else if(mode==='finish'&&b.damageable)target=b.x;
    if(target!==undefined){
     const dx=target-a.x;
     const offset=target>=711?74*(side<0?-1:1):side*65;
     goal=Math.max(65,Math.min(902,target+offset));
     if(Math.abs(goal-a.x)<12&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*22;
     attack=Math.abs(dx)<112&&Math.sign(dx)===a.dir&&a.y>399;
    }
   }
   key('KeyA',goal<a.x-9);key('KeyD',goal>a.x+9);key('KeyJ',attack);
   requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
 },side);
}

async function saved(page,done=false){
 await page.locator('#saveProgress').click();
 await wait(page,([key,boss,quest,done])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return d?.weeklyBosses?.[boss]?.hp===0&&d?.endgame?.bosses?.[boss]?.clears===1
   &&(!done||d?.story?.quests?.[quest]?.status==='complete');
 },[saveKey,boss,quest,done]);
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
 await Promise.all([host,guest].map(({route})=>route.cross(arena)));
 await Promise.all(players.map(p=>wait(p,()=>{
  const f=window.lab.frame;
  return f.coop?.peers[0]?.actors.length>=1&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===1650;
 })));
 const before=await Promise.all(players.map(frame));
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['hereticLattice','ready']);
 await Promise.all([drive(a,-1),drive(b,1)]);
 await Promise.all(players.map(p=>wait(p,()=>window.lab.frame.weeklyBoss?.heretic?.card==='WH10')));
 await capture(a,'change');
 await Promise.all(players.map(p=>wait(p,()=>{
  const v=window.lab.frame.weeklyBoss?.heretic;
  return v?.anchors?.length===2&&v.hole?.x>0;
 })));
 const wall=await frame(a);
 assert.equal(wall.weeklyBoss.heretic.hole.upper,false);
 assert.equal(wall.weeklyBoss.heretic.hole.bottom,480);
 await capture(a,'wall');
 await Promise.all(players.map(p=>mode(p,'trial')));
 await Promise.all(players.map(p=>wait(p,()=>window.lab.frame.weeklyBoss?.heretic?.open)));
 await capture(a,'chant');
 const stagger=await Promise.all(players.map(async p=>{
  const handle=await wait(p,()=>{
   const f=window.lab.frame;
   return f.weeklyBoss?.heretic?.card==='WH19'&&f.weeklyBoss.heretic.tick<59&&f;
  });
  return handle.jsonValue();
 }));
 const sourceCounts=[];
 for(const [i,f] of stagger.entries()){
  const trial=f.weeklyBoss.heretic.trial;
  const hp=await players[i].evaluate(trial=>window.hereticCoopBaseline[trial],trial);
  assert.equal(f.weeklyBoss.hp,hp);
  const started=f.events.find(e=>e.kind==='heretic:WH13'&&e.value===trial);
  assert.ok(started);
  const accepted=f.events.filter(e=>e.kind==='heretic:WH13:chant'&&e.seq>started.seq);
  assert.deepEqual(accepted.map(e=>e.value),Array.from({length:24},(_,i)=>23-i));
  assert.deepEqual([...new Set(accepted.filter(e=>e.actor===1).map(e=>e.member))].sort(),[1,2]);
  sourceCounts.push([1,2].map(member=>accepted.filter(e=>e.member===member).length));
 }
 await wait(a,()=>window.lab.frame.weeklyBoss?.heretic?.exposure>0);
 await capture(a,'exposure');
 await Promise.all(players.map(p=>mode(p,'finish')));
 await Promise.all(players.map(p=>wait(p,()=>window.lab.frame.weeklyBoss?.phase==='respawn')));
 const after=await Promise.all(players.map(frame));
 const rewards=after.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===6600));
 assert.deepEqual(after.map(f=>f.story.quests[quest]?.count??null),[1,null]);
 const cards=await Promise.all(players.map(p=>p.evaluate(()=>window.hereticCoopCards)));
 assert.ok(cards.every(seen=>['WH10','WH11','WH13','WH19'].every(id=>seen.includes(id))));
 await Promise.all(players.map(p=>saved(p)));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:1230000,mora:26500});
 await saved(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-heretic-browser.json',JSON.stringify({
  participants:2,scene,healthPools:[1650,2250],cards,sharedWall:true,
  deadlineTicks:1800,successfulTrial:stagger[0].weeklyBoss.heretic.trial,sharedAcceptedChantHits:24,
  sourceCounts,rewards,report,errors
 },null,2)+'\n');
 console.log('Chrome: two forms, shared wall and core, both players interrupted the chant, rewards and report passed.');
}catch(error){
 const state=await Promise.allSettled(pages.map(p=>p.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,t:f.t,actors:f.actors.map(a=>[a.x,a.y,a.hp,a.dir]),
   mode:window.hereticCoopMode,cards:window.hereticCoopCards,status:document.querySelector('#status')?.textContent,
   events:f.events.filter(e=>e.kind.startsWith('heretic:')).slice(-18)};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
