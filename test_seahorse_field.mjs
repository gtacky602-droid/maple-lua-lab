import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const route=process.argv.includes('--interrupt')?'interrupt':process.argv.includes('--land')?'land':null;
const output=route?'work/earned-fontaine-seahorse':'evidence';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), prefix='seahorse-field';
const id='boss-26180101', arena='seahorse-field-cavern', quest='seahorse-commission';
const {killXp}=JSON.parse(await fs.readFile('evidence/seahorse-field-lua.json','utf8'));
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
  const warnings={FSH01:[92],FSH02:[98,146],FSH03:[128]};
  let prior='',lastTick=-1,used=new Set();
  let interrupted=false,flew=false,landed=false,ready=false;
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
    window.seahorseFieldResult={seconds:+(f.t-start).toFixed(2),moves:[...moves],dodgeWindows:dodges.size,finished:b?.phase==='respawn',hp:a.hp,returns:f.returns,interrupted,flew,landed};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(prior!==b.move||b.tick<lastTick){prior=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move)moves.add(b.move);
   if(b.move==='FSH03'){
    flew||=Boolean(b.flying);
    landed||=b.tick>=132&&b.form==='airborne'&&!b.flying&&Math.abs(b.x-b.destinationX)<.01;
    interrupted||=b.label.startsWith('真珠が消灯');
    ready||=b.form==='dim';
   }
   for(const at of warnings[b.move]||[]){
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){
     used.add(at);dodges.add(b.move+at);hold('ShiftLeft',true);hold('ShiftLeft',false);
    }
   }
   const dx=b.x-a.x,turn=Math.abs(dx)>8&&dx*a.dir<0;
   hold('KeyA',dx<-99||(turn&&dx<0));
   hold('KeyD',dx>99||(turn&&dx>0));
   const attack=!route||(b.weakpoint?route==='interrupt':ready);
   hold('KeyJ',attack&&Math.abs(dx)<125&&dx*a.dir>=0);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },route);
}

