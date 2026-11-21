import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {dvalinGate,driveDvalin} from './tools/browser_dvalin_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9044/';
const town='mond-town',road='mond-road',arena='dvalin-sky-arena';
const id='boss-29010101',quest='dvalin-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/dvalin-weekly-fixture.json','utf8');
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
 const player={page,route};
 players.push(player);
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(([key,data])=>localStorage.setItem(key,data),[key,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(town);
 if(accept) await route.accept(quest);
 await route.cross(road);
 await page.locator('#coopPanel summary').click();
 return player;
}

async function save(page,reported){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(([key,id,quest,reported])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return d?.weeklyBosses?.[id]?.hp===0&&d?.endgame?.bosses?.[id]?.clears===1
   &&(!reported||d?.story?.quests?.[quest]?.status==='complete');
 },[key,id,quest,reported]);
 return page.evaluate(([key,id,quest])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return {wait:d.weeklyBosses[id].waitTicks,clears:d.endgame.bosses[id].clears,mora:d.mora,xp:d.progression.killXp,
   quest:d.story.quests[quest]?.status??null};
 },[key,id,quest]);
}

try{
 const [host,guest]=await Promise.all([start(true),start(false)]);
 const [a,b]=[host.page,guest.page];
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await b.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([host,guest].map(({route})=>route.cross(arena)));
 const scenery=await Promise.all([a,b].map(page=>page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 })));
 assert.ok(scenery.every(s=>s.key==='dvalinWeekly'&&s.state==='ready'));
 const before=await Promise.all([a,b].map(frame));

 for(const page of [a,b]){
  await page.waitForFunction(code=>{
   const f=window.lab.frame;
   return f.coop.code===code&&f.coop.enemies[0]?.maxhp===600&&f.coop.peers[0].actors.length===2;
  },code);
  await page.evaluate(()=>{document.activeElement.blur();window.dvalinFight=true;});
  await driveDvalin(page,{maxSeconds:225,crystalOffset:page===a?-34:34});
 }
 await Promise.all([a,b].map(page=>page.waitForFunction(()=>{
  const f=window.lab.frame,v=f.weeklyBoss;
  return v?.exposed&&v.padY===420&&v.guard===0&&window.dvalinPadReached;
 },null,{timeout:125000})));
 const opening=await Promise.all([a,b].map(frame));
 assert.equal(opening[0].weeklyBoss.crystal.x,opening[1].weeklyBoss.crystal.x);
 assert.ok(opening.every(f=>f.weeklyBoss.breaks>0));
 await a.locator('#game').screenshot({path:'evidence/coop-dvalin-crystal.png'});

 await Promise.all([a,b].map(page=>page.waitForFunction(()=>window.dvalinResult,null,{timeout:245000})));
 const results=await Promise.all([a,b].map(page=>page.evaluate(()=>window.dvalinResult)));
 assert.ok(results.every(r=>r.won&&r.returns===0&&r.manualLanded&&r.manualCrystalDamage>0),JSON.stringify(results));
 const defeated=await Promise.all([a,b].map(frame));
 assert.deepEqual(defeated.map((f,i)=>[f.mora-before[i].mora,f.progression.killXp-before[i].progression.killXp]),
  [[300,3450],[300,3450]]);
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all([a,b].map(page=>save(page,false)));
 assert.ok(saved.every(v=>v.wait>0&&v.clears===1));
 await Promise.all([a,b].map(page=>dvalinGate(page,35,road)));
 await Promise.all([host,guest].map(({route})=>route.cross(town)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const report=await frame(a);
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[1400,360]);
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-dvalin-browser.json',JSON.stringify({
  participants:2,hp:600,results,scenery,questCounts,saved,questReport:{xp:1400,mora:360},errors,
 },null,2)+'\n');
 console.log('Chrome: both players reached and struck the same crystal, cleared, saved and reported.');
}catch(error){
 console.error(await Promise.allSettled(players.map(({page})=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,weekly:f.weeklyBoss,actors:f.actors.map(a=>[a.x,a.y,a.hp]),result:window.dvalinResult,
   coop:f.coop?.shared,status:document.querySelector('#status')?.textContent};
 }))),errors);
 throw error;
}finally{
 await browser.close();
}
