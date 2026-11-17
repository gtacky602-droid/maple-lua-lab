import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const root=process.env.LAB_URL||'http://127.0.0.1:8769/';
const canvas=page.locator('#game');
const arena='cryo-field-grove',hub='mond-town',entry='cryo-approach';
const idle='cryo-regisvine-source-v1.png',actions='cryo-regisvine-field-actions-source-v1.png';
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
 await walk(1370);await through('mond-road');
 await walk(1370);await through('mond-border');
 await walk(1200);await through(entry);
 await walk(1270);await through(arena);
}

async function startFight(){
 await focus();
 await page.evaluate(()=>{
  let previous='',lastTick=0,lastFrame=-1,jumpUntil=0,kicked=new Set(),maxGap=0;
  const held=new Set(),order=[];
  const start=window.lab.frame.t;
  function hold(code,want){
   if(want===held.has(code))return;
   if(want)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(want?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.phase==='respawn'||f.returns>0||f.story.node!=='cryo-field-grove'||f.t-start>110){
    for(const key of [...held])hold(key,false);
    window.cryoFight={seconds:f.t-start,order,returns:f.returns,maxGap,finished:b?.phase==='respawn'};
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
    const trigger={FC01:[59],FC02:[63],FC03:[60]}[b.move]??[];
    for(const at of trigger)if(b.tick>=at&&b.tick<at+5&&a.ground&&!kicked.has(at)){
     kicked.add(at);hold('Space',false);jumpUntil=f.t+.92;
    }
    hold('Space',f.t<jumpUntil);
    const dx=b.x-a.x,turn=a.dir<0;
    hold('KeyA',dx<70||(turn&&dx<82));
    hold('KeyD',dx>89||(turn&&dx>=82));
    hold('KeyJ',dx>0&&dx<125&&!turn);
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
     await fs.readFile('work/cryo-regisvine-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.story.quests['cryo-commission']?.status==='active');
 await reach();
 const backdrop=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.equal(backdrop.key,'cryoField');
 await walk(452);
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.phase==='available');
 assert.equal((await frame()).fieldBoss.hp,570);
 await focus();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 await canvas.screenshot({path:'evidence/cryo-regisvine-field-idle.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(file=>!window.lab.frame.draws.some(d=>d.source===file),idle);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame();
 assert.equal(light.t,standard.t);
 await canvas.screenshot({path:'evidence/cryo-regisvine-field-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await focus();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
 await walk(654);
 const before=await frame();
 await startFight();
 await page.waitForFunction(source=>{
  const f=window.lab.frame;
  return f.fieldBoss?.label==='核を破壊・ダウン'&&f.draws.some(d=>d.source===source);
 },actions);
 await canvas.screenshot({path:'evidence/cryo-regisvine-field-down.png'});
 await page.waitForFunction(()=>window.cryoFight,{},{timeout:125000});
 const play=await page.evaluate(()=>window.cryoFight);
 assert.ok(play.finished,JSON.stringify(play));
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[900,125]);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/再出現まで/);
 assert.equal(defeated.story.quests['cryo-commission'].count,1);
 await walk(109);await through(entry);
 await walk(104);await through('mond-border');
 await walk(102);await through('mond-road');
 await walk(105);await through(hub);
 const quest=page.locator('[data-quest="cryo-commission"]');
 const oldXp=(await frame()).progression.questXp;
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story.quests['cryo-commission'].status==='complete');
 assert.equal((await frame()).progression.questXp-oldXp,1500);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses['boss-26020101'].hp,0);
 assert.ok(save.fieldBosses['boss-26020101'].waitTicks>0);
 await page.locator('#encountersPanel summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('急凍樹');
 const row=page.locator('[data-encounter="boss-26020101"]');
 assert.equal(await row.getByRole('link',{name:/霜花の洞窟/}).getAttribute('href'),'map-art.html?node='+arena);
 await row.getByRole('button',{name:'模擬戦に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.name.startsWith('急凍樹'));
 assert.equal((await frame()).boss.maxhp,750);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/cryo-regisvine-field-browser.json',JSON.stringify({
  browser:'Chrome',physical_normal_with_default_amber:play,field_route_and_nucleus_down:true,
  reward:{xp:900,mora:125},investigation_report_xp:1500,persisted_cooldown:true,direct_trial_750_hp:true,
  sameSceneCommands:{standard:standard.commands,light:light.commands},viewport_390:true,errors
 },null,2)+'\n');
 console.log('Cryo Regisvine Chrome route, core break, field reward, report and legacy trial passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  portal:window.lab?.frame.storyNearbyPortal,actor:window.lab?.frame.actors[0],play:window.cryoFight,
 })),errors);
 throw error;
}finally{await browser.close()}
