import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game');
const prefix='electro-hypostasis-field';
const arena='electro-field-shelf',entry='electro-approach',quest='electro-commission';
const coreArt='electro-core-source-v1.png';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(19000);
const frame=()=>page.evaluate(()=>window.lab.frame);

async function walk(x){
 const f=await frame();
 const east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
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
 await page.waitForFunction(node=>{
  const p=window.lab.frame.storyNearbyPortal;
  return p?.to===node&&p.available;
 },node);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}

async function fight(){
 await page.evaluate(()=>{
  const keys=new Set(),moves=new Set(),shapes=new Set();
  const triggers={FE01:[62,122,189],FE02:[79],FE03:[78,150]};
  let used=new Set(),previous='',lastTick=-1,jumpTo=0,drillStart=0,drillTravel=0;
  const start=window.lab.frame.t;
  function hold(code,on){
   if(on===keys.has(code))return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(!b||b.phase==='respawn'||f.returns>0||f.t-start>105){
    for(const key of [...keys])hold(key,false);
    window.electroResult={seconds:f.t-start,finished:b?.phase==='respawn',moves:[...moves],shapes:[...shapes],
     drillTravel,returns:f.returns,hp:a.hp};
    return;
   }
   if(b.move!==previous||b.tick<lastTick){
    used=new Set();
    previous=b.move;
    if(b.move==='FE02')drillStart=b.x;
   }
   lastTick=b.tick;
   if(b.move)moves.add(b.move);
   const sign=b.move==='FE01'&&b.label.match(/[123]\/3/)?.[0];
   if(sign)shapes.add(sign);
   if(b.move==='FE02')drillTravel=Math.max(drillTravel,Math.abs(b.x-drillStart));
   if(a.ground)for(const at of triggers[b.move]||[]){
    if(b.tick>=at&&b.tick<at+6&&!used.has(at)){used.add(at);jumpTo=f.t+.68}
   }
   hold('Space',f.t<jumpTo);
   const dx=b.x-a.x,side=dx>=0?-1:1,dist=Math.abs(dx),turn=a.dir===side;
   const toward=dist>112||(turn&&dist>=105);
   const away=dist<98||(turn&&dist<105);
   hold('KeyA',side===1?toward:away);
   hold('KeyD',side===-1?toward:away);
   hold('KeyJ',dist<125&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(save=>localStorage.setItem('maple-lua-lab.checkpoint.v1',save),
  await fs.readFile(`work/${prefix}-fixture.json`,'utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await cross(1370,'mond-road');
 await cross(400,entry);
 await cross(1270,arena);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'electroField',file:'electro-hypostasis-field-background-v1.png',state:'ready'});
 await walk(740);
 await page.waitForFunction(()=>{
  const b=window.lab.frame.fieldBoss;
  return b?.move==='FE01'&&b.tick>=61&&b.tick<78;
 });
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 const original=await frame();
 assert.equal(original.fieldBoss.maxhp,900);
 assert.ok(original.draws.some(d=>d.source===coreArt));
 assert.ok(original.draws.some(d=>d.source==='electro-shell-source-v1.png'));
 await canvas.screenshot({path:`evidence/${prefix}-png.png`});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(source=>!window.lab.frame.draws.some(d=>d.source===source),coreArt);
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
 for(const [move,lo,hi,name] of [['FE01',109,134,'shears'],['FE01',185,204,'palm'],
     ['FE02',94,108,'drill'],['FE03',164,190,'wave']]){
  await page.waitForFunction(({move,lo,hi})=>{
   const b=window.lab.frame.fieldBoss;
   return b?.move===move&&b.tick>=lo&&b.tick<hi;
  },{move,lo,hi});
  const shells=(await frame()).draws.filter(d=>d.source==='electro-shell-source-v1.png');
  assert.ok(shells.length>0&&shells.every(d=>d.y<=480));
  await canvas.screenshot({path:`work/${prefix}-${name}.png`});
 }
 await page.waitForFunction(()=>window.electroResult,undefined,{timeout:110000});
 const play=await page.evaluate(()=>window.electroResult);
 assert.ok(play.finished,JSON.stringify(play));
 assert.deepEqual(play.moves,['FE01','FE02','FE03']);
 assert.deepEqual(play.shapes,['1/3','2/3','3/3']);
 assert.equal(play.returns,0);
 assert.ok(play.drillTravel>=190&&play.drillTravel<=193.61);
 const defeated=await frame();
 assert.deepEqual([defeated.progression.killXp-before.progression.killXp,defeated.mora-before.mora],[1250,140]);
 assert.equal(defeated.story.quests[quest].count,1);
 await cross(109,entry);
 await cross(104,'mond-road');
 await cross(102,'mond-town');
 const beforeReport=(await frame()).progression.questXp;
 await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 assert.equal((await frame()).progression.questXp-beforeReport,1500);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.fieldBosses['boss-20040101'].hp,0);
 assert.ok(saved.fieldBosses['boss-20040101'].waitTicks>0);
 const panel=page.locator('#encountersPanel');
 if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
 await page.getByRole('textbox',{name:'ボス名で検索'}).fill('無相の雷');
 const row=page.locator('[data-encounter="boss-20040101"]');
 assert.equal(await row.getByRole('link',{name:/雷紋の岩棚/}).getAttribute('href'),`map-art.html?node=${arena}`);
 await row.getByRole('button',{name:'模擬戦に挑戦'}).click();
 await page.waitForFunction(()=>window.lab.frame.boss?.name.startsWith('無相の雷'));
 assert.equal((await frame()).boss.maxhp,420);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(`evidence/${prefix}-browser.json`,JSON.stringify({
  browser:'Chrome',play,fieldKill:{xp:1250,mora:140},commissionReportXp:1500,persistedCooldown:true,
  directTrialHp:420,sameSceneCommands:{png:original.commands,standard:standard.commands,light:light.commands},
  viewport390:true,errors
 },null,2)+'\n');
 console.log('Electro field Chrome route, three shapes, drill, waves, clear, save and legacy trial passed');
}catch(error){
 console.error(await page.evaluate(()=>({field:window.lab?.frame.fieldBoss,portal:window.lab?.frame.storyNearbyPortal,
  node:window.lab?.frame.story.node,play:window.electroResult,status:document.querySelector('#status')?.textContent})),errors);
 throw error;
}finally{await browser.close()}
