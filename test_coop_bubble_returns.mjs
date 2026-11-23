import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const prefix='evidence/coop-bubble-returns';
const key='maple-lua-lab.checkpoint.v1';
const cases=[
 {name:'chassanion',id:'legend-fontaine_chassanion',entrance:'fon-wp-55765',passage:'morte-tower-sluice',
  arena:'chassanion-legend-bubble-room',fixture:'fontaine-bubble',hp:1125,x:850,y:302,
  entity:97070,mora:410,returnDamage:156,range:167,vertical:55,art:'fontaine-bubble-poses-source-v1.png',alternateEntrance:true},
 {name:'corrouge',id:'legend-fontaine_mageblade_corrouge',entrance:'fon-wp-55784',passage:'erinnyes-root-waterway',
  arena:'erinnyes-corrouge-cleft',fixture:'fontaine-corrouge',hp:1190,x:855,y:308,
  entity:97071,mora:430,returnDamage:162,range:165,vertical:52,art:'fontaine-corrouge-poses-source-v1.png',planted:true},
];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const errors=[];
let pages=[];
const frame=p=>p.evaluate(()=>window.lab.frame);
const wait=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:65000});

async function start(cfg,slot){
 const context=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await context.newPage();
 pages.push(page);
 page.setDefaultTimeout(28000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().endsWith('/api/frame')&&!r.ok())errors.push('Frame HTTP '+r.status());});
 const route=waypointDriver(page,nodes,{walkTimeout:26000});
 const outside=cfg.alternateEntrance&&slot===1;
 const fixture=`work/coop-${cfg.fixture}-${outside?'fixture':'reported'}.json`;
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
 await wait(page,()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles(fixture);
 await route.waitNode('fontaine-hub');
 await route.warp(cfg.entrance);
 await page.locator('#coopPanel summary').click();
 return {page,route,context,entrance:outside?cfg.entrance:cfg.passage};
}

async function swim(page,cfg,guest){
 await page.evaluate(({cfg,guest})=>{
  const held=new Set(),test=window.bubbleTrial={fight:false,reflect:false};
  let proofReturned=false;
  const start=window.lab.frame.t;
  const button=(code,on)=>{
   if(held.has(code)===on)return;
   on?held.add(code):held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  function tick(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1],reflect=f.storySwimCombat?.reflect;
   if(b?.phase==='cleared'||f.story.node!==cfg.arena||f.t-start>112){
    for(const code of [...held])button(code,false);
    test.result={won:b?.phase==='cleared',returns:f.returns};
    return;
   }
   const bx=b?.x??cfg.x,by=b?.y??cfg.y;
   let x=bx-(guest?148:190),y=by+28;
   let lookAt=bx;
   const warnings=Object.values(b?.warnings??{});
   proofReturned ||= Object.values(f.events??{}).some(e=>e.kind==='swim_bubble_return'&&e.target===cfg.entity);
   const returning=guest&&test.reflect&&(test.fight||!proofReturned)&&warnings.filter(w=>w.returnWindow&&w.orb)
    .sort((u,v)=>Math.abs(u.orb.x-a.x)+Math.abs(u.orb.y+28-a.y)-
      Math.abs(v.orb.x-a.x)-Math.abs(v.orb.y+28-a.y))[0];
   if(returning){
    const orb=returning.orb;
    x=Math.max(30,orb.x-62);
    y=Math.max(147,Math.min(474,orb.y+28));
    lookAt=orb.x;
    const forward=(lookAt-a.x)*a.dir;
    if(reflect?.ready&&!reflect.cooldown&&forward>=-12&&forward<=cfg.range&&
       Math.abs(orb.y-a.y+28)<=cfg.vertical){
     window.lab.action('skill1');
    }
   }else if(test.fight){
    const hazards=warnings.filter(w=>Number.isFinite(w.left)&&!w.returning&&
     a.x>=w.left-25&&a.x<=w.right+25&&b.tick>=w.first-15);
    const safe=depth=>hazards.every(w=>depth<=w.top-12||depth>=w.bottom+62);
    const depths=hazards.flatMap(w=>[w.top-12,w.bottom+62]).filter(y=>y>=149&&y<=473&&safe(y));
    if(!safe(y)&&depths.length)y=depths.reduce((best,next)=>Math.abs(next-y)<Math.abs(best-y)?next:best);
   }
   const turn=Math.abs(x-a.x)<=10&&Math.abs(lookAt-a.x)>10&&a.dir*(lookAt-a.x)<0;
   button('KeyA',a.x>x+10||turn&&lookAt<a.x);
   button('KeyD',a.x<x-10||turn&&lookAt>a.x);
   button('KeyW',a.y>y+7);
   button('KeyS',a.y<y-7);
   const aligned=Math.abs(a.y-by-28)<41&&Math.abs(bx-a.x)<233&&(bx-a.x)*a.dir>0;
   button('KeyJ',aligned&&test.fight);
   requestAnimationFrame(tick);
  }
  document.activeElement.blur();
  requestAnimationFrame(tick);
 },{cfg,guest});
}

