import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const port='dornman-camp',view='dornman-wind-stairs',flags='dornman-flag-trestle',works='dornman-windworks';
const first='windward-lookouts',second='windward-flags',third='windward-tower-clear',boss='original-windward-tower';
const prefix='evidence/windward';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const nodeIs=node=>page.waitForFunction(id=>window.lab.frame.story.node===id,node);
const row=id=>page.locator(`[data-quest="${id}"]`);

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1];
  if(Math.abs(x-a.x)<7)return;
  const east=x>a.x,key=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  } finally {await page.keyboard.up(key)}
}

async function jump(x,y){
  await walk(x);
  await canvas.click();
  await page.keyboard.down('Space');
  try{
    await page.waitForFunction(y=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return a.y===y&&a.ground;
    },y);
  }finally{await page.keyboard.up('Space')}
}

async function gate(x,node,lift=false){
  await walk(x);
  await page.waitForFunction(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node);
  await canvas.click();
  await page.keyboard.press('KeyF');
  if(lift)await page.waitForFunction(()=>window.lab.frame.storyLift);
  await nodeIs(node);
}

async function g(x,id,count,label){
  await walk(x);
  await page.waitForFunction(label=>window.lab.frame.storyNearbyMilestone?.label.includes(label),label);
  await canvas.click();
  await page.keyboard.press('KeyG');
  await page.waitForFunction(({id,count})=>window.lab.frame.story.quests[id]?.count===count,{id,count});
}

async function quest(id,label,status){
  await row(id).getByRole('button',{name:label,exact:true}).click();
  await page.waitForFunction(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function back(){
  await page.getByRole('button',{name:'拠点へ：ドーンマンポート・入口拠点',exact:true}).click();
  await nodeIs(port);
}

async function quality(){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.exposed);
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.fieldBoss.barrier,0);
  assert.ok(png.draws.some(d=>d.source==='windward-tower-source-v1.png'&&d.h===146));
  await canvas.screenshot({path:prefix+'-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>8000);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.60,standard.commands);
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

async function fight(){
  await page.evaluate(()=>{
    const held=new Set(),moves=new Set(),started=window.lab.frame.t;
    let lastBossHp;
    const hold=(code,on)=>{
      if(held.has(code)===on)return;
      if(on)held.add(code);else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    };
    function update(){
      const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
      if(b)lastBossHp=b.hp;
      if(b?.phase==='respawn'||f.returns||f.t-started>115){
        for(const key of held)hold(key,false);
        window.towerResult={won:b?.phase==='respawn',seconds:+(f.t-started).toFixed(2),
          hp:a.hp,bossHp:lastBossHp,moves:[...moves],returns:f.returns};
        return;
      }
      if(b.move)moves.add(b.move);
      let dest=b.x+(a.x<b.x?-65:65);
      const lane=b.lane,aim=b.x-a.x;
      let jump=!a.ground;
      if(lane?.top<400&&lane.left-15<dest&&dest<lane.right+15){
        const left=lane.left-42,right=lane.right+42;
        dest=Math.abs(a.x-left)<Math.abs(a.x-right)?left:right;
      }
      if(lane?.top>=400&&!lane.active&&lane.left-15<a.x&&a.x<lane.right+15&&
         b.tick>=lane.at-17&&b.tick<lane.at-10){
        jump=true;
      }
      const dx=dest-a.x,turn=Math.abs(dx)<=8&&Math.abs(aim)>5&&aim*a.dir<0;
      hold('KeyA',dx<-8||turn&&aim<0);
      hold('KeyD',dx>8||turn&&aim>0);
      hold('Space',jump);
      hold('KeyJ',Math.abs(aim)<107&&aim*a.dir>0);
      requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
  await page.waitForFunction(()=>window.towerResult,undefined,{timeout:130000});
  const result=await page.evaluate(()=>window.towerResult);
  assert.ok(result.won&&!result.returns,JSON.stringify(result));
  return result;
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8857/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/windward-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(port);
  await quest(first,'受注','active');
  await gate(1168,view);
  await jump(342,392);
  await g(342,first,1,'海側');
  await jump(799,388);
  await g(799,first,2,'荷場');
  await jump(1390,399);
  await g(1390,first,3,'全景');
  await canvas.screenshot({path:prefix+'-lookout.png'});
  await back();
  await quest(first,'報告','complete');
  await quest(second,'受注','active');
  await gate(1168,view);
  await jump(1720,399);
  await gate(1720,flags,true);
  const lifted=await frame();
  assert.equal(lifted.actors[lifted.active-1].y,374);
  await walk(1070);
  await canvas.click();
  await page.keyboard.down('KeyS');
  try {await page.keyboard.press('Space')}finally{await page.keyboard.up('KeyS')}
  await g(1090,second,1,'合図旗');
  await jump(1410,391);
  await g(1410,second,2,'二つの旗');
  await back();
  await quest(second,'報告','complete');
  console.log('Lookouts and upper lift route reported');
  await quest(third,'受注','active');
  await gate(536,flags);
  await gate(1698,works);
  await walk(758);
  const before=await frame();
  assert.equal(before.imprintTrial,0);
  assert.equal(before.fieldBoss.id,boss);
  const commands=await quality();
  const battle=await fight();
  assert.equal((await frame()).progression.questXp,before.progression.questXp);
  await g(1375,third,2,'通行');
  await back();
  const expected=await frame();
  await quest(third,'報告','complete');
  const received=await frame();
  assert.deepEqual([received.progression.questXp-expected.progression.questXp,
    received.mora-expected.mora],[5312539,741600]);
  await page.click('#saveProgress');
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await nodeIs(port);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  assert.deepEqual(errors,[]);
  const proof={threeQuests:true,liftRoute:true,battle,lightReference:0,commands,savedReport:true,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,a:f?.actors[f.active-1],q:f?.story.quests,
      milestone:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,boss:f?.fieldBoss,result:window.towerResult};
  }),errors);
  throw error;
}finally{await browser.close()}
