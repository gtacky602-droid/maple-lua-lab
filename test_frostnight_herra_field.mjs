import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-20081001',quest='frostnight-herra-commission';
const hub='nod-town',road='nod-field',arena='nod-herra-terrace';
const prefix='evidence/frostnight-herra-field',source='frostnight-herra-field-poses-source-v1.png';
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

async function freeze(form,afterTick=0){
 await page.waitForFunction(({form,afterTick})=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.form!==form||b.tick<afterTick||f.paused)return false;
  window.lab.action('pause');
  return true;
 },{form,afterTick},{timeout:90000});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const current=await frame();
 assert.equal(current.fieldBoss.id,id);
 assert.equal(current.fieldBoss.form,form);
 assert.equal(current.fieldBoss.maxhp,1200);
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
  await fs.readFile('work/frostnight-herra-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 const start=await frame();
 assert.equal(start.companion.id,'wanderer');
 assert.deepEqual(start.loadout.slice(0,2),[['SK25'],['SK26']]);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(60,road);
 await gate(510,arena);
 assert.match((await frame()).location,/霜夜の石壇/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'herraField',file:'frostnight-herra-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{
  const img=new Image();
  img.src='./assets/'+name;
  await img.decode();
 },source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let down=false,casts=0,nextCast=0;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.phase==='respawn'||f.returns>0||f.t-start>120){
    for(const code of [...held])hold(code,false);
    window.herraResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,casts,down};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   if(b?.form==='down')down=true;
   const t=b?.tick;
   const windowOpen=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='FHR01'&&(windowOpen(88,109)||windowOpen(154,175))||
    b?.move==='FHR02'&&windowOpen(117,139)||
    b?.move==='FHR03'&&(!window.herraDispel||down)&&(windowOpen(164,185)||windowOpen(252,273));
   const dx=(b?.x??920)-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const inReach=Math.abs(dx)<115&&!turn;
   if(window.herraDispel&&b?.form==='gloom'&&inReach&&a.ground&&!f.macro&&!jump&&f.t>=nextCast&&casts<3){
    window.lab.action(casts===1?'slot2':'slot1');
    nextCast=f.t+(casts===0?0.65:2.54);
    casts++;
   }
   hold('Space',jump);
   hold('KeyA',dx<-78||(turn&&dx<0));
   hold('KeyD',dx>78||(turn&&dx>0));
   hold('KeyJ',inReach&&down);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const leap=await freeze('airborne',115);
 assert.ok(leap.fieldBoss.y<365);
 await canvas.screenshot({path:prefix+'-air.png'});
 await resume();
 const png=await freeze('gloom');
 assert.match(png.fieldBoss.label,/薄闇・氷／月 0／3/);
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
 await page.evaluate(()=>{window.herraDispel=true});
 await resume();
 const down=await freeze('down');
 assert.match(down.fieldBoss.label,/薄闇解除/);
 assert.ok(down.fieldBoss.tick<324);
 await canvas.screenshot({path:prefix+'-down.png'});
 await resume();

 await page.waitForFunction(()=>window.herraResult,undefined,{timeout:210000});
 const play=await page.evaluate(()=>window.herraResult);
 assert.ok(play.won&&play.down&&play.casts===3,JSON.stringify(play));
 assert.deepEqual(play.moves,['FHR01','FHR02','FHR03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,465);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,road);
 await gate(1380,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[9000,610]);
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
  questReport:{xp:9000,mora:610},sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  flightY:leap.fieldBoss.y,dispelTick:down.fieldBoss.tick,savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Frostnight Herra Chrome route, flight, gloom, comparison, quest and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  play:window.herraResult,nearby:window.lab?.frame.storyNearbyPortal})),errors);
 throw error;
}finally{await browser.close()}
