import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const hub='snezhnaya-hub',road='snezhnaya-field',cut='white-pass-cut',coach='white-pass-coach';
const station='white-pass-station',woods='white-pass-woods',ridge='white-pass-ridge',basin='white-rainbow-basin';
const ticket='white-pass-ticket',trail='white-pass-trail',summit='white-pass-summit';
const boss='original-frost-antler',output='work/earned-white-pass-summit';
const earned=process.argv.includes('--summit'),aurora=process.argv.includes('--aurora');
const prefix=earned||aurora?`${output}/summit`:'evidence/white-pass';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1180,height:960}});
const board=page.locator('#game');
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const nodeIs=id=>page.waitForFunction(id=>window.lab.frame.story.node===id,id);
const count=(id,n)=>page.waitForFunction(({id,n})=>window.lab.frame.story.quests[id]?.count===n,{id,n});
const row=id=>page.locator(`[data-quest="${id}"]`);

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1];
  if(Math.abs(x-a.x)<7)return;
  const east=x>a.x,key=east?'KeyD':'KeyA';
  await board.click();
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  } finally {await page.keyboard.up(key)}
}

async function portal(x,node,open=true){
  await walk(x);
  await page.waitForFunction(({node,open})=>{
    const p=window.lab.frame.storyNearbyPortal;
    return p?.to===node&&p.available===open;
  },{node,open});
  if(!open)return;
  await board.click();
  await page.keyboard.press('KeyF');
  await nodeIs(node);
}

async function jumpTo(x,y){
  await walk(x);
  await board.click();
  await page.keyboard.down('Space');
  try {
    await page.waitForFunction(y=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return a.ground&&a.y===y;
    },y);
  } finally {await page.keyboard.up('Space')}
}

async function survey(x,q,n,message){
  await walk(x);
  await page.waitForFunction(text=>window.lab.frame.storyNearbyMilestone?.label.includes(text),message);
  await board.click();
  await page.keyboard.press('KeyG');
  await count(q,n);
}

