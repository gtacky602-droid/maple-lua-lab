import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1260,height:910}});
const canvas=page.locator('#game'),id='boss-25140101',quest='immortal-construct-commission';
const hub='snezhnaya-hub',road='snezhnaya-field',arena='immortal-construct-root-hollow';
const prefix='evidence/immortal-construct-field',source='immortal-construct-field-poses-source-v1.png';
const errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
const progress=setInterval(async()=>{
 try{
  const f=await frame();
  await fs.writeFile('work/immortal-construct-browser-progress.json',JSON.stringify({
   at:new Date().toISOString(),node:f.story?.node,t:f.t,paused:f.paused,boss:f.fieldBoss,
   actors:f.actors,result:await page.evaluate(()=>window.immortalResult)
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
 assert.equal(current.fieldBoss.maxhp,1260);
 assert.equal(current.draws.filter(d=>d.source===source).length,1);
 return current;
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8845/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/immortal-construct-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 assert.equal((await frame()).companion.id,'wanderer');
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(1380,road);await gate(1210,arena);
 assert.match((await frame()).location,/赤葉の根洞/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'immortalConstructField',file:'immortal-construct-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{const img=new Image();img.src='./assets/'+name;await img.decode()},source);
 const beforeFight=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let shieldBroken=false,lastFire=-20,fireCasts=0;
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.form==='down')shieldBroken=true;
   if(b?.phase==='respawn'||f.returns>0||f.t-start>180){
    for(const code of [...held])hold(code,false);
    window.immortalResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,shieldBroken,fireCasts};return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   const attackDx=(b?.x??940)-a.x,dx=(b?.x??940)-70-a.x;
   const turn=Math.abs(attackDx)>8&&attackDx*a.dir<0;
   const t=b?.tick,open=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='IC01'&&(open(84,105)||open(154,175))||
    b?.move==='IC02'&&(open(108,129)||open(188,209))||
    b?.move==='IC03'&&(b?.immortalConstruct.chantStart?open(b.immortalConstruct.chantStart+136,b.immortalConstruct.chantStart+157):(open(120,141)||open(200,221)||open(280,301)));
   const enabled=!!window.immortalFight&&(b?.move!=='IC03'||window.immortalBreak);
   if(enabled&&Math.abs(attackDx)<150&&!turn&&a.ground&&!f.macro&&f.t-lastFire>3.2){
    window.lab.action('slot1');lastFire=f.t;fireCasts++;
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
 assert.equal(ready.fieldBoss.immortalConstruct.units,0);
 await canvas.screenshot({path:prefix+'-ready.png'});
 await page.evaluate(()=>{window.immortalFight=true});
 await resume();
 const png=await freeze('life',62);
 assert.ok(png.fieldBoss.immortalConstruct.units>0);
 assert.equal(png.fieldBoss.immortalConstruct.spent,96);
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
 await page.evaluate(()=>{window.immortalBreak=true});
 await resume();
 const down=await freeze('down');
 assert.equal(down.fieldBoss.immortalConstruct.units,0);
 assert.ok(down.fieldBoss.immortalConstruct.downTicks>0);
 await canvas.screenshot({path:prefix+'-down.png'});
 await resume();
 await page.waitForFunction(()=>window.immortalResult,undefined,{timeout:240000});
 const play=await page.evaluate(()=>window.immortalResult);
 assert.ok(play.won&&play.shieldBroken&&play.fireCasts>0,JSON.stringify(play));
 assert.deepEqual([...play.moves].sort(),['IC01','IC02','IC03']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,550);assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,road);await gate(60,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[10600,720]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({browser:'Chrome',companion:'wanderer',play,scenery,
  questAcceptedInUi:true,questReport:{xp:10600,mora:720},shieldInterrupted:true,
  sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  savedRespawn:true,viewport390:true,errors},null,2)+'\n');
 console.log('Immortal Construct Chrome route, layered shield, interruption, comparison, quest and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  play:window.immortalResult,actors:window.lab?.frame.actors,nearby:window.lab?.frame.storyNearbyPortal})),errors);
 throw error;
}finally{clearInterval(progress);await browser.close()}
