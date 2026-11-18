import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';




const entry='sumeru-entry',yard='veluriyam-bottle-yard',hub='veluriyam-hub';
const outbound='veluriyam-trolley-out',inbound='veluriyam-trolley-back',stop='veluriyam-petal-stop';
const terminal='veluriyam-rail-end',lookout='veluriyam-petal-lookout';
const first='veluriyam-bottle-ticket',second='veluriyam-trolley-lookout';
const prefix='evidence/veluriyam-trolley';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const canvas=page.locator('#game');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,param,timeout=12000)=>page.waitForFunction(fn,param,{timeout});
const nodeIs=node=>wait(id=>window.lab.frame.story.node===id,node);
const row=id=>page.locator(`[data-quest="${id}"]`);

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1];
  if(Math.abs(x-a.x)<7)return;
  const east=x>a.x,dir=east?'KeyD':'KeyA';
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
  try{
    await wait(y=>window.lab.frame.actors[0].y===y&&window.lab.frame.actors[0].ground,y);
  }finally{await page.keyboard.up('Space')}
}

async function gate(x,node){
  await walk(x);
  await wait(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node,16000);
  await key('KeyF');
  await nodeIs(node);
}

async function count(id,n){
  await wait(({id,n})=>window.lab.frame.story.quests[id]?.count===n,{id,n});
}

async function interact(x,id,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  await count(id,n);
}

async function quest(id,label,status){
  await row(id).getByRole('button',{name:label,exact:true}).click();
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
}

async function saveReload(){
  await page.click('#saveProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
}

async function background(){
  return page.evaluate(async()=>{
    const {sceneryStatus,backgroundReady}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function report(id,reward){
  const before=await frame();
  await quest(id,'報告','complete');
  const after=await frame();
  const received=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(received,reward);
}

async function rotate(pattern){
  await key('KeyG');
  await wait(pattern=>window.lab.frame.storyAirflow?.pattern===pattern,pattern);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='mirage-trolley-source-v1.png'&&d.h===62));
  await page.locator('.game').screenshot({path:prefix+'-ride-png.png'});
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*20,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.equal(standard.t,png.t);
  assert.equal(light.t,png.t);
  await page.locator('.game').screenshot({path:prefix+'-ride-light.png'});
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8870/');
  await wait(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/veluriyam-trolley-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.click('#loadProgress');
  await nodeIs('sumeru-hub');
  await gate(60,entry);
  assert.ok(!(await frame()).storyGraph.nodes.some(n=>n.hiddenGroup==='veluriyam'));
  await walk(1050);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label.startsWith('砂に埋もれた瓶'));
  await key('KeyG');
  await wait(()=>window.lab.frame.story.discovered.veluriyam);
  await gate(1125,yard);
  await quest(first,'受注','active');
  await interact(355,first,1);
  await jump(873,391);
  await wait(()=>window.lab.frame.storyAirflow?.target==='✧');
  assert.ok(await page.locator('#airflowSound').isHidden());
  await rotate('□');
  await page.getByRole('button',{name:'瓶と模様を合わせる',exact:true}).click();
  await wait(()=>window.lab.frame.storyNotice?.includes('模様が合いません'));
  assert.ok(!(await frame()).storyGraph.nodes.find(n=>n.id===yard).exits.some(e=>e.to===hub));
  await rotate('○');
  await rotate('✧');
  await page.locator('.game').screenshot({path:prefix+'-bottle.png'});
  await page.getByRole('button',{name:'瓶と模様を合わせる',exact:true}).click();
  await count(first,2);
  await saveReload();
  await nodeIs(yard);
  await gate(1260,hub);
  await interact(323,first,3);
  await jump(985,390);
  await interact(985,first,4);
  await gate(323,yard);
  await report(first,[13400,510,2]);
  await page.getByRole('button',{name:'拠点へ：ヴェルーリヤ・ミラージュ・入口広場',exact:true}).click();
  await nodeIs(hub);
  console.log('Bottle clues, locked wrong pattern, save and revisit verified');

  await quest(second,'受注','active');
  await gate(1181,outbound);
  const track=await background();
  assert.deepEqual(track,{key:'mirageTrack',file:'mirage-track-background-v1.png',state:'ready'});
  await wait(()=>window.lab.frame.voyage?.stopover);
  await wait(()=>document.querySelector('#storyLiftText').textContent.includes('途中下車'));
  const commands=await compare();
  await nodeIs(terminal);
  await count(second,0);
  await gate(1060,inbound);
  await wait(()=>window.lab.frame.voyage?.stopover);
  assert.match(await page.locator('#nearbyPortalGo').textContent(),/途中下車/);
  await gate(160,stop);
  await interact(521,second,1);
  await jump(834,390);
  await gate(834,lookout);
  await jump(1010,386);
  await interact(1010,second,2);
  await canvas.screenshot({path:prefix+'-lookout.png'});
  await gate(62,stop);
  await gate(172,inbound);
  await nodeIs(hub);
  await count(second,3);
  await interact(787,second,4);
  await report(second,[18100,680,3]);
  await saveReload();
  await nodeIs(hub);
  await walk(787);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='花棚の記念切符を読む');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.includes('帰りは広場行きの戻り便'));
  assert.deepEqual(errors,[]);
  const proof={bottlePersists:true,wrongPatternRejected:true,revisit:true,missedStopReachedTerminal:true,
    reverseMidStop:true,lookoutChest:true,returnedByRail:true,readbackAfterReload:true,track,commands,
    firstReport:[13400,510,2],secondReport:[18100,680,3],errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[0],quests:f?.story.quests,
      portal:f?.storyNearbyPortal,notice:f?.storyNotice,airflow:f?.storyAirflow,voyage:f?.voyage};
  }),errors);
  throw error;
}finally{await browser.close()}
