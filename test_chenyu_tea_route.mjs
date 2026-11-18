import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const camp='chenyu-camp',terraces='chenyu-tea-terraces',road='chenyu-cart-road';
const rig='chenyu-tea-lift',pavilion='chenyu-tea-pavilion',gully='chenyu-boulder-gully';
const first='chenyu-tea-delivery',second='chenyu-loading-landing',third='chenyu-tea-with-friends';
const boss='original-tea-boulder',prefix='evidence/chenyu-tea';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const nodeIs=(node,timeout=30000)=>page.waitForFunction(id=>window.lab.frame.story.node===id,node,{timeout});
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

async function gate(x,node){
  await walk(x);
  await page.waitForFunction(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node);
  await canvas.click();
  await page.keyboard.press('KeyF');
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

async function saveReload(){
  await page.click('#saveProgress');
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.click('#loadProgress');
}

async function fight(){
  await page.evaluate(()=>{
    const held=new Set(),moves=new Set(),started=window.lab.frame.t;
    const hold=(code,on)=>{
      if(held.has(code)===on)return;
      if(on)held.add(code);else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    };
    function update(){
      const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
      if(b?.phase==='respawn'||f.returns||f.t-started>120){
        for(const key of held)hold(key,false);
        window.boulderResult={won:b?.phase==='respawn',seconds:+(f.t-started).toFixed(2),
          hp:a.hp,bossHp:b?.hp,moves:[...moves],returns:f.returns};
        return;
      }
      if(b.move)moves.add(b.move);
      const lane=b.lane;
      let dest=b.x+(a.x<b.x?-62:62);
      if(lane&&lane.left-19<dest&&dest<lane.right+19){
        const left=lane.left-28,right=lane.right+28;
        dest=Math.abs(a.x-left)<Math.abs(a.x-right)?left:right;
      }
      const dx=dest-a.x,aim=b.x-a.x;
      const turn=Math.abs(dx)<=8&&Math.abs(aim)>5&&aim*a.dir<0;
      hold('KeyA',dx<-8||turn&&aim<0);
      hold('KeyD',dx>8||turn&&aim>0);
      hold('KeyJ',Math.abs(aim)<107&&aim*a.dir>0);
      requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
  await page.waitForFunction(()=>window.boulderResult,undefined,{timeout:140000});
  const result=await page.evaluate(()=>window.boulderResult);
  assert.ok(result.won&&!result.returns,JSON.stringify(result));
  return result;
}

async function ride(x,node,label,y){
  await walk(x);
  await page.waitForFunction(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node);
  await canvas.click();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(label=>window.lab.frame.storyLift?.destination===label,label);
  if(node===rig){
    await page.waitForFunction(()=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return f.storyLift&&a.y>345&&a.y<431;
    });
    await canvas.screenshot({path:prefix+'-rise.png'});
  }
  await page.waitForFunction(({node,y})=>{
    const f=window.lab.frame,a=f.actors[f.active-1];
    return f.story.node===node&&!f.storyLift&&a.ground&&a.y===y;
  },{node,y});
}

async function enterPavilion(){
  await gate(1198,rig);
  await jump(1220,385);
  await ride(1245,pavilion,'展望亭横の中継台',390);
}

async function quality(){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.exposed);
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.fieldBoss.barrier,0);
  assert.ok(png.draws.some(d=>d.source==='tea-boulder-source-v1.png'&&d.h===125));
  await canvas.screenshot({path:prefix+'-boss-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>6200);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.60,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await canvas.screenshot({path:prefix+'-boss-light.png'});
  await mode.selectOption('sprite');
  await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.source==='tea-boulder-source-v1.png'));
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8865/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/chenyu-tea-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(camp);
  await quest(first,'受注','active');
  await gate(950,terraces);
  await g(318,first,1,'一つ目');
  await jump(929,390);
  await g(929,first,2,'二つ目');
  await g(1430,first,3,'三つ目');
  await jump(1537,384);
  await gate(1537,pavilion);
  await g(660,first,4,'茶葉を届ける');
  await gate(55,road);
  await g(1234,first,5,'荷車');
  await gate(55,camp);
  await quest(first,'報告','complete');
  console.log('Tea delivered via hillside and cart road recorded on the return');

  await quest(second,'受注','active');
  await gate(1198,rig);
  await g(355,second,1,'上向き');
  await ride(570,rig,'高い試験台',312);
  await g(655,second,2,'着地');
  await walk(922);
  await page.waitForFunction(()=>window.lab.frame.actors[0].y===480);
  await g(922,second,3,'横に台');
  await saveReload();
  await nodeIs(camp);
  await gate(1198,rig);
  const tracks=(await frame()).platforms.filter(p=>p.track==='tea-landing');
  assert.deepEqual(tracks.map(p=>p.y),[385]);
  await jump(1220,385);
  await ride(1245,pavilion,'展望亭横の中継台',390);
  await g(428,second,4,'亭の横に固定');
  await gate(560,camp);
  await quest(second,'報告','complete');
  console.log('Both lift stops tested, lower landing survives reload');

  await enterPavilion();
  await quest(third,'受注','active');
  await gate(1325,gully);
  await walk(612);
  await page.waitForFunction(()=>{
    const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
    return b?.move==='TB01'&&b.lane?.left===645&&a.x+10<b.lane.left;
  });
  const coverHp=(await frame()).actors[0].hp;
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.exposed);
  assert.equal((await frame()).actors[0].hp,coverHp);
  await walk(819);
  const before=await frame();
  assert.equal(before.fieldBoss.id,boss);
  assert.equal(before.imprintGrowth.total,0);
  const commands=await quality();
  const battle=await fight();
  assert.equal((await frame()).progression.questXp,before.progression.questXp);
  await gate(57,pavilion);
  await g(500,third,2,'小さな器に');
  await g(865,third,3,'一服する');
  await canvas.screenshot({path:prefix+'-pavilion.png'});
  const expected=await frame();
  await quest(third,'報告','complete');
  const received=await frame();
  const firstReport=[received.progression.questXp-expected.progression.questXp,
    received.mora-expected.mora,received.inventory.upgradeOre-expected.inventory.upgradeOre];
  assert.deepEqual(firstReport,[55165,290472,4]);
  await saveReload();
  await nodeIs(pavilion);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  assert.ok(resumed.draws.some(d=>d.text==='茶席・一服の記録'));
  assert.deepEqual(errors,[]);
  const proof={outboundHillside:true,cartReturn:true,liftRiseAndLowerLanding:true,replacedPlatformAfterReload:true,
    rockStopsBeam:true,threeQuests:true,battle,commands,firstReport,savedCups:true,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[f.active-1],q:f?.story.quests,
      total:f?.total,notice:f?.storyNotice,portal:f?.storyNearbyPortal,lift:f?.storyLift,boss:f?.fieldBoss,
      result:window.boulderResult};
  }),errors);
  throw error;
}finally{await browser.close()}
