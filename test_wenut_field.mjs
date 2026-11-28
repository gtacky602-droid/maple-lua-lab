import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {verifySumeruBossGuide} from './tools/browser_waypoint_test.mjs';

const earned=process.argv.includes('--earned');
const output=earned?'work/earned-sumeru-wenut':'evidence';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), prefix='wenut-field';
const id='boss-26130101', arena='wenut-field-cavern', quest='wenut-commission';
const {killXp}=JSON.parse(await fs.readFile('evidence/wenut-field-lua.json','utf8'));
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
 await page.evaluate(earnedRun=>{
  const held=new Set(),moves=new Set(),dodges=new Set();
  const warnings={FWN01:[104],FWN02:[104],FWN03:[152,202]};
  let prior='',lastTick=-1,used=new Set(),readyToAttack=!earnedRun;
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
    window.wenutFieldResult={seconds:+(f.t-start).toFixed(2),moves:[...moves],dodgeWindows:dodges.size,finished:b?.phase==='respawn',hp:a.hp,returns:f.returns};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(prior!==b.move||b.tick<lastTick){prior=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move)moves.add(b.move);
   if(b.move==='FWN03'&&b.tick>=240)readyToAttack=true;
   for(const at of warnings[b.move]||[]){
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){
     used.add(at);dodges.add(b.move+at);hold('ShiftLeft',true);hold('ShiftLeft',false);
    }
   }
   const dx=b.x-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',dx<-99||(turn&&dx<0));
   hold('KeyD',dx>99||(turn&&dx>0));
   hold('KeyJ',readyToAttack&&!b.underground&&Math.abs(dx)<125&&dx*a.dir>=0);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },earned);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile(earned?output+'/wenut-ready.json':'work/'+prefix+'-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active'&&window.lab.frame.story.node==='sumeru-hub',quest);
 let route;
 if(earned){
  const current=await frame();
  assert.equal(current.progression.level,72);
  assert.equal(current.story.quests['sum-kaveh-model'].status,'complete');
  assert.equal(current.story.quests['sum-nahida-map'].status,'complete');
  route=await verifySumeruBossGuide(page,arena,'sumeru-entry');
 }
 await gate(60,'sumeru-entry');
 await gate(800,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'wenutField',file:prefix+'-background-v1.png',state:'ready'});
 await walk(700);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FWN01'&&b.tick>=63&&b.tick<91;
 });
 await pause(true);
 const original=await frame(), before=original;
 assert.equal(original.fieldBoss.maxhp,1080);
 assert.ok(original.draws.some(d=>d.source==='wenut-field-poses-source-v1.png'));
 assert.equal(original.boss,undefined);
 await canvas.screenshot({path:output+'/'+prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.source==='wenut-field-poses-source-v1.png'));
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.64,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[original.t,original.t,original.fieldBoss.tick]);
 await canvas.screenshot({path:output+'/'+prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);
 await fight();
 await page.waitForFunction(()=>{
  const {fieldBoss:b,draws}=window.lab.frame;
  if(b?.move!=='FWN03'||b.tick<92||b.tick>=107||!b.underground||
   !draws.some(d=>d.w===38&&d.color==='#e3b572'))return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const hidden=await frame();
 assert.equal(hidden.fieldBoss.underground,true);
 assert.ok(hidden.fieldBoss.emergeTicks>0);
 assert.equal(hidden.fieldBoss.emergeTicks,114-hidden.fieldBoss.tick);
 assert.ok(hidden.draws.some(d=>d.color==='#302235'&&d.w===32&&Math.abs(d.x+16+hidden.camera-hidden.fieldBoss.emergeX)<.01));
 assert.match(await page.locator('#fieldBossLabel').innerText(),/砂の下.*出現まで[0-9.]+秒/);
 assert.ok(!hidden.draws.some(d=>d.source===prefix+'-poses-source-v1.png'));
 await canvas.screenshot({path:output+'/'+prefix+'-burrow.png'});
 await pause(false);
 await page.waitForFunction(()=>{
  const {fieldBoss:b,draws}=window.lab.frame;
  if(b?.move!=='FWN03'||b.tick<149||b.tick>=156||b.underground||
   !draws.some(d=>d.source==='wenut-field-poses-source-v1.png'&&d.h===27))return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const emerged=await frame();
 assert.ok(emerged.draws.some(d=>d.source===prefix+'-poses-source-v1.png'&&d.h===99));
 assert.equal(emerged.fieldBoss.x,hidden.fieldBoss.emergeX);
 assert.equal(emerged.fieldBoss.emergeTicks,undefined);
 await canvas.screenshot({path:output+'/'+prefix+'-orb.png'});
 let emergenceCommands;
 if(earned){
  await page.locator('#renderMode').selectOption('rect');
  await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.kind==='boss_sprite'));
  const standard=await frame();
  await page.locator('#renderMode').selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.72,standard.commands);
  const light=await frame();
  assert.deepEqual([standard.t,light.t,light.fieldBoss.x],[emerged.t,emerged.t,emerged.fieldBoss.x]);
  await canvas.screenshot({path:output+'/wenut-field-orb-light.png'});
  emergenceCommands={png:emerged.commands,standard:standard.commands,light:light.commands,
   emergenceX:hidden.fieldBoss.emergeX,hiddenCountdown:hidden.fieldBoss.emergeTicks};
  await page.locator('#renderMode').selectOption('sprite');
 }
 await pause(false);
 await page.waitForFunction(()=>window.wenutFieldResult,undefined,{timeout:140000});
 const play=await page.evaluate(()=>window.wenutFieldResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual([...play.moves].sort(),['FWN01','FWN02','FWN03']);
 assert.ok(play.dodgeWindows>=3);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[killXp,250]);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,'sumeru-entry');
 await gate(1380,'sumeru-hub');
 const beforeReport=await frame();
 await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[4400,320]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.fieldBosses[id].hp,0);
 assert.ok(saved.fieldBosses[id].waitTicks>0);
 if(earned){
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開'));
  const current=await frame();
  assert.equal(current.story.node,'sumeru-hub');
  assert.equal(current.story.quests[quest].status,'complete');
  assert.equal(current.story.quests[quest].cycles,1);
  assert.equal(current.endgame.bosses[id].clears,1);
 }
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('風蝕ウェネト');
 const row=page.locator('[data-encounter="'+id+'"]');
 assert.equal(await row.getByRole('link',{name:/風蝕の砂洞/}).getAttribute('href'),'map-art.html?node='+arena);
 assert.equal(await row.getByRole('button',{name:'模擬戦に挑戦'}).count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(earned?'evidence/earned-sumeru-wenut-browser.json':'evidence/'+prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',play,...(earned?{levelAtEntry:72,route,emergenceCommands,commissionRestored:true}:{}),fieldKill:{xp:killXp,mora:250},commissionReport:{xp:4400,mora:320},
  persistedCooldown:true,
  sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},hiddenWithMarker:true,visibleHeadAndFirstWindOrb:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Wenut field Chrome route, all moves, clear, report, save passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,node:window.lab?.frame.story.node,
  play:window.wenutFieldResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
