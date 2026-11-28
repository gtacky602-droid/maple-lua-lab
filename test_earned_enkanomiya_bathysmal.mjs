import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const graph=await read('content/story-graph.json');
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const evidence=await read('evidence/earned-enkanomiya-bathysmal.json');
const work='work/earned-enkanomiya-bathysmal';
const port='inazuma-port', camp='enkanomiya-camp', arena='bathysmal-field-sanctum';
const boss='bathysmal-herd', quest='bathysmal-commission';
const errors=[];
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game');
const drive=waypointDriver(page,nodes);
const frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',error=>errors.push(error.message));

async function followMap(target,region,layer,expected){
 await canvas.click();
 await page.keyboard.press('KeyM');
 await page.locator('#worldAtlas').waitFor();
 await page.locator('#atlasRegion').selectOption(region);
 await page.waitForFunction(region=>window.lab.frame.worldMap?.region===region,region);
 await page.locator('#atlasLayer').selectOption(layer);
 await page.locator('#atlasField').selectOption(target);
 await page.waitForFunction(target=>window.lab.frame.worldMap?.selected?.id===target,target);
 const guide=(await frame()).worldMap.guide;
 assert.equal(guide.status,'ready');
 assert.deepEqual(guide.stops.map(stop=>[stop.id,stop.mode]),expected);
 for(const step of guide.stops){
  if(step.mode==='boat')assert.match(step.hint,/移動に4\.2秒/);
  if(step.mode==='water')assert.match(step.hint,/移動に3\.8秒/);
 }
 await page.locator('#atlasClose').click();
 await page.locator('#worldAtlas').waitFor({state:'hidden'});
 for(const stop of guide.stops)await drive.cross(stop.id,stop.gateX);
}

async function pause(on){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(on=>window.lab.frame.paused===on,on);
}

