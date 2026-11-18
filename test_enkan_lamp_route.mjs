import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const camp='enkanomiya-camp',shelf='enkan-guide-shelf',room='enkan-lamp-chamber';
const gallery='enkan-route-gallery',hollow='enkan-tablet-hollow';
const first='enkan-safety-leaflet',second='enkan-shadow-crossing',third='enkan-coverless-log';
const boss='original-plate-tail',prefix='evidence/enkan-lamp';
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
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
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
        window.plateResult={won:b?.phase==='respawn',seconds:+(f.t-started).toFixed(2),
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
  await page.waitForFunction(()=>window.plateResult,undefined,{timeout:140000});
  const result=await page.evaluate(()=>window.plateResult);
  assert.ok(result.won&&!result.returns,JSON.stringify(result));
  return result;
}

async function toggle(x,mode){
  await walk(x);
  await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone?.label.startsWith('灯り'));
  await canvas.click();
  await page.keyboard.press('KeyG');
  await page.waitForFunction(mode=>window.lab.frame.storyLocalLight?.mode===mode,mode);
}

async function background(){
  return page.evaluate(async()=>{
    const {sceneryStatus,backgroundReady}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function quality(){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.exposed);
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.fieldBoss.barrier,0);
  assert.ok(png.draws.some(d=>d.source==='plate-tail-source-v1.png'&&d.h===132));
  await canvas.screenshot({path:prefix+'-boss-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>8000);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.62,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await canvas.screenshot({path:prefix+'-boss-light.png'});
  await mode.selectOption('sprite');
  await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.source==='plate-tail-source-v1.png'));
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8866/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/enkan-lamp-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(camp);
  await quest(first,'受注','active');
  await gate(942,shelf);
  await g(315,first,1,'地図の線');
  await jump(880,390);
  await g(880,first,2,'休憩');
  await g(1460,first,3,'帰れる道');
  await gate(55,camp);
  await quest(first,'報告','complete');

  await quest(second,'受注','active');
  await gate(1125,room);
  await g(390,second,1,'点灯中');
  await walk(224);
  const litFrame=await frame();
  assert.equal(litFrame.platforms.length,2);
  assert.ok(!litFrame.storyPortals.some(p=>p.to===gallery));
  const lit=await background();
  assert.deepEqual(lit,{key:'enkanLamp',file:'enkan-lamp-chamber-background-v1.png',state:'ready'});
  await canvas.screenshot({path:prefix+'-lit.png'});
  await toggle(224,'dark');
  const dark=await background();
  assert.deepEqual(dark,{key:'enkanLampDark',file:'enkan-lamp-chamber-dark-v1.png',state:'ready'});
  assert.ok((await frame()).storyPortals.some(p=>p.to===gallery));
  await canvas.screenshot({path:prefix+'-dark.png'});
  await jump(763,390);
  await toggle(763,'bright');
  const safe=await frame();
  assert.equal(safe.platforms.length,2);
  assert.equal(safe.actors[0].y,480);
  assert.ok(Math.abs(safe.actors[0].x-478)<12);
  await toggle(224,'dark');
  await jump(647,390);
  await g(647,second,2,'消灯中');
  await saveReload();
  await nodeIs(camp);
  await gate(1125,room);
  const reset=await frame();
  assert.equal(reset.storyLocalLight.mode,'bright');
  assert.equal(reset.story.quests[second].count,2);
  await toggle(224,'dark');
  await jump(886,390);
  await gate(896,gallery);
  await g(442,second,3,'出口を記録');
  await gate(55,camp);
  await quest(second,'報告','complete');
  console.log('Bright/dark route, safe floor and saved observations verified');

  await gate(1292,gallery);
  await quest(third,'受注','active');
  await gate(1210,hollow);
  await walk(604);
  await page.waitForFunction(()=>{
    const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
    return b?.move==='PT01'&&b.lane?.finish===708&&a.x+10<b.lane.left;
  });
  const hp=(await frame()).actors[0].hp;
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.stopped);
  const stopped=await frame();
  assert.equal(stopped.fieldBoss.x,708);
  assert.equal(stopped.actors[0].hp,hp);
  const before=await frame();
  assert.equal(before.fieldBoss.id,boss);
  assert.equal(before.imprintGrowth.total,0);
  const commands=await quality();
  const battle=await fight();
  assert.equal((await frame()).progression.questXp,before.progression.questXp);
  await g(1545,third,2,'道順メモ');
  await gate(58,gallery);
  await g(825,third,3,'表紙を付け');
  const expected=await frame();
  await quest(third,'報告','complete');
  const received=await frame();
  const firstReport=[received.progression.questXp-expected.progression.questXp,
    received.mora-expected.mora,received.inventory.upgradeOre-expected.inventory.upgradeOre];
  assert.deepEqual(firstReport,[103552,371745,5]);
  await saveReload();
  await nodeIs(gallery);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  await walk(825);
  await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone?.label==='完成した探検記を読む');
  await canvas.click();
  await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('同じ道で小間へ戻る'));
  assert.deepEqual(errors,[]);
  const proof={threeQuests:true,lit,dark,relightReturnsToSafeFloor:true,restoredClues:true,
    chargeStoppedAt:stopped.fieldBoss.x,battle,commands,firstReport,readableRecordAfterReload:true,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[f.active-1],q:f?.story.quests,
      notice:f?.storyNotice,portal:f?.storyNearbyPortal,localLight:f?.storyLocalLight,boss:f?.fieldBoss,
      result:window.plateResult};
  }),errors);
  throw error;
}finally{await browser.close()}
