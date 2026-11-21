import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:9017/';
const [hub,road,arena]=['sumeru-hub','sumeru-field','sumeru-jadeplume-grove'];
const id='boss-26110101',saveKey='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/jadeplume-field-fixture.json','utf8');
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const errors=[];

async function start(){
 const context=await browser.newContext({viewport:{width:1220,height:940}});
 const page=await context.newPage();
 page.setDefaultTimeout(45000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',r=>{
  if(r.url().endsWith('/api/frame')&&!r.ok()) errors.push('Frame HTTP '+r.status());
 });
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(([key,data])=>localStorage.setItem(key,data),[saveKey,fixture]);
 await page.locator('#loadProgress').click();
 const route=waypointDriver(page,nodes,{walkTimeout:22000});
 await route.waitNode(hub);
 await route.cross(road);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function fight(page,side){
 await page.evaluate(side=>{
  document.activeElement.blur();
  const held=new Set(),moves=new Set(),hits=new Map(),leaps=new Map(),spores=new Map();
  const start=window.lab.frame;
  const evade={FJ01:[60,102],FJ02:[102],FJ03:[102,138,174]};
  let lastMove,lastTick,used=new Set();
  function hold(code,on){
   if(on===held.has(code)) return;
   if(on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   for(const event of Array.isArray(f.events)?f.events:[]){
    if(event.actor===1&&event.kind==='hit'&&event.target===26110101&&event.t>=start.t) hits.set(event.seq,event.value);
   }
   if(!f.coop?.code||b?.phase==='respawn'||f.returns>start.returns||f.t-start.t>100){
    for(const code of [...held]) hold(code,false);
    window.coopJade={seconds:+(f.t-start.t).toFixed(2),hp:a.hp,kills:f.kills-start.kills,
     startingMora:start.mora,mora:f.mora-start.mora,startingKillXp:start.progression.killXp,
     killXp:f.progression.killXp-start.progression.killXp,moves:[...moves],
     manualDamage:[...hits.values()].reduce((total,value)=>total+value,0),
     leaps:[...leaps.values()],spores:[...spores.values()]};
    return;
   }
   if(!b){
    hold('KeyD',true);
    requestAnimationFrame(control);
    return;
   }
   if(b.move!==lastMove||b.tick<lastTick){lastMove=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move) moves.add(b.move);
   if(b.flying&&b.landingX!==undefined)
    leaps.set(b.landingX,{landingX:b.landingX,spriteFollowsBoss:f.draws.some(d=>d.source==='jadeplume-field-actions-source-v1.png'&&d.y===b.y)});
   if(b.move==='FJ03'&&b.warnings?.length===3&&b.warnings.every(w=>w.locked))
    spores.set(b.warnings[0].left,b.warnings.map(w=>(w.left+w.right)/2));
   for(const at of evade[b.move]||[]){
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){
     used.add(at);hold('ShiftLeft',true);hold('ShiftLeft',false);
    }
   }
   if(b.x+side*97<515||b.x+side*97>1315) side=-side;
   const dx=b.x-a.x,offset=b.x+side*97-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',offset<-7||(Math.abs(offset)<=7&&turn&&dx<0));
   hold('KeyD',offset>7||(Math.abs(offset)<=7&&turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<123&&dx*a.dir>=0);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },side);
}

try {
 const players=[await start(),await start()];
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
  return coop.code===code&&coop.enemies[0]?.maxhp===800&&coop.peers[0]?.actors.length===2;
 },code)));
 await Promise.all([fight(host,-1),fight(guest,1)]);
 await host.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.fieldBoss?.flying&&f.draws.some(d=>d.source==='jadeplume-field-actions-source-v1.png'&&d.y===f.fieldBoss.y);
 });
 await host.locator('#game').screenshot({path:'evidence/coop-jadeplume-leap.png'});
 await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.coopJade,null,{timeout:125000})));
 const results=await Promise.all(players.map(({page})=>page.evaluate(()=>window.coopJade)));
 assert(results.every(r=>r.kills===1&&r.mora===180&&r.killXp===39950&&r.hp>0&&r.manualDamage>0&&r.moves.length===3),JSON.stringify(results));
 assert(results[0].leaps.some(v=>v.spriteFollowsBoss&&results[1].leaps.some(s=>s.spriteFollowsBoss&&s.landingX===v.landingX)));
 assert(results[0].spores.some(v=>results[1].spores.some(s=>JSON.stringify(s)===JSON.stringify(v))));
 const saves=[];
 for(const {page} of players){
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[saveKey,id]);
  saves.push(await page.evaluate(([key,id])=>{
   const save=JSON.parse(localStorage.getItem(key));
   return {clears:save.endgame.bosses[id].clears,mora:save.mora,xp:save.progression.killXp};
  },[saveKey,id]));
 }
 assert.deepEqual(saves,results.map(r=>({clears:1,mora:r.startingMora+180,xp:r.startingKillXp+39950})));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-jadeplume-browser.json',JSON.stringify({participants:2,results,saves,errors},null,2)+'\n');
 console.log('Chrome: both parties witnessed the same landing and spores, attacked and saved.');
} finally {
 await browser.close();
}
