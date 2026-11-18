import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const town='snezhnaya-hub',field='snezhnaya-field',camp='novokichev-camp';
const works='novo-frozen-works',passage='novo-drift-passage',vault='novo-ice-vault';
const first='novo-expedition-ready',second='novo-equipment-route',third='novo-return-report';
const boss='original-ice-crawler',prefix='evidence/ice-expedition';
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
        window.crawlerResult={won:b?.phase==='respawn',seconds:+(f.t-started).toFixed(2),
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
  await page.waitForFunction(()=>window.crawlerResult,undefined,{timeout:140000});
  const result=await page.evaluate(()=>window.crawlerResult);
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

async function ground(){
  await canvas.click();
  await page.keyboard.down('KeyS');
  try{await page.keyboard.press('Space')}finally{await page.keyboard.up('KeyS')}
  await page.waitForFunction(()=>{
    const f=window.lab.frame,a=f.actors[f.active-1];
    return a.y===480&&a.ground;
  });
}

async function enterPassage(){
  await gate(1050,works);
  await jump(1560,385);
  await gate(1595,passage);
}

async function quality(){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.exposed);
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.fieldBoss.barrier,0);
  assert.ok(png.draws.some(d=>d.source==='ice-crawler-source-v1.png'&&d.h===151));
  await canvas.screenshot({path:prefix+'-boss-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>6000);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await canvas.screenshot({path:prefix+'-boss-light.png'});
  await mode.selectOption('sprite');
  await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.source==='ice-crawler-source-v1.png'));
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

const quota=({id,n})=>window.lab.frame.story.quests[id]?.count>=n;
const sweep=({id,enemy})=>{
  const q=window.lab.frame.story.quests[id];
  return q?.count>=1||q?.sweep?.[enemy];
};

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8860/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/ice-expedition-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs(town);
  await gate(1380,field);
  await gate(720,camp);
  await quest(first,'受注','active');
  await walk(450);
  assert.equal(await page.getByRole('table',{name:'旅人と同行者の10部位'}).locator('tbody tr').count(),5);
  await page.getByRole('button',{name:'障壁を試打する',exact:true}).click();
  await page.waitForFunction(()=>window.lab.frame.storyExpeditionDesk?.practice===10);
  await page.locator('#expeditionDesk').screenshot({path:prefix+'-desk.png'});
  await g(450,first,1,'装備と帰還先');
  await quest(first,'報告','complete');
  assert.equal((await frame()).inventory.upgradeOre,2);

  await quest(second,'受注','active');
  await gate(1050,works);
  assert.ok((await frame()).actors[0].x<300);
  await g(350,second,1,'巻き上げ機');
  await jump(610,388);
  await jump(675,294);
  await clearGuard(697,quota,{id:second,n:2});
  await walk(1010);
  await page.waitForFunction(()=>window.lab.frame.actors[0].y===480);
  await g(991,second,3,'送風輪');
  await clearGuard(1094,quota,{id:second,n:4});
  await jump(1535,385);
  await g(1535,second,5,'帰還用');
  await ground();
  await gate(1435,camp);
  await quest(second,'報告','complete');
  console.log('Two equipment platforms crossed and both guards cleared');

  await quest(third,'受注','active');
  await enterPassage();
  await clearGuard(321,sweep,{id:third,enemy:'novo-drift-west-guard'});
  await saveReload();
  await nodeIs(camp);
  assert.equal((await frame()).story.quests[third].sweep['novo-drift-west-guard'],true);
  await enterPassage();
  await jump(725,389);
  await clearGuard(753,sweep,{id:third,enemy:'novo-drift-upper-guard'});
  await walk(1103);
  await page.waitForFunction(()=>window.lab.frame.actors[0].y===480);
  await clearGuard(1125,quota,{id:third,n:1});
  await gate(1475,vault);
  console.log('Guard group progress loaded and completed');
  await walk(870);
  const before=await frame();
  assert.equal(before.fieldBoss.id,boss);
  assert.equal(before.imprintGrowth.total,0);
  const commands=await quality();
  const battle=await fight();
  assert.equal((await frame()).progression.questXp,before.progression.questXp);
  await jump(1510,388);
  await g(1510,third,3,'帰り道');
  await gate(1660,camp);
  const expected=await frame();
  await quest(third,'報告','complete');
  const received=await frame();
  const firstReport=[received.progression.questXp-expected.progression.questXp,
    received.mora-expected.mora,received.inventory.upgradeOre-expected.inventory.upgradeOre];
  assert.deepEqual(firstReport,[17133467,882270,8]);
  await saveReload();
  await nodeIs(camp);
  const resumed=await frame();
  assert.ok([first,second,third].every(id=>resumed.story.quests[id]?.status==='complete'));
  assert.deepEqual(errors,[]);
  const proof={deskRows:5,practiceDamage:10,imprint:0,equipmentRoute:true,savedGroup:true,
    threeQuests:true,directReturn:true,battle,commands,firstReport,savedReport:true,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[f.active-1],q:f?.story.quests,
      total:f?.total,notice:f?.storyNotice,desk:f?.storyExpeditionDesk,portal:f?.storyNearbyPortal,boss:f?.fieldBoss,result:window.crawlerResult};
  }),errors);
  throw error;
}finally{await browser.close()}
