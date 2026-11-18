import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='ina-window-fireworks',town='inazuma-town',lookouts='ina-firework-lookouts',beach='ina-firework-beach';
const prefix='evidence/ina-fireworks';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg,timeout=23000)=>page.waitForFunction(fn,arg,{timeout});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});
const phase=name=>wait(name=>window.lab.frame.storyFireworkStatus?.phase===name,name);

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
  if(Math.abs(player.x-x)<9)return;
  await held(right?'KeyD':'KeyA',()=>wait(({x,right})=>{
    const f=window.lab.frame,player=f.actors[f.active-1];
    return right?player.x>=x-7:player.x<=x+7;
  },{x,right}));
}

async function ground(y){
  await wait(y=>{
    const f=window.lab.frame,a=f.actors[f.active-1];
    return a.ground&&(y===null||a.y===y);
  },y??null);
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

async function read(status){
  await wait(status=>window.lab.frame.storySurveyMap?.status===status,status);
  assert.equal(await page.locator('#surveyMap').isVisible(),true);
  const report=(await frame()).storySurveyMap;
  assert.equal(report.routes.some(route=>route.dashed),status!=='clear');
  return report.caption;
}

async function compareWindow(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.storyFireworkStatus.phase,'window');
  assert.ok(png.draws.some(d=>d.source==='ina-fireworks-props-source-v1.png'&&d.h===261));
  await shot('window-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(()=>window.lab.frame.commands>1000);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n,standard.commands);
  const light=await frame();
  await shot('window-light');
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyFireworkStatus,png.storyFireworkStatus);
  }
  await menu.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function scene(key){
  const art=await page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.equal(art.key,key);
  assert.equal(art.state,'ready');
  assert.equal((await frame()).total,0);
  return art;
}

async function load(){
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8912/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/ina-fireworks-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await load();
  await questButton('受注','active');
  await collect(372,1);
  await gate(755,lookouts);
  const lookoutScene=await scene('fireworkLookouts');
  await walk(616);
  assert.ok(!(await frame()).storyNearbyMilestone);
  await held('Space',()=>ground(395));
  await collect(616,2);
  const readings=[await read('partial')];
  await walk(814);
  await ground(395);
  await held('Space',()=>ground(307));
  await collect(1040,3);
  readings.push(await read('blocked'));
  await page.locator('#surveyMap').screenshot({path:prefix+'-blocked.png'});
  await walk(1608);
  await ground();
  if((await frame()).actors[0].y===480)await held('Space',()=>ground(414));
  await collect(1608,4);
  readings.push(await read('clear'));
  await page.locator('#surveyMap').screenshot({path:prefix+'-clear.png'});
  await gate(2064,beach);
  const beachScene=await scene('fireworkBeach');
  await walk(475);
  const choices=page.locator('#fireworkDesign');
  await choices.waitFor({state:'visible'});
  assert.equal(await page.locator('#fireworkColor option').count(),3);
  assert.equal(await page.locator('#fireworkShape option').count(),3);
  await page.locator('#fireworkColor').selectOption('sunset');
  await page.locator('#fireworkShape').selectOption('fan');
  await wait(()=>window.lab.frame.storyFireworkDesign?.color==='sunset'&&window.lab.frame.storyFireworkDesign?.shape==='fan');
  await page.locator('#nearbyCargoGo').click();
  await phase('window');
  const commands=await compareWindow();
  await phase('rise');
  await wait(()=>window.lab.frame.storyFireworkStatus?.progress>=0.41);
  const burst=(await frame()).storyFireworkStatus;
  assert.deepEqual(burst.design,{color:'sunset',shape:'fan'});
  await shot('burst');
  await count(5);
  await gate(896,town);
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
  await gate(266,beach);
  await walk(475);
  assert.equal(await choices.isVisible(),false);
  await collect(475);
  await phase('window');
  await phase('burst');
  assert.deepEqual((await frame()).storyFireworkStatus.design,burst.design);
  await wait(()=>!window.lab.frame.storyFireworkStatus?.phase);
  assert.equal((await frame()).progression.questXp,after.progression.questXp);
  assert.deepEqual(errors,[]);
  const proof={lookoutScene,beachScene,readings,realJumps:true,independentColorAndShape:true,
    windowRiseBurst:true,replayAfterReload:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,interact:f?.storyNearbyMilestone,
      firework:f?.storyFireworkStatus,progress:f?.story?.quests['ina-window-fireworks']};
  }));
  throw error;
}finally{
  await browser.close();
}
