import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { waypointDriver } from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:9005/';
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
  const x=await page.evaluate(i=>window.lab.frame.fieldBoss.bodies[i].x,index);
  await route.walk(x-83);
  await page.evaluate(()=>document.activeElement.blur());
 }));
 await Promise.all(players.map(({page})=>page.keyboard.down('KeyJ')));
 try {
  await Promise.all(players.map(({page})=>page.waitForFunction(
   i=>window.lab.frame.fieldBoss?.bodies[i]?.hp===0,index,{timeout:85000})));
 } finally {
  await Promise.all(players.map(({page})=>page.keyboard.up('KeyJ')));
 }
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
 await host.locator('#game').screenshot({path:'evidence/coop-tristars-gather.png'});
 await attackBody(players,0);
 await Promise.all(players.map(({page})=>waitBodies(page,[0,null,null],0)));
 const snapshots=[await readHp(host)];
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
  kills,mora,savedClears:[1,1],rematchHp:fullHp,sameRoomAfterRematch:true,errors
 },null,2)+'\n');
 console.log('Chrome: both players witnessed separate defeats, saved one clear and re-entered the same room.');
} finally {
 await browser.close();
}
