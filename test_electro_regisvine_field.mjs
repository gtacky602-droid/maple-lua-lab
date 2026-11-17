import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), prefix='electro-regisvine-field';
const id='boss-26020301', arena='electro-regisvine-field-cave', quest='electro-regisvine-commission';
const {killXp}=JSON.parse(await fs.readFile('evidence/electro-regisvine-field-lua.json','utf8'));
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
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),dodges=new Set();
  const warnings={FER01:[92],FER02:[94,142],FER03:[104,146,188]};
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
    window.electroVineFieldResult={seconds:+(f.t-start).toFixed(2),moves:[...moves],dodgeWindows:dodges.size,finished:b?.phase==='respawn',hp:a.hp,returns:f.returns};
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
   const dx=b.x-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',dx<-99||(turn&&dx<0));
   hold('KeyD',dx>99||(turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<125&&dx*a.dir>=0);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/'+prefix+'-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active'&&window.lab.frame.story.node==='sumeru-hub',quest);
 await gate(1380,'sumeru-field');
 await gate(1240,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'electroVineField',file:prefix+'-background-v1.png',state:'ready'});
 await walk(689);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FER01'&&b.tick>=63&&b.tick<91;
 });
 await pause(true);
 const original=await frame(), before=original;
 assert.equal(original.fieldBoss.maxhp,1240);
 assert.ok(original.draws.some(d=>d.source==='electro-regisvine-field-poses-source-v1.png'));
 assert.equal(original.boss,undefined);
 await canvas.screenshot({path:'evidence/'+prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.source==='electro-regisvine-field-poses-source-v1.png'));
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.64,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[original.t,original.t,original.fieldBoss.tick]);
 await canvas.screenshot({path:'evidence/'+prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);
 await fight();
 await page.waitForFunction(()=>{
  const {fieldBoss:b,draws}=window.lab.frame;
  if(b?.move!=='FER03'||b.tick<108||b.tick>=114||!draws.some(d=>d.color==='#b77fff28'&&d.h>114))return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const rain=await frame();
 assert.ok(rain.draws.some(d=>d.color==='#b77fff28'&&Math.abs(d.h-114.4)<.001));
 await canvas.screenshot({path:'evidence/'+prefix+'-lightning.png'});
 await pause(false);
 await page.waitForFunction(()=>window.electroVineFieldResult,undefined,{timeout:140000});
 const play=await page.evaluate(()=>window.electroVineFieldResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual(play.moves,['FER01','FER02','FER03']);
 assert.ok(play.dodgeWindows>=3);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[killXp,225]);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(105,'sumeru-field');
 await gate(105,'sumeru-hub');
 const beforeReport=await frame();
 await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[4000,300]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.fieldBosses[id].hp,0);
 assert.ok(saved.fieldBosses[id].waitTicks>0);
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('迅電樹');
 const row=page.locator('[data-encounter="'+id+'"]');
 assert.equal(await row.getByRole('link',{name:/紫脈の石窟/}).getAttribute('href'),'map-art.html?node='+arena);
 assert.equal(await row.getByRole('button',{name:'模擬戦に挑戦'}).count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/'+prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',play,fieldKill:{xp:killXp,mora:225},commissionReport:{xp:4000,mora:300},
  persistedCooldown:true,
  sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},lightningColumnMatchesHeight:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Electro Regisvine field Chrome route, all moves, clear, report, save passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,node:window.lab?.frame.story.node,
  play:window.electroVineFieldResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
