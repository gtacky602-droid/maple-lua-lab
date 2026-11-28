import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub', course='natlan-surf-run', cove='natlan-surf-cove';
const quest='natlan-mualani-surf',checkpoint=process.env.LAB_SURF_CHECKPOINT;
const prefix=process.env.LAB_SURF_OUTPUT||'evidence/nat-mualani-surf';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:24000});
const at=node=>wait(node=>window.lab?.frame.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const button=name=>page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true});
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
 await canvas.click();
 await page.keyboard.press(code);
}

async function move(x){
 const f=await frame();
 const here=f.actors[f.active-1].x;
 if(Math.abs(here-x)<8)return;
 const right=x>here,code=right?'KeyD':'KeyA';
 await canvas.click();
 await page.keyboard.down(code);
 try{
  await wait(({x,right})=>{
   const f=window.lab.frame, here=f.actors[f.active-1].x;
   return right?here>=x-5:here<=x+5;
  },{x,right});
 }finally{await page.keyboard.up(code)}
}

async function collect(x,label){
 await move(x);
 await wait(label=>window.lab.frame.storyNearbyMilestone?.label===label,label);
 await key('KeyG');
}

async function gate(x,node){
 await move(x);
 await wait(id=>window.lab.frame.storyNearbyPortal?.to===id&&window.lab.frame.storyNearbyPortal.available,node);
 await key('KeyF');
 await at(node);
}

