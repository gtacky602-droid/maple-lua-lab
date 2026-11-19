import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:910}});
const canvas=page.locator('#game'),id='boss-29010101',quest='dvalin-weekly-commission';
const prefix='evidence/dvalin-weekly',errors=[],frame=()=>page.evaluate(()=>window.lab.frame);
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
async function gate(x,node){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.click();await page.keyboard.down(key);
 await page.keyboard.down('Space');
 await page.evaluate(east=>{window.dvalinGateTimer=setInterval(()=>{
  const f=window.lab.frame,a=f.actors[f.active-1];if(!f.weeklyBoss||!a.ground)return;
  for(const p of [{x:0,w:264},{x:303.6,w:264},{x:607.2,w:264}]){
   const edge=east?p.x+p.w:p.x;
   if(a.x>=p.x&&a.x<=p.x+p.w&&Math.abs(a.x-edge)<50&&edge>0&&edge<850)window.lab.action('jump');
  }
 },30)},east);
 try{await page.waitForFunction(({x,east})=>{const f=window.lab.frame,a=f.actors[f.active-1];return east?a.x>=x-8:a.x<=x+8},{x,east},{timeout:90000})}
 finally{await page.keyboard.up(key);await page.keyboard.up('Space');await page.evaluate(()=>clearInterval(window.dvalinGateTimer))}
 await page.waitForFunction(node=>window.lab.frame.storyNearbyPortal?.to===node,node);
 await page.keyboard.press('KeyF');await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}
