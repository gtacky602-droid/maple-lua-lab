import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:910}});
const canvas=page.locator('#game'),id='boss-24111101',quest='fallen-vigil-commission';
const hub='dornman-camp',arena='windrest-vigil-court';
const prefix='evidence/fallen-vigil-field',source='fallen-vigil-field-poses-source-v1.png';
const errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
const progress=setInterval(async()=>{
 try{
  const f=await frame();
  await fs.writeFile('work/fallen-vigil-browser-progress.json',JSON.stringify({
   at:new Date().toISOString(),node:f.story?.node,t:f.t,paused:f.paused,boss:f.fieldBoss,
   actors:f.actors,result:await page.evaluate(()=>window.vigilResult)
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
 assert.equal(current.fieldBoss.maxhp,700);
 assert.equal(current.draws.filter(d=>d.source===source).length,form==='charging'?3:1);
 return current;
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8842/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/fallen-vigil-field-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForFunction(hub=>window.lab.frame.story.node===hub,hub);
 assert.equal((await frame()).companion.id,'amber');
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(970,arena);
 assert.match((await frame()).location,/風息山の石庭/);
 const scenery=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual(scenery,{key:'vigilField',file:'fallen-vigil-field-background-v1.png',state:'ready'});
 await page.evaluate(async name=>{
  const img=new Image();img.src='./assets/'+name;await img.decode();
 },source);
 const beforeFight=await frame();
 await canvas.click();
 await page.keyboard.press('KeyE');
 await page.waitForFunction(()=>window.lab.frame.active===2);
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let interrupted=false,lastCast=-20,skill1=0,skill2=0,recorded=[];
  function hold(code,on){
   if(on===held.has(code))return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function control(){
   const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
   if(b?.form==='down')interrupted=true;
   if(b?.vigil?.records?.every(e=>e==='pyro'))recorded=b.vigil.records;
   if(b?.phase==='respawn'||f.returns>0||f.t-start>180){
    for(const code of [...held])hold(code,false);
    window.vigilResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),moves:[...moves],
     hp:a.hp,returns:f.returns,interrupted,recorded,skill1,skill2};return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);
   let target=b;
   if(b?.summons?.length)target=b.summons.reduce((best,u)=>Math.abs(u.x-a.x)<Math.abs(best.x-a.x)?u:best);
   const attackDx=(target?.x??940)-a.x,dx=(target?.x??940)-70-a.x;
   const turn=Math.abs(attackDx)>8&&attackDx*a.dir<0;
   const t=b?.tick,open=(first,last)=>t>=first&&t<last;
   const jump=b?.move==='FV01'&&(open(84,105)||open(154,175))||
    b?.move==='FV02'&&(open(92,113)||open(158,179))||
    b?.move==='FV03'&&(open(910,931)||open(990,1011));
   if(window.vigilRecord&&f.active===2&&b?.vigil?.monitor&&!b.vigil.recorded&&!turn&&f.t-lastCast>.8){
    const key=b.vigil.monitor===1?'skill1':'skill2';
    if((a.cd[key]??0)===0&&a.lock<=0){
     window.lab.action(key);lastCast=f.t;
     if(key==='skill1')skill1++;else skill2++;
    }
   }
   hold('Space',jump);
   let steer=0;
   if(Math.abs(dx)>12)steer=Math.sign(dx);
   else if(turn)steer=Math.sign(attackDx);
   hold('KeyA',steer<0);hold('KeyD',steer>0);
   hold('KeyJ',!!window.vigilAttack&&Math.abs(attackDx)<125&&!turn);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const monitor=await freeze('monitoring',62);
 assert.equal(monitor.fieldBoss.vigil.monitor,1);
 await canvas.screenshot({path:prefix+'-monitor.png'});
 await page.evaluate(()=>{window.vigilRecord=true});
 await resume();
 const png=await freeze('charging',422);
 assert.deepEqual(png.fieldBoss.vigil.records,['pyro','pyro']);
 assert.equal(png.fieldBoss.vigil.counts.pyro,6);
 assert.equal(png.fieldBoss.summons.length,2);
 assert.ok(png.fieldBoss.summons.every(u=>u.maxhp===3));
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
 await page.evaluate(()=>{window.vigilAttack=true});
 await resume();
 const down=await freeze('down');
 assert.ok(down.fieldBoss.tick<930);
 assert.match(down.fieldBoss.label,/元素星を破壊/);
 assert.ok(!down.fieldBoss.summons);
 await canvas.screenshot({path:prefix+'-down.png'});
 await resume();
 await page.keyboard.press('KeyE');
 await page.waitForFunction(()=>window.lab.frame.active===1);
 await page.waitForFunction(()=>window.vigilResult,undefined,{timeout:220000});
 const play=await page.evaluate(()=>window.vigilResult);
 assert.ok(play.won&&play.interrupted&&play.skill1>0&&play.skill2>0,JSON.stringify(play));
 assert.deepEqual(play.moves,['FV01','FV02','FV03']);
 assert.deepEqual(play.recorded,['pyro','pyro']);
 const defeated=await frame();
 assert.equal(defeated.mora-beforeFight.mora,155);
 assert.equal(defeated.story.quests[quest].count,1);
 await gate(65,hub);
 const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();
 assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,
                   report.mora-beforeReport.mora],[1400,220]);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.fieldBosses[id].hp,0);assert.ok(save.fieldBosses[id].waitTicks>0);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({browser:'Chrome',companion:'amber',play,scenery,
  questAcceptedInUi:true,questReport:{xp:1400,mora:220},twoPyroRecords:true,
  repeatedElementRequiredSix:true,twoActiveStars:true,normalCastsBreakStars:true,
  sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},
  starsBrokenTick:down.fieldBoss.tick,savedRespawn:true,viewport390:true,errors},null,2)+'\n');
 console.log('Fallen Vigil Chrome route, two elemental records, active stars, interruption, quest and save passed.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,field:window.lab?.frame.fieldBoss,
  play:window.vigilResult,actors:window.lab?.frame.actors,nearby:window.lab?.frame.storyNearbyPortal})),errors);
 throw error;
}finally{clearInterval(progress);await browser.close()}