async function scenario(cfg){
 pages=[];
 const players=await Promise.all([start(cfg,1),start(cfg,2)]);
 const [a,b]=players.map(p=>p.page);
 await a.locator('#coopCreate').click();
 await wait(a,()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await wait(b,c=>window.lab.frame.coop?.code===c,code);
 await Promise.all(players.map(async p=>{
  if(p.entrance!==cfg.entrance)await p.route.cross(p.entrance);
  await p.route.cross(cfg.arena);
  await wait(p.page,()=>window.lab.frame.storySwimCombat?.reflect);
  assert.equal((await p.page.locator('#touchSwimGuard').textContent()).trim(),'泡返し');
 }));
 await Promise.all(pages.map(p=>wait(p,()=>window.lab.frame.coop.peers[0]?.actors.length)));
 const before=await Promise.all(pages.map(frame));
 if(cfg.alternateEntrance){
  assert.equal(before[0].storyScenery,undefined);
  assert.equal(before[1].storyScenery,'bygoneResonance');
  assert.match(before[1].location,/下層/);
 }
 await Promise.all([swim(a,cfg,false),swim(b,cfg,true)]);
 await Promise.all(pages.map(p=>wait(p,({planted,art})=>{
  const f=window.lab.frame;
  return f.draws.some(d=>d.source===art)&&
   Object.values(f.fieldBoss?.warnings??{}).some(w=>w.returnWindow&&Boolean(w.active)!==planted);
 },cfg)));
 await b.evaluate(()=>{window.bubbleTrial.reflect=true});
 await Promise.all(pages.map(p=>wait(p,()=>Object.values(window.lab.frame.fieldBoss?.warnings??{}).some(w=>w.returning))));
 if(cfg.alternateEntrance){
  await Promise.all([a.locator('.game').screenshot({path:prefix+'-chassanion-outside.png'}),
   b.locator('.game').screenshot({path:prefix+'-chassanion-inside.png'})]);
 }else await b.locator('.game').screenshot({path:prefix+'-corrouge-return.png'});
 await wait(b,id=>{
  const f=window.lab.frame;
  return Object.values(f.events??{}).some(e=>e.kind==='swim_bubble_impact'&&e.target===id)&&f.fieldBoss.hp<f.fieldBoss.maxhp;
 },cfg.entity);
 const returned=await frame(b);
 assert.equal(returned.fieldBoss.hp,cfg.hp-cfg.returnDamage);
 await wait(a,hp=>window.lab.frame.fieldBoss?.hp===hp,returned.fieldBoss.hp);
 const hostImpact=await frame(a);
 assert.ok(!Object.values(hostImpact.events??{}).some(e=>e.kind==='swim_bubble_impact'));
 assert.equal(returned.fieldBoss.hp,hostImpact.fieldBoss.hp);
 await Promise.all(pages.map(p=>p.evaluate(()=>{window.bubbleTrial.fight=true})));
 await Promise.all(pages.map(p=>wait(p,()=>window.bubbleTrial.result)));
 const results=await Promise.all(pages.map(p=>p.evaluate(()=>window.bubbleTrial.result)));
 assert.ok(results.every(r=>r.won&&r.returns===0),JSON.stringify(results));
 const after=await Promise.all(pages.map(frame));
 assert.ok(after.every(f=>Object.values(f.events??{}).some(e=>e.kind==='hit'&&e.actor===1&&e.target===cfg.entity)));
 const rewards=after.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.deepEqual(rewards,[[212400,cfg.mora],[212400,cfg.mora]]);
 await Promise.all(players.map(async ({page})=>{
  await page.locator('#saveProgress').click();
  await wait(page,([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[key,cfg.id]);
 }));
 await Promise.all(players.map(p=>p.route.cross(p.entrance)));
 await Promise.all(players.map(p=>p.route.cross(cfg.arena)));
 assert.ok((await Promise.all(pages.map(frame))).every(f=>f.coop.enemies[0]?.hp===cfg.hp));
 await Promise.all(players.map(p=>p.context.close()));
 return {returnDamage:cfg.hp-returned.fieldBoss.hp,rewards,onlyGuestReturned:true,returnSeenByBoth:true,
  atmosphere:cfg.alternateEntrance?['outside',before[1].storyScenery]:undefined,saved:true,sharedRematch:true};
}

try{
 const result={participants:2};
 for(const cfg of cases)result[cfg.name]=await scenario(cfg);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({...result,errors},null,2)+'\n');
 console.log('Chrome: shared bubble trajectories, personal impact, separate routes and personal clear records.');
}catch(error){
 console.error(JSON.stringify(await Promise.allSettled(pages.map(p=>p.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f?.story?.node,t:f?.t,boss:f?.fieldBoss,swim:f?.storySwimCombat,trial:window.bubbleTrial,
   actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),events:Object.values(f?.events??{}).slice(-12)};
 }))),null,2),errors);
 throw error;
}finally{
 await browser.close();
}
