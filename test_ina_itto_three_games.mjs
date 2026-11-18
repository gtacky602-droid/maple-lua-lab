import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='ina-itto-three-games',town='inazuma-town',field='ina-festival-games';
const prefix='evidence/ina-itto-games';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg,timeout=23000)=>page.waitForFunction(fn,arg,{timeout});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const round=i=>wait(i=>window.lab.frame.storyIttoGames?.round===i,i);
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

async function ground(y){
  await wait(y=>{
    const f=window.lab.frame,a=f.actors[f.active-1];
    return a.ground&&a.y===y;
  },y);
}

async function jump(y){
  await held('Space',()=>ground(y));
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
  if(n!==undefined)await count(n);
}

async function questButton(name,status){
  await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
}

async function load(){
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
}

async function compareRelay(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.storyIttoGames.round,3);
  assert.equal(png.storyIttoGames.helpReady,true);
  assert.equal(png.draws.filter(d=>d.source==='ina-itto-games-props-source-v1.png'&&d.h===65).length,2);
  await shot('relay-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(()=>window.lab.frame.commands>1000);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n,standard.commands);
  const light=await frame();
  await shot('relay-light');
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyIttoGames,png.storyIttoGames);
  }
  await menu.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8914/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/ina-itto-games-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await load();
  await questButton('受注','active');
  await collect(681,1);
  await gate(828,field);
  const scene=await page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scene,{key:'ittoFestival',file:'ina-itto-games-background-v1.png',state:'ready'});
  await collect(174);
  await round(1);
  await shot('flags');
  await walk(263);
  await wait(()=>window.lab.frame.storyIttoGames.player===1);
  await walk(431);
  await jump(396);
  await wait(()=>window.lab.frame.storyIttoGames.player===2);
  await walk(522);
  await jump(310);
  await walk(588);
  await wait(()=>window.lab.frame.storyIttoGames.player===3);
  await walk(773);
  await ground(399);
  await wait(()=>window.lab.frame.storyIttoGames.player===4);
  await walk(905);
  await count(2);
  assert.equal((await frame()).storyIttoGames.record.last[0].player,5);

  const beforeTargets=await frame();
  await collect(174);
  await round(2);
  await shot('targets');
  await held('KeyJ',()=>walk(309));
  if((await frame()).story.quests[quest].count===2){
    await held('KeyJ',()=>wait(()=>window.lab.frame.storyIttoGames.round!==2||window.lab.frame.storyIttoGames.player>=3));
  }
  if((await frame()).story.quests[quest].count===2){
    await walk(626);
    await jump(399);
    await held('KeyJ',()=>count(3));
  }
  const targets=await frame();
  assert.equal(targets.storyIttoGames.record.last[1].player,6);
  assert.ok(targets.hits>beforeTargets.hits);
  assert.deepEqual([targets.kills,targets.mora,targets.progression.questXp],
    [beforeTargets.kills,beforeTargets.mora,beforeTargets.progression.questXp]);

  await collect(174);
  await round(3);
  await walk(308);
  await wait(()=>window.lab.frame.storyIttoGames?.helpReady);
  const commands=await compareRelay();
  await collect(308);
  await wait(()=>window.lab.frame.storyIttoGames?.player===1);
  for(const x of [530,725]){
    await walk(x);
    await wait(()=>window.lab.frame.storyIttoGames?.helpReady);
    await collect(x);
  }
  await count(4);
  const awards=await frame();
  assert.equal(awards.storyIttoGames.record.best,3);
  assert.equal(awards.storyIttoGames.title,'荒瀧三番勝負・全勝');
  await shot('awards');
  await gate(56,town);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  const expected=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  assert.deepEqual(reward,expected.reward);
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await load();
  await gate(828,field);
  assert.equal((await frame()).storyIttoGames.title,awards.storyIttoGames.title);
  await collect(174);
  await round(1);
  assert.equal((await frame()).storyIttoGames.record.series,1);
  await gate(56,town);
  assert.equal((await frame()).progression.questXp,after.progression.questXp);
  assert.deepEqual(errors,[]);
  const proof={scene,collectedFiveFlags:true,trainingObjectsNoKill:true,assistedAtThreeMarks:true,
    titleAndReplayAfterReload:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,interact:f?.storyNearbyMilestone,
      contest:f?.storyIttoGames,progress:f?.story?.quests['ina-itto-three-games']};
  }));
  throw error;
}finally{
  await browser.close();
}
