import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'), prefix='primo-geovishap-field';
const arena='primo-field-vault', entry='primo-approach', quest='primo-commission';
const sheet='primo-geovishap-field-actions-source-v1.png', id='boss-26050101';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(21000);
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
  const jumps={FV01:[66,126],FV02:[78],FV03:[112]};
  let prior='',lastTick=-1,used=new Set(),jumpUntil=0,shield=false,bonus=false;
  const start=window.lab.frame.t;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||f.returns>0||f.t-start>105){
    for(const code of [...held])hold(code,false);
    window.primoFieldResult={seconds:+(f.t-start).toFixed(2),moves:[...moves],bonus,finished:b?.phase==='respawn',hp:a.hp,returns:f.returns};
    return;
   }
   if(prior!==b.move||b.tick<lastTick){prior=b.move;used=new Set()}
   lastTick=b.tick;
   if(b.move)moves.add(b.move);
   if(b.label==='盾で受けた・隙＋1秒')bonus=true;
   const useShield=b.move==='FV03'&&!bonus;
   if(useShield&&!shield&&b.tick>=91&&b.tick<105){
    hold('Digit1',true);hold('Digit1',false);shield=true;
   }
   if(a.ground&&!useShield)for(const at of jumps[b.move]||[]){
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){used.add(at);jumpUntil=f.t+.7}
   }
   const dx=b.x-a.x,turn=a.dir<0;
   hold('Space',f.t<jumpUntil);
   hold('KeyA',dx<101||(turn&&dx<106));
   hold('KeyD',dx>111||(turn&&dx>=106));
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
  await fs.readFile('work/'+prefix+'-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active'&&window.lab.frame.story.node==='liyue-harbor',quest);
 assert.equal((await frame()).loadout[0][0],'SK20');
 await gate(1380,'liyue-field');
 await gate(650,entry);
 await gate(1270,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'primoField',file:prefix+'-background-v1.png',state:'ready'});
 await walk(758);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FV01'&&b.tick>=52&&b.tick<75;
 });
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 const original=await frame();
 assert.equal(original.fieldBoss.maxhp,970);
 assert.equal(original.fieldBoss.element,'hydro');
 assert.ok(original.draws.some(d=>d.source===sheet));
 await canvas.screenshot({path:'evidence/'+prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(source=>!window.lab.frame.draws.some(d=>d.source===source),sheet);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.64,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[original.t,original.t,original.fieldBoss.tick]);
 await canvas.screenshot({path:'evidence/'+prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
 const before=await frame();
 await fight();
 await page.waitForFunction(()=>window.lab.frame.fieldBoss?.label==='盾で受けた・隙＋1秒');
 await page.waitForFunction(source=>window.lab.frame.draws.some(d=>d.source===source),sheet);
 await canvas.screenshot({path:'evidence/'+prefix+'-shield.png'});
 await page.waitForFunction(()=>window.primoFieldResult,undefined,{timeout:118000});
 const play=await page.evaluate(()=>window.primoFieldResult);
 assert.ok(play.finished&&play.bonus,JSON.stringify(play));
 assert.deepEqual(play.moves,['FV01','FV02','FV03']);
 assert.equal(play.returns,0);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[8500,165]);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(110,entry);
 await gate(104,'liyue-field');
 await gate(102,'liyue-harbor');
 const beforeReport=await frame();
 await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const reported=await frame();
 assert.deepEqual([reported.progression.questXp-beforeReport.progression.questXp,reported.mora-beforeReport.mora],[4000,300]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.fieldBosses[id].hp,0);
 assert.ok(saved.fieldBosses[id].waitTicks>0);
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('エンシェントヴィシャップ');
 const row=page.locator('[data-encounter="'+id+'"]');
 assert.equal(await row.getByRole('link',{name:/伏竜の石窟/}).getAttribute('href'),'map-art.html?node='+arena);
 await row.getByRole('button',{name:'模擬戦に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.name.startsWith('エンシェントヴィシャップ'));
 assert.equal((await frame()).boss.maxhp,800);

 const tint=await page.evaluate(async source=>{
  const {elementTintedSprite}=await import('./sprite-images.js');
  const image=new Image();
  image.src='assets/'+source;
  await image.decode();
  const canvas=document.createElement('canvas');
  canvas.width=image.naturalWidth;
  canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  return [[255,92,25],[140,224,255],[199,90,255]].map(tint=>{
   const result=elementTintedSprite(image,tint);
   const output=result.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   let changed=0,stone=0,transparencyErrors=0;
   for(let i=0;i<rgba.length;i+=4){
    const r=rgba[i],g=rgba[i+1],b=rgba[i+2],a=rgba[i+3];
    if(a!==output[i+3])transparencyErrors++;
    if(a<245)continue;
    const differs=[0,1,2].some(c=>Math.abs(rgba[i+c]-output[i+c])>3);
    if(differs&&b-r>=32&&g-r>=12&&b-g>=8)changed++;
    if(!differs&&b-r<32)stone++;
   }
   return {changed,stone,transparencyErrors,cached:result===elementTintedSprite(image,tint)};
  });
 },sheet);
 assert.ok(tint.every(t=>t.changed>1000&&t.stone>1000&&!t.transparencyErrors&&t.cached),JSON.stringify(tint));
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/'+prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',play,fieldKill:{xp:8500,mora:165},commissionReport:{xp:4000,mora:300},persistedCooldown:true,
  directTrialHp:800,sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},
  tint,viewport390:true,errors
 },null,2)+'\n');
 console.log('Primo field Chrome route, shield, clear, report, save, tint and legacy trial passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,node:window.lab?.frame.story.node,
  play:window.primoFieldResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