async function freeze(move,tick){
 await page.waitForFunction(({move,tick})=>{
  const f=window.lab.frame,b=f.weeklyBoss;if(b?.move!==move||b.tick<tick||f.paused)return false;
  window.lab.action('pause');return true;
 },{move,tick},{timeout:180000});
 await page.waitForFunction(()=>window.lab.frame.paused);return frame();
}
async function resume(){await canvas.click();await page.keyboard.press('KeyP');await page.waitForFunction(()=>!window.lab.frame.paused)}
const progress=setInterval(async()=>{try{await fs.writeFile('work/dvalin-browser-progress.json',JSON.stringify({at:new Date().toISOString(),frame:await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.dvalinResult}))},null,2))}catch{}},5000);progress.unref();
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8847/');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/dvalin-weekly-fixture.json','utf8'));
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town');
 const row=page.locator(`[data-quest="${quest}"]`);await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await page.keyboard.press('KeyM');
 const atlas=page.locator('#worldAtlas');
 await atlas.waitFor();
 await page.locator('#atlasLayer').selectOption('boss');
 await page.locator('#atlasSearch').fill('トワリン');
 await page.locator('#atlasField').selectOption('dvalin-sky-arena');
 await page.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='dvalin-sky-arena');
 const map=(await frame()).worldMap;
 const mapRoute=map.guide.stops.map(stop=>stop.id);
 assert.equal(map.guide.status,'ready');
 assert.deepEqual(mapRoute,['mond-road','dvalin-sky-arena']);
 await page.keyboard.press('Escape');
 await atlas.waitFor({state:'hidden'});
 await gate(1380,'mond-road');await gate(1280,'dvalin-sky-arena');
 const scenery=await page.evaluate(async()=>{const {sceneryStatus,backgroundReady}=await import('./scenery.js');await backgroundReady;return sceneryStatus(window.lab.frame)});
 assert.equal(scenery.key,'dvalinWeekly');assert.equal(scenery.state,'ready');
 const before=await frame();
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t,platforms=[{x:0,w:264},{x:303.6,w:264},{x:607.2,w:264}];
  let aiLanded=false,manualLanded=false,maxFalls=0;
  function hold(code,on){if(on===held.has(code))return;on?held.add(code):held.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}))}
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1],ai=f.actors[2-f.active];
   if(b?.phase==='respawn'||f.returns>0||f.t-start>260){
    for(const c of [...held])hold(c,false);
    window.dvalinResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),hp:a.hp,returns:f.returns,moves:[...moves],breaks:b?.breaks,falls:maxFalls,aiLanded,manualLanded};return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);maxFalls=Math.max(maxFalls,b?.falls||0);
   if(b?.exposed){aiLanded||=ai.ground&&Math.abs(ai.y-420)<1;manualLanded||=a.ground&&Math.abs(a.y-420)<1}
   const m=b?.move,t=b?.tick,c=b?.attack;
   let dest=a.x,jump=!a.ground,attack=false,aim=null;
   const dodge=m==='WD01'&&t>=52&&t<103||m==='WD06'&&t>=150&&t<193;
   if(dodge){jump=true;if(a.ground)window.lab.action('jump')}
   if(m==='WD08'){
    dest=b.crystal.x-30;jump=true;attack=t>=42&&t<462;aim=b.crystal.x;
    if(a.ground&&a.y>423&&Math.abs(dest-a.x)<100)window.lab.action('jump');
   }else if((m==='WD02'||m==='WD03')&&c){
    dest=c.center+(m==='WD02'?65:c.dir*75);aim=c.center+65;attack=true;
    if(m==='WD02'&&t>=70&&t<103){jump=true;if(a.ground)window.lab.action('jump')}
    if(m==='WD03'&&t>=90&&t<234){
     const q=(t-90)/144,beam=c.dir<0?c.right-(c.right-c.left)*q:c.left+(c.right-c.left)*q;
     if(Math.abs(beam-a.x)<65&&a.ground){window.lab.action('jump');jump=true}
    }
   }else if(c){
    dest=platforms[c.zone===1?1:0].x+132;
    if(m==='WD07'&&c.points){
     const p=platforms[c.zone-1],score=x=>Math.min(...c.points.map(v=>Math.abs(x-v)));
     dest=score(p.x+20)>score(p.x+p.w-20)?p.x+20:p.x+p.w-20;
    }
   }
   if(b?.hazard&&m!=='WD08'){
    const p=platforms[b.hazard.zone-1];if(dest>=p.x&&dest<=p.x+p.w)dest=platforms[b.hazard.zone===1?1:0].x+132;
   }
   const dx=dest-a.x;let direction=dx>10?1:dx<-10?-1:0;
   if(!direction&&aim!==null&&(aim-a.x)*a.dir<0)direction=aim>a.x?1:-1;
   if(direction)for(const p of platforms){const edge=direction>0?p.x+p.w:p.x;
    if(a.ground&&a.x>=p.x&&a.x<=p.x+p.w&&Math.abs(a.x-edge)<55&&(dest-edge)*direction>25){window.lab.action('jump');jump=true}
   }
   hold('KeyA',direction<0);hold('KeyD',direction>0);hold('Space',jump);hold('KeyJ',attack&&!!window.dvalinFight);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const perch=await freeze('WD02',50);assert.equal(perch.weeklyBoss.maxhp,600);
 await canvas.screenshot({path:prefix+'-perch.png'});await page.evaluate(()=>{window.dvalinFight=true});await resume();
 const png=await freeze('WD08',170);assert.ok(png.weeklyBoss.exposed);
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');await page.waitForFunction(()=>window.lab.frame.commands>1000);const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);const light=await frame();
 assert.deepEqual([standard.t,light.t],[png.t,png.t]);await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');await resume();
 const floor=await freeze('WD05',100);assert.ok(floor.draws.some(d=>d.text==='SAFE'));
 await canvas.screenshot({path:prefix+'-floor.png'});await resume();
 await page.waitForFunction(()=>window.dvalinResult,undefined,{timeout:300000});
 const play=await page.evaluate(()=>window.dvalinResult);assert.ok(play.won&&play.aiLanded&&play.manualLanded&&play.returns===0&&play.falls===0,JSON.stringify(play));
 const defeated=await frame();assert.equal(defeated.mora-before.mora,300);assert.equal(defeated.story.quests[quest].count,1);
 await gate(35,'mond-road');await gate(60,'mond-town');const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[1400,360]);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));assert.equal(save.weeklyBosses[id].hp,0);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({browser:'Chrome',companion:'amber',play,scenery,mapRoute,uiQuestAccepted:true,questReport:{xp:1400,mora:360},savedWeeklyRespawn:true,
  sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},viewport390:true,errors},null,2)+'\n');
 console.log('Dvalin Chrome: actual pads, guard/crystal, floor warning, quest, comparison and saved respawn passed.');
}catch(e){console.error(await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.dvalinResult})),errors);throw e}
finally{clearInterval(progress);await browser.close()}
