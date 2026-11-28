import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const graph=await read('content/story-graph.json');
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const islands=process.argv.includes('--islands');
const runName=islands?'earned-inazuma-island-bosses':'earned-inazuma-thunder-pyro';
const {trials}=await read('evidence/'+runName+'.json');
const roster=(await read('content/field-boss-spawns.json')).fieldBosses;
const work='work/'+runName;
const specs=islands?[
 {key:'hydro',id:'boss-20040401',quest:'hydro-hypostasis-commission',hub:'inazuma-port',
  path:['watatsumi-landing','hydro-hypostasis-field-cove'],source:'hydro-hypostasis-field-poses-source-v1.png',boatSeconds:4.2},
 {key:'wolflord',id:'boss-22060101',quest:'wolflord-commission',hub:'inazuma-port',
  path:['tsurumi-coast','wolflord-field-ruins'],source:'wolflord-field-poses-source-v1.png',boatSeconds:4.8},
]:[
 {key:'thunder',id:'boss-20070101',quest:'thunder-commission',hub:'inazuma-port',
  path:['inazuma-road','thunder-approach','thunder-field-crest'],source:'thunder-field-poses-source-v1.png'},
 {key:'pyro',id:'boss-20040601',quest:'pyro-hypostasis-commission',hub:'inazuma-town',
  path:['pyro-hypostasis-field-terrace'],source:'pyro-hypostasis-field-poses-source-v1.png'},
];

async function fight(page,moves,spriteSource){
 await page.evaluate(({moves,spriteSource})=>{
  const held=new Set(),seen=new Set(),recoveries=new Set(),skulls=new Set();
  let lastFrame,pivot,previousMove,lastTick,airborne=false,threeRainMarkers=false;
  const began=window.lab.frame.t;
  const hold=(code,on)=>{
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  function play(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||a.hp<=0||f.t-began>110){
    for(const code of held)hold(code,false);
    window.earnedFight={cleared:b?.phase==='respawn',seen:[...seen],recoveries:[...recoveries],airborne,
     threeRainMarkers,skulls:[...skulls],
     returns:f.returns,hp:a.hp,seconds:+(f.t-began).toFixed(2)};
    return;
   }
   if(!f.paused&&lastFrame!==f.t){
    lastFrame=f.t;
    const move=moves.find(candidate=>candidate.id===b.move);
    if(previousMove!==b.move||b.tick<lastTick)pivot=undefined;
    previousMove=b.move;lastTick=b.tick;
    if(move)seen.add(move.id);
    if(b.recovering){
     recoveries.add(b.move);
     if(document.querySelector('#fieldBossLabel').textContent.includes('反撃の隙'))
      window.lastRecoveryLabel=document.querySelector('#fieldBossLabel').textContent;
    }
    if(b.flying)airborne=true;
    if(b.fallPoints?.length===3)threeRainMarkers=true;
    for(const skull of Object.values(b.skulls??{}))skulls.add(skull.index);
    let direction=0,attack=false;
    if(move&&b.tick>=move.lock&&!b.recovering){
     if(pivot===undefined){
      const side=a.x<b.x?-1:1;
      if(move.kind==='tail'){
       const sprite=f.draws.find(draw=>draw.source===spriteSource);
       pivot=b.x+(sprite?.flip?72:-72);
      }else{
       pivot=b.x+(move.kind==='wing'?side*158:-side*72);
      }
     }
     if(Math.abs(pivot-a.x)>17)direction=Math.sign(pivot-a.x);
    }else if(seen.size===moves.length){
     const dx=b.x-a.x,face=a.dir*dx>=0;
     direction=Math.abs(dx)>96||!face?Math.sign(dx):0;
     attack=face&&Math.abs(dx)<122;
    }
    hold('KeyA',direction<0);hold('KeyD',direction>0);hold('KeyJ',attack);
   }
   requestAnimationFrame(play);
  }
  requestAnimationFrame(play);
 },{moves,spriteSource});
 await page.waitForFunction(()=>window.earnedFight,undefined,{timeout:120000});
 return page.evaluate(()=>({...window.earnedFight,recoveryLabel:window.lastRecoveryLabel}));
}