async function quest(id,text,status){
  await row(id).getByRole('button',{name:text,exact:true}).click();
  await page.waitForFunction(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function fast(label,id){
  await page.getByRole('button',{name:'拠点へ：'+label,exact:true}).click();
  await nodeIs(id);
}

async function backdrop(key){
  const result=await page.evaluate(async()=>{
    const scene=await import('./scenery.js');
    await scene.backgroundReady;
    return scene.sceneryStatus(window.lab.frame);
  });
  assert.equal(result.key,key);
  assert.equal(result.state,'ready');
}

async function runCombat(target){
  await board.click();
  await page.evaluate(({target,ticket})=>{
    const held=new Set(),moves=new Set(),start=window.lab.frame.t;
    window.whitePassResult=null;
    const hold=(code,pressed)=>{
      if(held.has(code)===pressed)return;
      if(pressed)held.add(code);else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    };
    function tick(){
      const f=window.lab.frame,actor=f.actors[f.active-1],boss=f.fieldBoss;
      const won=target==='boss'?boss?.phase==='respawn':f.story.quests[ticket]?.count>=2;
      if(won||f.returns>0||f.t-start>95){
        for(const key of held)hold(key,false);
        window.whitePassResult={won:!!won,hp:actor.hp,seconds:+(f.t-start).toFixed(2),
          returns:f.returns,moves:[...moves]};
        return;
      }
      const cart=f.draws.find(d=>d.source==='snow-rail-sprites-source-v1.png'&&d.h===48);
      const x=target==='boss'?boss?.x??790:cart?cart.x+f.camera:517;
      if(boss?.move)moves.add(boss.move);
      const delta=x-actor.x,turn=Math.abs(delta)>5&&delta*actor.dir<0;
      const lane=boss?.lane;
      if(lane&&!lane.active&&actor.ground&&actor.x>lane.left-12&&actor.x<lane.right+12&&
          boss.tick>=lane.at-15&&boss.tick<lane.at-9)window.lab.action('jump');
      hold('Space',!actor.ground);
      hold('KeyD',delta>65||turn&&delta>0);
      hold('KeyA',delta<-65||turn&&delta<0);
      hold('KeyJ',Math.abs(delta)<108&&!turn);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  },{target,ticket});
  await page.waitForFunction(()=>window.whitePassResult,undefined,{timeout:120000});
  const results=await page.evaluate(()=>window.whitePassResult);
  assert.ok(results.won&&!results.returns,JSON.stringify(results));
  return results;
}

async function loadSave(path){
  const fixture=await fs.readFile(path,'utf8');
  await page.evaluate(text=>localStorage.setItem('maple-lua-lab.checkpoint.v1',text),fixture);
  await page.click('#loadProgress');
  return fixture;
}

async function checkpoint(){
  await page.click('#saveProgress');
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await nodeIs(station);
  return JSON.parse(saved);
}

async function verifyAurora(){
  await loadSave(`${output}/complete.json`);
  await nodeIs(station);
  const initial=await frame();
  assert.equal(initial.progression.level,160);
  assert.equal(initial.story.quests[summit].status,'complete');
  assert.equal(initial.weaponView.traveler,'SW07');
  await walk(1050);
  await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone?.label==='白虹のスケッチを見返す');
  assert.ok((await frame()).draws.some(d=>d.color==='#745443'&&d.y===349&&d.w===50));
  await board.screenshot({path:`${prefix}-sketch.png`});
  await portal(861,'aurora-ice-cut');
  assert.ok((await frame()).total>0);
  await board.click();
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(()=>window.lab.frame.lightForm?.seconds>0);
  const lit=await frame();
  assert.ok(lit.gauge<initial.gauge);
  await board.screenshot({path:`${prefix}-aurora.png`});
  const proof={level:160,field:'aurora-ice-cut',lightRelease:true,weapon:'SW07',enemies:lit.total,sketchMounted:true,errors};
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${output}/aurora-browser.json`,JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}

async function earlyChapters(){
  await quest(ticket,'受注','active');
  await portal(1380,road);
  await portal(865,cut);
  await backdrop('whitePassSnow');
  await survey(282,ticket,1,'雪の深さ');
  await runCombat('cart');
  await jumpTo(685,382);
  await survey(685,ticket,3,'旧道');
  await fast('スネージナヤ・雪の町',hub);
  await quest(ticket,'報告','complete');
  await portal(800,coach);
  await backdrop('whitePassCoach');
  await board.screenshot({path:prefix+'-coach.png'});
  await nodeIs(station);
  await backdrop('whitePassStation');
  await quest(trail,'受注','active');
  await portal(1144,woods);
  await survey(300,trail,1,'林の目印');
  await jumpTo(1115,382);
  await survey(1115,trail,2,'岩棚');
  await survey(1660,trail,3,'案内');
  await fast('雪原の終着駅',station);
  await quest(trail,'報告','complete');
  console.log('Checked the train and reported the wooded pass');
}

async function verifySummit(){
  const seed=await loadSave(earned?`${output}/summit-ready.json`:'work/white-pass-fixture.json');
  const input=JSON.parse(seed);
  if(earned){
    await nodeIs(station);
    assert.equal((await frame()).progression.level,156);
    await walk(1050);
    assert.ok(!(await frame()).draws.some(d=>d.text==='白虹のスケッチ'));
  }else{
    await nodeIs(hub);
    await earlyChapters();
  }
  await quest(summit,'受注','active');
  await portal(1144,woods);
  await portal(1774,ridge);
  await portal(1774,basin);
  await backdrop('whiteRainbowBasin');
  await walk(650);
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.recovering);
  await board.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame(),sprite=png.draws.find(d=>d.source==='frost-antler-source-v1.png'&&d.h===136);
  assert.equal(png.fieldBoss.id,boss);
  assert.ok(sprite);
  assert.ok(png.fieldBoss.recovery.ticks>0);
  assert.equal(png.fieldBoss.recovery.factor,1.25);
  assert.ok(png.draws.some(d=>d.text?.startsWith('胸の継ぎ目・反撃')));
  await board.screenshot({path:prefix+'-boss-png.png'});
  const view=page.locator('#renderMode');
  await view.selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>5000);
  const rect=await frame();
  await view.selectOption('h32c16');
  await page.waitForFunction(commands=>window.lab.frame.commands<commands*.58,rect.commands);
  const light=await frame();
  assert.equal(rect.t,png.t);
  assert.equal(light.t,png.t);
  assert.deepEqual(light.fieldBoss.recovery,png.fieldBoss.recovery);
  await board.screenshot({path:prefix+'-boss-light.png'});
  await view.selectOption('sprite');
  await board.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>!window.lab.frame.paused);
  const before=(await frame()).progression.questXp;
  const battle=await runCombat('boss');
  assert.equal((await frame()).progression.questXp-before,61667202);
  await survey(1380,summit,2,'白虹');
  await board.screenshot({path:prefix+'-observation.png'});
  await fast('雪原の終着駅',station);
  const beforeReport=await frame();
  await quest(summit,'報告','complete');
  const reported=await frame();
  const reward=[reported.progression.questXp-beforeReport.progression.questXp,reported.mora-beforeReport.mora];
  const saved=await checkpoint();
  const resumed=await frame();
  assert.ok([ticket,trail,summit].every(q=>resumed.story.quests[q]?.status==='complete'));
  await walk(1050);
  await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone?.label==='白虹のスケッチを見返す');
  await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('青い氷柱'));
  await board.screenshot({path:prefix+'-sketch.png'});
  const prior=Object.entries(input.story.quests).filter(([,q])=>q.status==='complete');
  if(earned){
    for(const [id,q] of prior)assert.deepEqual(saved.story.quests[id],q,id);
    const items=new Set(saved.inventory.items.map(item=>item.id));
    for(const item of input.inventory.items)assert.ok(items.has(item.id),item.id);
    assert.equal(saved.weapons.equipped.traveler,'SW07');
    assert.equal(saved.companion,input.companion);
    assert.equal(saved.endgame.bosses[boss].clears,1);
    await fs.writeFile(`${output}/summit-complete.json`,JSON.stringify(saved)+'\n');
  }
  assert.deepEqual(errors,[]);
  const result={mainQuests:3,battle,commands:{png:png.commands,rect:rect.commands,light:light.commands},
    onceOnlyBossAward:61667202,train:!earned,restored:true,recovery:png.fieldBoss.recovery,sketchReadback:true,
    reward,level:saved.progression.level,priorQuests:prior.length,sourceSha256:createHash('sha256').update(seed).digest('hex'),errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(result,null,2)+'\n');
  console.log(result);
}

try {
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8856/');
  await page.waitForFunction(()=>window.lab?.frame);
  if(aurora)await verifyAurora();
  else await verifySummit();
} catch(e) {
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[f.active-1],boss:f?.fieldBoss,
      milestone:f?.storyNearbyMilestone,exit:f?.storyNearbyPortal,quests:f?.story.quests,result:window.whitePassResult};
  }),errors);
  throw e;
} finally {await browser.close()}
