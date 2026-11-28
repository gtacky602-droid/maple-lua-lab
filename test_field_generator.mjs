import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const earned=process.argv.includes('--earned');
const output=earned?'work/earned-fontaine-generator':'evidence';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), prefix='field-generator-field';
const id='boss-24080101', arena='field-generator-field-chamber', quest='field-generator-commission';
const {killXp}=JSON.parse(await fs.readFile('evidence/field-generator-field-lua.json','utf8'));
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

async function jumpApex(){
 await canvas.click();
 await page.evaluate(()=>{
  const start=window.lab.frame.actors[0].y;
  let min=start;
  window.jumpApexResult=null;
  const sample=()=>{
   const y=window.lab.frame.actors[0].y;
   min=Math.min(min,y);
   if(min<start-15&&y>min+4){
    window.jumpApexResult=+(start-min).toFixed(2);
    return;
   }
   requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
 });
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(()=>Number.isFinite(window.jumpApexResult));
  return await page.evaluate(()=>window.jumpApexResult);
 }finally{await page.keyboard.up('Space')}
}

async function fight(){
 await page.evaluate(earned=>{
  const held=new Set(),moves=new Set(),dodges=new Set();
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
    window.generatorFieldResult={seconds:+(f.t-start).toFixed(2),moves:[...moves],dodgeWindows:dodges.size,finished:b?.phase==='respawn',hp:a.hp,returns:f.returns};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b.move)moves.add(b.move);
   const dx=b.x-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   const direction=f.draws.find(d=>d.source==='field-generator-field-poses-source-v1.png')?.flip ? -1 : 1;
   const locked=(b.move==='FFG01'&&b.tick>=42&&b.tick<158)||
    (b.move==='FFG02'&&b.tick>=48&&b.tick<180);
   let move=dx;
   if(locked){
    const rear=dx-direction*98;
    move=Math.abs(rear)>9?rear:turn?dx:0;
    dodges.add(b.move);
   }
   const jump=b.move==='FFG03'&&b.gravity&&b.tick>=90&&b.tick<188;
   if(jump)dodges.add(b.move);
   hold('Space',!!jump);
   hold('KeyA',locked?move<0:dx<-99||(turn&&dx<0));
   hold('KeyD',locked?move>0:dx>99||(turn&&dx>0));
   hold('KeyJ',(!earned||(moves.size===3&&dodges.size===3))&&Math.abs(dx)<125&&dx*a.dir>=0&&(!locked||dx*direction>=0));
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },earned);
}

