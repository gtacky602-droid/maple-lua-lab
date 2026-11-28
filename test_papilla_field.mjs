import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-22120101',quest='papilla-commission';
const hub='natlan-hub',approach='natlan-field',arena='papilla-field-hollow';
const prefix='evidence/papilla-field',source='papilla-field-poses-source-v1.png';
const errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(45000);

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

async function freeze(move,form,fromTick){
 await page.waitForFunction(({move,form,fromTick})=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.move!==move||b.form!==form||b.tick<fromTick||f.paused)return false;
  window.lab.action('pause');
  return true;
 },{move,form,fromTick});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const current=await frame();
 assert.equal(current.fieldBoss.id,id);
 assert.equal(current.fieldBoss.form,form);
 assert.equal(current.fieldBoss.maxhp,1050);
 assert.equal(current.draws.filter(d=>d.source===source).length,1);
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
  await fs.readFile('work/papilla-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 assert.equal((await frame()).companion.id,'columbina');
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(1380,'natlan-quarry-road');
 await gate(64,approach);
 await gate(235,arena);
 assert.match((await frame()).location,/紫影の石窟/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'papillaField',file:'papilla-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{
  const image=new Image();
  image.src='./assets/'+name;
  await image.decode();
 },source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let priorHp=Infinity;
  let hpMonotonic=true;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.phase==='respawn'||f.returns>0||f.t-start>115){
    for(const code of [...held])hold(code,false);
    window.papillaResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),
     moves:[...moves],hp:a.hp,returns:f.returns,hpMonotonic};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   if(b){hpMonotonic=hpMonotonic&&b.hp<=priorHp;priorHp=b.hp}
   const t=b?.tick;
   const inWindow=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='FMP01'&&inWindow(110,126)||
    b?.move==='FMP02'&&(inWindow(104,120)||inWindow(164,180))||
    b?.move==='FMP03'&&inWindow(110,126);
   const dx=(b?.x??890)-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('Space',jump);
   hold('KeyA',dx<-86||(turn&&dx<0));
   hold('KeyD',dx>86||(turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<117&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });

 const stem=await freeze('FMP01','stem',132);
 await canvas.screenshot({path:prefix+'-stem.png'});
 await resume();
 const wing=await freeze('FMP02','wing',70);
 assert.ok(wing.fieldBoss.hp<=stem.fieldBoss.hp);
 await canvas.screenshot({path:prefix+'-wing.png'});
 await resume();
 const png=await freeze('FMP03','airborne',112);
 assert.ok(png.fieldBoss.hp<=wing.fieldBoss.hp);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/着地点/);
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

 await page.waitForFunction(()=>window.papillaResult,undefined,{timeout:240000});
 const play=await page.evaluate(()=>window.papillaResult);
 assert.ok(play.won&&play.hpMonotonic,JSON.stringify(play));
 assert.deepEqual(play.moves,['FMP01','FMP02','FMP03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,395);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,approach);
 await gate(552,'natlan-quarry-road');
 await gate(1610,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[7800,500]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);
 assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',companion:'columbina',play,scenery,sameActorId:id,questAcceptedInUi:true,
  hpByForm:[stem,wing,png].map(f=>({form:f.fieldBoss.form,hp:f.fieldBoss.hp})),
  questReport:{xp:7800,mora:500},sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  fungusAirborneAt:png.fieldBoss.tick,savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Type I Papilla Chrome route, three forms, same-frame comparison, victory, report and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,
  field:window.lab?.frame.fieldBoss,play:window.papillaResult})),errors);
 throw error;
}finally{await browser.close()}
