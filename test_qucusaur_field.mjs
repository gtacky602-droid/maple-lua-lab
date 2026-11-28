import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), id='boss-26230301', quest='qucusaur-commission';
const hub='natlan-hub', approach='natlan-field', arena='qucusaur-field-cavern';
const quarry='natlan-quarry-road';
const prefix='evidence/qucusaur-field', source='qucusaur-field-poses-source-v1.png';
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
  await fs.readFile('work/qucusaur-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(1380,quarry);
 await gate(64,approach);
 await gate(1030,arena);
 assert.match((await frame()).location,/金焔の岩窟/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'qucusaurField',file:'qucusaur-field-background-v1.png',state:'ready'});
 await walk(705);
 const beforeFight=await frame();
 assert.equal(beforeFight.fieldBoss.maxhp,1020);
 await page.evaluate(async name=>{
  const image=new Image();
  image.src='./assets/'+name;
  await image.decode();
 },source);

 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||f.returns>0||f.t-start>115){
    for(const code of [...held])hold(code,false);
    window.qucusaurResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),
     moves:[...moves],hp:a.hp,returns:f.returns};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b.move)moves.add(b.move);
   const target=b.summon||b,dx=target.x-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0,t=b.tick;
   const inWindow=(first,last)=>t>=first&&t<last;
   const jump=b.move==='FQT01'&&inWindow(75,88)||
    b.move==='FQT02'&&(inWindow(75,92)||inWindow(136,153))||
    b.move==='FQT03'&&!b.summon&&(inWindow(199,220)||inWindow(279,300));
   const reach=b.summon?54:85;
   hold('Space',jump);
   hold('KeyA',dx<-reach||(turn&&dx<0));
   hold('KeyD',dx>reach||(turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<119&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });

 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  if(b?.move!=='FQT03'||b.form!=='gold'||!b.summon||b.tick>=94)return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame();
 assert.equal(png.fieldBoss.summon.maxhp,14);
 assert.ok(png.fieldBoss.y<400 && png.draws.filter(d=>d.source===source).length===2);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/羽根を壊すと飛行が止まる/);
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await page.waitForFunction(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[png.t,png.t,png.fieldBoss.tick]);
 await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);

 await page.waitForFunction(()=>window.qucusaurResult,undefined,{timeout:260000});
 const play=await page.evaluate(()=>window.qucusaurResult);
 assert.ok(play.won,JSON.stringify(play));
 assert.deepEqual(play.moves,['FQT01','FQT02','FQT03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,360);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,approach);
 await gate(552,quarry);
 await gate(1610,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[7200,460]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);
 assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',play,scenery,questAcceptedInUi:true,questReport:{xp:7200,mora:460},
  sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  goldAndFeatherAt:{tick:png.fieldBoss.tick,y:png.fieldBoss.y,hp:png.fieldBoss.summon.hp},
  savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Goldflame Qucusaur Chrome quest, route, all moves, comparison, clear, report and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,
  field:window.lab?.frame.fieldBoss,play:window.qucusaurResult})),errors);
 throw error;
}finally{await browser.close()}
