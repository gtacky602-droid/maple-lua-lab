import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureNumberedFieldWarning} from './tools/browser_waypoint_test.mjs';

const route=process.argv.includes('--stop')?'stop':process.argv.includes('--merge')?'merge':null;
const output=route?'work/earned-fontaine-tulpa':'evidence';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), prefix='tulpa-field';
const id='boss-20051201', arena='tulpa-field-grotto', quest='tulpa-commission';
const {killXp}=JSON.parse(await fs.readFile('evidence/tulpa-field-lua.json','utf8'));
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(20000);
const frame=()=>page.evaluate(()=>window.lab.frame);

async function walk(x){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.click();
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-7:a.x<=x+7;
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

async function fight(){
 await page.evaluate(route=>{
  const held=new Set(),moves=new Set(),dodges=new Set();
  const warnings={FHT01:[],FHT02:[152],FHT03:[]};
  let prior='',lastTick=-1,used=new Set();
  const start=window.lab.frame.t;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||f.returns>0||f.t-start>130){
    for(const code of [...held])hold(code,false);
    window.tulpaFieldResult={seconds:+(f.t-start).toFixed(2),moves:[...moves],dodgeWindows:dodges.size,finished:b?.phase==='respawn',hp:a.hp,returns:f.returns};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(prior!==b.move||b.tick<lastTick){prior=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move)moves.add(b.move);
   for(const at of warnings[b.move]||[]){
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){
     used.add(at);dodges.add(b.move+at);hold('ShiftLeft',true);hold('ShiftLeft',false);
    }
   }
   const half=route==='stop'&&b.summon?.hp>0?b.summon:null;
   const dx=(half?.x??b.x)-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const jump=(b.move==='FHT01'&&b.tick>=76&&b.tick<109)||
    (b.move==='FHT02'&&b.tick>=77&&b.tick<113)||(b.move==='FHT03'&&b.tick>=181&&b.tick<215);
   if(jump)dodges.add(b.move+'jump');
   hold('Space',jump);
   const distance=half?58:99;
   hold('KeyA',dx<-distance||(turn&&dx<0));
   hold('KeyD',dx>distance||(turn&&dx>0));
   hold('KeyJ',(!route||half||window.tulpaCounterReady)&&Math.abs(dx)<(half?94:125)&&dx*a.dir>=0);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },route);
}

function shot(name){
 return canvas.screenshot({path:`${output}/${prefix}${route?'-'+route:''}-${name}.png`});
}

