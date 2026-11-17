import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-26302101',quest='moongecko-commission';
const hub='nod-town',road='nod-field',arena='nod-gecko-depths';
const prefix='evidence/moongecko-field',source='moongecko-field-poses-source-v1.png';
const errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(45000);

async function gate(x,node){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.click();
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-8:a.x<=x+8;
  },{x,east});
 }finally{await page.keyboard.up(key)}
 await page.waitForFunction(node=>{
  const p=window.lab.frame.storyNearbyPortal;
  return p?.to===node&&p.available;
 },node);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}

async function freeze(form,afterTick=0){
 await page.waitForFunction(({form,afterTick})=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(b?.form!==form||b.tick<afterTick||f.paused)return false;
  window.lab.action('pause');
  return true;
 },{form,afterTick},{timeout:90000});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const current=await frame();
 assert.equal(current.fieldBoss.id,id);
 assert.equal(current.fieldBoss.form,form);
 assert.equal(current.fieldBoss.maxhp,1160);
 assert.equal(current.draws.filter(d=>d.source===source).length,form==='charging'?2:1);
 return current;
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/moongecko-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 const start=await frame();
 assert.equal(start.companion.id,'wanderer');
 assert.deepEqual(start.loadout.slice(0,2),[['SK18'],['SK05']]);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(60,road);
 await gate(1260,arena);
 assert.match((await frame()).location,/波追いの峠の月石洞/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'moongeckoField',file:'moongecko-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{
  const img=new Image();
  img.src='./assets/'+name;
  await img.decode();
 },source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let escaped=false,healed=false,anchorBroken=false,healX;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   const mark=f.radiantCocoons?.find(m=>m.actor===f.active);
   if(mark&&!mark.bound)escaped=true;
   if(b?.form==='down')anchorBroken=true;
   if(b?.phase==='respawn'||f.returns>0||f.t-start>170){
    for(const code of [...held])hold(code,false);
    window.moongeckoResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,healed,escaped,anchorBroken};
    return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   const t=b?.tick,open=(first,last)=>t>=first&&t<last;
   const healing=window.moongeckoHeal&&!escaped&&anchorBroken;
   if(healing&&healX===undefined)healX=(b?.x??940)+280;
   let destination=(b?.x??940)-82;
   if(b?.summon)destination=b.summon.x-12;
   if(healing)destination=healX;
   const dx=destination-a.x,attackDx=(b?.x??920)-a.x;
   const turn=Math.abs(attackDx)>8&&attackDx*a.dir<0;
   const jump=!healing&&(b?.move==='FMG01'&&(open(84,105)||open(154,175))||
    b?.move==='FMG02'&&open(114,135)||b?.move==='FMG03'&&open(460,481));
   if(healing&&a.x>=healX-15&&a.ground&&!f.macro&&!healed){
    window.lab.action('slot1');
    healed=true;
   }
   hold('Space',jump);
   let steer=0;
   if(Math.abs(dx)>12)steer=Math.sign(dx);
   else if(!healing&&turn)steer=Math.sign(attackDx);
   hold('KeyA',steer<0);
   hold('KeyD',steer>0);
   hold('KeyJ',(escaped||window.moongeckoHeal&&!anchorBroken)&&Math.abs(attackDx)<135&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const png=await freeze('charging',114);
 assert.match(png.fieldBoss.label,/月石の錨/);
 assert.ok(png.fieldBoss.summon.hp>0);
 assert.ok(png.radiantCocoons.some(m=>m.actor===png.active&&m.bound));
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t,light.fieldBoss.tick],[png.t,png.t,png.fieldBoss.tick]);
 await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await page.evaluate(()=>{window.moongeckoHeal=true});
 await resume();
 const down=await freeze('down');
 assert.ok(down.fieldBoss.tick<480);
 assert.match(down.fieldBoss.label,/月石の錨を破壊/);
 await canvas.screenshot({path:prefix+'-down.png'});
 await resume();
 await page.waitForFunction(()=>{
  const f=window.lab.frame;
  if(f.paused||!f.radiantCocoons?.some(m=>m.actor===f.active&&!m.bound))return false;
  window.lab.action('pause');
  return true;
 },undefined,{timeout:90000});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const escaped=await frame();
 assert.equal(escaped.actors[escaped.active-1].hp,escaped.actors[escaped.active-1].maxhp);
 assert.match(escaped.fieldBoss.label,/脱出/);
 await canvas.screenshot({path:prefix+'-escape.png'});
 await resume();

 await page.waitForFunction(()=>window.moongeckoResult,undefined,{timeout:210000});
 const play=await page.evaluate(()=>window.moongeckoResult);
 assert.ok(play.won&&play.healed&&play.escaped&&play.anchorBroken,JSON.stringify(play));
 assert.deepEqual(play.moves,['FMG01','FMG02','FMG03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,495);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,road);
 await gate(1380,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[9600,670]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);
 assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({
  browser:'Chrome',companion:'wanderer',play,scenery,questAcceptedInUi:true,
  questReport:{xp:9600,mora:670},sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  healedToFull:true,escapedAt:escaped.t,cocoonActor:png.active,anchorBrokenTick:down.fieldBoss.tick,savedRespawn:true,viewport390:true,errors
 },null,2)+'\n');
 console.log('Radiant Moongecko Chrome route, cocoon, anchor, healing and escape, comparison, quest and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  play:window.moongeckoResult,nearby:window.lab?.frame.storyNearbyPortal})),errors);
 throw error;
}finally{await browser.close()}
