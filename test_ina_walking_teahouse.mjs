import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='ina-walking-teahouse',town='inazuma-town';
const forks='ina-tea-crossroads',landing='ina-tea-landing',prefix='evidence/ina-tea-case';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
const board=page.locator('#teaCaseBoard'),confirm=page.locator('#teaEvidenceConfirm');
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:23000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});
const card=id=>page.locator(`[data-tea-evidence="${id}"]`);

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
  if(n!==undefined)await count(n);
}

async function questButton(name,status){
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
}

async function load(){
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
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
  assert.equal(png.storyTeaCase.parked,true);
  assert.equal(png.draws.filter(d=>d.source==='ina-tea-case-props-source-v1.png').length,3);
  await shot('parked-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n,standard.commands);
  const light=await frame();
  await shot('parked-light');
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyTeaCase,png.storyTeaCase);
    assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  }
  await menu.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8915/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/ina-tea-case-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await load();
  await questButton('受注','active');
  await collect(169,1);
  await collect(396,2);
  await gate(350,forks);
  const crossroads=await scene();
  assert.deepEqual(crossroads,{key:'teaCrossroads',file:'ina-tea-case-crossroads-background-v1.png',state:'ready'});
  await collect(345,3);
  await walk(744);
  await jump(403);
  await shot('crossroads');
  await collect(744,4);
  await gate(1166,landing);
  const dusk=await scene();
  assert.deepEqual(dusk,{key:'teaLanding',file:'ina-tea-case-landing-background-v1.png',state:'ready'});
  await collect(284,5);
  await walk(469);
  await board.waitFor();
  assert.equal(await card('paper').count(),1);
  assert.equal(await board.locator('button[data-tea-evidence]').count(),4);
  assert.equal(await confirm.isDisabled(),true);
  await card('paper').click();
  await card('day').click();
  await confirm.click();
  await wait(()=>document.querySelector('#teaCaseFeedback').textContent.includes('動いた痕跡'));
  assert.equal((await frame()).story.quests[quest].count,5);
  assert.equal(await card('paper').getAttribute('aria-pressed'),'true');
  await page.setViewportSize({width:390,height:844});
  const dimensions=await board.locator('[data-tea-evidence]').evaluateAll(buttons=>buttons.map(button=>{
    const {top,right}=button.getBoundingClientRect();
    return {top,right};
  }));
  assert.equal(dimensions[0].top,dimensions[1].top);
  assert.ok(dimensions.every(rect=>rect.right<=390));
  await page.setViewportSize({width:1280,height:960});
  await shot('evidence-board');
  await card('paper').click();
  await card('day').click();
  await card('ruts').click();
  await card('dusk').click();
  await confirm.click();
  await count(6);
  const initial=(await frame()).storyTeaCase;
  assert.equal(initial.parked,false);
  await wait(x=>{
    const a=window.lab.frame.storyTeaCase;
    return a.cartX<Math.min(x-40,930)&&!a.parked;
  },initial.cartX);
  await shot('arrival');
  await wait(()=>window.lab.frame.storyTeaCase?.parked===true);
  await walk(555);
  const commands=await compare();
  await collect(600,7);
  await gate(889,town);
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
  await page.locator(`[data-rest-waypoint="${landing}"]`).click();
  await at(landing);
  assert.equal((await frame()).storyTeaCase.parked,true);
  assert.equal((await frame()).storyNearbyMilestone?.label,'お茶を飲んで休む');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.includes('ひと休み'));
  await gate(889,town);
  const dot=page.getByRole('button',{name:'船着き場の茶屋へ移動する'});
  await dot.focus();
  await page.keyboard.press('Enter');
  await at(landing);
  const revisited=await frame();
  assert.equal(revisited.progression.questXp,after.progression.questXp);
  assert.equal(revisited.mora,after.mora);
  assert.deepEqual(errors,[]);
  const proof={scenes:[crossroads,dusk],walkAndJump:true,wrongThenCorrect:true,boardFits390px:true,cartRollsIn:true,
    mapButtonAndKeyboardAfterReload:true,repeatRest:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      board:f?.storyTeaBoard,tea:f?.storyTeaCase,progress:f?.story?.quests['ina-walking-teahouse']};
  }));
  throw error;
}finally{
  await browser.close();
}
