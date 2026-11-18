import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:70000});
const canvas=page.locator('#game');
const prefix='evidence/signora-weekly';
const node='signora-ten-shrine-arena',hub='inazuma-town',quest='signora-weekly-commission',id='boss-29050101';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function freeze(stage){
 await wait(stage=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  if(f.paused||b?.signoraStage!==stage||(stage==='seal'&&!b.seal.ready))return false;
  window.lab.action('pause');
  return true;
 },stage);
 await wait(()=>window.lab.frame.paused);
 return frame();
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>!window.lab.frame.paused);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8945/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/signora-weekly-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const row=page.locator(`[data-quest="${quest}"]`);
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);}
 finally{await page.keyboard.up('KeyD');}
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
 const scene=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['inazuma','ready']);
 const first=await frame();
 assert.deepEqual(first.weeklyBoss.phaseHp.map(p=>[p.name,p.hp]),[['氷',480],['炎',800]]);
 assert.ok(first.draws.some(draw=>draw.source==='signora-idle-source-v1.png'));
 await canvas.screenshot({path:prefix+'-cryo.png'});
 await canvas.click();
 await page.keyboard.down('KeyA');
 try{await wait(()=>window.lab.frame.actors[0].x<=105);}
 finally{await page.keyboard.up('KeyA');}
 await page.keyboard.down('KeyG');
 try{await wait(()=>window.lab.frame.weeklyBoss.devices[0]>0);}
 finally{await page.keyboard.up('KeyG');}
 assert.equal((await frame()).weeklyBoss.devices[1],0);
 await page.evaluate(()=>{
  const held=new Set();
  let coolingGoal=0;
  function set(code,on){
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function run(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0];
   if(!b||b.phase==='respawn'||f.returns){
    for(const code of [...held])set(code,false);
    return;
   }
   if(f.paused){
    for(const code of [...held])set(code,false);
   }else{
    const dx=b.x-a.x;
    let goal=b.x+(dx>0?-74:74),strike=b.damageable;
    if(b.temperature>=55&&!coolingGoal)coolingGoal=!b.devices[0]&&(b.devices[1]||a.x<480)?70:890;
    if(b.temperature<5||!b.deviceEnabled)coolingGoal=0;
    if(coolingGoal){
     goal=coolingGoal;strike=false;
    }else if(b.signoraStage==='seal'&&!b.seal.carrying){
     const moths=Array.isArray(b.seal.moths)?b.seal.moths:[];
     const nearest=moths.slice().sort((l,r)=>Math.abs(l.x-a.x)-Math.abs(r.x-a.x))[0];
     goal=nearest?.x??(a.x<480?70:890);strike=false;
    }
    const delta=goal-a.x;
    const move=Math.abs(delta)>7?Math.sign(delta):strike&&dx*a.dir<0?Math.sign(dx):0;
    set('KeyA',move<0);set('KeyD',move>0);
    set('KeyJ',strike&&Math.abs(dx)<112&&dx*a.dir>=0);
    set('KeyG',!!coolingGoal&&Math.abs(delta)<10);
   }
   requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
 });
 const cocoon=await freeze('seal');
 assert.ok(cocoon.weeklyBoss.seal.hp<=100&&cocoon.weeklyBoss.seal.moths.length>0);
 await wait(()=>document.querySelector('#weeklySealText').textContent.includes('紅蓮蛾'));
 await page.locator('.game').screenshot({path:prefix+'-seal.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#fieldBoss').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await resume();
 const pyro=await freeze('pyro');
 assert.equal(pyro.weeklyBoss.temperatureLabel,'灼熱');
 assert.ok(pyro.draws.some(draw=>draw.source==='signora-flame-idle-source-v1.png'));
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 await canvas.screenshot({path:prefix+'-standard.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(count=>window.lab.frame.commands<count*.7,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[pyro.t,pyro.t]);
 assert.equal(light.weeklyBoss.hp,pyro.weeklyBoss.hp);
 await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await resume();
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const defeated=await frame();
 assert.equal(defeated.returns,0);
 assert.equal(defeated.endgame.bosses[id].clears,1);
 assert.equal(defeated.story.quests[quest].count,1);
 await page.getByRole('button',{name:'拠点へ：稲妻・城下の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({entry:true,deviceKeyboardHold:true,cocoonAndPyro:true,
  normalKeyBattleAndReport:true,savedRespawn:true,remainingHp:defeated.actors[0].hp,viewport390:true,scene,
  sameStateCommands:{png:pyro.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Signora Chrome: quest, portal, held device, cocoon, four moths, two forms, clear and save passed');
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.hp]),returns:f?.returns,errors});
 await page.screenshot({path:'work/signora-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
