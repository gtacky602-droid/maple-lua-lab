import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureNumberedFieldWarning} from './tools/browser_waypoint_test.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const url=process.env.LAB_URL||'http://127.0.0.1:8769/';
const earned=process.argv.includes('--earned');
const captures=earned?'work/earned-fontaine-icewind':'evidence';
const fixture=await fs.readFile(earned?captures+'/icewind-ready.json':'work/icewind-field-fixture.json','utf8');
const {fieldBosses}=JSON.parse(await fs.readFile('content/field-boss-spawns.json','utf8'));
const hub='fontaine-hub', entrance='icewind-promenade';
const encounters=[['icewind-coppelia',420],['icewind-coppelius',1060]];

async function play([id,door],checkpoint,prior){
 const page=await browser.newPage({viewport:{width:1200,height:910}});
 const canvas=page.locator('#game'), quest=id+'-commission', arena=id+'-field';
 const otherQuest=encounters.find(([key])=>key!==id)[0]+'-commission';
 const spec=fieldBosses.find(row=>row.id===id);
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.setDefaultTimeout(60000);
 const frame=()=>page.evaluate(()=>window.lab.frame);

 async function walk(x){
  const f=await frame(), east=f.actors[f.active-1].x<x;
  const key=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(key);
  try{
   await page.waitForFunction(({x,east})=>{
    const f=window.lab.frame,a=f.actors[f.active-1];
    return east?a.x>=x-7:a.x<=x+7;
   },{x,east});
  }finally{await page.keyboard.up(key)}
 }

 async function gate(x,node){
  for(let attempt=0;attempt<6;attempt++){
   const nearby=(await frame()).storyNearbyPortal;
   if(nearby?.to===node&&nearby.available)break;
   await walk(x);
  }
  const portal=(await frame()).storyNearbyPortal;
  assert.ok(portal?.to===node&&portal.available,'Expected gate to '+node+' near '+x);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
 }

 async function setPause(value){
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(value=>window.lab.frame.paused===value,value);
 }

 try{
  await page.goto(url);
  await page.waitForFunction(()=>window.lab?.frame);
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),checkpoint);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(({hub,quest})=>window.lab.frame.story.node===hub&&
   window.lab.frame.story.quests[quest]?.status==='active',{hub,quest});
  await gate(580,entrance);
  await gate(door,arena);
  console.log(id,'entered');
  const scenery=await page.evaluate(async()=>{
   const {sceneryStatus,loadScenery}=await import('./scenery.js');
   await loadScenery(window.lab.frame);
   return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scenery,{key:'icewindField',file:'icewind-field-background-v1.png',state:'ready'});
  await walk(665);
  await page.waitForFunction(first=>{
   const b=window.lab.frame.fieldBoss;
   return b?.move===first&&b.tick>=54&&b.tick<87;
  },spec.moves[0].id);
  await setPause(true);
  const png=await frame();
  const field=page.locator('#fieldBossLabel');
  const hasPose=d=>d.kind==='boss_sprite'&&d.source.startsWith('copp')&&d.source.includes('field-poses');
  assert.equal(png.fieldBoss.maxhp,1030);
  assert.equal(png.fieldBoss.bodies[0].element,spec.lead);
  assert.equal(png.draws.filter(hasPose).length,2);
  await page.evaluate(async filenames=>{
   await Promise.all(filenames.map(file=>{
    const img=new Image();
    img.src='./assets/'+file;
    return img.decode();
   }));
  },png.draws.filter(hasPose).map(d=>d.source));
  assert.match(await field.textContent(),spec.lead==='anemo'?/風① \/ ❄ 氷②/:/❄ 氷① \/ 風②/);
  const markers=f=>f.draws.filter(d=>d.kind==='text'&&d.color==='#fff1b0').map(({x,y,text})=>[x,y,text]);
  const order=markers(png);
  assert.deepEqual(order.map(mark=>mark[2]),spec.lead==='cryo'?['1','2']:['1']);
  assert.equal(new Set(order.map(mark=>mark[0])).size,order.length);
  await canvas.screenshot({path:captures+'/'+arena+'-png.png'});
  await page.locator('#renderMode').selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>1000);
  const standard=await frame();
  await page.locator('#renderMode').selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.6,standard.commands);
  const light=await frame();
  assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[png.t,png.t,png.fieldBoss.tick]);
  assert.deepEqual(markers(standard),order);
  assert.deepEqual(markers(light),order);
  await canvas.screenshot({path:captures+'/'+arena+'-light.png'});
  await page.locator('#renderMode').selectOption('sprite');
  await setPause(false);

  await page.evaluate(({spec,earned})=>{
   const held=new Set(), moves=new Set();
   const recovery={};
   const start=window.lab.frame.t;
   let lastMove, origin, dir;
   function hold(code,on){
    if(on===held.has(code))return;
    if(on)held.add(code);else held.delete(code);
    window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
   }
   function step(){
    const f=window.lab.frame, b=f.fieldBoss, a=f.actors[f.active-1];
    if(!b||b.phase==='respawn'||f.returns>0||f.t-start>135){
     for(const code of [...held])hold(code,false);
     window.icewindResult={win:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),
      moves:[...moves],recovery,hp:a.hp,returns:f.returns};
     return;
    }
    if(f.paused){requestAnimationFrame(step);return}
    const m=spec.moves.find(move=>move.id===b.move);
    if(b.move!==lastMove){origin=b.x;lastMove=b.move}
    if(m&&b.tick<=m.lock)dir=a.x<origin?-1:1;
    const closest=b.bodies.reduce((aBody, body)=>Math.abs(a.x-aBody.x)<Math.abs(a.x-body.x)?aBody:body);
    const target=b.form==='guarded'?b.bodies[1]:closest;
    const dx=target.x-a.x, turn=Math.abs(dx)>8&&dx*a.dir<0;
    let move=dx, jump=false, evade=false;
    if(m){
     moves.add(m.id);
     if(b.recovering&&!(m.id in recovery))recovery[m.id]=b.exposureTicks;
     let arrivals=m.active.map(w=>w[0]);
     if(m.kind==='ice'){
      const gap=(a.x-origin)*dir;
      arrivals=gap>30?m.fire.map(t=>t+Math.round(Math.max(0,gap-44)/(m.speed*88/60))):[];
     }
     if(m.kind==='guard'&&arrivals.some(t=>t-40<=b.tick&&b.tick<t+12)){
      move=Math.abs(a.x-origin)<180?(a.x>=origin?170:-170):0;
      evade=true;
     }else if(m.kind==='wind'){
      const center=Math.max(spec.arenaMin+2.4*88,Math.min(spec.arenaMax-2.4*88,origin));
      const i=m.active.findIndex(([from,to])=>from-23<=b.tick&&b.tick<to);
      if(i>=0){
       const x=center+(i-1)*m.spacing*88;
       if(Math.abs(a.x-x)<52){move=a.x>=x?160:-160;evade=true}
      }
      arrivals=[];
     }
     jump=arrivals.some(t=>t-25<=b.tick&&b.tick<t-16);
    }
    hold('Space',jump);
    hold('KeyA',move<-85||(turn&&move<0));
    hold('KeyD',move>85||(turn&&move>0));
    const witnessedFinale=spec.moves[2].id in recovery;
    hold('KeyJ',(!earned||witnessedFinale)&&Math.abs(dx)<120&&!turn&&!evade);
    requestAnimationFrame(step);
   }
   requestAnimationFrame(step);
  },{spec,earned});

  const finale=spec.moves[2];
  const finaleComparison=await captureNumberedFieldWarning(page,{
   move:finale.id,before:finale.active[0][0],count:finale.active.length,
   color:'#fff1b0',output:captures+'/'+arena+'-finale'
  });
  console.log(id,'finale warning compared');
  await page.waitForFunction(()=>window.icewindResult,undefined,{timeout:300000});
  const play=await page.evaluate(()=>window.icewindResult);
  assert.ok(play.win,JSON.stringify(play));
  console.log(id,'defeated');
  assert.deepEqual(play.moves,spec.moves.map(m=>m.id));
  if(earned)assert.ok(play.recovery[finale.id]>=138&&play.recovery[finale.id]<=144);
  const defeated=await frame();
  assert.equal(defeated.mora-png.mora,325);
  assert.equal(defeated.story.quests[quest].count,1);
  assert.equal(defeated.story.quests[otherQuest].count,prior?1:0);
  await gate(65,entrance);
  await gate(65,hub);
  const before=await frame();
  await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'報告',exact:true}).click();
  await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
  console.log(id,'reported');
  const reported=await frame();
  assert.deepEqual([reported.progression.questXp-before.progression.questXp,reported.mora-before.mora],[6000,400]);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
  assert.equal(save.fieldBosses[id].hp,0);
  assert.ok(save.fieldBosses[id].waitTicks>0);
  if(earned){
   await page.reload();
   await page.waitForFunction(()=>window.lab?.frame);
   await page.locator('#loadProgress').click();
   await page.waitForFunction(({hub,quest,prior})=>{
    const f=window.lab.frame;
    return f.story.node===hub&&f.story.quests[quest]?.status==='complete'&&
     (!prior||f.story.quests[prior]?.status==='complete');
   },{hub,quest,prior});
   assert.equal(save.endgame.bosses[id].clears,1);
   if(prior)assert.equal(save.endgame.bosses[encounters[0][0]].clears,1);
  }
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  return {checkpoint:JSON.stringify(save),proof:{play,scenery,orderedElements:png.fieldBoss.bodies.map(b=>b.element),
   order,finaleComparison,
   sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
   savedRespawn:true,variantQuestIsolation:true,questReport:{xp:6000,mora:400},viewport390:true}};
 }catch(error){
  console.error(id,await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
   player:window.lab?.frame.actors[0],play:window.icewindResult})),errors);
  throw error;
 }finally{await page.close()}
}

try{
 const variants={};
 let checkpoint=fixture,prior;
 for(const encounter of encounters){
  const id=encounter[0];
  const result=await play(encounter,checkpoint,prior);
  variants[id]=result.proof;
  if(earned){
   checkpoint=result.checkpoint;
   prior=id+'-commission';
  }
 }
 const report=earned?'earned-fontaine-icewind-browser':'icewind-field-browser';
 await fs.writeFile('evidence/'+report+'.json',
  JSON.stringify({browser:'Chrome',earned,variants},null,2)+'\n');
 console.log('Both Icewind modes, render profiles, quest isolation, reports and saves passed.');
}finally{await browser.close()}
