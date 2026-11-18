import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='sumeru-hub',roots='sumeru-river-roots',trail='sum-wanderer-trail',hollow='sum-wanderer-hollow';
const main='sumeru-leaf-crossing',quest='sum-wanderer-observation',prefix='evidence/sum-wanderer-sign';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:23000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=(n,id)=>wait(({id,n})=>window.lab.frame.story.quests[id]?.count===n,{id,n});
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});
const questRow=id=>page.locator(`[data-quest="${id}"]`);

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function held(code,fn){
  await canvas.click();
  await page.keyboard.down(code);
  try{return await fn()}finally{await page.keyboard.up(code)}
}

async function walk(x){
  const f=await frame(),player=f.actors[f.active-1],right=x>player.x;
  if(Math.abs(player.x-x)<8)return;
  await held(right?'KeyD':'KeyA',()=>wait(({x,right})=>{
    const f=window.lab.frame,player=f.actors[f.active-1];
    return right?player.x>=x-7:player.x<=x+7;
  },{x,right}));
}

async function jump(y){
  await held('Space',()=>wait(y=>{
    const f=window.lab.frame,a=f.actors[f.active-1];
    return a.ground&&a.y===y;
  },y));
}

async function gate(x,node){
  await walk(x);
  await wait(node=>{
    const p=window.lab.frame.storyNearbyPortal;
    return p?.to===node&&p.available;
  },node);
  await key('KeyF');
  await at(node);
}

async function collect(x,n,id=quest){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  await count(n,id);
}

async function questButton(id,name,status){
  await questRow(id).getByRole('button',{name,exact:true}).click();
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function load(){
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(hub);
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
  assert.equal(png.storyWandererSurvey.defeated,0);
  assert.equal(png.draws.filter(d=>d.source?.startsWith('dendro-fungus-')).length,2);
  assert.equal(png.draws.filter(d=>d.source?.startsWith('wanderer-idle-')).length,1);
  await shot('hollow-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n,standard.commands);
  const light=await frame();
  await shot('hollow-light');
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyWandererSurvey,png.storyWandererSurvey);
    assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  }
  await menu.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8916/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/sum-wanderer-sign-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await load();
  const party=(await frame()).companion.id;
  assert.equal(party,'beidou');
  await questButton(main,'受注','active');
  await gate(875,roots);
  await collect(315,1,main);
  await walk(714);
  await jump(391);
  await collect(714,2,main);
  await wait(()=>window.lab.frame.storyNotice?.includes('枝の上の放浪者'));
  await gate(56,hub);
  await questButton(quest,'受注','active');
  assert.equal((await frame()).story.quests[main].status,'active');
  await collect(415,1);
  await gate(618,trail);
  const forest=await scene();
  assert.deepEqual(forest,{key:'sumeruObservationTrail',file:'sum-wanderer-sign-trail-background-v1.png',state:'ready'});
  await collect(287,2);
  await walk(607);
  await jump(396);
  await collect(607,3);
  await walk(711);
  await jump(303);
  await walk(942);
  await shot('trail');
  await collect(942,4);
  assert.ok(!(await frame()).storyGraph.nodes.some(n=>n.id===hollow));
  await collect(1251,5);
  assert.ok((await frame()).storyGraph.nodes.some(n=>n.id===hollow));
  await gate(1367,hollow);
  const cave=await scene();
  assert.deepEqual(cave,{key:'sumeruObservationHollow',file:'sum-wanderer-sign-hollow-background-v1.png',state:'ready'});
  await collect(273,6);
  await walk(410);
  const before=await frame();
  const commands=await compare();
  await key('KeyG');
  await wait(()=>window.lab.frame.storyWandererSurvey?.working&&window.lab.frame.storyWandererSurvey.defeated===1);
  await shot('assist');
  await count(7,quest);
  const helped=await frame();
  assert.equal(helped.storyWandererSurvey.defeated,2);
  assert.deepEqual([helped.kills,helped.hits,helped.mora,helped.companion.id],
    [before.kills,before.hits,before.mora,party]);
  await walk(698);
  await jump(390);
  await walk(868);
  await jump(297);
  await collect(1079,8);
  await wait(()=>window.lab.frame.storySurveyMap?.id==='wanderer-observation-record');
  assert.equal((await frame()).storySurveyMap.marks.length,6);
  await shot('record');
  await gate(1288,hub);
  await questButton(quest,'報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  const expected=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  assert.deepEqual(reward,expected.reward);
  assert.equal(after.companion.id,party);
  await questRow(quest).getByRole('button',{name:'放浪者を同行に選ぶ'}).click();
  await wait(()=>window.lab.frame.starterEquipment?.weapon.name==='樹上観測の入門法器');
  assert.equal((await frame()).companion.id,'wanderer');
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await load();
  const restored=await frame();
  assert.equal(restored.companion.id,'wanderer');
  assert.equal(restored.starterEquipment.flower.name,'根道の記録花');
  assert.equal(restored.story.quests[quest].status,'complete');
  assert.deepEqual(errors,[]);
  const proof={scenes:[forest,cave],mainMeeting:true,markersAndRouteReveal:true,leverAndVerticalAssistance:true,
    recordedFromRaisedPath:true,partyPreserved:true,starterAfterReload:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(({main,quest})=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      interact:f?.storyNearbyMilestone,survey:f?.storyWandererSurvey,main:f?.story?.quests[main],quest:f?.story?.quests[quest]};
  },{main,quest}));
  throw error;
}finally{
  await browser.close();
}
