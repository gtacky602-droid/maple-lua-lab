import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:9006/';
const [hub,entry,arena]=['sumeru-hub','sumeru-entry','baptist-field-sanctuary'];
const [boss,quest]=['boss-22100501','baptist-commission'];
const entity=22100501;
const elements=['pyro','cryo','electro'];
const saveKey='maple-lua-lab.checkpoint.v1';
const fixture=JSON.parse(await fs.readFile('work/coop-baptist-fixture.json','utf8'));
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
 await page.waitForFunction(()=>window.lab?.frame);
 const save=structuredClone(fixture);
 if(!accepted) delete save.story.quests[quest];
 await page.evaluate(([key,data])=>localStorage.setItem(key,JSON.stringify(data)),[saveKey,save]);
 await page.locator('#loadProgress').click();
 const route=waypointDriver(page,nodes,{walkTimeout:18000});
 await route.waitNode(hub);
 await route.cross(entry);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function fight(page) {
 await page.evaluate(entity=>{
  document.activeElement.blur();
  const held=new Set(),moves=new Set(),hits=new Map(),ringOrders=new Set();
  const start=window.lab.frame;
  function hold(code,on) {
   if(on===held.has(code)) return;
   if(on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   for(const event of Array.isArray(f.events)?f.events:[]) {
    if(event.kind==='hit'&&event.target===entity&&event.t>=start.t) hits.set(event.seq,event);
   }
   if(!f.coop?.code||b?.phase==='respawn'||f.returns>start.returns||f.t-start.t>105){
    for(const code of [...held]) hold(code,false);
    const manualDamage=[...hits.values()].filter(e=>e.actor===1).reduce((sum,e)=>sum+e.value,0);
    window.coopBaptist={seconds:+(f.t-start.t).toFixed(2),hp:a.hp,kills:f.kills-start.kills,
     mora:f.mora-start.mora,moves:[...moves],ringOrders:[...ringOrders],manualDamage};
    return;
   }
   if(!b) {
    hold('KeyD',true);
    requestAnimationFrame(control);
    return;
   }
   if(b.move) moves.add(b.move);
   const dx=b.x-a.x;
   let walk=dx;
   for(const w of Array.isArray(b.warnings)?b.warnings:[]) {
    if(b.move==='FIB03') ringOrders.add(w.order);
    if(b.tick>=w.first-22&&a.x>=w.left-16&&a.x<=w.right+16) {
     walk=a.x<(w.left+w.right)/2?-190:190;
     break;
    }
   }
   const flee=walk!==dx,turn=Math.abs(walk)>8&&walk*a.dir<0;
   const jump=b.move==='FIB01'&&((b.tick>=76&&b.tick<115)||(b.tick>=124&&b.tick<163));
   hold('Space',jump);
   hold('KeyA',walk<-96||(turn&&walk<0));
   hold('KeyD',walk>96||(turn&&walk>0));
   hold('KeyJ',!flee&&Math.abs(dx)<125&&dx*a.dir>=0);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },entity);
}

try {
 const a=await start(true),b=await start(false);
 await a.page.locator('#coopCreate').click();
 await a.page.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=await a.page.evaluate(()=>window.lab.frame.coop.code);
 await b.page.locator('#coopCode').fill(code);
 await b.page.locator('#coopJoin').click();
 await b.page.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([a,b].map(p=>p.route.cross(arena)));
 await Promise.all([a,b].map(({page})=>page.waitForFunction(code=>{
  const coop=window.lab.frame.coop;
  return coop.code===code&&coop.enemies[0]?.maxhp===1090&&coop.peers[0]?.actors.length===2;
 },code)));
 await Promise.all([a,b].map(({page})=>fight(page)));
 await Promise.all([a,b].map(({page})=>page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FIB03'&&b.warnings?.length===3;
 })));
 const slots=await Promise.all([a,b].map(({page})=>page.evaluate(()=>window.lab.frame.fieldBoss.elementSlots)));
 assert.deepEqual(slots,[elements,elements]);
 await a.page.locator('#game').screenshot({path:'evidence/coop-baptist-rings.png'});
 await Promise.all([a,b].map(({page})=>page.waitForFunction(()=>window.coopBaptist,null,{timeout:130000})));
 const results=await Promise.all([a,b].map(({page})=>page.evaluate(()=>window.coopBaptist)));
 assert(results.every(r=>r.kills===1&&r.mora===255&&r.hp>0&&r.manualDamage>0),JSON.stringify(results));
 assert(results.every(r=>r.ringOrders.length===3&&r.moves.length===3),JSON.stringify(results));
 const questCounts=await Promise.all([a,b].map(({page})=>page.evaluate(q=>window.lab.frame.story.quests[q]?.count??null,quest)));
 assert.deepEqual(questCounts,[1,null]);
 await a.page.locator('#fieldBoss').screenshot({path:'evidence/coop-baptist-cleared.png'});
 for(const {page} of [a,b]) {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[saveKey,boss]);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-baptist-browser.json',JSON.stringify({
  browser:'Chrome',participants:2,slots,results,questCounts,savedClears:[1,1],errors
 },null,2)+'\n');
 console.log('Chrome: three shared rings, two contributors, two saved clears.');
} finally {
 await browser.close();
}
