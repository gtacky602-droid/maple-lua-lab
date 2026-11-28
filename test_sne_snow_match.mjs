import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='sne-snow-match-quest',station='white-pass-station',arena='sne-snow-match';
const footwork='white-pass-footwork',rest='white-pass-rest',woods='white-pass-woods';
const output='work/earned-white-pass-snow';
const checkpoint=process.env.LAB_SNOW_MATCH_CHECKPOINT, restOnly=process.argv.includes('--rest');
const prefix=checkpoint||restOnly?`${output}/snow`:'evidence/sne-snow-match';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value,timeout=23000)=>page.waitForFunction(fn,value,{timeout});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const ground=y=>wait(y=>{const a=window.lab.frame.actors[0];return a.ground&&a.y===y},y);
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function throwUntil(predicate){
  await canvas.click();
  await page.keyboard.down('KeyJ');
  try{await wait(predicate)}finally{await page.keyboard.up('KeyJ')}
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1],east=x>a.x;
  if(Math.abs(a.x-x)<8)return;
  const direction=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(direction);
  try{
    await wait(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{await page.keyboard.up(direction)}
}

async function gate(x,node){
  await walk(x);
  await wait(node=>{const p=window.lab.frame.storyNearbyPortal;return p?.available&&p.to===node},node);
  await key('KeyF');
  await at(node);
}

async function inspect(x,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  if(n!==undefined)await count(n);
}

async function questButton(name,status,id=quest){
  await page.locator('[data-quest="'+id+'"]').getByRole('button',{name,exact:true}).click();
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function scenery(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function compare(){
  await wait(()=>window.lab.frame.storySnowball?.warning==='feint');
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.storySnowball.warning,'feint');
  assert.ok(png.draws.some(d=>d.source==='childe-idle-source-v1.png'));
  await shot('feint-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*10,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.66,standard.commands);
  const light=await frame();
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storySnowball,png.storySnowball);
  }
  await shot('feint-light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function saveReload(){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  const save=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(station);
  return JSON.parse(save);
}

async function practiceFootwork(){
  await questButton('受注','active',footwork);
  await walk(450);
  await ground(480);
  assert.notEqual((await frame()).storyNearbyMilestone?.label,'台に跳び上がる');
  await page.keyboard.down('Space');
  try{await ground(390)}finally{await page.keyboard.up('Space')}
  await inspect(450);
  await wait(id=>window.lab.frame.story.quests[id]?.count===1,footwork);
  const partial=await saveReload();
  assert.equal(partial.story.quests[footwork].count,1);
  await walk(670);
  await ground(480);
  assert.equal((await frame()).draws.filter(d=>d.color==='#b9d1df').length,2);
  await inspect(670);
  await wait(id=>window.lab.frame.story.quests[id]?.count===2,footwork);
  const before=await frame();
  await questButton('報告','complete',footwork);
  const after=await frame();
  assert.ok(after.draws.some(d=>d.text==='足取りを記録済み'));
  await shot('footwork');
  return {midPracticeRestored:true,landingRecorded:true,
    reward:[after.progression.questXp-before.progression.questXp,after.mora-before.mora]};
}

function preserved(input,saved){
  for(const [id,q] of Object.entries(input.story.quests)){
    if(q.status==='complete')assert.deepEqual(saved.story.quests[id],q,id);
  }
  const items=new Set(saved.inventory.items.map(item=>item.id));
  for(const item of input.inventory.items)assert.ok(items.has(item.id),item.id);
  assert.equal(saved.companion,input.companion);
  assert.equal(saved.weapons.equipped.traveler,'SW07');
}

async function verifyRest(){
  const seed=JSON.parse(await fs.readFile(`${output}/rest-ready.json`,'utf8'));
  const lua=JSON.parse(await fs.readFile(`${output}/lua.json`,'utf8'));
  await page.locator('#importSave').setInputFiles(`${output}/rest-ready.json`);
  await at(station);
  assert.equal((await frame()).progression.level,153);
  await walk(670);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='足取りのメモを見返す');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.includes('足をそろえてから次の一歩'));
  await questButton('受注','active',rest);
  await inspect(895);
  await wait(id=>window.lab.frame.story.quests[id]?.count===1,rest);
  await gate(1144,woods);
  await inspect(185);
  await wait(id=>window.lab.frame.story.quests[id]?.count===2,rest);
  await gate(55,station);
  const before=await frame();
  await questButton('報告','complete',rest);
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,lua.reward);
  const finished=await saveReload();
  preserved(seed,finished);
  assert.equal(finished.story.quests[rest].status,'complete');
  assert.deepEqual(finished.story.quests[quest].snowMatchRecord,lua.snowRecord);
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${output}/rest-complete.json`,JSON.stringify(finished)+'\n');
  const proof={reward,level:finished.progression.level,snowRecord:lua.snowRecord,companion:finished.companion,
    weapon:finished.weapons.equipped.traveler,completedRestAfterReload:true,footworkReadback:true,errors};
  await fs.writeFile(`${output}/rest-browser.json`,JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}

async function verifyMatch(){
  const seed=await fs.readFile(checkpoint??'work/sne-snow-match-fixture.json','utf8');
  const input=JSON.parse(seed);
  const lua=JSON.parse(await fs.readFile('evidence/sne-snow-match-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(station);
  const practice=checkpoint?await practiceFootwork():null;
  await questButton('受注','active');
  await inspect(327,1);
  await gate(724,arena);
  const scene=await scenery();
  assert.deepEqual(scene,{key:'sneSnowMatch',file:'sne-snow-match-background-v1.png',state:'ready'});
  assert.equal((await frame()).total,0);
  const throwButton=page.locator('#snowMatchThrow');
  assert.equal(await throwButton.isVisible(),true);
  assert.equal(await throwButton.isDisabled(),true);
  await inspect(178,2);
  await inspect(178);
  await wait(()=>window.lab.frame.storySnowball?.running);
  const health=(await frame()).actors.map(a=>a.hp);
  const hits=(await frame()).hits;
  await key('KeyK');
  await throwButton.click();
  await wait(()=>window.lab.frame.storySnowball?.blocked>0);
  assert.equal((await frame()).storySnowball.score[0],0);
  await walk(383);
  await canvas.click();
  await page.keyboard.down('Space');
  try{await ground(398)}finally{await page.keyboard.up('Space')}
  await throwUntil(()=>window.lab.frame.draws.some(d=>d.color==='#c4f4ffa8'));
  await throwUntil(()=>{
    const f=window.lab.frame;
    return f.storySnowball?.flagHits===1&&f.draws.some(d=>d.text==='+1'&&d.color==='#bff5ff');
  });
  await walk(211);
  await ground(480);
  const commands=await compare();
  await wait(()=>window.lab.frame.storySnowball?.warning==='throw');
  await walk(740);
  await ground(480);
  await throwUntil(()=>window.lab.frame.storySnowball?.ownHits>0&&window.lab.frame.storySnowball.collapsed);
  await shot('open');
  await canvas.click();
  await page.keyboard.down('KeyJ');
  try{await count(3)}finally{await page.keyboard.up('KeyJ')}
  const won=await frame();
  assert.equal(won.storySnowball.record.wins,1);
  assert.equal(won.storySnowball.record.best,5);
  assert.deepEqual(won.actors.map(a=>a.hp),health);
  assert.equal(won.hits,hits);
  await gate(57,station);
  assert.equal(await throwButton.isVisible(),false);
  assert.equal(await page.locator('.bottom .skills').isVisible(),true);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,lua.reward);
  const saved=await saveReload();
  if(checkpoint){
    preserved(input,saved);
    assert.equal(saved.story.quests[footwork].status,'complete');
    await fs.writeFile(`${output}/snow-complete.json`,JSON.stringify(saved)+'\n');
  }
  await gate(724,arena);
  assert.equal((await frame()).storySnowball.record.wins,1);
  await inspect(178);
  await wait(()=>window.lab.frame.storySnowball?.running);
  await gate(57,station);
  assert.equal((await frame()).story.quests[quest].snowMatchRecord.wins,1);
  assert.deepEqual(errors,[]);
  const proof={scene,coverBlocks:true,feintShown:true,flagPoint:true,opponentHit:true,
    coverFalls:true,noHealthDamage:true,winSavedAndReplay:true,venueControls:true,commands,reward,
    visibleFlightAndPoint:true,practice,snowRecord:saved.story.quests[quest].snowMatchRecord,level:saved.progression.level,
    sourceSha256:createHash('sha256').update(seed).digest('hex'),errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8909/');
  await wait(()=>window.lab?.frame);
  if(restOnly)await verifyRest();
  else await verifyMatch();
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,snowball:f?.storySnowball};
  }),errors);
  throw error;
}finally{await browser.close()}