function screenshot(name){
 return canvas.screenshot({path:`${output}/${prefix}${route?'-'+route:''}-${name}.png`});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile(route?output+'/seahorse-ready.json':'work/'+prefix+'-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active'&&window.lab.frame.story.node==='fontaine-hub',quest);
 if(route==='land'){
  const holdFire=page.locator('#allyFire');
  if((await holdFire.getAttribute('aria-pressed'))!=='true')await holdFire.click();
  await page.waitForFunction(()=>document.getElementById('allyFire').getAttribute('aria-pressed')==='true');
 }
 await gate(1380,'fontaine-field');
 await gate(985,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'seahorseField',file:prefix+'-background-v1.png',state:'ready'});
 await walk(700);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FSH01'&&b.tick>=63&&b.tick<91;
 });
 await pause(true);
 const original=await frame(), before=original;
 assert.equal(original.fieldBoss.maxhp,1010);
 assert.equal(original.fieldBoss.form,'pearl');
 assert.ok(original.draws.some(d=>d.source==='seahorse-field-poses-source-v1.png'));
 assert.equal(original.boss,undefined);
 await screenshot('png');
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.source==='seahorse-field-poses-source-v1.png'));
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.64,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[original.t,original.t,original.fieldBoss.tick]);
 await screenshot('light');
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);
 await fight();
 await page.waitForFunction(()=>{
  const {fieldBoss:b,draws}=window.lab.frame;
  if(b?.move!=='FSH03'||!b.weakpoint||b.tick<54||b.tick>=88||
    !draws.some(d=>d.color==='#b9cdfc'&&d.w===10&&d.h===8))return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/真珠に攻撃 [01]\/2/);
 const charge=await frame();
 assert.equal(charge.fieldBoss.coreWindowTicks,96-charge.fieldBoss.tick);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/あと\d+\.\d秒/);
 await screenshot('charge');
 let chargeProfiles;
 if(route){
  const menu=page.locator('#renderMode');
  const timer=f=>f.draws.find(d=>d.kind==='rect'&&d.color==='#a6eee7'&&d.h===3);
  const target=f=>f.draws.find(d=>d.kind==='text'&&d.text==='着地点');
  await menu.selectOption('rect');
  await page.waitForFunction(n=>window.lab.frame.commands>n*3,charge.commands);
  const rect=await frame();
  await menu.selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.75,rect.commands);
  const low=await frame();
  assert.ok(timer(charge));
  assert.equal(target(charge)?.x,charge.fieldBoss.destinationX-charge.camera);
  for(const sample of [rect,low]){
   assert.equal(sample.t,charge.t);
   assert.equal(sample.fieldBoss.coreWindowTicks,charge.fieldBoss.coreWindowTicks);
   assert.deepEqual(timer(sample),timer(charge));
   assert.deepEqual(target(sample),target(charge));
  }
  chargeProfiles={png:charge.commands,standard:rect.commands,light:low.commands};
  await screenshot('charge-light');
  await menu.selectOption('sprite');
  await page.waitForFunction(n=>window.lab.frame.commands===n,charge.commands);
 }
 await pause(false);
 await page.waitForFunction(()=>{
  const {fieldBoss:b,draws}=window.lab.frame;
  if(b?.move!=='FSH03'||b.form!=='dim'||b.tick<173||b.tick>=250||
   !draws.some(d=>d.source==='seahorse-field-poses-source-v1.png'&&d.h===61))return false;
  window.lab.action('pause');
  return true;
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const recovered=await frame();
 assert.ok(!recovered.draws.some(d=>d.kind==='text'&&d.text==='着地点'));
 const recovery=recovered.fieldBoss.label;
 assert.equal(recovered.fieldBoss.exposureTicks,312-recovered.fieldBoss.tick);
 assert.match(recovery,/消灯・反撃/);
 assert.match(await page.locator('#fieldBossLabel').textContent(),/消灯・反撃/);
 if(route==='interrupt')assert.equal(recovery,'真珠が消灯・反撃');
 if(route==='land')assert.equal(recovery,'着地して真珠が消灯・反撃');
 await screenshot('dim');
 await pause(false);
 await page.waitForFunction(()=>window.seahorseFieldResult,undefined,{timeout:140000});
 const play=await page.evaluate(()=>window.seahorseFieldResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual(play.moves,['FSH01','FSH02','FSH03']);
 if(route)assert.deepEqual([play.interrupted,play.flew,play.landed],
  route==='interrupt'?[true,false,false]:[false,true,true]);
 assert.ok(play.dodgeWindows>=3);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[killXp,290]);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,'fontaine-field');
 await gate(60,'fontaine-hub');
 const beforeReport=await frame();
 await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[5200,370]);
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
  assert.equal(restored.story.quests[quest].cycles,1);
  assert.equal(restored.endgame.bosses[id].clears,1);
  assert.equal(restored.story.quests['fon-furina-cues'].status,'complete');
 }
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('千年真珠の海駿');
 const row=page.locator('[data-encounter="'+id+'"]');
 assert.equal(await row.getByRole('link',{name:/真珠珊瑚の洞/}).getAttribute('href'),'map-art.html?node='+arena);
 assert.equal(await row.getByRole('button',{name:'模擬戦に挑戦'}).count(),0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 const reportPath=route?`evidence/earned-fontaine-seahorse-${route}-browser.json`:'evidence/'+prefix+'-browser.json';
 await fs.writeFile(reportPath,JSON.stringify({
  browser:'Chrome',play,fieldKill:{xp:killXp,mora:290},commissionReport:{xp:5200,mora:370},
  persistedCooldown:true,
  sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},
  chargeAndWeakpoint:true,recovery,viewport390:true,errors,
  ...(route?{route,chargeProfiles,restoredCommission:true}:{}),
  ...(route==='land'?{heldAllyFire:true}:{})
 },null,2)+'\n');
 console.log('Seahorse field Chrome route, all moves, clear, report, save passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,node:window.lab?.frame.story.node,
  play:window.seahorseFieldResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