async function load(){
 await page.locator('#loadProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('保存した進行で町から再開しました'));
 await at(hub);
}

async function save(){
 await page.locator('#saveProgress').click();
 await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 return page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
}

async function reload(){
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load();
}

async function background(key){
 const status=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.equal(status.key,key);
 assert.equal(status.state,'ready');
}

async function compare(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.ok(png.draws.some(d=>d.source==='nat-mualani-surf-props-source-v1.png'));
 await shot('cove-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('cove-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.equal(f.camera,png.camera);
  assert.deepEqual(f.storySurf,png.storySurf);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
 }
 for(const f of [png,standard,light]){
  assert.ok(f.draws.some(d=>d.kind==='rect'&&d.color==='#ffdb86'&&d.x+f.camera===512&&d.y===475));
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

async function skate(){
 const launch=[{from:470,after:690},{from:1018,after:1280}];
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{
  for(const stage of launch){
   await wait(x=>{
    const f=window.lab.frame;
    return f.actors[f.active-1].x>=x;
   },stage.from);
   await page.keyboard.press('Space');
   await wait(x=>{
    const f=window.lab.frame;
    return f.actors[f.active-1].x>=x;
   },stage.after);
  }
  await count(3);
 }finally{await page.keyboard.up('KeyD')}
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8927/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile(checkpoint||'work/nat-mualani-surf-fixture.json','utf8');
 const input=JSON.parse(seed);
 assert.equal(input.story.quests[quest],undefined);
 if(checkpoint)assert.equal(input.story.quests['natlan-kachina-charms'].status,'complete');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 const start=await frame();
 assert.equal(start.progression.level,input.progression.level);
 await button('受注').click();
 await collect(302,'ムアラニに水遊びの話を聞く');
 await count(1);
 await gate(545,course);
 await background('natlanSurfRun');
 await collect(190,'練習ボードに乗る');
 await count(2);
 await shot('course');
 const beforeFall=await frame();
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(()=>window.lab.frame.storySurf?.retries>0)}finally{await page.keyboard.up('KeyD')}
 const fell=await frame();
 assert.ok(fell.actors[fell.active-1].x<360);
 assert.equal(fell.hits,beforeFall.hits);
 assert.deepEqual(fell.actors.map(actor=>actor.hp),beforeFall.actors.map(actor=>actor.hp));
 assert.match(await page.locator('#surfStatus').innerText(),/浅瀬に戻った回数 [1-9]/);
 await save();
 await reload();
 await count(2);
 await gate(545,course);
 await collect(190,'練習ボードをもう一度借りる');
 await wait(()=>window.lab.frame.storySurf?.phase==='run');
 assert.equal((await frame()).storySurf.retries,0);
 await skate();
 await gate(1562,cove);
 await background('natlanSurfCove');
 assert.equal((await frame()).total,0);
 await collect(445,'コホラ竜と返球遊びを始める');
 await wait(()=>window.lab.frame.storySurf.phase==='cove');
 await wait(()=>window.lab.frame.storySurf?.waiting);
 assert.match(await page.locator('#surfStatus').innerText(),/ボールを拾っています/);
 await wait(()=>window.lab.frame.storySurf?.retries>0);
 await count(3);
 await wait(()=>window.lab.frame.storySurf?.ball?.y<385);
 const calls=await compare();
 const hit=page.locator('#surfHit');
 await wait(()=>window.lab.frame.storySurf?.ready);
 await page.keyboard.press('KeyJ');
 await count(4);
 const firstReturn=await frame();

 await collect(445,'もう一回、返球遊びを始める');
 await wait(()=>window.lab.frame.storySurf?.phase==='cove');
 await page.setViewportSize({width:390,height:844});
 await hit.scrollIntoViewIfNeeded();
 const bounds=await hit.boundingBox();
 assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 assert.equal(await page.locator('#touchJump').isVisible(),false);
 assert.ok(await page.getByRole('button',{name:'左へ移動'}).isVisible());
 assert.ok(await page.getByRole('button',{name:'右へ移動'}).isVisible());
 await shot('mobile');
 await wait(()=>window.lab.frame.storySurf?.ready);
 await hit.click();
 await wait(()=>window.lab.frame.storySurf?.result==='cove');
 const replay=await frame();
 assert.equal(replay.story.quests[quest].count,4);
 assert.equal(replay.progression.questXp,firstReturn.progression.questXp);
 assert.equal(replay.mora,firstReturn.mora);

 await page.setViewportSize({width:1280,height:960});
 await gate(1074,hub);
 const beforeReport=await frame();
 await button('報告').click();
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 const afterReport=await frame();
 const reward=[afterReport.progression.questXp-beforeReport.progression.questXp,afterReport.mora-beforeReport.mora];
 assert.deepEqual(reward,[1404867,4900]);
 const complete=await save(),saved=JSON.parse(complete);
 const preserved=Object.entries(input.story.quests).filter(([,state])=>state.status==='complete');
 for(const [id,state] of preserved)assert.deepEqual(saved.story.quests[id],state,id);
 if(checkpoint)await fs.writeFile(prefix+'-complete.json',complete+'\n');
 await reload();
 const restored=await frame();
 assert.equal(restored.story.quests[quest].status,'complete');
 assert.equal(restored.progression.questXp,afterReport.progression.questXp);
 assert.equal(restored.companion.id,start.companion.id);
 await collect(307,'水しぶきの波札を見る');
 await wait(()=>document.querySelector('#storyObjective')?.textContent?.includes('水しぶきの波札')||
  document.body.textContent.includes('ムアラニとコホラ竜と遊んだ記念'));
 await move(275);
 await shot('memento');
 assert.deepEqual(errors,[]);
 const proof={waveFallRecovery:true,courseSaveAndResume:true,jumpOverBothWaves:true,missAndRethrow:true,
  landingMarkerAllProfiles:true,keyboardRally:true,mobileRallyButton:true,
  replayExitAndReport:true,mementoOnReload:true,sourceSha256:createHash('sha256').update(seed).digest('hex'),
  startLevel:start.progression.level,reportedLevel:restored.progression.level,companion:restored.companion.id,
  priorCompleted:preserved.length,reward,calls,errors};
 await fs.writeFile(prefix+'-web.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Mualani browser playthrough passed',calls);
}catch(err){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,quest:f?.story?.quests['natlan-mualani-surf'],camera:f?.camera,actors:f?.actors,
   m:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,surf:f?.storySurf,paused:f?.paused};
 }));
 await page.screenshot({path:prefix+'-failure.png'});
 throw err;
}finally{
 await browser.close();
}
