import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:910}}),canvas=page.locator('#game');
const id='boss-29020101',quest='andrius-weekly-commission',prefix='evidence/andrius-weekly',errors=[];
const frame=()=>page.evaluate(()=>window.lab.frame);page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
async function gate(x,node){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.click();await page.keyboard.down(key);
 try{await page.waitForFunction(({x,east})=>{const f=window.lab.frame,a=f.actors[f.active-1];return east?a.x>=x-8:a.x<=x+8},{x,east},{timeout:90000})}
 finally{await page.keyboard.up(key)}
 await page.waitForFunction(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);
 await page.keyboard.press('KeyF');await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}
async function freeze(move,tick){
 await page.waitForFunction(({move,tick})=>{const f=window.lab.frame,b=f.weeklyBoss;
  if(b?.move!==move||b.tick<tick||f.paused)return false;window.lab.action('pause');return true;
 },{move,tick},{timeout:180000});await page.waitForFunction(()=>window.lab.frame.paused);return frame();
}
async function resume(){await canvas.click();await page.keyboard.press('KeyP');await page.waitForFunction(()=>!window.lab.frame.paused)}
const progress=setInterval(async()=>{try{await fs.writeFile('work/andrius-browser-progress.json',JSON.stringify({at:new Date().toISOString(),frame:await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.andriusResult}))},null,2))}catch{}},5000);progress.unref();
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8849/');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/andrius-weekly-fixture.json','utf8'));
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town');
 const row=page.locator(`[data-quest="${quest}"]`);await row.getByRole('button',{name:'受注',exact:true}).click();
 await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await gate(1380,'mond-road');await gate(940,'andrius-wolf-ring');const before=await frame();
 assert.match(before.weeklyBoss.resistance,/風・氷 無効/);
 const scenery=await page.evaluate(async()=>{const {sceneryStatus,backgroundReady}=await import('./scenery.js');await backgroundReady;return sceneryStatus(window.lab.frame)});
 assert.deepEqual(scenery,{key:'andriusWeekly',file:'andrius-weekly-background-v1.png',state:'ready'});
 await page.evaluate(()=>{
  const held=new Set(),moves=new Set(),start=window.lab.frame.t;
  let aiUpper=false,manualUpper=false,immuneCast=false,immuneEvent=false,maxFalls=0;
  function hold(code,on){if(on===held.has(code))return;on?held.add(code):held.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}))}
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1],ai=f.actors[2-f.active];
   immuneEvent||=f.events?.some(e=>e.kind==='immune:anemo'&&e.actor===1);
   if(b?.move)moves.add(b.move);maxFalls=Math.max(maxFalls,b?.falls||0);
   if(b?.stage==='INTERLUDE'){
    aiUpper||=ai.ground&&Math.abs(ai.y-356.8)<1;manualUpper||=a.ground&&Math.abs(a.y-356.8)<1;
   }
   if(b?.phase==='respawn'||f.returns>0||f.t-start>300){
    for(const code of [...held])hold(code,false);
    window.andriusResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),hp:a.hp,returns:f.returns,moves:[...moves],
     transitions:b?.transitions,falls:maxFalls,aiUpper,manualUpper,immuneEvent};return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   const c=b?.attack,m=b?.move,t=b?.tick;
   let dest=(b?.x??480)-70,jump=!a.ground,attack=b?.stage!=='INTERLUDE'||t>=504;
   if(m==='WA01'&&t<84&&c)dest=c.origin-c.dir*75;
   else if(m==='WA02'&&t<96&&c)dest=c.origin+c.dir*75;
   else if(m==='WA03'&&c?.center&&t<138)dest=c.center+(a.x>=c.center?125:-125);
   else if(m==='WA04'&&c?.left&&t<120)dest=Math.abs(a.x-c.left)<Math.abs(a.x-c.right)?c.left-30:c.right+30;
   else if(m==='WA05'&&t<120&&c)dest=c.origin-c.dir*150;
   else if(m==='WA06'&&t<504){
    const p=a.x<480?{x:40,w:176}:{x:744,w:176};dest=p.x+p.w/2;
    if(a.ground&&a.y>360&&Math.abs(a.x-dest)<110){window.lab.action('jump');jump=true}
    attack=false;
   }else if((m==='WA07'||m==='WA08')&&c)dest=c.origin-c.dir*75;
   else if(m==='WA09'&&c?.points&&t<240){
    const choices=[];for(let x=100;x<=860;x+=10)if(Math.min(...c.points.map(p=>Math.abs(x-p)))>=45)choices.push(x);
    choices.sort((x,y)=>Math.abs(x-b.x)-Math.abs(y-b.x));dest=choices[0];
   }else if(m==='WA10'&&t<180&&c){
    const left=c.origin-275,right=c.origin+275;dest=Math.abs(a.x-left)<Math.abs(a.x-right)?left:right;
   }else if(m==='WA11'&&c?.entry){
    const arrival=72+Math.abs(a.x-c.entry)/640*48;
    if(t>=arrival-20&&t<arrival+4&&a.ground){window.lab.action('jump');jump=true}
   }
   dest=Math.max(90,Math.min(870,dest));const dx=dest-a.x,aim=(b?.x??480)-a.x;
   let direction=dx>8?1:dx<-8?-1:0;
   if(!direction&&Math.abs(aim)>5&&aim*a.dir<0)direction=aim>0?1:-1;
   if(window.andriusFight&&!immuneCast&&Math.abs(aim)<110&&aim*a.dir>=0&&a.ground){window.lab.action('slot1');immuneCast=true}
   hold('KeyA',direction<0);hold('KeyD',direction>0);hold('Space',jump);hold('KeyJ',!!window.andriusFight&&attack&&Math.abs(aim)<114);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 });
 const normal=await freeze('WA01',38);assert.equal(normal.weeklyBoss.maxhp,900);await canvas.screenshot({path:prefix+'-normal.png'});
 await page.evaluate(()=>{window.andriusFight=true});await resume();
 const interlude=await freeze('WA06',120);assert.equal(interlude.weeklyBoss.transitions,1);await canvas.screenshot({path:prefix+'-interlude.png'});await resume();
 const png=await freeze('WA08',80);assert.ok(png.weeklyBoss.awakened&&png.weeklyBoss.stage==='P2');await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');await page.waitForFunction(()=>window.lab.frame.commands>1000);const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);const light=await frame();
 assert.deepEqual([standard.t,light.t],[png.t,png.t]);await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');await page.evaluate(()=>{window.andriusFight=false});await resume();
 await freeze('WA09',145);await canvas.screenshot({path:prefix+'-rain.png'});await resume();
 await freeze('WA10',96);await canvas.screenshot({path:prefix+'-howl.png'});await resume();
 const swipe=await freeze('WA01',38);assert.ok(swipe.weeklyBoss.awakened&&swipe.draws.some(d=>d.source==='andrius-weekly-awake-actions-source-v1.png'));
 await canvas.screenshot({path:prefix+'-awake-swipe.png'});await resume();
 const tail=await freeze('WA02',50);assert.ok(tail.weeklyBoss.awakened&&tail.draws.some(d=>d.source==='andrius-weekly-awake-actions-source-v1.png'));
 await canvas.screenshot({path:prefix+'-awake-tail.png'});await page.evaluate(()=>{window.andriusFight=true});await resume();
 await page.waitForFunction(()=>window.andriusResult,undefined,{timeout:300000});const play=await page.evaluate(()=>window.andriusResult);
 assert.ok(play.won&&play.aiUpper&&play.manualUpper&&play.immuneEvent&&play.transitions===1&&play.returns===0&&play.falls===0,JSON.stringify(play));
 const defeated=await frame();assert.equal(defeated.mora-before.mora,330);assert.equal(defeated.story.quests[quest].count,1);
 await gate(35,'mond-road');await gate(60,'mond-town');const beforeReport=await frame();
 await row.getByRole('button',{name:'報告',exact:true}).click();await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
 const report=await frame();assert.deepEqual([report.progression.questXp-beforeReport.progression.questXp,report.mora-beforeReport.mora],[1600,390]);
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));assert.equal(save.weeklyBosses[id].hp,0);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({browser:'Chrome',companion:'amber',play,scenery,uiQuestAccepted:true,
  questReport:{xp:1600,mora:390},savedWeeklyRespawn:true,awakenedActionShots:true,sameSceneCommands:{png:png.commands,standard:standard.commands,light:light.commands},viewport390:true,errors},null,2)+'\n');
 console.log('Andrius Chrome: two phases, interlude upper route, immunity, comparison, report and save passed.');
}catch(e){console.error(await page.evaluate(()=>({t:window.lab?.frame.t,boss:window.lab?.frame.weeklyBoss,actors:window.lab?.frame.actors,result:window.andriusResult})),errors);throw e}
finally{clearInterval(progress);await browser.close()}
