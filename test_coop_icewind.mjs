import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9003/';
const entrance='icewind-promenade', coppelia='icewind-coppelia', coppelius='icewind-coppelius';
const saveKey='maple-lua-lab.checkpoint.v1';
const fixture=JSON.parse(await fs.readFile('work/icewind-field-fixture.json','utf8'));
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const {fieldBosses}=JSON.parse(await fs.readFile('content/field-boss-spawns.json','utf8'));
const specs=Object.fromEntries(fieldBosses.filter(b=>b.controller==='icewind').map(b=>[b.id,b]));
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];

async function start(accept) {
 const context=await browser.newContext({viewport:{width:1220,height:940}});
 const page=await context.newPage();
 page.setDefaultTimeout(25000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 const save=structuredClone(fixture);
 if(!accept) for(const id of [coppelia,coppelius]) delete save.story.quests[id+'-commission'];
 await page.evaluate(([key,data])=>localStorage.setItem(key,JSON.stringify(data)),[saveKey,save]);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.story?.node==='fontaine-hub'&&window.lab.frame.progression?.level===90);
 const travel=waypointDriver(page,nodes,{walkTimeout:18000});
 await travel.cross(entrance);
 await page.locator('#coopPanel summary').click();
 return {page,travel};
}

async function fight(page,spec) {
 await page.evaluate(spec=>{
  document.activeElement.blur();
  window.coopIcewind=null;
  const held=new Set(), moves=new Set();
  const start=window.lab.frame;
  let lastMove,origin,dir,seenGuard=false,broken=false;
  function hold(code,on) {
   if(on===held.has(code)) return;
   if(on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function step() {
   const f=window.lab.frame, b=f.fieldBoss, a=f.actors[f.active-1];
   if(!f.coop?.code||b?.hp===0||f.returns>start.returns||f.t-start.t>120) {
    for(const code of [...held]) hold(code,false);
    window.coopIcewind={seconds:+(f.t-start.t).toFixed(2), hp:a.hp,
     moves:[...moves], kills:f.kills-start.kills, damage:f.damage-start.damage, seenGuard, broken};
    return;
   }
   if(!b) {
    hold('KeyD',true);
    requestAnimationFrame(step);
    return;
   }
   seenGuard ||= b.form==='guarded';
   broken ||= b.form==='guard-broken';
   const m=spec.moves.find(move=>move.id===b.move);
   if(b.move!==lastMove) { origin=b.x; lastMove=b.move; }
   if(m&&b.tick<=m.lock) dir=a.x<origin?-1:1;
   const [lead,partner]=b.bodies;
   const closest=Math.abs(a.x-lead.x)<=Math.abs(a.x-partner.x)?lead:partner;
   const approachLead=spec.lead==='cryo'&&(m?.kind==='guard'||(m?.kind==='duet'&&b.tick>=m.recover));
   const target=approachLead?lead:closest;
   const dx=target.x-a.x, turn=Math.abs(dx)>8&&dx*a.dir<0;
   const side=approachLead?Math.sign(lead.x-partner.x)||1:dx>=0?-1:1;
   let move=target.x+side*99-a.x, jump=false, evade=false;
   if(Math.abs(move)<8&&turn) move=dx;
   if(m) {
    moves.add(m.id);
    let arrivals=m.active.map(w=>w[0]);
    if(m.kind==='ice') {
     const gap=(a.x-origin)*dir;
     arrivals=gap>30?m.fire.map(t=>t+Math.round(Math.max(0,gap-44)/(m.speed*88/60))):[];
    } else if(m.kind==='wind') {
     const center=Math.max(spec.arenaMin+2.4*88,Math.min(spec.arenaMax-2.4*88,origin));
     const i=m.active.findIndex(([from,to])=>from-23<=b.tick&&b.tick<to);
     if(i>=0) {
      const x=center+(i-1)*m.spacing*88;
      if(Math.abs(a.x-x)<52) { move=a.x>=x?160:-160; evade=true; }
     }
     arrivals=[];
    }
    jump=arrivals.some(t=>t-25<=b.tick&&b.tick<t-16);
   }
   hold('Space',jump);
   hold('KeyA',move<-8);
   hold('KeyD',move>8);
   hold('KeyJ',Math.abs(dx)<120&&!turn&&!evade);
   requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
 },spec);
}

try {
 const [host,guest]=await Promise.all([start(true),start(false)]);
 const a=host.page,b=guest.page;
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=await a.evaluate(()=>window.lab.frame.coop.code);
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await b.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([host.travel.cross(coppelia+'-field'),guest.travel.cross(coppelius+'-field')]);
 await a.waitForFunction(site=>window.lab.frame.coop.peers[0]?.map===site,coppelius+'-field');
 assert.deepEqual(await a.evaluate(()=>window.lab.frame.coop.enemies.map(e=>e.maxhp)),[1030,1030]);
 await host.travel.cross(entrance);
 await host.travel.cross(coppelius+'-field');
 const results={};
 for(const id of [coppelius,coppelia]) {
  await Promise.all([a,b].map(page=>page.waitForFunction(([code,id])=>{
   const {coop}=window.lab.frame;
   return coop.code===code&&coop.map===id+'-field'&&coop.peers[0]?.actors.length===2;
  },[code,id])));
  await Promise.all([a,b].map(page=>fight(page,specs[id])));
  const canvas=a.locator('#game');
  if(id===coppelius) {
   await a.waitForFunction(()=>window.lab.frame.fieldBoss?.form==='guarded');
   await canvas.screenshot({path:'evidence/coop-icewind-armor.png'});
   await Promise.all([a,b].map(page=>page.waitForFunction(()=>window.lab.frame.fieldBoss?.form==='guard-broken')));
   await canvas.screenshot({path:'evidence/coop-icewind-armor-broken.png'});
  } else {
   await a.waitForFunction(()=>window.lab.frame.fieldBoss?.move==='FIC02'&&window.lab.frame.fieldBoss.tick>=90);
   await canvas.screenshot({path:'evidence/coop-icewind-coppelia.png'});
  }
  await Promise.all([a,b].map(page=>page.waitForFunction(()=>window.coopIcewind,null,{timeout:155000})));
  results[id]=await Promise.all([a,b].map(page=>page.evaluate(()=>window.coopIcewind)));
  assert.ok(results[id].every(r=>r.kills===1&&r.hp>0&&r.damage>0),JSON.stringify(results[id]));
  const counts=await Promise.all([a,b].map(page=>page.evaluate(q=>window.lab.frame.story.quests[q]?.count??null,id+'-commission')));
  assert.deepEqual(counts,[1,null]);
  if(id===coppelius){
   assert.ok(results[id].every(r=>r.seenGuard&&r.broken));
   await Promise.all([host,guest].map(({travel})=>travel.cross(entrance)));
   await Promise.all([host,guest].map(({travel})=>travel.cross(coppelia+'-field')));
  }
 }
 for(const page of [a,b]) {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,ids])=>{
   const saved=JSON.parse(localStorage.getItem(key));
   return ids.every(id=>saved?.endgame?.bosses?.[id]?.clears===1);
  },[saveKey,[coppelia,coppelius]]);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-icewind-browser.json',JSON.stringify({
  browser:'Chrome',participants:2,oneRoomAcrossBothPerformances:true,
  bothSawIceArmorBreak:true,results,savedClearsPerPlayer:2,errors,
 },null,2)+'\n');
 console.log('Both Chrome players cleared both Icewind performances, broke the shared guard and saved both records.');
} finally {
 await browser.close();
}
