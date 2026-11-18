import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const hub='snezhnaya-hub',road='snezhnaya-field',yard='snow-rail-transfer',depot='steam-stabling-depot';
const patrol='snow-rail-clear',pressure='snow-rail-pressure',boss='original-snow-sweeper';
const source='snow-rail-sprites-source-v1.png',prefix='evidence/snow-rail';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1180,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const row=id=>page.locator(`[data-quest="${id}"]`);

async function walkTo(x){
  const f=await frame(),actor=f.actors[f.active-1];
  if(Math.abs(actor.x-x)<=6)return;
  const east=actor.x<x,key=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(key);
  try{
    await page.waitForFunction(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{
    await page.keyboard.up(key);
  }
}

async function gate(x,node,available=true){
  await walkTo(x);
  await page.waitForFunction(({node,available})=>{
    const portal=window.lab.frame.storyNearbyPortal;
    return portal?.to===node&&portal.available===available;
  },{node,available});
  if(!available)return;
  await canvas.click();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(id=>window.lab.frame.story.node===id,node);
}

async function actAt(x,text,count){
  await walkTo(x);
  await page.waitForFunction(text=>window.lab.frame.storyNearbyMilestone?.label.includes(text),text);
  await canvas.click();
  await page.keyboard.press('KeyG');
  await phase(pressure,count);
}

async function phase(id,count){
  await page.waitForFunction(({id,count})=>window.lab.frame.story.quests[id]?.count===count,{id,count});
}

async function quest(id,button,status){
  await row(id).getByRole('button',{name:button,exact:true}).click();
  await page.waitForFunction(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function verifyBackdrop(expected){
  const background=await page.evaluate(async()=>{
    const scenery=await import('./scenery.js');
    await scenery.backgroundReady;
    return scenery.sceneryStatus(window.lab.frame);
  });
  assert.equal(background.key,expected);
  assert.equal(background.state,'ready');
}

async function finishFight(kind){
  await canvas.click();
  await page.evaluate(({kind,patrol,source})=>{
    const start=window.lab.frame.t,held=new Set(),moves=new Set();
    window.snowFightResult=null;
    function hold(code,down){
      if(down===held.has(code))return;
      if(down)held.add(code);else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    }
    function tick(){
      const f=window.lab.frame,actor=f.actors[f.active-1];
      const defeated=kind==='boss'?f.fieldBoss?.phase==='respawn':f.story.quests[patrol]?.count===3;
      if(defeated||f.returns>0||f.t-start>95){
        for(const key of held)hold(key,false);
        window.snowFightResult={defeated,seconds:+(f.t-start).toFixed(2),hp:actor.hp,returns:f.returns,moves:[...moves]};
        return;
      }
      const cartPositions=f.draws.filter(draw=>draw.source===source&&draw.h===48).map(draw=>draw.x+f.camera);
      const target=kind==='boss'?f.fieldBoss?.x:cartPositions.sort((a,b)=>Math.abs(a-actor.x)-Math.abs(b-actor.x))[0];
      if(f.fieldBoss?.move)moves.add(f.fieldBoss.move);
      const aim=(target??(actor.x+160))-actor.x;
      const turning=Math.abs(aim)>6&&aim*actor.dir<0;
      const lane=f.fieldBoss?.lane;
      if(lane&&!lane.active&&actor.ground&&actor.x+14>lane.left&&actor.x-14<lane.right){
        const windup=f.fieldBoss.move==='SR01'?63:51;
        if(f.fieldBoss.tick>=windup-12&&f.fieldBoss.tick<windup-8)window.lab.action('jump');
      }
      hold('Space',!actor.ground);
      hold('KeyD',aim>67||turning&&aim>0);
      hold('KeyA',aim<-67||turning&&aim<0);
      hold('KeyJ',Math.abs(aim)<103&&!turning);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  },{kind,patrol,source});
  await page.waitForFunction(()=>window.snowFightResult,undefined,{timeout:120000});
  const result=await page.evaluate(()=>window.snowFightResult);
  assert.ok(result.defeated&&result.returns===0,JSON.stringify(result));
  return result;
}

async function compareBossPose(){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.cooling);
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.fieldBoss.pose,'vent');
  assert.ok(png.draws.some(draw=>draw.source===source&&draw.h===96));
  await canvas.screenshot({path:prefix+'-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>4000);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await page.waitForFunction(commands=>window.lab.frame.commands<commands*.55,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await canvas.screenshot({path:prefix+'-light.png'});
  await mode.selectOption('sprite');
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8854/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/snow-rail-fixture.json','utf8');
  await page.evaluate(data=>localStorage.setItem('maple-lua-lab.checkpoint.v1',data),fixture);
  await page.click('#loadProgress');
  await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
  await quest(patrol,'受注','active');
  await gate(1380,road);
  await gate(260,yard);
  await verifyBackdrop('snowRailTransfer');
  assert.ok((await frame()).draws.some(draw=>draw.source===source&&draw.h===48));
  await canvas.screenshot({path:prefix+'-yard.png'});
  const carts=await finishFight('carts');
  await gate(60,road);
  await gate(60,hub);
  await quest(patrol,'報告','complete');
  console.log('Cleared and reported the transfer yard',carts);
  await quest(pressure,'受注','active');
  await row(pressure).getByRole('button',{name:'この依頼を追跡',exact:true}).click();
  await gate(1380,road);
  await gate(260,yard);
  await actAt(1070,'信号箱',1);
  await page.waitForFunction(()=>document.querySelector('#trackedQuestText').textContent.includes('次は 蒸気留置庫'));
  await gate(1432,depot);
  await verifyBackdrop('steamStablingDepot');
  await walkTo(646);
  const commands=await compareBossPose();
  const battle=await finishFight('boss');
  assert.equal((await frame()).fieldBoss.id,boss);
  await phase(pressure,2);
  await actAt(1215,'圧力計',3);
  await gate(60,yard);
  await gate(60,road);
  await gate(60,hub);
  const before=await frame();
  await quest(pressure,'報告','complete');
  const after=await frame();
  assert.deepEqual([after.progression.questXp-before.progression.questXp,after.mora-before.mora],[11400,740]);
  await page.click('#saveProgress');
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',pressure);
  assert.deepEqual(errors,[]);
  const proof={carts,battle,commands,confirmedPressure:true,reportedBoth:true,restored:true,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,x:f?.actors[f.active-1]?.x,field:f?.fieldBoss,portal:f?.storyNearbyPortal,
      quests:f?.story.quests,result:window.snowFightResult,frameTime:f?.t,status:document.querySelector('#status')?.textContent};
  }),errors);
  throw error;
}finally{
  await browser.close();
}
