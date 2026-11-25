import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {holdPortalFrame} from './tools/browser_waypoint_test.mjs';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:115000});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game');
const prefix='evidence/raiden-weekly';
const normal='raiden-weekly-normal-source-v1.png';
const node='raiden-thunder-echo-arena',hub='inazuma-town',quest='raiden-weekly-commission',id='boss-29060201';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function freeze(stage){
 await wait(stage=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  const ready=stage==='dome'?b?.move==='WR15'&&b.flower.protected&&b.moveTick>=64:
   b?.move==='WR16'&&b.damageable;
  if(f.paused||!ready)return false;
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

async function canvasImage(name){
 const data=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(data,'base64'));
 return data;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8946/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/raiden-weekly-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 const row=page.locator(`[data-quest="${quest}"]`);
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);}
 finally{await page.keyboard.up('KeyD');}
 const releaseOpening=await holdPortalFrame(page);
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
 const scene=await page.evaluate(async()=>{
  const {loadScenery,sceneryStatus}=await import('./scenery.js');
  await loadScenery(window.lab.frame);
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['euthymiaDuel','ready']);
 const opening=await frame();
 assert.equal(opening.weeklyBoss.formName,'薙刀');
 assert.ok(opening.draws.some(draw=>draw.source===normal));
 await page.locator('.game').screenshot({path:prefix+'-normal.png'});
 await releaseOpening();
 await canvas.click();
 await page.evaluate(()=>{
  const held=new Set();
  function key(code,on){
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  let lastDodge=-10,retreat=905;
  window.raidenLog=[];
  let previousMove;
  function run(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0],flower=b?.flower;
   if(!b||b.phase==='respawn'||f.returns){
    for(const code of [...held])key(code,false);
    return;
   }
   if(previousMove!==b.move){
    previousMove=b.move;window.raidenLog.push([Math.round(f.t),b.move,b.hp,a.hp,Math.round(a.x),b.raidenMeter.value,b.flower?.value]);
   }
   if(f.paused){
    for(const code of [...held])key(code,false);
   }else{
    const targets=Array.isArray(b.targets)?b.targets:[];
    const eye=targets.filter(x=>x.kind==='eye').sort((l,r)=>Math.abs(l.x-a.x)-Math.abs(r.x-a.x))[0];
    const shade=b.moveTick>=126&&targets.find(x=>x.clue==='╳');
    let target,goal;
    if(flower){
     if(flower.protected||!flower.ready)goal=flower.x;
     else target=flower.x;
    }else if(eye&&b.moveTick<260)target=eye.x;
    else if(shade)target=shade.x;
    else if(b.damageable&&(window.raidenFinish||b.raidenStage==='armored'&&b.hp>950))target=b.x;
    if(target!==undefined)goal=target+(a.x<target?-65:65);
    if(goal===undefined){
     if(Math.abs(a.x-retreat)<15&&Math.abs(a.x-b.x)<174)retreat=960-retreat;
     goal=retreat;
    }
    const delta=goal-a.x,dx=target===undefined?0:target-a.x;
    const movement=Math.abs(delta)>7?Math.sign(delta):dx*a.dir<0?Math.sign(dx):0;
    key('KeyA',movement<0);key('KeyD',movement>0);
    key('KeyJ',target!==undefined&&Math.abs(dx)<109&&dx*a.dir>=0);
    const jump=b.move==='WR12'&&[120,210,300,390].some(t=>b.moveTick>=t-8&&b.moveTick<t+32);
    key('Space',jump);
    if(jump&&a.ground)window.lab.action('jump');
    const warnings=Array.isArray(b.warnings)?b.warnings:[];
    const imminent=warnings.some(w=>w.starts-b.moveTick<=8&&w.starts-b.moveTick>=2
     &&a.x>w.lo&&a.x<w.hi&&a.y>=w.y-w.h&&a.y<=w.y+6);
    const danger=!flower&&!jump&&!eye&&(imminent||b.phase==='active');
    if(danger&&f.t-lastDodge>2.2){lastDodge=f.t;window.lab.action('dodge');}
   }
   requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
 });
 await wait(()=>window.lab.frame.weeklyBoss?.raidenStage==='armored');
 const dome=await freeze('dome');
 assert.equal(dome.weeklyBoss.flower.value,5);
 assert.ok(await page.locator('#status').evaluate(el=>!el.classList.contains('error')));
 assert.ok(dome.events.some(e=>e.kind==='raiden:WR15:protected'&&e.actor===1));
 assert.ok(dome.draws.some(draw=>draw.source==='raiden-boss-idle-source-v1.png'&&draw.h===144));
 const spritePixels=await canvasImage('png');
 await page.locator('.game').screenshot({path:prefix+'-dome.png'});
 await page.locator('#renderMode').selectOption('rect');
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 const standardPixels=await canvasImage('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(count=>window.lab.frame.commands<count*.7,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[dome.t,dome.t]);
 assert.equal(light.weeklyBoss.hp,dome.weeklyBoss.hp);
 const lightPixels=await canvasImage('light');
 assert.equal(new Set([spritePixels,standardPixels,lightPixels]).size,3);
 await page.locator('#renderMode').selectOption('sprite');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#fieldBoss').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await resume();
 const collapse=await freeze('down');
 assert.ok(collapse.weeklyBoss.down>=470);
 assert.ok(await page.locator('#status').evaluate(el=>!el.classList.contains('error')));
 await canvas.evaluate(el=>el.getContext('2d').getImageData(0,0,el.width,el.height));
 await page.locator('.game').screenshot({path:'work/raiden-weekly-collapse.png'});
 await page.evaluate(()=>{window.raidenFinish=true;});
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
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({questEntry:true,ordinaryAndArmored:true,fivePhysicalFlowerHits:true,
  protectedAtSlash:true,attackableArmorDown:true,clears:1,reportAndRestore:true,viewport390:true,scene,
  remainingHp:defeated.actors[0].hp,sameStateCommands:{png:dome.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Raiden Chrome: portal, two forms, flower, down, clear, report and save passed');
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.hp]),returns:f?.returns,
  stages:await page.evaluate(()=>window.raidenLog),errors});
 await page.screenshot({path:'work/raiden-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
