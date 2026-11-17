import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const root=process.env.LAB_URL||'http://127.0.0.1:8769/';
const canvas=page.locator('#game');
const arena='sumeru-jadeplume-grove',localField='sumeru-field',hub='sumeru-hub';
const idle='jadeplume-idle-source-v1.png',actions='jadeplume-field-actions-source-v1.png';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(17000);
const frame=()=>page.evaluate(()=>window.lab.frame);

async function focus(){
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
}
async function walk(x){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await focus();
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-7:a.x<=x+7;
  },{x,east});
 }finally{await page.keyboard.up(key)}
}
async function through(id){
 await page.waitForFunction(id=>{
  const p=window.lab.frame.storyNearbyPortal;
  return p?.to===id&&p.available;
 },id);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(id=>window.lab.frame.story.node===id,id);
}
async function reach(){
 await walk(1380);await through(localField);
 await walk(1080);await through(arena);
}

async function startFight(){
 await focus();
 await page.evaluate(()=>{
  let previous='',lastTick=0,lastFrame=-1,side=-1,jumpUntil=0,kicked=new Set(),maxGap=0;
  const held=new Set(),order=[];
  const start=window.lab.frame.t;
  function hold(code,want){
   if(want===held.has(code))return;
   if(want)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(want?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.phase==='respawn'||f.returns>0||f.story.node!=='sumeru-jadeplume-grove'||f.t-start>110){
    for(const key of [...held])hold(key,false);
    window.jadeFight={seconds:f.t-start,order,returns:f.returns,maxGap,finished:b?.phase==='respawn'};
    return;
   }
   if(b&&f.t!==lastFrame){
    if(lastFrame>=0)maxGap=Math.max(maxGap,f.t-lastFrame);
    lastFrame=f.t;
    if(b.move!==previous||b.tick<lastTick){
     if(b.move)order.push(b.move);
     previous=b.move;kicked=new Set();
    }
    lastTick=b.tick;
    const trigger={FJ01:[54,98],FJ02:[92],FJ03:[96,132,168]}[b.move]??[];
    for(const at of trigger)if(b.tick>=at&&b.tick<at+5&&a.ground&&!kicked.has(at)){
     kicked.add(at);hold('Space',false);jumpUntil=f.t+.92;
    }
    hold('Space',f.t<jumpUntil);
    if(side<0&&b.x<632)side=1;
    if(side>0&&b.x>1198)side=-1;
    const desired=b.x+side*100,offset=desired-a.x,dx=b.x-a.x;
    const left=Math.abs(offset)>10?offset<0:dx*a.dir<0&&dx<0;
    const right=Math.abs(offset)>10?offset>0:dx*a.dir<0&&dx>0;
    hold('KeyA',left);hold('KeyD',right);hold('KeyJ',dx*a.dir>0&&Math.abs(dx)<125);
   }
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
     await fs.readFile('work/jadeplume-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(node=>window.lab.frame.story.node===node,hub);
 await reach();
 const backdrop=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.equal(backdrop.key,'sumeru');
 await walk(460);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='available');
 assert.equal((await frame()).fieldBoss.hp,800);
 await focus();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 await canvas.screenshot({path:'evidence/jadeplume-field-idle.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(file=>!window.lab.frame.draws.some(d=>d.source===file),idle);
 const frozen=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(standard=>window.lab.frame.commands<standard*.65,frozen.commands);
 const light=await frame();
 assert.equal(light.t,frozen.t);
 await canvas.screenshot({path:'evidence/jadeplume-field-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await focus();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
 await walk(650);
 const before=await frame();
 await startFight();
 await page.waitForFunction(source=>{
  const f=window.lab.frame,b=f.fieldBoss;
  return b?.move==='FJ02'&&b.tick>=48&&b.tick<70&&f.draws.some(d=>d.source===source);
 },actions);
 await canvas.screenshot({path:'evidence/jadeplume-field-leap.png'});
 await page.waitForFunction(source=>{
  const f=window.lab.frame,b=f.fieldBoss;
  return b?.move==='FJ02'&&b.tick>=82&&b.tick<=99&&b.y<444&&f.draws.some(d=>d.source===source&&d.y===b.y);
 },actions);
 await canvas.screenshot({path:'evidence/jadeplume-field-spring.png'});
 await page.waitForFunction(()=>window.jadeFight,{},{timeout:125000});
 const play=await page.evaluate(()=>window.jadeFight);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual(play.order.slice(0,3),['FJ01','FJ02','FJ03']);
 const defeated=await frame();
 assert.equal(defeated.progression.killXp-before.progression.killXp,39950);
 assert.equal(defeated.mora-before.mora,180);
 assert.equal(defeated.fieldBoss.generation,1);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/再出現まで/);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開'));
 await page.waitForFunction(node=>window.lab.frame.story.node===node,hub);
 await reach();
 const resume=await frame(),remaining=resume.fieldBoss.remaining;
 assert.equal(resume.fieldBoss.generation,1);
 assert.equal(resume.fieldBoss.phase,'respawn');
 assert.ok(remaining>0&&remaining<60);
 await walk(460);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.generation===2,{},{timeout:80000});
 const spawned=(await frame()).fieldBoss;
 assert.deepEqual([spawned.generation,spawned.hp],[2,800]);
 await page.locator('#encountersPanel summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('マッシュラプトル');
 await page.locator('#playableBosses').check();
 const row=page.locator('[data-encounter="boss-26110101"]');
 assert.match(await row.innerText(),/フィールドで遭遇可能/);
 assert.equal(await row.getByRole('link',{name:/菌傘の谷/}).getAttribute('href'),'map-art.html?node='+arena);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/jadeplume-field-browser.json',JSON.stringify({
  browser:'Chrome',physical_normal_with_default_amber:play,
  airborne_sprite_tracks_boss_y:true,normal_route_and_sumeru_backdrop:true,save_and_game_clock_respawn:true,remainingAfterReload:remaining,
  reward:{xp:39950,mora:180},sameSceneCommands:{standard:frozen.commands,light:light.commands},
  accessible_from_playable_catalog:true,viewport_390:true,errors
 },null,2)+'\n');
 console.log('Jadeplume Chrome region route, timed fight, reward and persisted respawn passed:',play.seconds);
}catch(error){
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame.story.node,status:document.querySelector('#status')?.textContent,
  field:window.lab?.frame.fieldBoss,actor:window.lab?.frame.actors[0],play:window.jadeFight,
 }),{}),errors);
 throw error;
}finally{await browser.close()}