async function gravityComparison(){
 await page.waitForFunction(()=>{
  const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
  if(b?.move!=='FFG03'||b.gravity?.factor!==.55||b.tick>=86||a.x<=b.gravity.left||a.x>=b.gravity.right)return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame(),menu=page.locator('#renderMode');
 const marks=f=>f.draws.filter(d=>d.kind==='text'&&d.size===13&&['1','2','3'].includes(d.text));
 assert.deepEqual(marks(png).map(d=>d.text),['1','2','3']);
 assert.equal(png.fieldBoss.gravityTicks,216-png.fieldBoss.tick);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/低重力の残り/);
 await canvas.screenshot({path:output+'/'+prefix+'-pulses.png'});
 await menu.selectOption('rect');
 await page.waitForFunction(n=>window.lab.frame.commands>n*3,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.75,standard.commands);
 const light=await frame();
 for(const sample of [standard,light]){
  assert.equal(sample.t,png.t);
  assert.equal(sample.fieldBoss.gravityTicks,png.fieldBoss.gravityTicks);
  assert.deepEqual(marks(sample),marks(png));
 }
 await canvas.screenshot({path:output+'/'+prefix+'-pulses-light.png'});
 await menu.selectOption('sprite');
 await page.waitForFunction(n=>window.lab.frame.commands===n,png.commands);
 await pause(false);
 return {png:png.commands,standard:standard.commands,light:light.commands,pulseOrder:['1','2','3'],
         gravityTicks:png.fieldBoss.gravityTicks};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile(earned?output+'/generator-ready.json':'work/'+prefix+'-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active'&&window.lab.frame.story.node==='fontaine-hub',quest);
 if(earned)assert.equal((await frame()).progression.level,90);
 await gate(1380,'fontaine-field');
 await gate(1165,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'generatorField',file:prefix+'-background-v1.png',state:'ready'});
 await walk(700);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FFG01'&&b.tick>=63&&b.tick<91;
 });
 await pause(true);
 const original=await frame(), before=original;
 assert.equal(original.fieldBoss.maxhp,1020);
 assert.equal(original.fieldBoss.gravity,undefined);
 assert.ok(original.draws.some(d=>d.source==='field-generator-field-poses-source-v1.png'));
 assert.equal(original.boss,undefined);
 await canvas.screenshot({path:output+'/'+prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.source==='field-generator-field-poses-source-v1.png'));
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.64,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[original.t,original.t,original.fieldBoss.tick]);
 await canvas.screenshot({path:output+'/'+prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);
 const normalJump=await jumpApex();
 assert.ok(normalJump>135&&normalJump<185,normalJump);
 const pulses=earned?await gravityComparison():null;
 if(!earned)await page.waitForFunction(()=>{
  const {fieldBoss:b,actors}=window.lab.frame;
  return b?.move==='FFG03'&&b.gravity?.factor===.55&&b.tick<86&&
   actors[0].x>b.gravity.left&&actors[0].x<b.gravity.right;
 });
 const lowGravityJump=await jumpApex();
 assert.ok(lowGravityJump>normalJump*1.7,lowGravityJump);
 const high=await frame();
 assert.ok(high.fieldBoss.gravity&&high.actors[0].y<255);
 await canvas.screenshot({path:output+'/'+prefix+'-gravity.png'});
 await page.waitForFunction(()=>{
  const {fieldBoss:b}=window.lab.frame;
  return b?.move==='FFG03'&&b.tick>=216&&!b.gravity&&!b.gravityTicks;
 });
 await fight();
 await page.waitForFunction(()=>window.generatorFieldResult,undefined,{timeout:140000});
 const play=await page.evaluate(()=>window.generatorFieldResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual([...play.moves].sort(),['FFG01','FFG02','FFG03']);
 assert.ok(play.dodgeWindows>=3);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[killXp,305]);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,'fontaine-field');
 await gate(60,'fontaine-hub');
 const beforeReport=await frame();
 await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[5400,380]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.fieldBosses[id].hp,0);
 assert.ok(saved.fieldBosses[id].waitTicks>0);
 if(earned){
  await page.reload();
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
  const restored=await frame();
  assert.equal(restored.story.quests[quest].cycles,1);
  assert.equal(restored.endgame.bosses[id].clears,1);
  assert.equal(restored.story.quests['fontaine-grand-finale'].status,'complete');
  assert.equal(restored.story.quests['fon-furina-cues'].status,'complete');
 }
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('実験用フィールド生成装置');
 const row=page.locator('[data-encounter="'+id+'"]');
 assert.equal(await row.getByRole('link',{name:/重力試験室/}).getAttribute('href'),'map-art.html?node='+arena);
 assert.equal(await row.getByRole('button',{name:'模擬戦に挑戦'}).count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(earned?'evidence/earned-fontaine-generator-browser.json':output+'/'+prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',play,fieldKill:{xp:killXp,mora:305},commissionReport:{xp:5400,mora:380},
  persistedCooldown:true,
  sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},
  jumpHeight:{normal:normalJump,inside:lowGravityJump},viewport390:true,errors,
  ...(earned?{pulses,entryLevel:90,restoredCommission:true}:{})
 },null,2)+'\n');
 console.log('Field Generator Chrome route, all moves, clear, report, save passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,node:window.lab?.frame.story.node,
  play:window.generatorFieldResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
