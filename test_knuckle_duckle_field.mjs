import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-24100101',quest='knuckle-duckle-commission';
const hub='nod-town',road='nod-field',arena='nod-duckle-workyard';
const prefix='evidence/knuckle-duckle-field',source='knuckle-duckle-field-poses-source-v1.png';
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
 assert.equal(current.fieldBoss.maxhp,1135);
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
  await fs.readFile('work/knuckle-duckle-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 const start=await frame();
 assert.equal(start.companion.id,'wanderer');
 assert.deepEqual(start.loadout[0],['SK17']);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(60,road);
 await gate(1110,arena);
 assert.match((await frame()).location,/工房裏の試運転場/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'duckleField',file:'knuckle-duckle-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{
  const img=new Image();
  img.src='./assets/'+name;
  await img.decode();
 },source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),destroyed=new Set(),start=window.lab.frame.t;
  let usedSkill=false,started=false,down=false;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   for(const e of f.events??[]){
    if(e.kind==='object_destroyed'&&[-24100102,-24100103].includes(e.target))destroyed.add(e.target);
    if(e.kind==='cast:SK17'&&e.t>=start)started=true;
   }
   if(b?.phase==='respawn'||f.returns>0||f.t-start>128){
    for(const code of [...held])hold(code,false);
    window.duckResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,down,usedSkill,started,destroyed:[...destroyed]};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   if(b?.form==='down')down=true;
   const t=b?.tick;
   const inWindow=(first,last)=>t>=first&&t<last;
   if(!down&&b?.move==='FDK03'&&inWindow(69,225)&&!started){
    const distance=b.x-a.x;
    hold('Space',false);hold('KeyJ',false);
    hold('KeyA',distance<204&&!usedSkill);
    hold('KeyD',distance>=204&&a.dir<0);
    if(distance>=198&&a.dir>0&&!usedSkill){window.lab.action('slot1');usedSkill=true}
    requestAnimationFrame(control);
    return;
   }
   const jump=b?.move==='FDK01'&&(inWindow(80,98)||inWindow(149,167))||
    b?.move==='FDK02'&&inWindow(107,125)||b?.move==='FDK03'&&inWindow(317,337);
   const dx=(b?.x??920)-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('Space',jump);
   hold('KeyA',dx<-87||(turn&&dx<0));
   hold('KeyD',dx>87||(turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<118&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const air=await freeze('FDK02','airborne',108,124);
 assert.ok(air.fieldBoss.y<430);
 await canvas.screenshot({path:prefix+'-air.png'});
 await resume();
 const png=await freeze('FDK03','guard',64,82);
 assert.equal(png.fieldBoss.summons.length,2);
 assert.equal(png.draws.filter(d=>d.source===source).length,3);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/メカダック/);
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
 await resume();
 const down=await freeze('FDK03','down',65,340);
 assert.equal(down.fieldBoss.summons,undefined);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/バリアが割れた/);
 await canvas.screenshot({path:prefix+'-down.png'});
 await resume();

 await page.waitForFunction(()=>window.duckResult,undefined,{timeout:240000});
 const play=await page.evaluate(()=>window.duckResult);
 assert.ok(play.won&&play.down&&play.started,JSON.stringify(play));
 assert.equal(play.destroyed.length,2);
 assert.deepEqual(play.moves,['FDK01','FDK02','FDK03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,445);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,road);
 await gate(1380,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[8500,570]);
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
  questReport:{xp:8500,mora:570},sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  twoMechaDucksAt:png.fieldBoss.tick,wardBrokenBy:down.fieldBoss.tick,savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Knuckle Duckle Chrome route, two repair units, comparison, victory, report and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  play:window.duckResult,nearby:window.lab?.frame.storyNearbyPortal})),errors);
 throw error;
}finally{await browser.close()}
