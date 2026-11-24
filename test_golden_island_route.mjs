import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';



const road='mond-road',coast='golden-mainland-coast',island='golden-hub';
const lookout='golden-shadow-lookouts',grotto='golden-shadow-grotto',pocket='golden-tide-pocket';
const first='golden-little-boat',second='golden-trace-shadows';
const prefix='evidence/golden-island-route';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:960}});
const canvas=page.locator('#game');
const atlas=page.locator('#worldAtlas');
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

async function checkAtlas(visible,hidden){
  await key('KeyM');
  await atlas.waitFor({state:'visible'});
  const field=atlas.locator('#atlasField');
  for(const id of hidden) assert.equal(await field.locator(`option[value="${id}"]`).count(),0,id);
  if(visible){
    await field.selectOption(visible);
    await wait(id=>window.lab.frame.worldMap?.selected?.id===id,visible);
    await atlas.locator('#atlasItineraryStops button').last().waitFor();
  }
  await page.keyboard.press('Escape');
  await atlas.waitFor({state:'hidden'});
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

async function gate(x,node,boat=false){
  await walk(x);
  await wait(id=>{
    const exit=window.lab.frame.storyNearbyPortal;
    return exit?.available&&exit.to===id;
  },node,16000);
  await key('KeyF');
  if(boat){
    await wait(()=>window.lab.frame.storyLift?.boat);
    assert.match(await page.locator('#storyLiftText').textContent(),/小舟で移動中/);
  }
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

async function defeatOne(x,y,sources){
  if(y===480)await walk(x);else await jump(x,y);
  const before=await frame();
  if(!before.draws.some(d=>sources.includes(d.source)&&d.y===y&&Math.abs(d.x+before.camera-x)<75))return;
  await page.click('#auto');
  await wait(n=>window.lab.frame.kills>=n,before.kills+1,25000);
  await page.click('#auto');
  await wait(()=>!window.lab.frame.auto);
}

async function background(){
  return page.evaluate(async()=>{
    const {sceneryStatus,backgroundReady}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function compare(sources){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>sources.includes(d.source)));
  await canvas.screenshot({path:prefix+'-cave-png.png'});
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*10,png.commands);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.equal(light.t,png.t);
  assert.equal(standard.t,png.t);
  await canvas.screenshot({path:prefix+'-cave-light.png'});
  await mode.selectOption('sprite');
  await wait(sources=>window.lab.frame.draws.some(d=>sources.includes(d.source)),sources);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function report(id,reward){
  const before=await frame();
  await quest(id,'報告','complete');
  const after=await frame();
  const received=[after.progression.questXp-before.progression.questXp,
    after.mora-before.mora,after.inventory.upgradeOre-before.inventory.upgradeOre];
  assert.deepEqual(received,reward);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8869/');
  await wait(()=>window.lab?.frame);
  await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
  await nodeIs('mond-town');
  await gate(1380,road);
  const initial=await frame();
  assert.equal(initial.progression.level,1);
  assert.ok(!initial.storyGraph.nodes.some(n=>n.hiddenGroup==='golden'));
  assert.ok(!initial.storyGraph.quests.some(q=>q.id===first));
  await walk(1050);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label.startsWith('古い船着き場'));
  await key('KeyG');
  await wait(()=>window.lab.frame.story.discovered.golden);
  assert.ok(!(await frame()).storyGraph.nodes.find(n=>n.id===road).exits.some(e=>e.to===island));
  await gate(1124,coast);
  const dock=await background();
  assert.deepEqual(dock,{key:'goldenDock',file:'golden-dock-background-v1.png',state:'ready'});
  await quest(first,'受注','active');
  await interact(345,first,1);
  assert.equal((await frame()).storyRockView.gap,0);
  await jump(827,390);
  await interact(827,first,2);
  await interact(1308,first,3);
  await walk(1530);
  await page.locator('.game').screenshot({path:prefix+'-dock.png'});
  await gate(1530,island,true);
  await interact(505,first,4);
  assert.ok((await frame()).storyRockView.gap>23);
  await interact(248,first,5);
  await interact(931,first,6);
  await gate(248,coast,true);
  await report(first,[220,120,1]);
  await gate(1530,island,true);
  console.log('Fresh Lv1 discovery and two-way boat verified');

  await quest(second,'受注','active');
  await gate(1222,lookout);
  const samples=[],gaps=[];
  for(const [x,y,step,id] of [[405,388,1,'high'],[819,480,2,'shore'],[1290,392,3,'arch']]){
    if(y!==480)await jump(x,y);
    await interact(x,second,step);
    await wait(id=>window.lab.frame.storyRockView?.id===id,id);
    gaps.push((await frame()).storyRockView.gap);
    samples.push(await page.locator('#rockViewCanvas').evaluate(c=>c.toDataURL()));
    await page.locator('#rockView').screenshot({path:prefix+'-'+id+'.png'});
  }
  assert.equal(new Set(samples).size,3);
  assert.ok(gaps[0]===0&&gaps[1]>0&&gaps[1]<24&&gaps[2]>=24);
  await interact(819,second,3);
  await wait(()=>window.lab.frame.storyNotice?.includes('別の地点'));
  await walk(1570);
  const stillHidden=await frame();
  assert.ok(!stillHidden.storyNearbyPortal);
  assert.ok(!stillHidden.storyGraph.nodes.find(n=>n.id===lookout).exits.some(e=>e.to===grotto));
  await checkAtlas(null,[grotto,pocket]);
  await key('KeyF');
  await nodeIs(lookout);
  await jump(1290,392);
  await interact(1290,second,4);
  await checkAtlas(grotto,[pocket]);
  await gate(1570,grotto);
  const cave=await background();
  assert.deepEqual(cave,{key:'goldenGrotto',file:'golden-grotto-background-v1.png',state:'ready'});
  const sources=await page.evaluate(async()=>Promise.all(['pebble-courier','sail-shell-crawler'].map(async id=>{
    const response=await fetch('assets/'+id+'-idle-sprites.json');
    return (await response.json()).source;
  })));
  const commands=await compare(sources);
  for(const [x,y] of [[299,480],[725,391],[965,480]])await defeatOne(x,y,sources);
  await count(second,5);
  await interact(1170,second,6);
  await canvas.screenshot({path:prefix+'-chest.png'});
  await gate(53,lookout);
  await gate(59,island);
  await interact(1115,second,7);
  await report(second,[420,210,2]);
  await saveReload();
  await nodeIs(island);
  const resumed=await frame();
  assert.ok([first,second].every(id=>resumed.story.quests[id]?.status==='complete'));
  await checkAtlas(pocket,[]);
  await walk(1115);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label==='島の記念札を読む');
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.includes('岩穴では足元まで通れる道'));
  await gate(1222,lookout);
  await gate(1570,grotto);
  await gate(1415,pocket);
  assert.equal((await frame()).total,3);
  await gate(61,grotto);
  assert.deepEqual(errors,[]);
  const proof={startsAtLevelOne:true,freshDiscovery:true,twoWayBoat:true,threeViews:gaps.map(n=>+n.toFixed(2)),
    threePanelsDiffer:true,wrongViewRejected:true,gateConcealedUntilChoice:true,
    atlasCaveVisibleAfterPuzzleAndPocketAfterReport:true,
    readbackAfterSave:true,newOptionalGround:true,dock,cave,commands,
    firstReport:[220,120,1],secondReport:[420,210,2],errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {t:f?.t,node:f?.story.node,actor:f?.actors[0],kills:f?.kills,quests:f?.story.quests,
      portal:f?.storyNearbyPortal,notice:f?.storyNotice,view:f?.storyRockView};
  }),errors);
  throw error;
}finally{await browser.close()}
async function saveReload(){
  await page.click('#saveProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.click('#loadProgress');
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
}