async function verify(browser,spec){
 const page=await browser.newPage({viewport:{width:1280,height:960}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const drive=waypointDriver(page,nodes),frame=()=>page.evaluate(()=>window.lab.frame);
 const arena=spec.path.at(-1),boss=roster.find(row=>row.id===spec.id),trial=trials[spec.key];
 async function pause(state){
  await page.locator('#game').click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(paused=>window.lab.frame.paused===paused,state);
 }
 try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles(work+'/'+spec.key+'-ready.json');
  await drive.waitNode(spec.hub);
  assert.equal((await frame()).progression.level,boss.level);
  assert.equal((await frame()).story.quests[spec.quest].status,'active');

  await page.keyboard.press('KeyM');
  await page.locator('#worldAtlas').waitFor();
  await page.locator('#atlasRegion').selectOption('region-03');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-03');
  await page.locator('#atlasLayer').selectOption('boss');
  await page.locator('#atlasField').selectOption(arena);
  await page.waitForFunction(arena=>window.lab.frame.worldMap?.selected?.id===arena,arena);
  const guide=(await frame()).worldMap.guide;
  assert.equal(guide.status,'ready');
  assert.deepEqual(guide.stops.map(stop=>stop.id),spec.path);
  if(spec.boatSeconds){
   assert.equal(guide.stops[0].mode,'boat');
   assert.ok(guide.stops[0].hint.includes('移動に'+spec.boatSeconds+'秒'));
  }
  await page.keyboard.press('Escape');
  await page.locator('#worldAtlas').waitFor({state:'hidden'});
  for(const stop of guide.stops)await drive.cross(stop.id,stop.gateX);

  await drive.walk(boss.home-104);
  await page.waitForFunction(move=>{
   const b=window.lab.frame.fieldBoss;
   return b?.move===move&&b.tick>=62&&b.tick<90;
  },boss.moves[0].id);
  await pause(true);
  const before=await frame();
  assert.ok(before.draws.some(draw=>draw.source===spec.source));
  await page.locator('#game').screenshot({path:work+'/'+spec.key+'-warning-png.png'});
  await page.locator('#renderMode').selectOption('rect');
  await page.waitForFunction(source=>!window.lab.frame.draws.some(draw=>draw.source===source),spec.source);
  const standard=await frame();
  await page.locator('#renderMode').selectOption('h32c16');
  await page.waitForFunction(count=>window.lab.frame.commands<count*.7,standard.commands);
  const light=await frame();
  assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[before.t,before.t,before.fieldBoss.tick]);
  await page.locator('#game').screenshot({path:work+'/'+spec.key+'-warning-light.png'});
  await page.locator('#renderMode').selectOption('sprite');
  await pause(false);
  const result=await fight(page,boss.moves,spec.source);
  assert.ok(result.cleared,JSON.stringify(result));
  assert.equal(result.returns,0);
  assert.equal(result.airborne,true);
  assert.deepEqual(result.seen,trial.allMoves);
  assert.deepEqual(result.recoveries,trial.recoveryLabels);
  assert.match(result.recoveryLabel,/反撃の隙/);
  if(spec.key==='hydro')assert.equal(result.threeRainMarkers,true);
  if(spec.key==='wolflord')assert.deepEqual(result.skulls,[1,2]);
  const defeated=await frame();
  assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[trial.xp,trial.mora]);
  await drive.count(spec.quest,1);
  for(const back of [spec.hub,...spec.path.slice(0,-1)].reverse())await drive.cross(back);
  const beforeReport=await frame();
  await drive.report(spec.quest);
  const reported=await frame();
  assert.deepEqual([reported.progression.questXp-beforeReport.progression.questXp,reported.mora-beforeReport.mora],
   [trial.report.xp,trial.report.mora]);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
  assert.ok(saved.fieldBosses[spec.id].waitTicks>0);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開'));
  const restored=await frame();
  assert.equal(restored.story.node,spec.hub);
  assert.equal(restored.story.quests[spec.quest].cycles,1);
  assert.equal(restored.story.quests[spec.quest].status,'complete');
  assert.equal(restored.endgame.bosses[spec.id].clears,1);
  assert.deepEqual(errors,[]);
  return {level:boss.level,journeys:drive.journeys,play:result,restored:true,storedCooldown:saved.fieldBosses[spec.id].waitTicks,
   sameFrameCommands:{png:before.commands,standard:standard.commands,light:light.commands}};
 }finally{
  await page.close();
 }
}

const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const results=await Promise.all(specs.map(async spec=>[spec.key,await verify(browser,spec)]));
 await fs.writeFile('evidence/'+runName+'-browser.json',
  JSON.stringify({browser:'Chrome',trials:Object.fromEntries(results)},null,2)+'\n');
 console.log(results);
}finally{
 await browser.close();
}
