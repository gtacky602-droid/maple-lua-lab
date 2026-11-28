import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-26270301',quest='lava-dragon-commission';
const hub='natlan-hub',approach='natlan-field',arena='atocpan-lava-field';
const prefix='evidence/lava-dragon-field',source='lava-dragon-field-poses-source-v1.png';
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

async function freeze(form,move,fromTick=0){
 await page.waitForFunction(({form,move,fromTick})=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.form!==form||f.paused||(move&&(b.move!==move||b.tick<fromTick)))return false;
  window.lab.action('pause');
  return true;
 },{form,move,fromTick});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const current=await frame();
 assert.equal(current.fieldBoss.id,id);
 assert.equal(current.fieldBoss.form,form);
 assert.equal(current.fieldBoss.maxhp,1100);
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
  await fs.readFile('work/lava-dragon-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 const start=await frame();
 assert.equal(start.companion.id,'wanderer');
 assert.deepEqual(start.loadout.slice(0,2),[['SK21'],['SK17']]);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(1380,'natlan-quarry-road');
 await gate(64,approach);
 await gate(1195,arena);
 assert.match((await frame()).location,/アトクパンの溶岩棚/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'lavaDragonField',file:'lava-dragon-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{
  const image=new Image();
  image.src='./assets/'+name;
  await image.decode();
 },source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),forms=new Set(),start=window.lab.frame.t;
  let step='rock',overburnAt,coolingTime,waterHit=false;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.phase==='respawn'||f.returns>0||f.t-start>118){
    for(const code of [...held])hold(code,false);
    window.lavaResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     forms:[...forms],hp:a.hp,returns:f.returns,coolingTime,waterHit};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   if(b?.form)forms.add(b.form);
   const t=b?.tick;
   if(step==='rock'&&b?.move==='FLD02'&&t>=215)step='heatRock';
   if(step==='heatRock'&&b?.form==='molten')step='molten';
   if(step==='molten'&&b?.move==='FLD04'&&t>=233)step='heatMolten';
   if(step==='heatMolten'&&b?.form==='overburn'){step='overburn';overburnAt=f.t}
   if(step==='overburn'&&b?.form==='rock'){
    step='finish';
    coolingTime=+(f.t-overburnAt).toFixed(2);
    waterHit=f.events.some(e=>e.kind==='hit'&&e.target===26270301&&e.element==='hydro'&&e.t>=overburnAt);
   }
   const inWindow=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='FLD01'&&inWindow(87,104)||
    b?.move==='FLD02'&&(inWindow(88,104)||inWindow(154,170))||
    b?.move==='FLD03'&&inWindow(88,106)||
    b?.move==='FLD04'&&(inWindow(103,125)||inWindow(169,191));
   const dx=(b?.x??925)-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const inReach=Math.abs(dx)<120&&!turn;
   if(inReach&&a.ground&&!f.macro&&!a.lock&&!jump){
    if(step==='heatRock'||step==='heatMolten')window.lab.action('slot1');
    if(step==='overburn'&&window.lavaAllowCooling)window.lab.action('slot2');
   }
   hold('Space',jump);
   hold('KeyA',dx<-84||(turn&&dx<0));
   hold('KeyD',dx>84||(turn&&dx>0));
   hold('KeyJ',inReach&&['rock','molten','finish'].includes(step));
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });

 const rock=await freeze('rock','FLD01',108);
 await canvas.screenshot({path:prefix+'-rock.png'});
 await resume();
 const png=await freeze('molten','FLD04',128);
 assert.ok(png.fieldBoss.hp<rock.fieldBoss.hp);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/熔焰の龍/);
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
 const hot=await freeze('overburn',null);
 assert.ok(hot.fieldBoss.hp<png.fieldBoss.hp);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/過燃焼/);
 await canvas.screenshot({path:prefix+'-overburn.png'});
 await page.evaluate(()=>{window.lavaAllowCooling=true});
 await resume();

 await page.waitForFunction(()=>window.lavaResult,undefined,{timeout:240000});
 const play=await page.evaluate(()=>window.lavaResult);
 assert.ok(play.won&&play.waterHit&&play.coolingTime<2.7,JSON.stringify(play));
 assert.deepEqual(play.moves,['FLD01','FLD02','FLD03','FLD04']);
 assert.deepEqual(play.forms,['rock','molten','overburn']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,410);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,approach);
 await gate(552,'natlan-quarry-road');
 await gate(1610,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[8000,520]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);
 assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',companion:'wanderer',play,scenery,sameActorId:id,questAcceptedInUi:true,
  hpByState:[rock,png,hot].map(f=>({form:f.fieldBoss.form,hp:f.fieldBoss.hp})),
  questReport:{xp:8000,mora:520},sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  eruptionShownAt:png.fieldBoss.tick,savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Lava Dragon Chrome route, heat and cooling, comparison, victory, report and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,
  field:window.lab?.frame.fieldBoss,play:window.lavaResult})),errors);
 throw error;
}finally{await browser.close()}
