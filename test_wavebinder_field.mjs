import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:910}});
const canvas=page.locator('#game'),id='boss-25134601',quest='wavebinder-commission';
const hub='novokichev-camp',road='novokichev-depth',arena='wavebinder-tide-cavern';
const prefix='evidence/wavebinder-field',source='wavebinder-field-poses-source-v1.png';
const errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
const progress=setInterval(async()=>{
 try{
  const f=await frame();
  await fs.writeFile('work/wavebinder-browser-progress.json',JSON.stringify({
   at:new Date().toISOString(),node:f.story?.node,t:f.t,paused:f.paused,boss:f.fieldBoss,
   actors:f.actors,result:await page.evaluate(()=>window.waveResult)
  },null,2));
 }catch{}
},5000);
progress.unref();
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
  },{x,east},{timeout:90000});
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
 assert.equal(current.draws.filter(d=>d.source===source).length,1);
 return current;
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8846/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/wavebinder-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 assert.equal((await frame()).companion.id,'wanderer');
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('boss');
 await page.locator('#atlasSearch').fill('波濤の投錨者');
 await page.locator('#atlasField').selectOption(arena);
 await page.waitForFunction(arena=>window.lab.frame.worldMap?.selected?.id===arena,arena);
 const map=(await frame()).worldMap;
 const mapRoute=map.guide.stops.map(stop=>stop.id);
 assert.equal(map.guide.status,'ready');
 assert.deepEqual(mapRoute,[road,arena]);
 assert.ok(map.draws.some(draw=>draw.kind==='line'&&draw.color==='#ffe196'));
 await atlas.screenshot({path:prefix+'-map.png'});
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await gate(1380,road);await gate(1030,arena);
 assert.match((await frame()).location,/西港の潮洞/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'wavebinderField',file:'wavebinder-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{const img=new Image();img.src='./assets/'+name;await img.decode()},source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let drinkBroken=false,valiantBroken=false,sawValiant=false,lastElectro=-20,electroCasts=0;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1],d=b?.wavebinder;
   if(b?.form==='down'&&d?.downReason==='drink')drinkBroken=true;
   if(b?.form==='down'&&d?.downReason==='valiant')valiantBroken=true;
   if(d?.valiant)sawValiant=true;
   if(b?.phase==='respawn'||f.returns>0||f.t-start>210){
    for(const code of [...held])hold(code,false);
    window.waveResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,drinkBroken,valiantBroken,sawValiant,electroCasts};return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   const attackDx=(b?.x??940)-a.x,dx=(b?.x??940)-70-a.x;
   const turn=Math.abs(attackDx)>8&&attackDx*a.dir<0;
   const t=b?.tick,open=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='WB01'&&(open(84,105)||open(154,175)||d?.valiant&&open(224,245))||
    b?.move==='WB02'&&(open(106,127)||open(184,205));
   const inDrink=b?.move==='WB03'&&b?.form==='drinking';
   const enabled=!!window.waveFight&&(!inDrink||window.waveInterrupt||window.waveDrain);
   const electro=enabled&&(inDrink&&window.waveInterrupt||window.waveDrain);
   if(electro&&Math.abs(attackDx)<150&&!turn&&a.ground&&!f.macro&&f.t-lastElectro>3.2){
    window.lab.action('slot1');lastElectro=f.t;electroCasts++;
   }
   hold('Space',jump);
   let steer=0;
   if(Math.abs(dx)>12)steer=Math.sign(dx);else if(turn)steer=Math.sign(attackDx);
   hold('KeyA',steer<0);hold('KeyD',steer>0);
   hold('KeyJ',enabled&&Math.abs(attackDx)<125&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const ready=await freeze('attack',1);
 assert.equal(ready.fieldBoss.wavebinder.courage,0);
 await canvas.screenshot({path:prefix+'-ready.png'});
 await page.evaluate(()=>{window.waveFight=true});await resume();
 const drink=await freeze('drinking',112);
 assert.ok(drink.fieldBoss.wavebinder.courage>0&&!drink.fieldBoss.wavebinder.valiant);
 await canvas.screenshot({path:prefix+'-drink.png'});
 await page.evaluate(()=>{window.waveInterrupt=true});await resume();
 const drinkDown=await freeze('down');
 assert.equal(drinkDown.fieldBoss.wavebinder.downReason,'drink');
 await canvas.screenshot({path:prefix+'-drink-down.png'});
 await page.evaluate(()=>{window.waveInterrupt=false});await resume();
 await page.waitForFunction(()=>{
  const f=window.lab.frame,b=f.fieldBoss;
  if(!b?.wavebinder.valiant||b.form!=='attack'||b.move!=='WB01'||b.tick<54||f.paused)return false;
  window.lab.action('pause');return true;
 },undefined,{timeout:90000});
 await page.waitForFunction(()=>window.lab.frame.paused);
 const png=await frame();
 assert.ok(png.fieldBoss.wavebinder.valiant&&png.fieldBoss.wavebinder.courage>0);
 assert.equal(png.draws.filter(d=>d.source===source).length,1);
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
 await page.evaluate(()=>{window.waveDrain=true});await resume();
 const down=await freeze('down');
 assert.equal(down.fieldBoss.wavebinder.downReason,'valiant');
 assert.ok(!down.fieldBoss.wavebinder.valiant&&down.fieldBoss.wavebinder.courage===0);
 await canvas.screenshot({path:prefix+'-down.png'});await resume();
 await page.waitForFunction(()=>window.waveResult,undefined,{timeout:240000});
 const play=await page.evaluate(()=>window.waveResult);
 assert.ok(play.won&&play.drinkBroken&&play.valiantBroken&&play.sawValiant&&play.electroCasts>0,JSON.stringify(play));
 assert.deepEqual([...play.moves].sort(),['WB01','WB02','WB03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,570);assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,road);await gate(60,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[11200,750]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({browser:'Chrome',companion:'wanderer',play,scenery,
  mapRoute,
  questAcceptedInUi:true,questReport:{xp:11200,mora:750},drinkInterrupted:true,valiantInterrupted:true,
  sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  savedRespawn:true,viewport390:true,errors},null,2)+'\n');
 console.log('Wavebinder Chrome route, drinking, Valiant, Electro, comparison, quest and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  play:window.waveResult,actors:window.lab?.frame.actors,nearby:window.lab?.frame.storyNearbyPortal})),errors);
 throw error;
}finally{clearInterval(progress);await browser.close()}
