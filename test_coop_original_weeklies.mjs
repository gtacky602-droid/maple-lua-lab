import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const hub='liyue-harbor',saveKey='maple-lua-lab.checkpoint.v1';
const cases={
 surveyor:{boss:'original-tide-surveyor',arena:'tide-calibration-hall',quest:'surveyor-inspection',
  report:[1800,420],mora:340,scene:'tideCalibration',hp:650},
 loom:{boss:'original-twin-shuttle-loom',arena:'buried-weaving-room',quest:'loom-stopped',
  report:[2100,450],mora:360,scene:'buriedWeaving',hp:250},
};
const fixture=await fs.readFile('work/twin-shuttle-loom-fixture.json','utf8');
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const pages=[],errors=[];
const frame=p=>p.evaluate(()=>window.lab.frame);
const wait=(p,fn,arg,timeout=65000)=>p.waitForFunction(fn,arg,{timeout});
const mode=(p,value)=>p.evaluate(value=>{window.originalCoopMode=value},value);
const capture=(p,tag)=>p.locator('.game').screenshot({path:'evidence/coop-original-weeklies-'+tag+'.png'});

async function start(){
 const profile=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await profile.newPage();
 pages.push(page);
 page.setDefaultTimeout(50000);
 page.on('pageerror',e=>errors.push(e.message));
 const route=waypointDriver(page,nodes,{walkTimeout:32000});
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9059/');
 await wait(page,()=>window.lab?.frame);
 await page.evaluate(([key,data])=>localStorage.setItem(key,data),[saveKey,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(hub);
 for(const c of Object.values(cases))await route.accept(c.quest);
 await page.locator('#coopPanel summary').click();
 return {page,route};
}

async function drive(page,kind,side){
 await page.evaluate(({kind,side})=>{
  document.activeElement.blur();
  const held=new Set(),stages=new Set();
  const start=window.lab.frame.t;
  let jumpAt=-1;
  window.originalCoopMode=kind==='surveyor'?'mark':'fight';
  window.originalCoopResult=null;
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function step(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1],mode=window.originalCoopMode;
   if(!b||b.phase==='respawn'||f.returns>0||f.t-start>145){
    for(const code of [...held])key(code,false);
    window.originalCoopResult={won:b?.phase==='respawn',hp:a.hp,returns:f.returns,
     stages:[...stages],exposures:b?.cycle};
    return;
   }
   stages.add(b.stage);
   const old=b.shuttles?.[side<0?0:1];
   const target=kind==='loom'&&b.stage==='sealed'?old?.x??480:480;
   let goal=target+side*66,jump=!a.ground,canAttack=mode==='fight';
   if(kind==='surveyor'){
    if(mode==='mark')goal=117;
    if(mode==='cleanse'||mode==='fight'&&b.marks?.[String(a.id)])goal=a.x<480?160:800;
    if(mode==='fight'&&((b.stage===1&&b.hp<=455)||(b.stage===2&&b.hp<=221)))canAttack=false;
   }else if(b.stage==='sealed'&&old?.broken){
    goal=480+side*68;
    canAttack=false;
   }
   if(mode==='fight'){
    for(const zone of (Array.isArray(b.zones)?b.zones:[])){
     if(a.y<=zone.top||a.y-50>=zone.bottom)continue;
     if(zone.top>=420&&zone.right-zone.left>=170){
      const at=zone.at??(b.move==='TS07'?(b.tick<100?66:226):b.move==='TS03'?64:Infinity);
      if(a.ground&&b.tick>=at-14&&b.tick<at&&f.t-jumpAt>.7&&a.x>zone.left-12&&a.x<zone.right+12){
       window.lab.action('jump');jumpAt=f.t;jump=true;
      }
     }else if(goal>zone.left-20&&goal<zone.right+20){
      const edge=[zone.left-30,zone.right+30].filter(x=>x>=30&&x<=930);
      goal=edge.sort((x,y)=>Math.abs(x-a.x)-Math.abs(y-a.x))[0]??goal;
     }
    }
   }
   const dx=target-a.x,turn=canAttack&&Math.abs(dx)>7&&dx*a.dir<0;
   const delta=goal-a.x;
   const direction=Math.abs(delta)>8?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',direction<0);key('KeyD',direction>0);
   key('Space',jump);
   key('KeyJ',canAttack&&!turn&&Math.abs(dx)<108&&a.y>=424);
   requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
 },{kind,side});
}

async function scenario(players,kind){
 const cfg=cases[kind],[a,b]=players.map(p=>p.page);
 let shuttleContacts;
 await Promise.all(players.map(p=>p.route.cross(cfg.arena)));
 await Promise.all(players.map(({page})=>wait(page,hp=>{
  const f=window.lab.frame;
  return f.coop?.peers[0]?.actors.length>=1&&f.coop.enemies.length===1&&f.weeklyBoss?.maxhp===hp;
 },cfg.hp)));
 const before=await Promise.all(players.map(p=>frame(p.page)));
 const scene=await a.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],[cfg.scene,'ready']);
 if(kind==='loom')await capture(a,'loom-closed');
 await Promise.all([drive(a,kind,-1),drive(b,kind,1)]);
 if(kind==='surveyor'){
  await Promise.all(players.map(({page})=>wait(page,()=>window.lab.frame.weeklyBoss?.marks?.['1']>0)));
  for(const page of [a,b])assert.match(await page.locator('#fieldBossLabel').textContent(),/旅人 測距印 \d+秒/);
  await capture(a,'surveyor-mark');
  await mode(a,'cleanse');
  await wait(a,()=>window.lab.frame.events.some(e=>e.kind==='surveyor_cleanse'&&e.actor===1));
  assert.ok((await frame(b)).weeklyBoss.marks['1']>0);
  await Promise.all([mode(a,'fight'),mode(b,'fight')]);
 }else{
  await Promise.all(players.map(({page})=>wait(page,()=>window.lab.frame.weeklyBoss?.openTicks>0)));
  const opened=await Promise.all(players.map(p=>frame(p.page)));
  assert.ok(opened.every(f=>f.weeklyBoss.shuttles.every(s=>s.broken)&&f.kills===before[0].kills));
  shuttleContacts=opened.map((f,i)=>f.events.filter(e=>e.kind==='hit'&&e.target===99000003+i).map(e=>e.actor));
  assert.ok(shuttleContacts.every(hits=>hits.length>0),JSON.stringify(shuttleContacts));
  await capture(a,'loom-open');
 }
 await Promise.all(players.map(({page})=>wait(page,()=>window.originalCoopResult,null,180000)));
 const results=await Promise.all(players.map(p=>p.page.evaluate(()=>window.originalCoopResult)));
 assert.ok(results.every(r=>r.won&&r.returns===0),JSON.stringify(results));
 if(kind==='surveyor')assert.ok(results.every(r=>JSON.stringify(r.stages)==='[1,2,3]'));
 const after=await Promise.all(players.map(p=>frame(p.page)));
 const rewards=after.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===cfg.mora));
 assert.ok(after.every(f=>f.story.quests[cfg.quest]?.count===1));
 await Promise.all(players.map(async ({page})=>{
  await page.locator('#saveProgress').click();
  await wait(page,([key,boss])=>JSON.parse(localStorage.getItem(key))?.weeklyBosses?.[boss]?.hp===0,[saveKey,cfg.boss]);
 }));
 await Promise.all(players.map(p=>p.route.cross(hub)));
 const preReport=await Promise.all(players.map(p=>frame(p.page)));
 await players[0].route.report(cfg.quest);
 assert.equal((await frame(b)).story.quests[cfg.quest].status,'active');
 await players[1].route.report(cfg.quest);
 const postReport=await Promise.all(players.map(p=>frame(p.page)));
 const report=postReport.map((f,i)=>[f.progression.questXp-preReport[i].progression.questXp,f.mora-preReport[i].mora]);
 assert.deepEqual(report,[cfg.report,cfg.report]);
 return {scene,results,rewards,report,separateReports:true,
  ...(kind==='surveyor'?{personalMarkLabel:true,independentCleanse:true}:{shuttleContacts})};
}

