import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), id='boss-26140101', quest='legatus-commission';
const hub='fontaine-hub', approach='nostoi-castle-approach', arena='legatus-field-hall';
const prefix='evidence/legatus-field', source='legatus-field-poses-source-v1.png';
const errors=[], frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(60000);

async function walk(x){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.click();
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-8:a.x<=x+8;
  },{x,east});
 }finally{await page.keyboard.up(key)}
}

async function gate(x,node){
 await walk(x);
 await page.waitForFunction(node=>{
  const p=window.lab.frame.storyNearbyPortal;
  return p?.to===node&&p.available;
 },node);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}

async function pause(value){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(value=>window.lab.frame.paused===value,value);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/legatus-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(({hub,quest})=>window.lab.frame.story.node===hub&&
  window.lab.frame.story.quests[quest]?.status==='active',{hub,quest});
 await gate(820,approach);
 await gate(1050,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'legatusField',file:'legatus-field-background-v1.png',state:'ready'});
 await walk(700);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FLG01'&&b.tick>=54&&b.tick<90;
 });
 await pause(true);
 const png=await frame();
 assert.equal(png.fieldBoss.maxhp,1010);
 assert.ok(png.draws.some(d=>d.source===source));
 await page.evaluate(async name=>{
  const image=new Image();
  image.src='./assets/'+name;
  await image.decode();
 },source);
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[png.t,png.t,png.fieldBoss.tick]);
 await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);

 await page.evaluate(()=>{
  const held=new Set(),moves=new Set();
  const start=window.lab.frame.t;
  let dodged=false,lastMove;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||f.returns>0||f.t-start>135){
    for(const code of [...held])hold(code,false);
    window.legatusResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),
     moves:[...moves],hp:a.hp,returns:f.returns};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(lastMove!==b.move){dodged=false;lastMove=b.move}
   if(b.move)moves.add(b.move);
   const target=b.summon||b,dx=target.x-a.x;
   const turn=Math.abs(dx)>8&&dx*a.dir<0;
   const jump=b.move==='FLG01'&&b.tick>=76&&b.tick<89||
    b.move==='FLG02'&&b.tick>=90&&b.tick<119;
   if(b.move==='FLG02'&&b.tick>=106&&b.tick<144&&Math.abs(dx)<90&&!turn&&!dodged){
    dodged=true;
    hold('ShiftLeft',true);hold('ShiftLeft',false);
   }
   const approach=b.summon?58:96;
   hold('Space',jump);
   hold('KeyA',dx<-approach||(turn&&dx<0));
   hold('KeyD',dx>approach||(turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<(b.summon?95:120)&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });

 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  if(b?.move!=='FLG03'||!b.summon||b.tick>=83)return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const signal=await frame();
 assert.equal(signal.fieldBoss.summon.maxhp,14);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/共鳴器を壊すと炎を止められる/);
 await canvas.screenshot({path:prefix+'-resonator.png'});
 await pause(false);
 await page.waitForFunction(()=>window.legatusResult,undefined,{timeout:300000});
 const play=await page.evaluate(()=>window.legatusResult);
 assert.ok(play.won,JSON.stringify(play));
 assert.deepEqual(play.moves,['FLG01','FLG02','FLG03']);
 const defeated=await frame();
 assert.equal(defeated.mora-png.mora,335);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,approach);
 await gate(65,hub);
 const before=await frame();
 await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-before.progression.questXp,report.mora-before.mora],[6200,420]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);
 assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',play,scenery,resonatorWasVisible:true,questReport:{xp:6200,mora:420},
  sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Legatus Chrome route, all moves, render comparison, clear, report and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,
  field:window.lab?.frame.fieldBoss,play:window.legatusResult})),errors);
 throw error;
}finally{await browser.close()}
