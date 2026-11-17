import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),prefix='pyro-regisvine-field';
const arena='pyro-field-grotto',entry='pyro-approach',quest='pyro-commission';
const sheet='pyro-regisvine-field-actions-source-v1.png';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(19000);
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

async function fight(){
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set();
  let last='',lastTick=-1,used=new Set(),jumpUntil=0;
  const start=window.lab.frame.t;
  const jumps={FP01:[63],FP02:[61,99],FP03:[66]};
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||f.returns>0||f.t-start>118){
    for(const key of [...held])hold(key,false);
    window.pyroResult={seconds:f.t-start,moves:[...moves],finished:b?.phase==='respawn',returns:f.returns,hp:a.hp};
    return;
   }
   if(last!==b.move||b.tick<lastTick){last=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move)moves.add(b.move);
   if(a.ground)for(const at of jumps[b.move]||[]){
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){used.add(at);jumpUntil=f.t+.72}
   }
   const dx=b.x-a.x,turn=a.dir<0;
   hold('Space',f.t<jumpUntil);
   hold('KeyA',dx<72||(turn&&dx<81));
   hold('KeyD',dx>89||(turn&&dx>=81));
   hold('KeyJ',dx>0&&dx<125&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile(`work/${prefix}-fixture.json`,'utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active'&&window.lab.frame.story.node==='liyue-harbor',quest);
 await gate(1380,'liyue-field');
 await gate(1200,entry);
 await gate(1270,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'pyroField',file:'pyro-regisvine-field-background-v1.png',state:'ready'});
 await walk(708);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FP01'&&b.tick>=49&&b.tick<80;
 });
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 const original=await frame();
 assert.equal(original.fieldBoss.maxhp,710);
 assert.ok(original.draws.some(d=>d.source===sheet));
 await canvas.screenshot({path:`evidence/${prefix}-png.png`});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(source=>!window.lab.frame.draws.some(d=>d.source===source),sheet);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.64,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[original.t,original.t]);
 await canvas.screenshot({path:`evidence/${prefix}-light.png`});
 await page.locator('#renderMode').selectOption('sprite');
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
 const before=await frame();
 await fight();
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FP01'&&b.tick>=104&&b.tick<149;
 });
 await canvas.screenshot({path:`work/${prefix}-wave.png`});
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.label==='核を破壊・ダウン';
 },undefined,{timeout:65000});
 await canvas.screenshot({path:`evidence/${prefix}-down.png`});
 await page.waitForFunction(()=>window.pyroResult,undefined,{timeout:120000});
 const play=await page.evaluate(()=>window.pyroResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual(play.moves,['FP01','FP02','FP03']);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[4900,150]);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(110,entry);
 await gate(104,'liyue-field');
 await gate(102,'liyue-harbor');
 const beforeReport=(await frame()).progression.questXp;
 await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 assert.equal((await frame()).progression.questXp-beforeReport,4000);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.fieldBosses['boss-26020201'].hp,0);
 assert.ok(saved.fieldBosses['boss-26020201'].waitTicks>0);
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('爆炎樹');
 const row=page.locator('[data-encounter="boss-26020201"]');
 assert.equal(await row.getByRole('link',{name:/燠火の岩窟/}).getAttribute('href'),`map-art.html?node=${arena}`);
 await row.getByRole('button',{name:'模擬戦に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.name.startsWith('爆炎樹'));
 assert.equal((await frame()).boss.maxhp,800);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(`evidence/${prefix}-browser.json`,JSON.stringify({
  browser:'Chrome',play,fieldKill:{xp:4900,mora:150},commissionReportXp:4000,persistedCooldown:true,nucleusDown:true,
  directTrialHp:800,sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},
  viewport390:true,errors
 },null,2)+'\n');
 console.log('Pyro field Chrome route, wave, nucleus, clear, report, save and legacy trial passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,node:window.lab?.frame.story.node,
  play:window.pyroResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