try{
 const players=await Promise.all([start(),start()]);
 const [a,b]=players.map(p=>p.page);
 await a.locator('#coopCreate').click();
 await wait(a,()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await wait(b,c=>window.lab.frame.coop?.code===c,code);
 const surveyor=await scenario(players,'surveyor');
 const loom=await scenario(players,'loom');
 await Promise.all(players.map(async ({page})=>{
  await page.locator('#saveProgress').click();
  await wait(page,([key,rows])=>{
   const save=JSON.parse(localStorage.getItem(key));
   return rows.every(c=>save?.endgame?.bosses?.[c.boss]?.clears===1&&save?.story?.quests?.[c.quest]?.status==='complete');
  },[saveKey,Object.values(cases)]);
 }));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-original-weeklies-browser.json',JSON.stringify({
  participants:2,surveyor,loom,bothTrialsInSameSave:true,errors
 },null,2)+'\n');
 console.log('Chrome: private survey marks, shared stage and shuttle progress, both trials saved and reported.');
}catch(error){
 const status=await Promise.allSettled(pages.map(p=>p.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f.story.node,t:f.t,boss:f.weeklyBoss,mode:window.originalCoopMode,
   result:window.originalCoopResult,actors:f.actors.map(a=>[a.x,a.y,a.hp,a.dir]),
   events:f.events.filter(e=>e.kind.startsWith('surveyor')||e.kind.startsWith('loom')||
    e.kind==='hit'&&e.target>=99000001&&e.target<=99000004).slice(-16)};
 })));
 console.error(JSON.stringify({status,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
