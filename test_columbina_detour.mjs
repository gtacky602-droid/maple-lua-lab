import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const town='nod-town',coast='nod-workshop-coast',market='nod-night-stalls',bend='nod-detour-shore',rest='nod-far-sea-bench';
const quest='columbina-coast-detour',main='nod-first-treasure',checkpoint=process.env.LAB_COLUMBINA_CHECKPOINT;
const prefix=process.env.LAB_COLUMBINA_OUTPUT||'evidence/columbina-detour';
const gift=process.env.LAB_COLUMBINA_GIFT||'chime';
const moon='growth-lunar-practice',port='nod-port',field='nod-field';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const option=graph.quests.find(q=>q.id===quest).itinerary[1].choices.find(o=>o.id===gift);
assert.ok(option);
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
await page.addInitScript(()=>{
  window.restTones=[];
  const createOscillator=AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator=function(){
    const tone=createOscillator.call(this);
    const start=tone.start.bind(tone);
    tone.start=time=>{window.restTones.push(tone.frequency.value);return start(time)};
    return tone;
  };
});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value,timeout=23000)=>page.waitForFunction(fn,value,{timeout});
const at=id=>wait(id=>window.lab?.frame?.story?.node===id,id);
const count=(n,id=quest,ms)=>wait(({id,n})=>window.lab.frame.story.quests[id]?.count===n,{id,n},ms);
const screenshot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1],east=x>a.x;
  if(Math.abs(a.x-x)<8)return;
  const dir=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(dir);
  try{
    await wait(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{await page.keyboard.up(dir)}
}

async function jump(x,y){
  await walk(x);
  await canvas.click();
  await page.keyboard.down('Space');
  try{await wait(y=>{const a=window.lab.frame.actors[0];return a.ground&&a.y===y},y)}
  finally{await page.keyboard.up('Space')}
}

async function gate(x,node){
  await walk(x);
  await wait(node=>{const p=window.lab.frame.storyNearbyPortal;return p?.available&&p.to===node},node);
  await key('KeyF');
  await at(node);
}

async function inspect(x,n,id=quest){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  if(n!==undefined)await count(n,id);
}

async function questButton(name,status,id=quest){
  await page.locator(`[data-quest="${id}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function auto(on){
  if((await frame()).auto===on)return;
  await page.locator('#auto').click();
  await wait(on=>window.lab.frame.auto===on,on);
}

async function scene(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='coastal-gifts-source-v1.png')&&
    png.draws.some(d=>d.source==='columbina-idle-source-v3.png'));
  await screenshot('bench-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*12,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.66,standard.commands);
  const light=await frame();
  assert.ok([standard,light].every(f=>f.t===png.t&&f.coastDetourRest.gift===png.coastDetourRest.gift));
  await screenshot('bench-light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function saveReload(node=town){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  const saved=await page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(node);
  return saved;
}

async function lunarPractice(){
  await gate(1432,coast);
  await gate(60,town);
  await page.getByText('スキル装着・全100技の制作状況',{exact:true}).click();
  await page.getByLabel('枠1の1番目',{exact:true}).selectOption('SK09');
  await page.locator('#applySlots').click();
  await wait(()=>window.lab.frame.loadout[0][0]==='SK09');
  await gate(60,field);
  await gate(60,port);
  await questButton('受注','active',moon);
  await count(0,moon);
  await gate(1380,field);
  await gate(1380,town);
  await gate(1258,'nod-moon-cave-mouth');
  await gate(1260,'nod-moon-crab-arena');
  await walk(750);
  await wait(()=>window.lab.frame.auras.some(a=>a.element==='hydro'&&a.owner===2));
  await key('Digit1');
  await count(1,moon);
  assert.match(await page.locator('#companionStatus').textContent(),/月感電/);
  await screenshot('moon-reaction');
  await page.getByRole('button',{name:'拠点へ：ナド・クライ・町の広場',exact:true}).click();
  await at(town);
  await gate(60,field);
  await gate(60,port);
  const before=await frame();
  await questButton('報告','complete',moon);
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  const spec=graph.quests.find(q=>q.id===moon);
  assert.deepEqual(reward,[spec.xp,spec.mora,spec.ore]);
  return {reaction:'月感電',target:'月殻の大ヤドカニ',reward};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8903/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile(checkpoint||'work/columbina-detour-fixture.json','utf8');
  const input=JSON.parse(seed);
  const lua=JSON.parse(await fs.readFile('evidence/columbina-detour-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  assert.ok(!(await frame()).storyGraph.quests.some(q=>q.id==='columbina-join'));
  if(checkpoint){
    assert.equal(input.story.quests[main].status,'complete');
    await gate(1160,coast);
  }else{
    await questButton('受注','active',main);
    await inspect(320,1,main);
    await gate(1160,coast);
    await page.waitForSelector(`[data-quest="${quest}"][data-status="locked"]`);
    await inspect(540,2,main);
  }
  await questButton('受注','active');
  await inspect(579,1);
  await gate(913,market);
  const marketScene=await scene();
  assert.deepEqual(marketScene,{key:'nodNightStalls',file:'nod-night-stalls-background-v1.png',state:'ready'});
  await walk(674);
  const wares=(await frame()).draws.filter(d=>d.source==='coastal-gifts-source-v1.png');
  assert.equal(wares.length,3);
  assert.equal(new Set(wares.map(d=>d.box[0])).size,3);
  await screenshot('market');
  const beforeGift=(await frame()).mora;
  await inspect(option.x,2);
  const chosen=await frame();
  assert.equal(chosen.story.quests[quest].storyChoice,gift);
  assert.equal(chosen.mora,beforeGift);
  await gate(1370,bend);
  await walk(470);
  await auto(true);
  await count(3,quest,45000);
  await auto(false);
  await gate(1447,rest);
  const restScene=await scene();
  assert.deepEqual(restScene,{key:'nodFarSea',file:'nod-far-sea-background-v1.png',state:'ready'});
  await jump(777,386);
  await inspect(777,4);
  await wait(pattern=>window.lab.frame.storyResonanceCue?.pattern===pattern,lua.restCues[gift].label);
  assert.deepEqual((await frame()).storyResonanceCue.notes,lua.restCues[gift].notes);
  await page.locator('#airflowSound').click();
  await wait(n=>window.restTones.length===n,lua.restCues[gift].notes.length);
  assert.deepEqual(await page.evaluate(()=>window.restTones),lua.restCues[gift].notes);
  const commands=await compare();
  await inspect(1116,5);
  await gate(1432,coast);
  const before=await frame();
  await questButton('報告','complete');
  const reported=await frame();
  const reward=[reported.progression.questXp-before.progression.questXp,reported.mora-before.mora];
  assert.deepEqual(reward,lua.reward);
  if(!checkpoint)assert.equal(reported.story.quests[main].count,2);
  assert.ok(reported.storyJoined.columbina);
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name:'コロンビーナを同行に選ぶ'}).click();
  await wait(()=>window.lab.frame.companion?.id==='columbina'&&window.lab.frame.starterEquipment);
  const joined=await frame();
  assert.deepEqual([joined.starterEquipment.weapon.atk,joined.starterEquipment.flower.hp],[1,10]);
  assert.ok(joined.starterEquipment.useFlower);
  if(!checkpoint)assert.deepEqual([joined.actors[1].atk,joined.actors[1].maxhp],lua.identicalStarterStats);
  assert.equal(joined.actors.length,2);
  await saveReload();
  assert.equal((await frame()).companion.id,'columbina');
  await gate(1160,coast);
  await gate(1122,rest);
  await walk(962);
  assert.equal((await frame()).coastDetourRest.gift,gift);
  assert.equal((await frame()).draws.filter(d=>d.source==='columbina-idle-source-v3.png').length,1);
  await screenshot('revisit');
  let practice,priorCompleted,reportedLevel;
  if(checkpoint){
    practice=await lunarPractice();
    const completed=await saveReload(port),saved=JSON.parse(completed);
    assert.equal(saved.story.quests[moon].status,'complete');
    assert.equal(saved.story.growth['lunar-reaction'],true);
    assert.equal((await frame()).companion.id,'columbina');
    const prior=Object.entries(input.story.quests).filter(([,state])=>state.status==='complete');
    for(const [id,state] of prior)assert.deepEqual(saved.story.quests[id],state,id);
    for(const item of input.inventory.items)assert.ok(saved.inventory.items.some(i=>i.id===item.id),item.id);
    priorCompleted=prior.length;
    reportedLevel=saved.progression.level;
    await fs.writeFile(prefix+'-complete.json',completed+'\n');
  }
  assert.deepEqual(errors,[]);
  const proof={afterFirstMeeting:true,threeVisibleWares:true,choice:gift,noGiftCost:true,fightAndRest:true,
    restCue:lua.restCues[gift],restAudioScheduled:true,joinedAndStarter:true,reloadAndReturn:true,mainUnfinished:!checkpoint,
    sourceSha256:createHash('sha256').update(seed).digest('hex'),startLevel:input.progression.level,
    reportedLevel,priorCompleted,practice,marketScene,restScene,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,rest:f?.coastDetourRest,auto:f?.auto,status:document.querySelector('#status')?.textContent};
  }),errors);
  await page.screenshot({path:prefix+'-failure.png'});
  throw error;
}finally{await browser.close()}