async function play(){
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),recoveries=new Set(),airborne=new Set(),bolts=new Set();
  let previous,lastTick,lastTime,pivot,marks;
  const start=window.lab.frame.t;
  const hold=(code,on)=>{
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  function step(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||a.hp<=0||f.t-start>100){
    for(const code of held)hold(code,false);
    window.pairResult={finished:b?.phase==='respawn',moves:[...moves],recoveries:[...recoveries],
     airborne:[...airborne],bolts:[...bolts],marks,returns:f.returns,hp:a.hp,seconds:+(f.t-start).toFixed(2)};
    return;
   }
   if(!f.paused&&f.t!==lastTime){
    lastTime=f.t;
    if(previous!==b.move||b.tick<lastTick)pivot=undefined;
    previous=b.move;lastTick=b.tick;
    if(b.move)moves.add(b.move);
    if(b.recovering)recoveries.add(b.move);
    const [ice,thunder]=b.bodies;
    if(ice.y<440&&thunder.y===480)airborne.add(1);
    if(thunder.y<440&&ice.y===480)airborne.add(2);
    if(b.relayLandings?.length===2)marks=[...b.relayLandings];
    if(b.move==='FBH02'){
     if(f.draws.some(d=>d.color==='#eaffff'&&d.w===6&&d.h===6))bolts.add(1);
     if(f.draws.some(d=>d.color==='#f2dbff'&&d.w===4&&d.h===6))bolts.add(2);
    }
    let direction=0,attack=false;
    if(b.move==='FBH01'&&b.tick>=42&&!b.recovering&&pivot===undefined){
     const warning=f.draws.find(d=>d.kind==='rect'&&Math.abs(d.w-228.8)<.001&&d.y===473);
     if(warning)pivot=warning.x+f.camera+warning.w/2-156;
    }
    if(b.move==='FBH02'&&b.tick>=48&&!b.recovering&&pivot===undefined)
     pivot=a.x+Math.sign(ice.x-thunder.x)*264;
    if(b.move==='FBH03'&&marks&&b.relayLandings?.length===2&&pivot===undefined)
     pivot=marks[0]-106;
    if(!b.move||b.recovering){
     const nearest=Math.abs(a.x-ice.x)<=Math.abs(a.x-thunder.x)?ice:thunder;
     const dx=nearest.x-a.x;
     direction=Math.abs(dx)>90||a.dir*dx<0?Math.sign(dx):0;
     attack=recoveries.has('FBH03')&&Math.abs(dx)<122&&a.dir*dx>=0;
    }else if(pivot!==undefined&&Math.abs(pivot-a.x)>11){
     direction=Math.sign(pivot-a.x);
    }
    hold('KeyA',direction<0);hold('KeyD',direction>0);hold('KeyJ',attack);
   }
   requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
 });
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/earned-inazuma-island-bosses/wolflord-complete.json');
 await drive.waitNode(port);
 assert.equal((await frame()).progression.level,54);
 await followMap('ina-wp-15942','region-03','all',[['watatsumi-landing','boat'],['ina-wp-15942','walk']]);
 await followMap(camp,'branch-03','all',[[camp,'water']]);
 await drive.accept(quest);
 await followMap(arena,'branch-03','boss',[['enkanomiya-depth','walk'],[arena,'walk']]);
 await drive.walk(684);
 const start=await frame();
 assert.equal(start.fieldBoss.maxhp,1120);
 assert.equal(start.fieldBoss.bodies.length,2);
 assert.equal(await page.locator('#fieldBoss progress:visible').count(),1);
 await play();
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FBH03'&&b.tick>=87&&b.tick<104&&b.relayLandings?.length===2&&b.bodies[0].y<440;
 },undefined,{timeout:60000});
 await pause(true);
 const png=await frame();
 assert.equal(png.fieldBoss.relayLandings.length,2);
 assert.ok(png.fieldBoss.bodies[0].y<440);
 assert.equal(png.fieldBoss.bodies[1].y,480);
 assert.ok(png.draws.some(d=>d.source==='bathysmal-field-poses-source-v1.png'));
 await canvas.screenshot({path:work+'/relay-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.kind==='boss_sprite'));
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.75,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[png.t,png.t,png.fieldBoss.tick]);
 assert.deepEqual(light.fieldBoss.relayLandings,png.fieldBoss.relayLandings);
 await canvas.screenshot({path:work+'/relay-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.kind==='boss_sprite'));
 await pause(false);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.move==='FBH03'&&window.lab.frame.fieldBoss.recovering);
 await pause(true);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/反撃の隙・二体が伏せる/);
 const recovery=await frame();
 assert.equal(recovery.draws.filter(d=>d.kind==='boss_sprite'&&d.h===94&&d.y===480).length,2);
 await canvas.screenshot({path:work+'/recovery-png.png'});
 await pause(false);
 await page.waitForFunction(()=>window.pairResult!==undefined,undefined,{timeout:80000});
 const playResult=await page.evaluate(()=>window.pairResult);
 assert.equal(playResult.finished,true,JSON.stringify(playResult));
 assert.equal(playResult.returns,0);
 assert.deepEqual(playResult.moves,evidence.combat.moveOrder);
 assert.deepEqual(playResult.recoveries,evidence.combat.moveOrder);
 assert.deepEqual(playResult.bolts,[1,2]);
 assert.deepEqual(playResult.airborne,[1,2]);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-start.progression.killXp,defeated.mora-start.mora],
  [evidence.combat.xp,evidence.combat.mora]);
 await drive.count(quest,1);
 await drive.cross('enkanomiya-depth');
 await drive.cross(camp);
 const before=await frame();
 await drive.report(quest);
 const reported=await frame();
 assert.deepEqual([reported.progression.questXp-before.progression.questXp,reported.mora-before.mora],
  [evidence.report.xp,evidence.report.mora]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.ok(saved.fieldBosses[boss].waitTicks>0);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開'));
 const restored=await frame();
 assert.equal(restored.story.node,camp);
 assert.equal(restored.story.quests[quest].cycles,1);
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.equal(restored.endgame.bosses[boss].clears,1);
 await followMap('ina-wp-15942','region-03','all',[['ina-wp-15942','water']]);
 await drive.cross('watatsumi-landing');
 await drive.cross(port);
 assert.deepEqual(errors,[]);
 const result={browser:'Chrome',level:54,journeys:drive.journeys,play:playResult,restored:true,
  cooldown:saved.fieldBosses[boss].waitTicks,finishedAt:port,
  sameFrameCommands:{png:png.commands,standard:standard.commands,light:light.commands}};
 await fs.writeFile('evidence/earned-enkanomiya-bathysmal-browser.json',JSON.stringify(result,null,2)+'\n');
 console.log(result);
}finally{
 await browser.close();
}
