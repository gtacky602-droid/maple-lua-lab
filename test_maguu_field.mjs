import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), prefix='maguu-field';
const id='boss-25090101', arena='maguu-field-dojo', entry='maguu-approach', quest='maguu-commission';
const {killXp}=JSON.parse(await fs.readFile('evidence/maguu-field-lua.json','utf8'));
const earned=process.argv.includes('--earned');
const resultPrefix=earned?'earned-'+prefix:prefix;
const shotPrefix=earned?'work/earned-inazuma-bosses/'+prefix:'evidence/'+prefix;
const sourceSave=earned?'work/earned-inazuma-bosses/maguu-ready.json':'work/'+prefix+'-fixture.json';
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
 await page.evaluate(earned=>{
  const held=new Set(),moves=new Set(),dodges=new Set(),recoveries=new Set();
  const warnings={FMK01:[122],FMK02:[81,141],FMK03:[90]};
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
    window.maguuFieldResult={seconds:+(f.t-start).toFixed(2),moves:[...moves],recoveries:[...recoveries],dodges:dodges.size,finished:b?.phase==='respawn',hp:a.hp,returns:f.returns};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(prior!==b.move||b.tick<lastTick){prior=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move)moves.add(b.move);
   if(b.recovering)recoveries.add(b.move);
   for(const at of warnings[b.move]||[]){
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){
     used.add(at);dodges.add(b.move+at);hold('ShiftLeft',true);hold('ShiftLeft',false);
    }
   }
   const dx=b.x-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',dx<-99||(turn&&dx<0));
   hold('KeyD',dx>99||(turn&&dx>0));
   hold('KeyJ',Math.abs(dx)<125&&dx*a.dir>=0&&(!earned||moves.size===3));
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },earned);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile(sourceSave,'utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active'&&window.lab.frame.story.node==='inazuma-port',quest);
 if(earned){
  assert.equal((await frame()).progression.level,44);
  await page.keyboard.press('KeyM');
  await page.locator('#worldAtlas').waitFor();
  await page.locator('#atlasRegion').selectOption('region-03');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-03');
  await page.locator('#atlasLayer').selectOption('boss');
  await page.locator('#atlasField').selectOption(arena);
  await page.waitForFunction(id=>window.lab.frame.worldMap?.selected?.id===id,arena);
  const atlas=(await frame()).worldMap.guide;
  assert.equal(atlas.status,'ready');
  assert.deepEqual(atlas.stops.map(stop=>stop.id),['inazuma-road',entry,arena]);
  await page.keyboard.press('Escape');
  await page.locator('#worldAtlas').waitFor({state:'hidden'});
 }
 await gate(1380,'inazuma-road');
 await gate(1100,entry);
 await gate(1270,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'maguuField',file:prefix+'-background-v1.png',state:'ready'});
 await walk(735);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FMK01'&&b.tick>=62&&b.tick<90;
 });
 await pause(true);
 const original=await frame(), before=original;
 assert.equal(original.fieldBoss.maxhp,900);
 assert.ok(original.draws.some(d=>d.source==='maguu-stance-source-v1.png'));
 assert.equal(original.boss,undefined);
 await canvas.screenshot({path:shotPrefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.source==='maguu-stance-source-v1.png'));
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.64,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[original.t,original.t,original.fieldBoss.tick]);
 await canvas.screenshot({path:shotPrefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);
 await fight();
 if(earned){
  await page.waitForFunction(()=>window.lab.frame.fieldBoss?.recovering);
  assert.match(await page.locator('#fieldBossLabel').textContent(),/反撃の隙/);
  await page.locator('#fieldBoss').screenshot({path:'work/earned-inazuma-bosses/'+prefix+'-recovery.png'});
 }
 await page.waitForFunction(()=>window.maguuFieldResult,undefined,{timeout:140000});
 const play=await page.evaluate(()=>window.maguuFieldResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual(play.moves,['FMK01','FMK02','FMK03']);
 assert.ok(play.dodges>=3);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[killXp,180]);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(110,entry);
 await gate(104,'inazuma-road');
 await gate(102,'inazuma-port');
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
 if(earned){
  await page.locator('#loadProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開'));
  const restored=await frame();
  assert.equal(restored.story.node,'inazuma-port');
  assert.equal(restored.story.quests[quest].status,'complete');
  assert.equal(restored.story.quests[quest].cycles,1);
  assert.equal(restored.endgame.bosses[id].clears,1);
 }
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('魔偶剣鬼');
 const row=page.locator('[data-encounter="'+id+'"]');
 assert.equal(await row.getByRole('link',{name:/剣鬼の古庭/}).getAttribute('href'),'map-art.html?node='+arena);
 await row.getByRole('button',{name:'模擬戦に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.name.startsWith('魔偶剣鬼'));
 assert.equal((await frame()).boss.maxhp,700);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/'+resultPrefix+'-browser.json',JSON.stringify({
  browser:'Chrome',earned,restoredCommission:earned,play,fieldKill:{xp:killXp,mora:180},commissionReport:{xp:4000,mora:300},
  persistedCooldown:true,directTrialHp:700,
  sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},viewport390:true,errors
 },null,2)+'\n');
 console.log('Maguu field Chrome route, all moves, clear, report, save and legacy trial passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,node:window.lab?.frame.story.node,
  play:window.maguuFieldResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
