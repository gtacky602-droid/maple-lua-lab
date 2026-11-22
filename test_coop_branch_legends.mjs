import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const cases=[
 {tag:'chizhang',id:'legend-liyue_rulers_of_chizhang_mountains',arena:'chizhang-legend-terrace',
  entry:'liyue-wp-64830',checkpoint:'chenyu-camp',hp:1060,mora:280,x:700,warning:'LC03',entities:[97021,97022]},
 {tag:'cineas',id:'legend-fontaine_cineas',arena:'cineas-legend-chamber',
  entry:'bygone-wp-68610',checkpoint:'bygone-camp',hp:1320,mora:440,x:925,warning:'LW03',entities:[97031]},
];
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(row=>[row.id,row]));
const key='maple-lua-lab.checkpoint.v1';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
let pages=[];
const errors=[];
const frame=p=>p.evaluate(()=>window.lab.frame);
const wait=(p,fn,arg,timeout=70000)=>p.waitForFunction(fn,arg,{timeout});
const capture=(p,t)=>p.locator('.game').screenshot({path:'evidence/coop-branch-legends-'+t+'.png'});

async function start(cfg){
 const context=await browser.newContext({viewport:{width:1200,height:940}});
 const page=await context.newPage();
 pages.push(page);
 page.setDefaultTimeout(45000);
 page.on('pageerror',e=>errors.push(e.message));
 const route=waypointDriver(page,nodes,{walkTimeout:32000});
 const fixture=await fs.readFile('work/coop-'+cfg.arena+'-fixture.json','utf8');
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9060/');
 await wait(page,()=>window.lab?.frame);
 await page.evaluate(([key,fixture])=>localStorage.setItem(key,fixture),[key,fixture]);
 await page.locator('#loadProgress').click();
 await route.waitNode(cfg.checkpoint);
 await route.warp(cfg.entry);
 await page.locator('#coopPanel summary').click();
 return {context,page,route};
}

