import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const hub='liyue-harbor', walk='cloth-service-walk', relay='threadline-relay', arena='buried-weaving-room';
const survey='threadline-survey', restore='threadline-restore';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:940}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const row=id=>page.locator(`[data-quest="${id}"]`);
const expectTracking=pattern=>page.waitForFunction(source=>
  new RegExp(source).test(document.querySelector('#trackedQuestText').textContent),pattern.source);

async function walkTo(x) {
  const f=await frame();
  const actor=f.actors[f.active-1];
  if(Math.abs(x-actor.x)<=6)return;
  const east=actor.x<x;
  const key=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  } finally {
    await page.keyboard.up(key);
  }
}

async function gate(x,node,available=true) {
  await walkTo(x);
  await page.waitForFunction(({node,available})=>{
    const portal=window.lab.frame.storyNearbyPortal;
    return portal?.to===node&&portal.available===available;
  },{node,available});
  if(!available)return;
  await canvas.click();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}

async function inspect(x,quest,count,label) {
  await walkTo(x);
  await page.waitForFunction(label=>window.lab.frame.storyNearbyMilestone?.label.includes(label),label);
  assert.ok((await page.locator('#nearbyCargoGo').textContent()).includes(label));
  await canvas.click();
  await page.keyboard.press('KeyG');
  await page.waitForFunction(({quest,count})=>window.lab.frame.story.quests[quest]?.count===count,{quest,count});
}

async function accept(id) {
  await row(id).getByRole('button',{name:'受注',exact:true}).click();
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='active',id);
  await row(id).getByRole('button',{name:'この依頼を追跡',exact:true}).click();
}

async function report(id,reward) {
  const before=await frame();
  await row(id).getByRole('button',{name:'報告',exact:true}).click();
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
  const after=await frame();
  assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],reward);
}

async function save() {
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
}

async function reloadSave() {
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await page.waitForFunction(node=>window.lab.frame.story.node===node,hub);
}

async function checkBackground(key,file) {
  const loaded=await page.evaluate(async()=>{
    const scenery=await import('./scenery.js');
    await scenery.backgroundReady;
    return scenery.sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(loaded,{key,file,state:'ready'});
}

async function defeatLoom() {
  await page.evaluate(()=>{
    const held=new Set(),start=window.lab.frame.t;
    const hold=(code,pressed)=>{
      if(pressed===held.has(code))return;
      if(pressed)held.add(code);else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    };
    function fight(){
      const f=window.lab.frame,boss=f.weeklyBoss,actor=f.actors[f.active-1];
      if(boss.phase==='respawn'||f.returns>0||f.t-start>90){
        for(const code of held)hold(code,false);
        window.threadlineBattle={won:boss.phase==='respawn',seconds:+(f.t-start).toFixed(2),hp:actor.hp,returns:f.returns};
        return;
      }
      const target=boss.stage==='open'?480:boss.shuttles.find(part=>!part.broken)?.x??480;
      let destination=target-57;
      for(const zone of Array.isArray(boss.zones)?boss.zones:[]){
        if(boss.tick<zone.at-48||actor.y<=zone.top||actor.y-50>=zone.bottom)continue;
        if(zone.top>=422&&zone.right-zone.left>=170){
          if(boss.tick>=zone.at-15&&boss.tick<zone.at&&actor.ground
             &&zone.left-12<actor.x&&actor.x<zone.right+12) window.lab.action('jump');
        }else if(zone.left-16<destination&&destination<zone.right+16){
          destination=[zone.left-24,zone.right+24].sort((a,b)=>Math.abs(a-actor.x)-Math.abs(b-actor.x))[0];
        }
      }
      const distance=destination-actor.x,aim=target-actor.x,turn=Math.abs(aim)>5&&aim*actor.dir<0;
      hold('KeyA',distance<-8||Math.abs(distance)<=8&&turn&&aim<0);
      hold('KeyD',distance>8||Math.abs(distance)<=8&&turn&&aim>0);
      hold('Space',!actor.ground);
      hold('KeyJ',Math.abs(aim)<110&&!turn);
      requestAnimationFrame(fight);
    }
    requestAnimationFrame(fight);
  });
  await page.waitForFunction(()=>window.threadlineBattle,undefined,{timeout:115000});
  const result=await page.evaluate(()=>window.threadlineBattle);
  assert.ok(result.won&&result.returns===0,JSON.stringify(result));
  return result;
}

try {
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8853/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/threadline-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(node=>window.lab.frame.story.node===node,hub);

  await accept(survey);
  await expectTracking(/布巻きの作業路/);
  await gate(1320,walk);
  await checkBackground('clothService','cloth-service-walk-background-v1.png');
  await inspect(355,survey,1,'点検札');
  await save();
  await reloadSave();
  assert.equal((await frame()).story.quests[survey].count,1);
  await gate(1320,walk);
  await gate(1138,relay,false);
  await walkTo(715);
  await expectTracking(/ヒューズ箱/);
  assert.ok(!(await frame()).storyNearbyMilestone);
  await canvas.click();
  await page.keyboard.down('Space');
  try {
    await page.waitForFunction(()=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return a.y===382&&a.ground;
    });
  } finally {
    await page.keyboard.up('Space');
  }
  await inspect(715,survey,2,'ヒューズ箱');
  await expectTracking(/次は 糸道の配電室/);
  await gate(1138,relay);
  await checkBackground('threadlineRelay','threadline-relay-background-v1.png');
  await inspect(710,survey,3,'停止時刻');
  await expectTracking(/報告/);
  await gate(60,walk);
  await gate(55,hub);
  await report(survey,[1300,250]);
  console.log('Survey accepted, resumed and reported');

  await accept(restore);
  await expectTracking(/目的地：糸道の配電室/);
  await gate(1320,walk);
  await gate(1138,relay);
  await gate(1018,arena,false);
  await inspect(710,restore,1,'遮断器');
  await expectTracking(/次は 埋もれた織房/);
  await gate(1018,arena);
  await canvas.click();
  const battle=await defeatLoom();
  console.log('Loom defeated',battle);
  assert.equal((await frame()).story.quests[restore].count,2);
  await expectTracking(/次は 糸道の配電室/);
  await gate(900,relay);
  await inspect(853,restore,3,'試験灯');
  await walkTo(740);
  assert.ok((await frame()).draws.some(draw=>draw.text==='試験灯・点灯'));
  await canvas.screenshot({path:'evidence/threadline-relay.png'});
  await gate(60,walk);
  await gate(55,hub);
  await report(restore,[2300,480]);
  await save();
  await reloadSave();
  const completed=(await frame()).story.quests;
  assert.equal(completed[survey].status,'complete');
  assert.equal(completed[restore].status,'complete');
  assert.deepEqual(errors,[]);
  const result={battle,keyboardJump:true,lockedGates:true,updatedTracking:true,reloadMidSurvey:true,
    completedAfterReload:true,litLamp:true,backgroundsLoaded:2,reported:{survey:[1300,250],restore:[2300,480]},errors};
  await fs.writeFile('evidence/threadline-browser.json',JSON.stringify(result,null,2)+'\n');
  console.log(result);
} catch(error) {
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[f.active-1],quest:f?.story.quests['threadline-restore'],
      portal:f?.storyNearbyPortal,milestone:f?.storyNearbyMilestone,tracked:document.querySelector('#trackedQuestText')?.textContent};
  }),errors);
  throw error;
} finally {
  await browser.close();
}
