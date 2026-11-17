import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-22150101',quest='whisperer-nightmares-commission';
const hub='nod-town',road='nod-field',arena='nod-nightmare-shore';
const prefix='evidence/whisperer-nightmares-field',source='whisperer-nightmares-field-poses-source-v1.png';
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
 assert.equal(current.fieldBoss.maxhp,1340);
 assert.equal(current.draws.filter(d=>d.source===source).length,form==='rift'?0:form==='shield'?5:1);
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
  await fs.readFile('work/whisperer-nightmares-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 const start=await frame();
 assert.equal(start.companion.id,'wanderer');
 assert.deepEqual(start.loadout.slice(0,2),[['SK21'],['SK22']]);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(60,road);
 await gate(330,arena);
 assert.match((await frame()).location,/煙雲の山の昏き浜/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'nightmareField',file:'whisperer-nightmares-field-background-v1.png',state:'ready'});
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
   if(b?.phase==='respawn'||f.returns>0||f.t-start>180){
    for(const code of [...held])hold(code,false);
    window.nightmareResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,casts,down};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   if(b?.form==='down')down=true;
   const t=b?.tick;
   const windowOpen=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='FWN01'&&windowOpen(80,101)||
    b?.move==='FWN02'&&windowOpen(118,139)||
    b?.move==='FWN03'&&windowOpen(820,841);
   const dx=(b?.x??940)-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const inReach=Math.abs(dx)<119&&!turn;
   if(window.nightmareBreak&&b?.form==='shield'&&t>=64&&inReach&&a.ground&&!f.macro&&!jump&&f.t>=nextCast){
    window.lab.action(casts===0?'slot2':'slot1');
    nextCast=f.t+3.2;
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
 const rift=await freeze('rift',104);
 assert.equal(rift.fieldBoss.underground,true);
 await canvas.screenshot({path:prefix+'-rift.png'});
 await resume();
 const png=await freeze('shield',66);
 assert.match(png.fieldBoss.label,/暗黒のシールド/);
 assert.equal(png.fieldBoss.summons.length,4);
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
 await page.evaluate(()=>{window.nightmareBreak=true});
 await resume();
 const down=await freeze('down');
 assert.match(down.fieldBoss.label,/シールド破壊/);
 assert.ok(down.fieldBoss.tick<840);
 await canvas.screenshot({path:prefix+'-down.png'});
 await resume();

 await page.waitForFunction(()=>window.nightmareResult,undefined,{timeout:210000});
 const play=await page.evaluate(()=>window.nightmareResult);
 assert.ok(play.won&&play.down&&play.casts>=1,JSON.stringify(play));
 assert.deepEqual(play.moves,['FWN01','FWN02','FWN03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,475);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,road);
 await gate(1380,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[9200,630]);
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
  questReport:{xp:9200,mora:630},sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  riftX:rift.fieldBoss.x,shieldBrokenTick:down.fieldBoss.tick,savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Whisperer of Nightmares Chrome route, rift, shield, comparison, quest and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  play:window.nightmareResult,nearby:window.lab?.frame.storyNearbyPortal})),errors);
 throw error;
}finally{await browser.close()}
