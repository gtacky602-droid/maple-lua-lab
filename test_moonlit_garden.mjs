import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const port='nod-port',field='nod-field',camp='nod-special-camp',town='nod-town';
const shore='nod-reflector-shore',garden='nod-reflection-garden',rim='nod-quiet-rim';
const first='nod-light-path',second='nod-light-record',third='nod-rim-return';
const boss='original-prism-walker',prefix='evidence/moonlit-garden';
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

async function turnTo(orientation){
  for(let i=0;i<3;i++){
    const previous=(await frame()).storyReflection?.orientation;
    if(previous===orientation)return;
    await canvas.click();
    await page.keyboard.press('KeyG');
    await page.waitForFunction(before=>window.lab.frame.storyReflection?.orientation!==before,previous);
  }
  assert.equal((await frame()).storyReflection?.orientation,orientation);
}

async function aim(x,id,progress,orientation){
  await walk(x);
  while((await frame()).story.quests[id].count<progress){
    const previous=(await frame()).storyReflection?.orientation;
    assert.ok(previous,`missing reflector at ${x}`);
    await canvas.click();
    await page.keyboard.press('KeyG');
    await page.waitForFunction(before=>window.lab.frame.storyReflection?.orientation!==before,previous);
    const f=await frame();
    if(f.story.quests[id].count<progress)assert.notEqual(f.storyReflection?.orientation,orientation);
  }
}

async function record(orientation,shape,progress){
  await turnTo(orientation);
  await page.getByRole('button',{name:'消灯する',exact:true}).click();
  await page.waitForFunction(shape=>!window.lab.frame.storyReflection?.lit&&window.lab.frame.storyReflection?.image===shape,shape);
  await page.getByRole('button',{name:'点灯する',exact:true}).click();
  await page.waitForFunction(shape=>window.lab.frame.storyReflection?.lit&&window.lab.frame.storyReflection?.image===shape,shape);
  if(progress===1)await page.locator('#nearbyCargo').screenshot({path:prefix+'-recorder.png'});
  await page.getByRole('button',{name:'照合する',exact:true}).click();
  await page.waitForFunction(({id,progress})=>window.lab.frame.story.quests[id]?.count===progress,{id:second,progress});
}

async function saveReload(){
  await page.click('#saveProgress');
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.click('#loadProgress');
}

async function enterGarden(){
  await gate(1020,shore);
  await jump(1552,390);
  await gate(1580,garden);
}

async function quality(){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.images?.length===2);
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.draws.filter(d=>d.source==='prism-walker-source-v1.png'&&d.h===129).length,3);
  await canvas.screenshot({path:prefix+'-boss-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>6000);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.78,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await canvas.screenshot({path:prefix+'-boss-light.png'});
  await mode.selectOption('sprite');
  await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.source==='prism-walker-source-v1.png'));
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
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
        window.walkerResult={won:b?.phase==='respawn',seconds:+(f.t-started).toFixed(2),
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
  await page.waitForFunction(()=>window.walkerResult,undefined,{timeout:140000});
  const result=await page.evaluate(()=>window.walkerResult);
  assert.ok(result.won&&!result.returns,JSON.stringify(result));
  return result;
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8859/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/moonlit-garden-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(port);
  await gate(1380,field);
  await gate(720,camp);
  await quest(first,'受注','active');
  await gate(1020,shore);
  await aim(323,first,1,'結晶');
  await jump(759,390);
  await aim(759,first,2,'結晶');
  await aim(1220,first,3,'結晶');
  await saveReload();
  await nodeIs(camp);
  await enterGarden();
  await g(322,first,4,'帰り道の目印');
  await gate(55,shore);
  await gate(55,camp);
  await quest(first,'報告','complete');
  console.log('Reflectors solved and bridge traversed after reload');
  await quest(second,'受注','active');
  await enterGarden();
  await walk(568);
  await turnTo('左');
  await page.getByRole('button',{name:'消灯する',exact:true}).click();
  await page.waitForFunction(()=>window.lab.frame.storyReflection?.lit===false);
  await page.getByRole('button',{name:'点灯する',exact:true}).click();
  await page.waitForFunction(()=>window.lab.frame.storyReflection?.lit===true);
  await page.getByRole('button',{name:'照合する',exact:true}).click();
  await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('記録が合いません'));
  assert.equal((await frame()).story.quests[second].count,0);
  await record('右','四角',1);
  await record('左','三角',2);
  await record('中央','円',3);
  await g(1320,second,4,'照射の順番');
  await jump(1055,394);
  await gate(1055,camp);
  await quest(second,'報告','complete');
  console.log('All three orientations recorded, shortcut used');
  await gate(60,field);
  await gate(1380,town);
  await quest(third,'受注','active');
  await gate(60,field);
  await gate(720,camp);
  await enterGarden();
  await gate(1640,rim);
  await walk(857);
  const before=await frame();
  assert.equal(before.fieldBoss.id,boss);
  const commands=await quality();
  const battle=await fight();
  assert.equal((await frame()).progression.questXp,before.progression.questXp);
  await jump(1530,389);
  await g(1530,third,2,'街へ続く道');
  await gate(1660,town);
  const expected=await frame();
  await quest(third,'報告','complete');
  const received=await frame();
  const firstReport=[received.progression.questXp-expected.progression.questXp,received.mora-expected.mora];
  assert.deepEqual(firstReport,[14095746,853650]);
  await saveReload();
  await nodeIs(town);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  assert.deepEqual(errors,[]);
  const proof={bridgeRestored:true,threeQuests:true,recordingWrongAngleRejected:true,shortcutToCamp:true,
    returnedViaRim:true,battle,commands,firstReport,savedReport:true,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[f.active-1],q:f?.story.quests,
      reflection:f?.storyReflection,notice:f?.storyNotice,portal:f?.storyNearbyPortal,boss:f?.fieldBoss,result:window.walkerResult};
  }),errors);
  throw error;
}finally{await browser.close()}
