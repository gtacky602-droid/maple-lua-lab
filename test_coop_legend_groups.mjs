import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:9068/';
const boss='legend-natlan_polychrome_tristars';
const gate='nat-wp-72432', arena='witztli-tristars-camp';
const saveKey='maple-lua-lab.checkpoint.v1';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const fixture='work/coop-legend-groups-fixture.json';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const errors=[];
const fullHp=[490,500,350];

async function start() {
 const c=await browser.newContext({viewport:{width:1220,height:940}});
 const page=await c.newPage();
 page.setDefaultTimeout(35000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',r=>{
  if(r.url().endsWith('/api/frame')&&!r.ok()) errors.push('Frame HTTP '+r.status());
 });
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(fixture);
 const route=waypointDriver(page,nodes,{walkTimeout:20000});
 await route.waitNode('natlan-hub');
 await route.warp(gate);
 await route.cross(arena);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function waitBodies(page, hp, kills) {
 await page.waitForFunction(([expected,count])=>{
  const f=window.lab.frame;
  const bodies=f.fieldBoss?.bodies;
  return f.kills===count&&bodies?.length===expected.length&&
   bodies.every((b,i)=>(expected[i]===null?b.hp>0:b.hp===expected[i])&&f.coop.enemies[i]?.hp===b.hp)&&
   f.fieldBoss.hp===bodies.reduce((sum,body)=>sum+body.hp,0);
 },[hp,kills]);
}

async function waitFresh(page,code) {
 await page.waitForFunction(([code,hp])=>{
  const coop=window.lab.frame.coop;
  return coop?.code===code&&coop.enemies.length===hp.length&&coop.enemies.every((e,i)=>e.hp===hp[i]);
 },[code,fullHp]);
}

const readHp=page=>page.evaluate(()=>window.lab.frame.fieldBoss.bodies.map(body=>body.hp));

async function attackBody(players, index) {
 await Promise.all(players.map(async({page,route})=>{
  for(let attempt=0;attempt<15;attempt++) {
   const body=await page.evaluate(i=>window.lab.frame.fieldBoss?.bodies[i],index);
   assert.ok(body,'Player left the arena during the fight');
   if(body.hp===0)return;
   const {x}=await route.actor();
   await route.walk(body.x+(x<body.x?-42:42));
   await page.evaluate(()=>document.activeElement.blur());
   await page.keyboard.down('KeyJ');
   try {
    await page.waitForFunction(i=>window.lab.frame.fieldBoss?.bodies[i]?.hp===0,index,{timeout:3000});
    return;
   }catch(error){
    if(error.name!=='TimeoutError')throw error;
   }finally{
    await page.keyboard.up('KeyJ');
   }
  }
  assert.fail(`Body ${index+1} was still alive after repeated attacks`);
 }));
}

async function sharedWarning(players, owner) {
 const warnings=await Promise.all(players.map(async({page})=>{
  const snapshot=await page.waitForFunction(id=>{
   const b=window.lab.frame.fieldBoss;
   const warning=b?.warnings?.[0];
   return b?.moveOwner===id&&warning&&!warning.active&&[b.move,warning.element,warning.left,warning.right];
  },owner);
  return snapshot.jsonValue();
 }));
 assert.deepEqual(warnings[0],warnings[1]);
 return warnings[0];
}

try {
 const players=[await start(),await start()];
 const [{page:host},{page:guest}]=players;
 await host.locator('#coopCreate').click();
 await host.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=await host.evaluate(()=>window.lab.frame.coop.code);
 await guest.locator('#coopCode').fill(code);
 await guest.locator('#coopJoin').click();
 await Promise.all(players.map(({page})=>page.waitForFunction(code=>{
  const coop=window.lab.frame.coop;
  return coop.code===code&&coop.peers[0]?.actors.length===2;
 },code)));
 await Promise.all(players.map(({page})=>waitFresh(page,code)));
 await Promise.all(players.map(({route})=>route.walk(560)));
 await Promise.all(players.map(({page})=>waitBodies(page,[null,null,null],0)));
 const firstWarning=await sharedWarning(players,97074);
 assert.deepEqual(firstWarning.slice(0,2),['GT01','cryo']);
 await host.locator('#game').screenshot({path:'evidence/coop-tristars-gather.png'});
 await attackBody(players,0);
 await Promise.all(players.map(({page})=>waitBodies(page,[0,null,null],0)));
 const snapshots=[await readHp(host)];
 const nextWarning=await sharedWarning(players,97075);
 assert.deepEqual(nextWarning.slice(0,2),['GT02','electro']);
 await host.locator('#game').screenshot({path:'evidence/coop-tristars-first-down.png'});
 await attackBody(players,1);
 await Promise.all(players.map(({page})=>waitBodies(page,[0,0,null],0)));
 snapshots.push(await readHp(host));
 await attackBody(players,2);
 await Promise.all(players.map(({page})=>waitBodies(page,[0,0,0],1)));
 snapshots.push(await readHp(host));
 assert.equal(await host.evaluate(()=>window.lab.frame.fieldBoss.label),'討伐完了・全員で出口へ');
 await host.locator('#game').screenshot({path:'evidence/coop-tristars-cleared.png'});
 const kills=await Promise.all(players.map(({page})=>page.evaluate(()=>window.lab.frame.kills)));
 const mora=await Promise.all(players.map(({page})=>page.evaluate(()=>window.lab.frame.mora)));
 assert.deepEqual(mora,[550,550]);
 for(const {page} of players) {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[saveKey,boss]);
 }
 await Promise.all(players.map(({route})=>route.cross(gate)));
 await players[0].route.cross(arena);
 await waitFresh(host,code);
 await players[1].route.cross(arena);
 await Promise.all(players.map(({page})=>waitFresh(page,code)));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-tristars-browser.json',JSON.stringify({
  browser:'Chrome',participants:2,fullHp,sharedHpByStep:snapshots,
  warningsBeforeAndAfterFirstDefeat:[firstWarning,nextWarning],kills,mora,
  savedClears:[1,1],rematchHp:fullHp,sameRoomAfterRematch:true,errors
 },null,2)+'\n');
 console.log('Chrome: both players witnessed separate defeats, saved one clear and re-entered the same room.');
} finally {
 await browser.close();
}