async function drive(page,cfg,side){
 await page.evaluate(({cfg,side})=>{
  document.activeElement.blur();
  const keys=new Set(),moves=new Set();
  const start=window.lab.frame.t;
  let jumpAt=-1;
  window.branchLegendFight=false;
  window.branchLegendResult=null;
  function key(code,on){
   if(keys.has(code)===on)return;
   on?keys.add(code):keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function step(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(f.story.node!==cfg.arena||b?.phase==='cleared'||f.returns||f.t-start>125){
    for(const code of [...keys])key(code,false);
    window.branchLegendResult={won:b?.phase==='cleared',returns:f.returns,hp:a.hp,moves:[...moves]};
    return;
   }
   if(b?.move)moves.add(b.move);
   const body=b?.bodies?.[side<0?0:1];
   const target=body?.x??b?.x??cfg.x;
   let goal=target+(b?side*70:-180),jump=!a.ground,evading=false;
   for(const w of (Array.isArray(b?.warnings)?b.warnings:[])){
    const delta=w.first-b.tick;
    if(a.x<w.left-12||a.x>w.right+12)continue;
    if(delta<=14&&b.tick<w.after){
     if(w.height<95&&a.ground&&f.t-jumpAt>.62){
      window.lab.action('jump');jumpAt=f.t;jump=true;
     }else if(w.height>=95){
      goal=a.x<(w.left+w.right)/2?w.left-27:w.right+27;
      evading=true;
     }
    }
   }
   const dx=target-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const delta=goal-a.x;
   const walk=Math.abs(delta)>8?Math.sign(delta):turn?Math.sign(dx):0;
   key('KeyA',walk<0);key('KeyD',walk>0);key('Space',jump);
   key('KeyJ',window.branchLegendFight&&!evading&&!turn&&Math.abs(dx)<112);
   requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
 },{cfg,side});
}

async function scenario(cfg){
 pages=[];
 const players=await Promise.all([start(cfg),start(cfg)]);
 const [a,b]=players.map(p=>p.page);
 await a.locator('#coopCreate').click();
 await wait(a,()=>window.lab.frame.coop?.code);
 const code=(await frame(a)).coop.code;
 await b.locator('#coopCode').fill(code);
 await b.locator('#coopJoin').click();
 await wait(b,c=>window.lab.frame.coop?.code===c,code);
 await Promise.all(players.map(p=>p.route.cross(cfg.arena)));
 await Promise.all(players.map(({page})=>wait(page,n=>{
  const f=window.lab.frame;
  return f.story.node===n&&f.coop?.peers[0]?.actors.length>=1;
 },cfg.arena)));
 const before=await Promise.all(players.map(p=>frame(p.page)));
 await Promise.all([drive(a,cfg,-1),drive(b,cfg,1)]);
 const warnings=await Promise.all(players.map(async ({page})=>{
  const token=await wait(page,move=>{
   const b=window.lab.frame.fieldBoss;
   return b?.move===move&&b.warnings?.length===2&&b.warnings.map(w=>[w.number,w.element,w.first,w.left,w.right]);
  },cfg.warning);
  return token.jsonValue();
 }));
 assert.deepEqual(warnings[0],warnings[1]);
 assert.deepEqual(warnings[0].map(x=>x.slice(0,3)),cfg.tag==='chizhang'
  ?[[1,'pyro',63],[2,'cryo',111]]:[[1,'hydro',63],[2,'hydro',116]]);
 await capture(a,cfg.tag+'-warning');
 await Promise.all(players.map(p=>p.page.evaluate(()=>{window.branchLegendFight=true})));
 await Promise.all(players.map(({page})=>wait(page,()=>window.branchLegendResult,null,155000)));
 const results=await Promise.all(players.map(p=>p.page.evaluate(()=>window.branchLegendResult)));
 assert.ok(results.every(r=>r.won&&r.returns===0),JSON.stringify(results));
 const after=await Promise.all(players.map(p=>frame(p.page)));
 const rewards=after.map((f,i)=>[f.progression.killXp-before[i].progression.killXp,f.mora-before[i].mora]);
 assert.ok(rewards[0][0]>0&&rewards.every(r=>r[0]===rewards[0][0]&&r[1]===cfg.mora));
 const contacts=after.map(f=>f.events.filter(e=>e.kind==='hit'&&e.actor===1&&cfg.entities.includes(e.target)).length);
 assert.ok(contacts.every(count=>count>0));
 await Promise.all(players.map(async ({page})=>{
  await page.locator('#saveProgress').click();
  await wait(page,([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[key,cfg.id]);
 }));
 await Promise.all(players.map(p=>p.route.cross(cfg.entry)));
 await Promise.all(players.map(p=>p.route.cross(cfg.arena)));
 const restart=await Promise.all(players.map(p=>frame(p.page)));
 assert.ok(restart.every(f=>f.coop.enemies[0]?.hp===cfg.hp));
 await Promise.all(players.map(p=>p.context.close()));
 return {results,warnings: warnings[0],rewards,contacts,saved:true,sharedRematch:true};
}

try{
 const evidence={participants:2};
 for(const cfg of cases)evidence[cfg.tag]=await scenario(cfg);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/coop-branch-legends-browser.json',JSON.stringify({...evidence,errors},null,2)+'\n');
 console.log('Chrome: both Local Legends share warnings, combat, personal rewards, and a fresh rematch.');
}catch(error){
 const status=await Promise.allSettled(pages.map(p=>p.evaluate(()=>{
  const f=window.lab.frame;
  return {node:f?.story?.node,t:f?.t,boss:f?.fieldBoss,coop:f?.coop?.map,
   actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),result:window.branchLegendResult,
   status:document.querySelector('#status')?.textContent};
 })));
 console.error(JSON.stringify({status,errors},null,2));
 throw error;
}finally{
 await browser.close();
}
