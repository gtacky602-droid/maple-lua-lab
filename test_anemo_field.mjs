import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
page.setDefaultTimeout(20000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const prefix='anemo-hypostasis-field';
const arena='anemo-field-basin';
const canvas=page.locator('#game');
const frame=()=>page.evaluate(()=>window.lab.frame);

async function walk(x){
 const f=await frame();
 const east=f.actors[f.active-1].x<x;
 const key=east?'KeyD':'KeyA';
 await canvas.click();
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-7:a.x<=x+7;
  },{x,east});
 }finally{await page.keyboard.up(key)}
}

async function cross(x,node){
 await walk(x);
 await page.waitForFunction(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}

async function fight(){
 await page.evaluate(()=>{
  const keys=new Set(),moves=new Set();
  let jumped='',jumpTo=0;
  const start=window.lab.frame.t;
  function hold(code,on){
   if(on===keys.has(code))return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||f.returns>0||f.t-start>110){
    for(const key of [...keys])hold(key,false);
    window.anemoResult={seconds:f.t-start,finished:b?.phase==='respawn',moves:[...moves],hp:a.hp,returns:f.returns};
    return;
   }
   if(b.move)moves.add(b.move);
   const timing={FA01:[42,96],FA02:[48,108]}[b.move];
   const retreat=timing&&b.tick>=timing[0]&&b.tick<timing[1];
   if(b.move!=='FA03')jumped='';
   if(b.move==='FA03'&&a.ground){
    const attempt=b.tick>=71&&b.tick<81?'first':b.tick>=106&&b.tick<116?'second':'';
    if(attempt&&attempt!==jumped){jumped=attempt;jumpTo=f.t+.68}
   }
   const dx=b.x-a.x,desired=retreat?192:106,turn=a.dir<0;
   hold('Space',f.t<jumpTo);
   hold('KeyA',dx<desired-6||(turn&&dx<desired));
   hold('KeyD',dx>desired+6||(turn&&dx>=desired));
   hold('KeyJ',!retreat&&!turn&&dx>0&&dx<125);
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
 await page.waitForFunction(()=>window.lab.frame.story.quests['anemo-commission']?.status==='active');
 await cross(1370,'mond-road');
 await cross(1200,'anemo-approach');
 await cross(1270,arena);
 const scene=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.equal(scene.key,'mondhill');
 await walk(680);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.move==='FA01'&&window.lab.frame.fieldBoss.tick>=42);
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 const reference=await frame();
 assert.equal(reference.fieldBoss.maxhp,870);
 assert.ok(reference.draws.some(d=>d.source==='anemo-core-source-v1.png'));
 assert.ok(reference.draws.some(d=>d.source==='anemo-shell-source-v1.png'));
 await canvas.screenshot({path:`evidence/${prefix}-png.png`});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.source==='anemo-core-source-v1.png'));
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(count=>window.lab.frame.commands<count*.65,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[reference.t,reference.t]);
 await canvas.screenshot({path:`evidence/${prefix}-light.png`});
 await page.locator('#renderMode').selectOption('sprite');
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
 const before=await frame();
 await fight();
 for(const [move,title,tick] of [['FA02','drop',80],['FA03','vortices',106]]){
  await page.waitForFunction(({move,tick})=>{
   const boss=window.lab.frame.fieldBoss;
   return boss?.move===move&&boss.tick>=tick&&boss.tick<tick+32;
  },{move,tick});
  await canvas.screenshot({path:`work/${prefix}-${title}.png`});
 }
 await page.waitForFunction(()=>window.anemoResult,undefined,{timeout:115000});
 const play=await page.evaluate(()=>window.anemoResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual(play.moves,['FA01','FA02','FA03']);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[900,125]);
 assert.equal(defeated.story.quests['anemo-commission'].count,1);
 await cross(109,'anemo-approach');
 await cross(104,'mond-road');
 await cross(102,'mond-town');
 const quest=page.locator('[data-quest="anemo-commission"]');
 const xp=(await frame()).progression.questXp;
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story.quests['anemo-commission'].status==='complete');
 assert.equal((await frame()).progression.questXp-xp,1500);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 const slot=saved.fieldBosses['boss-20040201'];
 assert.equal(slot.hp,0);
 assert.ok(slot.waitTicks>0);
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('無相の風');
 const row=page.locator('[data-encounter="boss-20040201"]');
 assert.equal(await row.getByRole('link',{name:/風鳴りの広場/}).getAttribute('href'),`map-art.html?node=${arena}`);
 await row.getByRole('button',{name:'模擬戦に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.name.startsWith('無相の風'));
 assert.equal((await frame()).boss.maxhp,300);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(`evidence/${prefix}-browser.json`,JSON.stringify({
  browser:'Chrome',play,fieldKill:{xp:900,mora:125},commissionReportXp:1500,persistedCooldown:true,
  directTrialHp:300,sameSceneCommands:{png:reference.commands,standard:standard.commands,light:light.commands},
  viewport390:true,errors
 },null,2)+'\n');
 console.log('Anemo field Chrome route, three attacks, clear, report, save and legacy trial passed');
}catch(error){
 console.error(await page.evaluate(()=>({field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,
  node:window.lab?.frame.story.node,play:window.anemoResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
