import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const border='mond-border',camp='dragonspine-camp',shelf='spine-observation-shelf';
const notch='spine-wind-notch',lee='spine-lee-walk',shelter='spine-shelter',ridge='spine-trace-ridge';
const first='spine-noon-pattern',second='spine-wind-route',third='spine-ridge-record';
const boss='original-rime-hare',prefix='evidence/spine-observation';
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
        window.hareResult={won:b?.phase==='respawn',seconds:+(f.t-started).toFixed(2),
          hp:a.hp,bossHp:lastBossHp,moves:[...moves],returns:f.returns};
        return;
      }
      if(b.move)moves.add(b.move);
      const lanes=(Array.isArray(b.lanes)?b.lanes:[]).filter(lane=>b.tick<lane.at+b.activeTicks);
      const choices=[b.x-62,b.x+62,b.x-31,b.x+31];
      for(const lane of lanes)choices.push(lane.left-25,lane.right+25);
      const distance=x=>Math.abs(x-a.x)+0.7*Math.abs(x-b.x);
      const safe=choices.filter(x=>lanes.every(lane=>x<=lane.left-18||x>=lane.right+18));
      safe.sort((a,b)=>distance(a)-distance(b));
      const dest=safe[0]??b.x,dx=dest-a.x,aim=b.x-a.x;
      const turn=Math.abs(dx)<=8&&Math.abs(aim)>5&&aim*a.dir<0;
      hold('KeyA',dx<-8||turn&&aim<0);
      hold('KeyD',dx>8||turn&&aim>0);
      hold('KeyJ',Math.abs(aim)<107&&aim*a.dir>0);
      requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
  await page.waitForFunction(()=>window.hareResult,undefined,{timeout:130000});
  const result=await page.evaluate(()=>window.hareResult);
  assert.ok(result.won&&!result.returns,JSON.stringify(result));
  return result;
}

async function clearGuard(x,test,arg){
  if(await page.evaluate(test,arg))return;
  await walk(x);
  await canvas.click();
  await page.keyboard.down('KeyJ');
  try{await page.waitForFunction(test,arg,{timeout:25000});}
  finally{await page.keyboard.up('KeyJ')}
}

const groupDone=({id,enemy})=>{
  const q=window.lab.frame.story.quests[id];
  return q?.count>=1||q?.sweep?.[enemy];
};

async function quality(){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.recovering);
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.fieldBoss.barrier,0);
  assert.ok(png.draws.some(d=>d.source==='rime-hare-source-v1.png'&&d.h===116));
  await canvas.screenshot({path:prefix+'-boss-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>5600);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.62,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await canvas.screenshot({path:prefix+'-boss-light.png'});
  await mode.selectOption('sprite');
  await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.source==='rime-hare-source-v1.png'));
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8862/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/spine-observation-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  // The original boundary field restores at the discovered Mondstadt checkpoint.
  await nodeIs('mond-town');
  await gate(1380,'mond-road');
  await gate(1380,border);
  await gate(720,camp);
  await quest(first,'受注','active');
  await gate(1020,shelf);
  await clearGuard(215,groupDone,{id:first,enemy:'spine-shelf-near-beetle'});
  await jump(677,389);
  await clearGuard(688,groupDone,{id:first,enemy:'spine-shelf-upper-beetle'});
  await walk(1065);
  await page.waitForFunction(()=>window.lab.frame.actors[0].y===480);
  await clearGuard(1075,groupDone,{id:first,enemy:'spine-shelf-far-beetle'});
  await g(346,first,2,'正面');
  await jump(856,389);
  await g(856,first,3,'上から');
  await g(1373,first,4,'横から');
  await canvas.screenshot({path:prefix+'-shelf.png'});
  await page.getByRole('button',{name:'拠点へ：ドラゴンスパイン・入口拠点',exact:true}).click();
  await nodeIs(camp);
  await quest(first,'報告','complete');

  await quest(second,'受注','active');
  await gate(1020,shelf);
  await gate(1560,notch);
  await g(280,second,1,'分岐');
  await jump(614,387);
  await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.wind?.calm===false);
  const windButton=page.locator('#nearbyPortalGo');
  assert.equal(await windButton.isDisabled(),true);
  await canvas.screenshot({path:prefix+'-gust.png'});
  await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.wind?.calm===true);
  await canvas.click();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(()=>window.lab.frame.storyLift?.destination==='峰下の観測小屋');
  await nodeIs(shelter);
  await g(630,second,2,'帰還用');
  await gate(56,camp);
  await quest(second,'報告','complete');
  await gate(1020,shelf);
  await gate(1560,notch);
  await gate(1440,lee);
  await gate(1560,shelter);
  console.log('Three observation angles and both trails connected');

  await quest(third,'受注','active');
  await gate(1130,ridge);
  await walk(818);
  const before=await frame();
  assert.equal(before.fieldBoss.id,boss);
  assert.equal(before.imprintGrowth.total,0);
  const commands=await quality();
  const battle=await fight();
  assert.equal((await frame()).progression.questXp,before.progression.questXp);
  await g(1455,third,2,'谷と霜筋');
  await gate(57,shelter);
  await g(777,third,3,'観測の一枚');
  const expected=await frame();
  await quest(third,'報告','complete');
  const received=await frame();
  const firstReport=[received.progression.questXp-expected.progression.questXp,
    received.mora-expected.mora,received.inventory.upgradeOre-expected.inventory.upgradeOre];
  assert.deepEqual(firstReport,[6649,153675,3]);
  await saveReload();
  await nodeIs(shelter);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  assert.ok(resumed.draws.some(d=>d.text==='稜線の観測記録・展示中'));
  assert.deepEqual(errors,[]);
  const proof={threeAngles:true,threeQuests:true,gustDisablesCrossing:true,calmLift:true,
    alternateLeeRoute:true,battle,commands,firstReport,savedExhibit:true,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[f.active-1],q:f?.story.quests,
      total:f?.total,notice:f?.storyNotice,portal:f?.storyNearbyPortal,boss:f?.fieldBoss,result:window.hareResult};
  }),errors);
  throw error;
}finally{await browser.close()}
