import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-23090101',quest='battleship-commission';
const hub='nod-town',road='nod-field',arena='nod-battleship-depot';
const prefix='evidence/battleship-field',source='battleship-field-poses-source-v1.png';
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

async function freeze(form,label){
 await page.waitForFunction(({form,label})=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.form!==form||!b.label?.startsWith(label)||f.paused)return false;
  window.lab.action('pause');
  return true;
 },{form,label});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const current=await frame();
 assert.equal(current.fieldBoss.id,id);
 assert.equal(current.fieldBoss.form,form);
 assert.equal(current.fieldBoss.maxhp,1170);
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
  await fs.readFile('work/battleship-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 const start=await frame();
 assert.equal(start.companion.id,'wanderer');
 assert.deepEqual(start.loadout.slice(0,2),[['SK21'],['SK22']]);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(60,road);
 await gate(945,arena);
 assert.match((await frame()).location,/陸巡艦の整備庫/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'battleshipField',file:'battleship-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{
  const img=new Image();
  img.src='./assets/'+name;
  await img.decode();
 },source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let phase='base',nextCast=start,melting=false,down=false;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.phase==='respawn'||f.returns>0||f.t-start>124){
    for(const code of [...held])hold(code,false);
    window.shipResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,melting,down};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   if(phase==='base'&&b?.move==='FBT02'&&b.tick>=225)phase='heating';
   if(phase==='heating'&&b?.label.startsWith('過熱'))phase='hot';
   if(b?.form==='shield')phase='ward';
   if(b?.form==='down'){phase='finish';down=true}
   const t=b?.tick;
   const inWindow=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='FBT01'&&inWindow(93,111)||
    b?.move==='FBT02'&&(inWindow(95,113)||inWindow(162,181))||
    b?.move==='FBT03'&&inWindow(229,248);
   const dx=(b?.x??930)-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const inReach=Math.abs(dx)<119&&!turn;
   if(inReach&&a.ground&&!f.macro&&!jump&&f.t>=nextCast){
    if(phase==='heating'||phase==='hot'&&window.shipContinueHeating){
     window.lab.action('slot1');
     nextCast=f.t+2.9;
    }
    if(phase==='ward'&&window.shipBreakWard&&!melting){
     window.lab.action('slot2');
     melting=true;
    }
   }
   hold('Space',jump);
   hold('KeyA',dx<-88||(turn&&dx<0));
   hold('KeyD',dx>88||(turn&&dx>0));
   hold('KeyJ',inReach&&(phase!=='ward'||melting&&t>=132));
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const hot=await freeze('idle','過熱');
 await canvas.screenshot({path:prefix+'-heated.png'});
 await page.evaluate(()=>{window.shipContinueHeating=true});
 await resume();
 const png=await freeze('shield','冷却中・氷バリア');
 assert.ok(png.fieldBoss.hp<hot.fieldBoss.hp);
 assert.equal(png.fieldBoss.move,'FBT03');
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
 await page.evaluate(()=>{window.shipBreakWard=true});
 await resume();
 const down=await freeze('down','氷バリア破壊');
 assert.ok(down.fieldBoss.tick<252);
 assert.ok(down.events.some(e=>e.kind==='cast:SK22'&&e.t>=png.t));
 await canvas.screenshot({path:prefix+'-down.png'});
 await resume();

 await page.waitForFunction(()=>window.shipResult,undefined,{timeout:240000});
 const play=await page.evaluate(()=>window.shipResult);
 assert.ok(play.won&&play.down&&play.melting,JSON.stringify(play));
 assert.deepEqual(play.moves,['FBT01','FBT02','FBT03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,455);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,road);
 await gate(1380,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[8800,590]);
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
  questReport:{xp:8800,mora:590},sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  wardBrokenAt:down.fieldBoss.tick,savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Battleship Chrome route, overheat and breakable Cryo ward, comparison, quest and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  play:window.shipResult,nearby:window.lab?.frame.storyNearbyPortal})),errors);
 throw error;
}finally{await browser.close()}