async function compareHalf(summoned){
 const menu=page.locator('#renderMode');
 const timer=f=>f.draws.find(d=>d.kind==='rect'&&d.color==='#a6eee7'&&d.h===3);
 assert.ok(timer(summoned));
 assert.equal(summoned.fieldBoss.summonTicks,174-summoned.fieldBoss.tick);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/合流まで \d+\.\d秒/);
 await menu.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n*3,summoned.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.75,standard.commands);
 const light=await frame();
 for(const view of [standard,light]){
  assert.equal(view.t,summoned.t);
  assert.equal(view.fieldBoss.summonTicks,summoned.fieldBoss.summonTicks);
  assert.deepEqual(timer(view),timer(summoned));
 }
 await shot('half-light');
 await menu.selectOption('sprite');
 await page.waitForFunction(n=>window.lab.frame.commands===n,summoned.commands);
 return {png:summoned.commands,standard:standard.commands,light:light.commands,summonTicks:summoned.fieldBoss.summonTicks};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile(route?output+'/tulpa-ready.json':'work/'+prefix+'-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active'&&window.lab.frame.story.node==='fontaine-hub',quest);
 const entryLevel=(await frame()).progression.level;
 if(route==='merge'){
  const ally=page.locator('#allyFire');
  if((await ally.getAttribute('aria-pressed'))!=='true')await ally.click();
  await page.waitForFunction(()=>document.getElementById('allyFire').getAttribute('aria-pressed')==='true');
 }
 await gate(1380,'fontaine-field');
 await gate(320,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'tulpaField',file:prefix+'-background-v1.png',state:'ready'});
 await walk(700);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FHT01'&&b.tick>=63&&b.tick<91;
 });
 await pause(true);
 const original=await frame(), before=original;
 assert.equal(original.fieldBoss.maxhp,1030);
 assert.equal(original.fieldBoss.form,'water');
 assert.ok(original.draws.some(d=>d.source==='tulpa-field-poses-source-v1.png'));
 assert.equal(original.boss,undefined);
 await shot('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.source==='tulpa-field-poses-source-v1.png'));
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.64,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[original.t,original.t,original.fieldBoss.tick]);
 await shot('light');
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);
 await fight();
 const hammer=route?await captureNumberedFieldWarning(page,{
  move:'FHT02',before:102,color:'#fff1b0',count:2,output:output+'/'+route+'-water-hammer'
 }):null;
 await page.waitForFunction(()=>{
  const {fieldBoss:b,draws}=window.lab.frame;
  if(b?.move!=='FHT03'||!b.summon||b.tick<56||b.tick>=92||
    !draws.some(d=>d.source==='tulpa-field-poses-source-v1.png'&&d.h===46))return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const summoned=await frame();
 assert.equal(summoned.fieldBoss.summon.maxhp,26);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/半身が接近/);
 await shot('half');
 const halfProfiles=route?await compareHalf(summoned):null;
 await pause(false);
 await page.waitForFunction(()=>{
  const {fieldBoss:b}=window.lab.frame;
  if(b?.move!=='FHT03'||b.summon||b.tick<181||b.tick>=218)return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const resolution=await frame();
 const mergeOutcome=resolution.fieldBoss.label;
 assert.match(mergeOutcome,/合流済み|合流を阻止/);
 assert.equal(resolution.fieldBoss.summonTicks,undefined);
 let surgeWidth;
 if(route){
  assert.match(mergeOutcome,route==='stop'?/合流を阻止/:/合流済み/);
  const band=resolution.draws.find(d=>d.kind==='rect'&&d.color==='#8de7ff'&&d.w>100&&d.h===2);
  surgeWidth=+band.w.toFixed(2);
  assert.equal(surgeWidth,route==='stop'?158.4:316.8);
  assert.equal(resolution.kills,original.kills);
  assert.equal(resolution.progression.killXp,original.progression.killXp);
  assert.equal(resolution.mora,original.mora);
  await page.evaluate(()=>{window.tulpaCounterReady=true});
 }
 await shot('merge');
 await pause(false);
 await page.waitForFunction(()=>window.tulpaFieldResult,undefined,{timeout:140000});
 const play=await page.evaluate(()=>window.tulpaFieldResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual(play.moves,['FHT01','FHT02','FHT03']);
 assert.ok(play.dodgeWindows>=3);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[killXp,315]);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,'fontaine-field');
 await gate(60,'fontaine-hub');
 const beforeReport=await frame();
 await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[5600,390]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.fieldBosses[id].hp,0);
 assert.ok(saved.fieldBosses[id].waitTicks>0);
 if(route){
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
  const restored=await frame();
  assert.equal(restored.endgame.bosses[id].clears,1);
  assert.equal(restored.story.quests[quest].cycles,1);
  assert.equal(restored.story.quests['fon-emilie-scent'].status,'complete');
 }
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('水形タルパ');
 const row=page.locator('[data-encounter="'+id+'"]');
 assert.equal(await row.getByRole('link',{name:/潮影の洞/}).getAttribute('href'),'map-art.html?node='+arena);
 assert.equal(await row.getByRole('button',{name:'模擬戦に挑戦'}).count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 const reportPath=route?`evidence/earned-fontaine-tulpa-${route}-browser.json`:'evidence/'+prefix+'-browser.json';
 await fs.writeFile(reportPath,JSON.stringify({
  browser:'Chrome',play,fieldKill:{xp:killXp,mora:315},commissionReport:{xp:5600,mora:390},
  persistedCooldown:true,
  sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},
  summonWasVisible:true,mergeOutcome,viewport390:true,errors,
  ...(route?{route,entryLevel,hammer,halfProfiles,surgeWidth,restoredCommission:true}:{})
 },null,2)+'\n');
 console.log('Tulpa field Chrome route, all moves, clear, report, save passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,node:window.lab?.frame.story.node,
  play:window.tulpaFieldResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
