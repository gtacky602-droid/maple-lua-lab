import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub', trail='natlan-kinich-hunt', field='natlan-field';
const quest='natlan-kinich-ambush',checkpoint=process.env.LAB_KINICH_CHECKPOINT;
const prefix=process.env.LAB_KINICH_OUTPUT||'evidence/nat-kinich-ambush';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg,timeout=24000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const questRow=()=>page.locator(`[data-quest="${quest}"]`);
const button=name=>questRow().getByRole('button',{name,exact:true});
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
   const f=window.lab.frame,p=f.actors[f.active-1].x;
   return right?p>=x-5:p<=x+5;
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

async function load(seed){
 if(seed)await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
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

async function holdAlly(){
 if((await frame()).holdAllyFire)return;
 await page.locator('#allyFire').click();
 await wait(()=>window.lab.frame.holdAllyFire);
}

async function begin(seed){
 await load(seed);
 await holdAlly();
 await button('受注').click();
 await collect(392,'キィニチに狩りの話を聞く');
 await count(1);
 await gate(405,trail);
}

async function compare(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.ok(png.draws.some(d=>d.source==='fanged-beast-idle-source-v1.png'));
 assert.ok(png.draws.some(d=>d.source==='nat-kinich-ambush-props-source-v1.png'));
 await shot('trail-png');
 const menu=page.locator('#renderMode');
 await menu.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await menu.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await shot('trail-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.equal(f.camera,png.camera);
  assert.deepEqual(f.storyKinichHunt,png.storyKinichHunt);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
 }
 await menu.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

async function fight(){
 for(let attempt=0;attempt<125;attempt++){
  const f=await frame(),hunt=f.storyKinichHunt;
  if(f.story.quests[quest].count===2)return;
  if(hunt.phase!=='scouting'&&hunt.phase!=='engaged'){
   await wait(q=>window.lab.frame.storyKinichHunt?.phase==='engaged'||
    window.lab.frame.story.quests[q]?.count===2,quest);
   continue;
  }
  const actor=f.actors[f.active-1],dx=hunt.beast.x-actor.x;
  if(Math.abs(dx)>42)await move(hunt.beast.x-Math.sign(dx)*34);
  const nearby=await frame();
  if(!nearby.storyKinichHunt.beast)continue;
  const player=nearby.actors[nearby.active-1];
  const dir=nearby.storyKinichHunt.beast.x>=player.x?1:-1;
  await canvas.click();
  if(player.dir!==dir){
   const key=dir>0?'KeyD':'KeyA';
   await page.keyboard.down(key);
   try{
    await wait(dir=>{
     const f=window.lab.frame;
     return f.actors[f.active-1].dir===dir;
    },dir);
   }finally{await page.keyboard.up(key)}
  }
  const start=(await frame()).t;
  await page.keyboard.down('KeyJ');
  try{
   await wait(({start,quest})=>window.lab.frame.t>=start+.35||
    window.lab.frame.story.quests[quest]?.count===2,{start,quest});
  }finally{await page.keyboard.up('KeyJ')}
 }
 assert.fail('Normal attacks did not defeat the beast');
}

async function report(dialogue){
 await gate(60,hub);
 const before=await frame();
 await button('報告').click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await questRow().filter({hasText:dialogue}).waitFor();
 const after=await frame();
 const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora,
  after.inventory.upgradeOre-before.inventory.upgradeOre];
 assert.deepEqual(reward,[1807313,5600,5]);
 return reward;
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8928/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile(checkpoint||'work/nat-kinich-ambush-fixture.json','utf8');
 const input=JSON.parse(seed);
 assert.equal(input.story.quests[quest],undefined);
 if(checkpoint)assert.equal(input.story.quests['natlan-mualani-surf'].status,'complete');
 await begin(seed);
 assert.equal((await frame()).progression.level,input.progression.level);
 assert.deepEqual(await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 }),{key:'natlanKinichHunt',file:'nat-kinich-ambush-trail-background-v1.png',state:'ready'});
 await collect(314,'足跡を調べる');
 await collect(425,'折れた枝を調べる');
 await collect(606,'狭い坂道で待ち伏せする');
 await wait(()=>window.lab.frame.storyKinichHunt?.site==='slope');
 await key('KeyM');
 await wait(id=>window.lab.frame.worldMap?.selected?.id===id,trail);
 const objectives=page.locator('#atlasQuestObjectives');
 const locations=await objectives.locator('a[href*="worksite="]').allTextContents();
 assert.deepEqual(locations,['狭い坂道（選択中）の位置を見る','開けた岩場の位置を見る','上下の岩棚の位置を見る']);
 const ledge=objectives.getByRole('link',{name:'上下の岩棚の位置を見る'});
 const [preview]=await Promise.all([page.waitForEvent('popup'),ledge.click()]);
 try{
  await preview.waitForFunction(()=>window.mapArt?.ready&&window.mapArt.node==='natlan-kinich-hunt');
  assert.match(await preview.locator('#surveyPointNote').innerText(),/目印の真下でジャンプを長押し/);
 }finally{await preview.close()}
 await page.keyboard.press('KeyM');
 await wait(()=>!window.lab.frame.worldMap);
 await save();
 await reload();
 await holdAlly();
 await gate(405,trail);
 assert.equal((await frame()).storyKinichHunt.site,'slope');
 await move(653);
 const turn=await (await wait(()=>{
  const hunt=window.lab.frame.storyKinichHunt;
  const cue=document.querySelector('#storyForest').textContent;
  return hunt?.phase==='turn'&&cue.includes('牙獣が折り返すまで')&&hunt;
 })).jsonValue();
 assert.ok(turn.returnSeconds>0&&turn.returnSeconds<=.62);
 await wait(()=>window.lab.frame.storyKinichHunt?.phase==='return'&&
  document.querySelector('#storyForest').textContent.includes('牙獣が狭い坂道へ戻ってきます'));
 await wait(()=>window.lab.frame.storyKinichHunt?.phase==='engaged');
 const calls=await compare();
 await fight();
 assert.equal((await frame()).storyKinichHunt.outcome,'slope');
 await move(2550);
 await wait(id=>window.lab.frame.storyNearbyPortal?.to===id&&!window.lab.frame.storyNearbyPortal.available,field);
 const reward=await report('狭い坂に進路を絞れた');
 const complete=await save(),saved=JSON.parse(complete);
 const preserved=Object.entries(input.story.quests).filter(([,state])=>state.status==='complete');
 for(const [id,state] of preserved)assert.deepEqual(saved.story.quests[id],state,id);
 if(checkpoint)await fs.writeFile(prefix+'-complete.json',complete+'\n');
 await reload();
 const restored=await frame();
 assert.equal(restored.story.quests[quest].huntNotes.outcome,'slope');
 assert.equal(restored.progression.level,saved.progression.level);
 await gate(405,trail);
 assert.equal((await frame()).total,0);
 await gate(2550,field);
 await gate(925,trail);
 assert.equal((await frame()).total,0);

 await begin(seed);
 await fight();
 assert.equal((await frame()).storyKinichHunt.outcome,'direct');
 await report('正面から止められるなら');

 await begin(seed);
 await collect(425,'折れた枝を調べる');
 await collect(314,'足跡を調べる');
 await move(1822);
 assert.equal((await frame()).storyNearbyMilestone,undefined);
 await canvas.click();
 await page.keyboard.down('Space');
 try{
  await wait(()=>window.lab.frame.actors[0].y===367&&
   window.lab.frame.storyNearbyMilestone?.label==='上下の岩棚で待ち伏せする');
 }finally{await page.keyboard.up('Space')}
 await key('KeyG');
 await wait(()=>window.lab.frame.storyKinichHunt?.site==='ledges');
 await shot('ledge');
 await page.setViewportSize({width:390,height:844});
 await page.locator('#game').scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 const proof={slopeAfterReload:true,directWithoutClues:true,actualJumpToLedge:true,
   atlasAmbushSites:true,turnCountdown:true,differentDialogue:true,shortcutBothWays:true,
   mobileFits:true,sourceSha256:createHash('sha256').update(seed).digest('hex'),
   startLevel:input.progression.level,reportedLevel:restored.progression.level,
   priorCompleted:preserved.length,reward,calls,errors};
 await fs.writeFile(prefix+'-web.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Kinich browser playthrough passed',calls);
}catch(err){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,quest:f?.story?.quests['natlan-kinich-ambush'],camera:f?.camera,actors:f?.actors,
   milestone:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,hunt:f?.storyKinichHunt,paused:f?.paused};
 }));
 await page.screenshot({path:prefix+'-failure.png'});
 throw err;
}finally{
 await browser.close();
}
