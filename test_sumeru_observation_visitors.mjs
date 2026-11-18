import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='sumeru-hub',meadow='sum-visitors-meadow',terrace='sum-visitors-terrace',store='sum-visitors-store';
const quest='sum-fungus-visitors',prefix='evidence/sum-fungus-visitors';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  window.observedTones=[];
  const start=OscillatorNode.prototype.start;
  OscillatorNode.prototype.start=function(...args){
    window.observedTones.push(this.frequency.value);
    return start.apply(this,args);
  };
});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:24000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

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

async function collect(x,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  await count(n);
}

async function fight(x,killCount){
  if((await frame()).kills>=killCount)return;
  await walk(x);
  await key('KeyK');
  await held('KeyJ',()=>wait(k=>window.lab.frame.kills>=k,killCount));
}

async function questButton(name,status){
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
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

async function heardTones(expected){
  await wait(n=>window.observedTones.length>=n,expected.length);
  assert.deepEqual(await page.evaluate(()=>window.observedTones),expected);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.storyObservationVisitors.sample,'carried');
  assert.equal(png.draws.filter(d=>d.source==='sum-fungus-visitors-props-source-v1.png').length,4);
  assert.equal(png.draws.filter(d=>d.source?.startsWith('dendro-fungus-')).length,1);
  await shot('carry-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n,standard.commands);
  const light=await frame();
  await shot('carry-light');
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyObservationVisitors,png.storyObservationVisitors);
    assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  }
  await menu.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  const proofData=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  const tones=proofData.tones;
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8917/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/sum-fungus-visitors-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await load();
  await questButton('受注','active');
  await collect(231,1);
  await gate(332,meadow);
  const grass=await scene();
  assert.deepEqual(grass,{key:'sumeruVisitorsMeadow',file:'sum-fungus-visitors-meadow-background-v1.png',state:'ready'});
  await walk(471);
  assert.equal((await frame()).total,4);
  await shot('meadow');
  await fight(553,4);
  await count(2);
  await collect(1028,3);
  assert.deepEqual((await frame()).storyAirflowCue.notes,tones);
  assert.deepEqual(await page.evaluate(()=>window.observedTones),[]);
  const soundButton=page.locator('#airflowSound');
  await soundButton.click();
  await wait(()=>document.querySelector('#airflowSound').getAttribute('aria-pressed')==='true');
  await key('KeyG');
  await heardTones(tones);
  await gate(1340,terrace);
  const heights=await scene();
  assert.deepEqual(heights,{key:'sumeruVisitorsTerrace',file:'sum-fungus-visitors-terrace-background-v1.png',state:'ready'});
  await walk(274);
  await shot('terrace');
  await fight(274,5);
  await walk(585);
  await jump(391);
  await fight(622,6);
  await walk(871);
  await jump(299);
  await fight(938,7);
  await count(4);
  await collect(1152,5);
  await gate(1449,store);
  const depot=await scene();
  assert.deepEqual(depot,{key:'sumeruVisitorsStore',file:'sum-fungus-visitors-store-background-v1.png',state:'ready'});
  await fight(299,8);
  await fight(507,9);
  await fight(713,10);
  await count(6);
  await collect(919,7);
  await collect(1006,8);
  await heardTones([...tones,...tones]);
  await collect(1124,9);
  const observer=(await frame()).storyObservationVisitors.observerX;
  await walk(1203);
  assert.ok((await frame()).storyObservationVisitors.observerX>observer+45);
  const commands=await compare();
  await collect(1326,10);
  assert.equal((await frame()).storyObservationVisitors.sample,'stored');
  await wait(()=>window.lab.frame.storyObservationVisitors?.quiet===true);
  await shot('stored');
  await collect(1006,11);
  await heardTones([...tones,...tones,...tones]);
  const before=await frame();
  assert.equal(before.kills,10);
  assert.equal(before.returns,0);
  await gate(1547,hub);
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora,
    after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(reward,proofData.reward);
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await load();
  await gate(332,meadow);
  assert.equal((await frame()).total,0);
  await gate(1340,terrace);
  assert.equal((await frame()).total,0);
  await gate(1449,store);
  await collect(1006,11);
  await wait(()=>window.lab.frame.storyAirflowCue&&window.lab.frame.storyNotice?.includes('今も同じ'));
  const again=await frame();
  assert.deepEqual(again.storyAirflowCue.notes,tones);
  assert.equal(again.storyObservationVisitors.sample,'stored');
  assert.equal(again.total,0);
  assert.equal(again.mora,after.mora);
  assert.deepEqual(errors,[]);
  const proof={scenes:[grass,heights,depot],battleKills:again.kills,returns:again.returns,
    mutedProgressAndWebAudioReplay:true,sameInstrumentBeforeAndAfter:true,realJumps:true,
    specimenCarryAndWithdrawal:true,storedAndClearedAfterReload:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(quest=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],kills:f?.kills,total:f?.total,notice:f?.storyNotice,
      nearby:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,sample:f?.storyObservationVisitors,
      quest:f?.story?.quests[quest],cue:f?.storyAirflowCue,audio:window.observedTones,
      fungi:f?.draws.filter(d=>d.source?.startsWith('dendro-fungus-')).map(d=>[d.x+f.camera,d.y])};
  },quest));
  throw error;
}finally{
  await browser.close();
}
