import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:9007/';
const [hub,road,arena]=['sumeru-hub','sumeru-field','aeonblight-field-chamber'];
const [boss,quest]=['boss-24030301','aeonblight-commission'];
const saveKey='maple-lua-lab.checkpoint.v1';
const fixture=JSON.parse(await fs.readFile('work/coop-aeonblight-fixture.json','utf8'));
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const errors=[];

async function start(accepted) {
 const context=await browser.newContext({viewport:{width:1220,height:940}});
 const page=await context.newPage();
 page.setDefaultTimeout(35000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',r=>{
  if(r.url().endsWith('/api/frame')&&!r.ok()) errors.push('Frame HTTP '+r.status());
 });
 await page.goto(base);
 try { await page.waitForFunction(()=>window.lab?.frame); }
 catch(error) { throw Error(`${await page.locator('#status').textContent()} ${errors.join(' / ')}`,{cause:error}); }
 const save=structuredClone(fixture);
 if(!accepted) delete save.story.quests[quest];
 await page.evaluate(([key,data])=>localStorage.setItem(key,JSON.stringify(data)),[saveKey,save]);
 await page.locator('#loadProgress').click();
 const route=waypointDriver(page,nodes,{walkTimeout:22000});
 await route.waitNode(hub);
 await route.cross(road);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function fight(page,side) {
 await page.evaluate(side=>{
  document.activeElement.blur();
  const held=new Set(),moves=new Set(),hits=new Map();
  const start=window.lab.frame;
  let down=false,flight=false,lastMove,lastTick,used=new Set();
  const evade={FAD01:[92,152],FAD02:[78,118,152],FAD03:[113]};
  function hold(code,on) {
   if(on===held.has(code)) return;
   if(on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   for(const event of Array.isArray(f.events)?f.events:[]) {
    if(event.kind==='hit'&&event.target===24030301&&event.t>=start.t) hits.set(event.seq,event);
   }
   if(!f.coop?.code||b?.phase==='respawn'||f.returns>start.returns||f.t-start.t>110){
    for(const code of [...held]) hold(code,false);
    const manualDamage=[...hits.values()].filter(e=>e.actor===1).reduce((sum,e)=>sum+e.value,0);
    window.coopDrake={seconds:+(f.t-start.t).toFixed(2),hp:a.hp,kills:f.kills-start.kills,
     mora:f.mora-start.mora,moves:[...moves],manualDamage,down,flight};
    return;
   }
   if(!b) {
    hold('KeyD',true);
    requestAnimationFrame(control);
    return;
   }
   if(b.move!==lastMove||b.tick<lastTick){lastMove=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move) moves.add(b.move);
   down ||= b.downTicks>0;
   flight ||= b.flying && b.y<430;
   for(const at of evade[b.move]||[]) {
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){
     used.add(at);hold('ShiftLeft',true);hold('ShiftLeft',false);
    }
   }
   const dx=b.x-a.x,desired=b.x+side*105;
   const position=desired-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',position<-7||(Math.abs(position)<=7&&turn&&dx<0));
   hold('KeyD',position>7||(Math.abs(position)<=7&&turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<125&&dx*a.dir>=0&&!b.flying);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },side);
}

try {
 const players=[await start(true),await start(false)];
 const [{page:host},{page:guest}]=players;
 await host.locator('#coopCreate').click();
 await host.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=await host.evaluate(()=>window.lab.frame.coop.code);
 await guest.locator('#coopCode').fill(code);
 await guest.locator('#coopJoin').click();
 await guest.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all(players.map(({route})=>route.cross(arena)));
 await Promise.all(players.map(({page})=>page.waitForFunction(code=>{
  const coop=window.lab.frame.coop;
  return coop.code===code&&coop.enemies[0]?.maxhp===1310&&coop.peers[0]?.actors.length===2;
 },code)));
 for(const {page} of players) {
  const actual=await page.evaluate(async()=>{
   const {sceneryStatus,backgroundReady}=await import('./scenery.js');
   await backgroundReady;
   return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(actual,{key:'aeonblightField',file:'aeonblight-field-background-v1.png',state:'ready'});
 }
 await Promise.all([fight(host,-1),fight(guest,1)]);
 await Promise.all(players.map(({page})=>page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.downTicks>0&&b.label==='胸部コアで中断・ダウン'&&!b.weakpoint&&!b.move;
 })));
 await host.locator('#game').screenshot({path:'evidence/coop-aeonblight-down.png'});
 await Promise.all(players.map(({page})=>page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.flying&&b.move==='FAD03'&&b.y<425;
 })));
 await host.locator('#game').screenshot({path:'evidence/coop-aeonblight-flight.png'});
 await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.coopDrake,null,{timeout:135000})));
 const results=await Promise.all(players.map(({page})=>page.evaluate(()=>window.coopDrake)));
 assert(results.every(r=>r.kills===1&&r.mora===235&&r.hp>0&&r.manualDamage>0&&r.down&&r.flight),
  JSON.stringify(results));
 const questCounts=await Promise.all(players.map(({page})=>page.evaluate(q=>window.lab.frame.story.quests[q]?.count??null,quest)));
 assert.deepEqual(questCounts,[1,null]);
 for(const {page} of players) {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[saveKey,boss]);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-aeonblight-browser.json',JSON.stringify({
  browser:'Chrome',participants:2,bossHp:1310,results,questCounts,savedClears:[1,1],
  backgroundScope:'all',errors
 },null,2)+'\n');
 console.log('Chrome: both players witnessed the same core interruption and flight, attacked and saved.');
} finally {
 await browser.close();
}
