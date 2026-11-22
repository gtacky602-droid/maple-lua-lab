import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const hub='fontaine-hub', quest=graph.quests.find(q=>q.id==='fon-beryl-thermal-vents');
const prefix='evidence/coop-aquatic-crabs';
const cases=[
 {name:'ocean-judge',id:'legend-fontaine_ocean_circuit_judge',host:'fon-wp-50065',
  arena:'ocean-judge-legend-pool',move:'FW11',hp:1050,x:850,y:305,entity:97061,mora:320},
 {name:'iron-viscount',id:'legend-fontaine_iron_viscount',host:'fon-wp-50044',
  vent:'iron-viscount-thermal-gallery',arena:'iron-viscount-legend-pool',
  move:'FW21',hp:1180,x:851,y:314,entity:97062,mora:345},
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const key='maple-lua-lab.checkpoint.v1';
const url=process.env.LAB_URL||'http://127.0.0.1:9065/';
const errors=[];
let pages=[];
const frame=page=>page.evaluate(()=>window.lab.frame);
const wait=(page,fn,arg)=>page.waitForFunction(fn,arg,{timeout:60000});

async function start(cfg,reported){
 const context=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await context.newPage();
 pages.push(page);
 page.setDefaultTimeout(28000);
 page.on('pageerror',err=>errors.push(err.message));
 page.on('response',res=>{if(res.url().endsWith('/api/frame')&&!res.ok())errors.push('Frame HTTP '+res.status());});
 const route=waypointDriver(page,nodes,{walkTimeout:27000});
 const file=reported?'work/coop-iron-viscount-ready.json':'work/'+cfg.name+'-fixture.json';
 await page.goto(url);
 await wait(page,()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(file);
 await route.waitNode(hub);
 if(cfg.vent&&!reported)await route.accept(quest.id);
 await route.warp(cfg.host);
 await page.locator('#coopPanel summary').click();
 return {page,route,context};
}

async function blocked({page,route},to,reason){
 const from=await route.node();
 const gate=nodes[from].exits.find(e=>e.to===to);
 await route.walk(gate.x);
 await route.changeHeight(gate.y??480);
 await wait(page,({to,reason})=>{
  const g=window.lab.frame.storyNearbyPortal;
  return g?.to===to&&!g.available&&g.reason.includes(reason);
 },{to,reason});
 await page.keyboard.press('KeyF');
 assert.equal(await route.node(),from);
}

async function openThermal(guest,cfg,code){
 const {page,route}=guest;
 await blocked(guest,cfg.vent,'排熱弁');
 for(const [i,step] of quest.itinerary.entries()){
  if(step.kind==='arrive')await route.cross(step.node);
  else{
   await route.walk(step.x);
   await route.changeHeight(step.y);
   await page.keyboard.press('KeyG');
  }
  await route.count(quest.id,i+1);
  if(i===2)await blocked(guest,cfg.arena,'報告');
 }
 await route.warp(hub);
 await route.report(quest.id);
 await route.warp(cfg.host);
 await route.cross(cfg.vent);
 await route.cross(cfg.arena);
 assert.equal((await frame(page)).coop.code,code);
}

async function swim(page,cfg,slot){
 await page.evaluate(({cfg,slot})=>{
  const held=new Set();
  const start=window.lab.frame.t;
  const test=window.aquaticTrial={attack:false,counter:false,guardUsed:false};
  function key(code,on){
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function tick(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.phase==='cleared'||f.story.node!==cfg.arena||f.t-start>110){
    for(const keyCode of [...held])key(keyCode,false);
    test.done=b?.phase==='cleared';
    test.stopped=true;
    return;
   }
   const guard=f.storySwimCombat?.counter;
   const bx=b?.x??cfg.x,by=b?.y??cfg.y;
   const side=slot===1?-1:1;
   let x=bx+(test.counter&&slot===1?-100:side*(test.attack?112:167)), y=by+28;
   const warnings=Array.isArray(b?.warnings)?b.warnings:[];
   const canCatch=cfg.vent&&!test.attack&&!test.counter&&warnings.find(w=>w.catchable&&!w.active);
   if(canCatch){
    x=(canCatch.left+canCatch.right)/2+side*23;
    y=(canCatch.top+canCatch.bottom)/2+25;
    if(slot===1&&!test.guardUsed&&!guard?.ready&&!guard?.guarding&&guard?.cooldown===0&&
       b.tick>=canCatch.first-20&&a.x+10>canCatch.left&&a.x-10<canCatch.right&&
       a.y>canCatch.top&&a.y-50<canCatch.bottom){
     window.lab.action('skill1');
    }
   }
   if(guard?.ready)test.guardUsed=true;
   if(test.attack){
    for(const w of warnings){
     if(w.left-20<=a.x&&a.x<=w.right+20&&a.y>w.top&&a.y-50<w.bottom&&b.tick>=w.first-12){
      const up=w.top-14,down=w.bottom+62;
      y=up>=145&&(down>480||Math.abs(a.y-up)<Math.abs(a.y-down))?up:Math.min(480,down);
      if(f.storySwimCombat.burstCooldown===0&&Math.abs(a.y-y)>20)window.lab.action('dodge');
      break;
     }
    }
   }
   const enemyDistance=bx-a.x;
   const turn=Math.abs(x-a.x)<=12&&Math.abs(enemyDistance)>12&&a.dir*enemyDistance<0;
   key('KeyA',a.x>x+12||turn&&enemyDistance<0);
   key('KeyD',a.x<x-12||turn&&enemyDistance>0);
   key('KeyW',a.y>y+8);
   key('KeyS',a.y<y-8);
   const aligned=Math.abs(a.y-by-28)<21&&Math.abs(enemyDistance)<201&&enemyDistance*a.dir>0;
   key('KeyJ',aligned&&!turn&&(test.attack||test.counter&&Boolean(guard?.ready)));
   requestAnimationFrame(tick);
  }
  document.activeElement.blur();
  requestAnimationFrame(tick);
 },{cfg,slot});
}

async function scenario(cfg){
 pages=[];
 const players=await Promise.all([start(cfg,Boolean(cfg.vent)),start(cfg,false)]);
 const [a,b]=players.map(p=>p.page);
 await a.locator('#coopCreate').click();
 await wait(a,()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await wait(b,c=>window.lab.frame.coop?.code===c,code);
 if(cfg.vent){
  await players[0].route.cross(cfg.vent);
  await players[0].route.cross(cfg.arena);
  await openThermal(players[1],cfg,code);
 }else await Promise.all(players.map(p=>p.route.cross(cfg.arena)));
 await Promise.all(pages.map(p=>wait(p,()=>window.lab.frame.storySwimCombat&&window.lab.frame.coop.peers[0]?.actors.length)));
 for(const p of pages){
  assert.ok(await p.locator('.game .skills').isHidden());
  assert.ok(await p.locator('.touch [data-hold="attack"]').isVisible());
  assert.ok(await p.locator('#touchSwimBurst').isVisible());
  assert.equal(await p.locator('#touchSwimGuard').isVisible(),Boolean(cfg.vent));
 }
 const before=await Promise.all(pages.map(frame));
 await Promise.all([swim(a,cfg,1),swim(b,cfg,2)]);
 const warnings=await Promise.all(pages.map(async p=>{
  const value=await wait(p,move=>{
   const boss=window.lab.frame.fieldBoss,w=boss?.warnings?.[0];
   return boss?.move===move&&w&&[w.left,w.right,w.top,w.bottom,w.first,w.after];
  },cfg.move);
  return value.jsonValue();
 }));
 assert.deepEqual(warnings[0],warnings[1]);
 const controls=a.locator('#fieldSwimHelp');
 let guardEvidence;
 if(cfg.vent){
  await wait(a,()=>window.lab.frame.storySwimCombat?.counter?.ready);
  await wait(b,id=>window.lab.frame.events.some(e=>e.kind==='hurt'&&e.target===id),cfg.entity);
  assert.equal((await frame(b)).storySwimCombat.counter.ready,false);
  assert.match(await controls.textContent(),/反撃/);
  await a.locator('.game').screenshot({path:prefix+'-iron-viscount-counter.png'});
  await a.evaluate(()=>{window.aquaticTrial.counter=true});
  await wait(a,id=>{
   const f=window.lab.frame;
   return f.events.some(e=>e.kind==='swim_counter'&&e.target===id)&&
    f.events.some(e=>e.kind==='hit'&&e.target===id)&&!f.storySwimCombat.counter.ready;
  },cfg.entity);
  guardEvidence={personalGuardAndCounter:true,unreportedGuestCouldNotFollow:true};
 }else{
  assert.match(await controls.textContent(),/水撃.*急回避/);
  await wait(a,()=>{
   const boss=window.lab.frame.fieldBoss,w=boss?.warnings?.[0];
   return boss?.move==='FW11'&&w?.active&&w.activeRight-w.activeLeft<w.right-w.left;
  });
  await a.locator('.game').screenshot({path:prefix+'-ocean-judge-wave.png'});
 }
 await Promise.all(pages.map(p=>p.evaluate(()=>{window.aquaticTrial.attack=true})));
 await Promise.all(pages.map(p=>wait(p,()=>window.aquaticTrial.stopped)));
 assert.ok((await Promise.all(pages.map(p=>p.evaluate(()=>window.aquaticTrial.done)))).every(Boolean));
 const after=await Promise.all(pages.map(frame));
 const rewards=after.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.deepEqual(rewards,[[212400,cfg.mora],[212400,cfg.mora]]);
 assert.ok(after.every(f=>f.events.some(e=>e.kind==='hit'&&e.actor===1&&e.target===cfg.entity)));
 await Promise.all(pages.map(async p=>{
  await p.locator('#saveProgress').click();
  await wait(p,([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[key,cfg.id]);
 }));
 const entry=cfg.vent??cfg.host;
 await Promise.all(players.map(p=>p.route.cross(entry)));
 await Promise.all(players.map(p=>p.route.cross(cfg.arena)));
 assert.ok((await Promise.all(pages.map(frame))).every(f=>f.coop.enemies[0]?.hp===cfg.hp));
 await Promise.all(players.map(p=>p.context.close()));
 return {warning:warnings[0],rewards,waterControlsOnly:true,saved:true,sharedRematch:true,...guardEvidence};
}

try{
 const result={participants:2};
 for(const cfg of cases)result[cfg.name]=await scenario(cfg);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({...result,errors},null,2)+'\n');
 console.log('Chrome: shared water depth, personal counter, both rewards and repeat entry.');
}catch(error){
 console.error(JSON.stringify(await Promise.allSettled(pages.map(p=>p.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f?.story?.node,t:f?.t,boss:f?.fieldBoss,swim:f?.storySwimCombat,
   trial:window.aquaticTrial,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),events:f?.events?.slice(-10)};
 }))),null,2),errors);
 throw error;
}finally{
 await browser.close();
}
