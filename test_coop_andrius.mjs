import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';
import {driveAndrius} from './tools/browser_andrius_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9045/';
const town='mond-town',road='mond-road',arena='andrius-wolf-ring';
const id='boss-29020101',quest='andrius-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/andrius-weekly-ranked-fixture.json','utf8');
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
 players.push({page,route});
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(([key,data])=>localStorage.setItem(key,data),[key,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(town);
 if(accept) await route.accept(quest);
 await route.cross(road);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function joinTrial({page,route}){
 await route.walk(940);
 await page.waitForFunction(arena=>window.lab.frame.storyNearbyPortal?.to===arena,arena);
 await page.locator('#weeklyDifficulty').selectOption('entry');
 const chosen=(await frame(page)).weeklyDesk.modes.find(m=>m.id==='entry');
 assert.ok(chosen.available&&chosen.name==='入門');
 await page.locator('#weeklyChallengeStart').click();
 await route.waitNode(arena);
 return chosen;
}

async function save(page,reported=false){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(([key,id,quest,reported])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return d?.weeklyBosses?.[id]?.hp===0&&d?.endgame?.weekly?.[id+':entry']?.clears===1
   &&(!reported||d?.story?.quests?.[quest]?.status==='complete');
 },[key,id,quest,reported]);
 return page.evaluate(([key,id,quest])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return {wait:d.weeklyBosses[id].waitTicks,clears:d.endgame.weekly[id+':entry'].clears,
   xp:d.progression.killXp,mora:d.mora,quest:d.story.quests[quest]?.status??null};
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
 const [rank]=await Promise.all([joinTrial(host),joinTrial(guest)]);
 const pages=[a,b];
 const scenery=await Promise.all(pages.map(page=>page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 })));
 assert.ok(scenery.every(s=>s.key==='andriusWeekly'&&s.state==='ready'));
 const before=await Promise.all(pages.map(frame));
 for(const [index,page] of pages.entries()){
  await page.waitForFunction(code=>{
   const f=window.lab.frame;
   return f.coop.code===code&&f.coop.enemies.length===1&&f.coop.enemies[0]?.maxhp===900
    &&f.coop.peers[0].actors.length===2&&f.weeklyBoss.difficulty==='入門';
  },code);
  assert.match(await page.locator('#coopPeers').textContent(),/入門/);
  await page.evaluate(()=>{document.activeElement.blur();window.andriusFight=true;});
  await driveAndrius(page,index===0?-1:1);
 }
 await a.waitForFunction(()=>{
  const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1],p=f.coop.peers[0]?.actors[0];
  return b.stage==='INTERLUDE'&&b.tick<504&&a.y===356.8&&p?.y===356.8&&a.x<216&&p.x>744;
 },null,{timeout:145000});
 await a.locator('#game').screenshot({path:'evidence/coop-andrius-upper-platforms.png'});
 await a.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.weeklyBoss?.stage==='P2'&&f.draws.some(d=>d.source?.startsWith('andrius-weekly-awake'));
 },null,{timeout:45000});
 await a.locator('#game').screenshot({path:'evidence/coop-andrius-awakened.png'});

 await Promise.all(pages.map(page=>page.waitForFunction(()=>window.andriusResult,null,{timeout:280000})));
 const results=await Promise.all(pages.map(page=>page.evaluate(()=>window.andriusResult)));
 assert.ok(results.every(r=>r.won&&r.transitions===1&&r.returns===0&&r.manualUpper&&r.manualDamage>0),
  JSON.stringify(results));
 const defeated=await Promise.all(pages.map(frame));
 const reward={xp:rank.xp+rank.firstXp,mora:rank.mora+rank.firstMora,first:true};
 assert.deepEqual(defeated.map(f=>f.weeklyBoss.reward),[reward,reward]);
 assert.deepEqual(defeated.map((f,i)=>[f.mora-before[i].mora,f.progression.killXp-before[i].progression.killXp]),
  [[reward.mora,reward.xp],[reward.mora,reward.xp]]);
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(pages.map(page=>save(page)));
 assert.ok(saved.every(v=>v.wait>0&&v.clears===1));
 await Promise.all([host,guest].map(async({route})=>{await route.cross(road);await route.cross(town);}));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:1600,mora:390});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-andrius-browser.json',JSON.stringify({
  participants:2,hp:900,rank:'entry',results,scenery,questCounts,saved,report,reward,errors
 },null,2)+'\n');
 console.log('Chrome: both entered Entry, took opposite platforms, cleared, saved and reported.');
}catch(error){
 const state=await Promise.allSettled(players.map(({page})=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,actors:f.actors.map(a=>[a.x,a.y,a.hp]),result:window.andriusResult,
   peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
