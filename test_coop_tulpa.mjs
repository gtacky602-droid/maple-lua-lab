import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9004/';
const arena='tulpa-field-grotto', quest='tulpa-commission', boss='boss-20051201';
const saveKey='maple-lua-lab.checkpoint.v1';
const fixture=JSON.parse(await fs.readFile('work/tulpa-field-fixture.json','utf8'));
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];

async function start(accept) {
 const context=await browser.newContext({viewport:{width:1220,height:940}});
 const page=await context.newPage();
 page.setDefaultTimeout(24000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 const save=structuredClone(fixture);
 if(!accept) delete save.story.quests[quest];
 await page.evaluate(([key,data])=>localStorage.setItem(key,JSON.stringify(data)),[saveKey,save]);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.story?.node==='fontaine-hub'&&window.lab.frame.progression?.level===88);
 const travel=waypointDriver(page,nodes,{walkTimeout:18000});
 await travel.cross('fontaine-field');
 await travel.cross(arena);
 await page.locator('#coopPanel summary').click();
 return page;
}

async function fight(page) {
 await page.evaluate(()=>{
  document.activeElement.blur();
  const held=new Set(),moves=new Set();
  const start=window.lab.frame;
  let lastMove, lastTick, dodged=false, stopped=false, absorbed=false;
  function hold(code,on) {
   if(on===held.has(code)) return;
   if(on) held.add(code); else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function step() {
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!f.coop?.code||b?.hp===0||f.returns>start.returns||f.t-start.t>105) {
    for(const code of [...held]) hold(code,false);
    const events=f.events.filter(e=>e.t>=start.t&&e.kind==='hit');
    const dealt=target=>events.filter(e=>e.target===target).reduce((sum,e)=>sum+e.value,0);
    window.coopTulpa={seconds:+(f.t-start.t).toFixed(2),hp:a.hp,kills:f.kills-start.kills,
     moves:[...moves],stopped,absorbed,bossDamage:dealt(20051201),halfDamage:dealt(-20051201)};
    return;
   }
   if(!b) {
    hold('KeyD',true);
    requestAnimationFrame(step);
    return;
   }
   if(b.move!==lastMove||b.tick<lastTick) { lastMove=b.move; dodged=false; }
   lastTick=b.tick;
   if(b.move) moves.add(b.move);
   stopped ||= b.label==='合流を阻止・小さな奔流';
   absorbed ||= b.form==='surge';
   if(b.move==='FHT02'&&b.tick>=152&&b.tick<159&&!dodged) {
    dodged=true;hold('ShiftLeft',true);hold('ShiftLeft',false);
   }
   const windup=b.move==='FHT03'&&b.tick<54;
   const target=b.summon?.x??(windup?b.x-188:b.x);
   const dx=target-a.x, turn=Math.abs(dx)>8&&dx*a.dir<0;
   const distance=b.summon?59:windup?10:99;
   const jump=(b.move==='FHT01'&&b.tick>=76&&b.tick<109)||
    (b.move==='FHT02'&&b.tick>=77&&b.tick<113)||(b.move==='FHT03'&&b.tick>=181&&b.tick<215);
   hold('Space',jump);
   hold('KeyA',dx<-distance||(turn&&dx<0));
   hold('KeyD',dx>distance||(turn&&dx>0));
   hold('KeyJ',!windup&&Math.abs(dx)<(b.summon?95:125)&&!turn);
   requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
 });
}

try {
 const [a,b]=await Promise.all([start(true),start(false)]);
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=await a.evaluate(()=>window.lab.frame.coop.code);
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await Promise.all([a,b].map(page=>page.waitForFunction(code=>{
  const coop=window.lab.frame.coop;
  return coop.code===code&&coop.peers[0]?.actors.length===2&&coop.enemies[0].maxhp===1030;
 },code)));
 await Promise.all([a,b].map(fight));
 await a.waitForFunction(()=>window.lab.frame.fieldBoss?.summon?.maxhp===26);
 await a.locator('#game').screenshot({path:'evidence/coop-tulpa-half.png'});
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.fieldBoss?.label==='合流を阻止・小さな奔流'&&f.coop.enemies.length===1;
 })));
 await a.locator('#game').screenshot({path:'evidence/coop-tulpa-interrupt.png'});
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>window.coopTulpa,null,{timeout:140000})));
 const results=await Promise.all([a,b].map(page=>page.evaluate(()=>window.coopTulpa)));
 assert.ok(results.every(r=>r.kills===1&&r.hp>0&&r.bossDamage>0&&r.stopped),JSON.stringify(results));
 assert.ok(results.reduce((sum,r)=>sum+r.halfDamage,0)>=26,JSON.stringify(results));
 const counts=await Promise.all([a,b].map(page=>page.evaluate(q=>window.lab.frame.story.quests[q]?.count??null,quest)));
 assert.deepEqual(counts,[1,null]);
 for(const page of [a,b]) {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[saveKey,boss]);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-tulpa-browser.json',JSON.stringify({
  browser:'Chrome',participants:2,maxHp:1030,halfHp:26,bothSawInterrupt:true,
  results,personalQuestCounts:counts,savedClears:[1,1],errors,
 },null,2)+'\n');
 console.log('Chrome players stopped the same Half-Tulpa, defeated the boss and saved both records.');
} finally {
 await browser.close();
}
