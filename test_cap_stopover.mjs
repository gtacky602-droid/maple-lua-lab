import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const port='natlan-port',boat='natlan-voyage',dock='ochkanatlan-dock';
const steps='ochka-tide-stairs',court='ochka-patched-court',kiln='ochka-sifting-kiln';
const first='ochka-stopover-survey',second='ochka-wall-marks',third='ochka-sifter-clear';
const boss='original-rubble-sifter',prefix='evidence/stopover-boss';
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
  await page.getByRole('button',{name:'拠点へ：オシカ・ナタ・寄港地',exact:true}).click();
  await nodeIs(dock);
}

async function quality(){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.exposed);
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.fieldBoss.barrier,0);
  assert.ok(png.draws.some(d=>d.source==='rubble-sifter-source-v1.png'&&d.h===142));
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

async function clearCarrier(){
  await walk(756);
  await canvas.click();
  await page.keyboard.down('KeyJ');
  try{
    await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.count===2,second,{timeout:15000});
  } finally {await page.keyboard.up('KeyJ')}
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
        window.sifterResult={won:b?.phase==='respawn',seconds:+(f.t-started).toFixed(2),
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
  await page.waitForFunction(()=>window.sifterResult,undefined,{timeout:130000});
  const result=await page.evaluate(()=>window.sifterResult);
  assert.ok(result.won&&!result.returns,JSON.stringify(result));
  return result;
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8858/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/cap-stopover-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(port);
  await gate(720,boat);
  await walk(720);
  await gate(720,dock);
  await canvas.screenshot({path:'evidence/stopover-port.png'});
  await quest(first,'受注','active');
  await gate(525,steps);
  await g(282,first,1,'印の向き');
  await jump(623,388);
  await g(623,first,2,'石段の道筋');
  await g(1450,first,3,'帰りの目印');
  await back();
  await quest(first,'報告','complete');
  await quest(second,'受注','active');
  await gate(525,steps);
  await gate(1700,court);
  await jump(501,387);
  await g(501,second,1,'刻み目');
  await clearCarrier();
  await jump(1290,393);
  await g(1290,second,3,'新しい目印');
  await back();
  await quest(second,'報告','complete');
  console.log('Disembarked and reported both surveys');
  await quest(third,'受注','active');
  await gate(525,steps);
  await gate(1700,court);
  await gate(1410,kiln);
  await walk(818);
  const before=await frame();
  assert.equal(before.fieldBoss.id,boss);
  const commands=await quality();
  const battle=await fight();
  assert.equal((await frame()).progression.questXp,before.progression.questXp);
  await g(1350,third,2,'寸法');
  await back();
  const expected=await frame();
  await quest(third,'報告','complete');
  const received=await frame();
  const firstReport=[received.progression.questXp-expected.progression.questXp,received.mora-expected.mora];
  assert.deepEqual(firstReport,[8653565,797220]);
  await page.click('#saveProgress');
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await nodeIs(dock);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  console.log('Defeated the sifter, reported, and loaded the checkpoint');
  await gate(60,boat);
  const departed=await frame();
  await nodeIs('nod-port',50000);
  const seconds=+((await frame()).t-departed.t).toFixed(2);
  assert.ok(seconds>=39&&seconds<=41);
  assert.deepEqual(errors,[]);
  const proof={threeQuests:true,battle,commands,firstReport,savedReport:true,voyageResumedSeconds:seconds,errors};
  await fs.writeFile('evidence/cap-stopover-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,a:f?.actors[f.active-1],q:f?.story.quests,
      milestone:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,boss:f?.fieldBoss,result:window.sifterResult};
  }),errors);
  throw error;
}finally{await browser.close()}
