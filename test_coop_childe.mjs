import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const url=process.env.LAB_URL||'http://127.0.0.1:9046/';
const hub='liyue-harbor',arena='childe-golden-house-arena',boss='boss-29030101';
const quest='childe-weekly-commission',key='maple-lua-lab.checkpoint.v1';
const fixture=await fs.readFile('work/childe-weekly-gear.json','utf8');
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
 await route.waitNode(hub);
 if(accept)await route.accept(quest);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function play(page,side){
 await page.evaluate(side=>{
  document.activeElement.blur();
  const held=new Set(),forms=new Set(),transitions=new Set(),strikes=new Map();
  const start=window.lab.frame.t;
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1];
   for(const e of Array.isArray(f.events)?f.events:[]){
    if(e.t>=start&&e.kind==='hit'&&e.actor===f.active&&e.target===29030101)strikes.set(e.seq,e.value);
   }
   if(b)forms.add(b.form);
   if(b?.move==='WC14')transitions.add(b.hp);
   if(b?.phase==='respawn'||f.returns||!b||f.t-start>85){
    for(const code of [...held])key(code,false);
    window.childeCoopResult={won:b?.phase==='respawn',forms:[...forms],transitions:[...transitions],
     partyHp:a.hp,manualDamage:[...strikes.values()].reduce((sum,n)=>sum+n,0),returns:f.returns};
    return;
   }
   const dx=b.x-a.x;
   const desired=Math.max(30,Math.min(930,b.x+side*65));
   const delta=desired-a.x,turn=dx*a.dir<0&&Math.abs(dx)>8;
   const direction=Math.abs(delta)>8?Math.sign(delta):turn?Math.sign(dx):0;
   const jump=b.move==='WC03'||b.move==='WC09'||b.move==='WC01'&&b.moveTick>=50&&b.moveTick<205;
   if(jump&&a.ground)window.lab.action('jump');
   key('KeyA',direction<0);key('KeyD',direction>0);
   key('KeyJ',b.damageable&&Math.abs(dx)<114&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },side);
}

async function save(page,reported=false){
 await page.locator('#saveProgress').click();
 await page.waitForFunction(([key,boss,quest,reported])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return d?.weeklyBosses?.[boss]?.hp===0&&d?.endgame?.bosses?.[boss]?.clears===1
   &&(!reported||d?.story?.quests?.[quest]?.status==='complete');
 },[key,boss,quest,reported]);
 return page.evaluate(([key,boss,quest])=>{
  const d=JSON.parse(localStorage.getItem(key));
  return {wait:d.weeklyBosses[boss].waitTicks,clears:d.endgame.bosses[boss].clears,
   xp:d.progression.killXp,mora:d.mora,quest:d.story.quests[quest]?.status??null};
 },[key,boss,quest]);
}

try{
 const [host,guest]=await Promise.all([start(true),start(false)]);
 const [a,b]=[host.page,guest.page];
 const pages=[a,b];
 await a.locator('#coopCreate').click();
 await a.waitForFunction(()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await b.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
 await Promise.all([host,guest].map(({route})=>route.cross(arena)));
 for(const page of pages)await page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.coop?.peers[0]?.actors.length===2&&f.coop.enemies.length===1&&f.weeklyBoss.maxhp===960;
 });
 const before=await Promise.all(pages.map(frame));
 const scenery=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scenery.file,scenery.state],['buried-weaving-background-v1.png','ready']);
 await guest.route.walk(343);
 await b.waitForFunction(()=>window.lab.frame.weeklyBoss.mark==='hydro',null,{timeout:12000});
 await a.waitForFunction(()=>{
  const f=window.lab.frame;
  return !f.weeklyBoss.mark&&f.draws.some(d=>d.text==='◆ 水断流');
 });
 await b.keyboard.press('KeyE');
 await b.waitForFunction(()=>window.lab.frame.active===2&&window.lab.frame.weeklyBoss.mark==='hydro');
 await a.locator('#game').screenshot({path:'evidence/coop-childe-riptide.png'});
 await guest.route.walk(29);
 await b.waitForFunction(()=>!window.lab.frame.weeklyBoss.mark);
 await b.keyboard.press('KeyE');
 await b.waitForFunction(()=>window.lab.frame.active===1);

 await Promise.all([play(a,-1),play(b,1)]);
 await a.waitForFunction(()=>{
  const f=window.lab.frame,v=f.weeklyBoss;
  return v?.form===3&&v.move==='WC14'&&f.draws.some(d=>d.source==='childe-foul-idle-source-v1.png');
 },null,{timeout:50000});
 await a.locator('#game').screenshot({path:'evidence/coop-childe-foul-legacy.png'});
 await Promise.all(pages.map(page=>page.waitForFunction(()=>window.childeCoopResult,null,{timeout:100000})));
 const results=await Promise.all(pages.map(page=>page.evaluate(()=>window.childeCoopResult)));
 for(const r of results){
  assert.ok(r.won&&!r.returns&&r.manualDamage>0,JSON.stringify(r));
  assert.deepEqual(r.forms,[1,2,3]);
  assert.deepEqual(r.transitions,[720,420]);
 }
 const defeated=await Promise.all(pages.map(frame));
 assert.deepEqual(defeated.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]),
  [[14700,560],[14700,560]]);
 const questCounts=defeated.map(f=>f.story.quests[quest]?.count??null);
 assert.deepEqual(questCounts,[1,null]);
 const saved=await Promise.all(pages.map(page=>save(page)));
 assert.ok(saved.every(s=>s.wait>0&&s.clears===1));
 await Promise.all([host,guest].map(({route})=>route.cross(hub)));
 const beforeReport=await frame(a);
 await host.route.report(quest);
 const afterReport=await frame(a);
 const report={xp:afterReport.progression.questXp-beforeReport.progression.questXp,mora:afterReport.mora-beforeReport.mora};
 assert.deepEqual(report,{xp:18000,mora:1800});
 await save(a,true);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-childe-browser.json',JSON.stringify({
  participants:2,phaseHp:[240,300,420],remoteMarkObserved:true,swapAndCleanse:true,
  results,scenery,questCounts,saved,report,errors
 },null,2)+'\n');
 console.log('Chrome: both saw party-owned Riptide and every form, fought, saved and reported.');
}catch(error){
 const state=await Promise.allSettled(players.map(({page})=>page.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,boss:f.weeklyBoss,actors:f.actors.map(a=>[a.x,a.y,a.hp]),active:f.active,
    result:window.childeCoopResult,peers:f.coop?.peers,status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({state,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
