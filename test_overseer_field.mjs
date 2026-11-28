import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-24090501',quest='overseer-commission';
const hub='natlan-hub',quarry='natlan-quarry-road',approach='natlan-field',shelf='atocpan-lava-field',arena='atocpan-overseer-ruin';
const prefix=process.env.OVERSEER_TEST_PREFIX??'evidence/overseer-field',source='overseer-field-poses-source-v1.png';
const errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(55000);

async function gate(x,node){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.click();
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-8:a.x<=x+8;
  },{x,east});
 }finally{await page.keyboard.up(key)}
 await page.waitForFunction(node=>{
  const p=window.lab.frame.storyNearbyPortal;
  return p?.to===node&&p.available;
 },node);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}

async function freeze(move,form,first,last){
 await page.waitForFunction(({move,form,first,last})=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.move!==move||b.form!==form||b.tick<first||b.tick>=last||f.paused)return false;
  window.lab.action('pause');
  return true;
 },{move,form,first,last});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const current=await frame();
 assert.equal(current.fieldBoss.id,id);
 assert.equal(current.fieldBoss.form,form);
 assert.equal(current.fieldBoss.maxhp,1125);
 return current;
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/overseer-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 const start=await frame();
 assert.equal(start.companion.id,'wanderer');
 assert.deepEqual(start.loadout[0],['SK25']);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(1380,quarry);
 await gate(64,approach);
 await gate(1195,shelf);
 await gate(258,arena);
 assert.match((await frame()).location,/統御の遺構/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'overseerField',file:'overseer-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{
  const image=new Image();
  image.src='./assets/'+name;
  await image.decode();
 },source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let usedCryo=false,sawCooling=false;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.phase==='respawn'||f.returns>0||f.t-start>118){
    for(const code of [...held])hold(code,false);
    window.overseerResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,sawCooling,usedCryo};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   if(b?.form==='cooled')sawCooling=true;
   const t=b?.tick;
   const inWindow=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='FOV01'&&(inWindow(87,104)||inWindow(158,175)||inWindow(229,246))||
    b?.move==='FOV02'&&inWindow(94,122)||
    b?.move==='FOV03'&&(inWindow(137,158)||inWindow(223,244));
   const dx=(b?.x??915)-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const inReach=Math.abs(dx)<120&&!turn;
   const preparingCryo=b?.move==='FOV03'&&inWindow(270,326)&&!usedCryo;
   if(preparingCryo&&inReach&&a.ground&&!a.lock&&!f.macro&&inWindow(300,326)){
    window.lab.action('slot1');
    usedCryo=true;
   }
   hold('Space',jump);
   hold('KeyA',dx<-89||(turn&&dx<0));
   hold('KeyD',dx>89||(turn&&dx>0));
   hold('KeyJ',inReach&&!preparingCryo);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const wave=await freeze('FOV02','wave',129,145);
 assert.equal(wave.draws.filter(d=>d.source===source).length,2);
 await canvas.screenshot({path:prefix+'-wave.png'});
 await resume();
 const purge=await freeze('FOV03','purge',162,174);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/掃討モード・液流/);
 await canvas.screenshot({path:prefix+'-purge.png'});
 await resume();
 const png=await freeze('FOV03','cooled',334,346);
 assert.ok(png.fieldBoss.hp<purge.fieldBoss.hp);
 assert.ok(png.events.some(e=>e.kind==='hit'&&e.target===24090501&&e.element==='cryo'&&!e.reaction));
 assert.equal(png.draws.filter(d=>d.source===source).length,2);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/冷却中/);
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
 await resume();

 await page.waitForFunction(()=>window.overseerResult,undefined,{timeout:240000});
 const play=await page.evaluate(()=>window.overseerResult);
 assert.ok(play.won&&play.usedCryo&&play.sawCooling,JSON.stringify(play));
 assert.deepEqual(play.moves,['FOV01','FOV02','FOV03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,420);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,shelf);
 await gate(65,approach);
 await gate(552,quarry);
 await gate(1610,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[8200,540]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);
 assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',companion:'wanderer',play,scenery,questAcceptedInUi:true,
  questReport:{xp:8200,mora:540},sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  cooledJetAt:png.fieldBoss.tick,savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Overseer Chrome route, three attacks, Cryo cooling, comparison, quest and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,
  field:window.lab?.frame.fieldBoss,play:window.overseerResult})),errors);
 throw error;
}finally{await browser.close()}
