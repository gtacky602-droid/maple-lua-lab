import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='ina-sayu-quiet-route',town='inazuma-town',path='ina-sayu-watchpath';
const suffix=process.argv.includes('--earned')?'-earned':'';
const prefix='evidence/ina-sayu-route'+suffix;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg,timeout=22000)=>page.waitForFunction(fn,arg,{timeout});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const mode=id=>wait(id=>window.lab.frame.storyStealth?.mode===id,id);
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

async function save(){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
}

async function begin(){
  await questButton('受注','active');
  await collect(346,1);
  await gate(454,path);
}

async function compareCover(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.storyStealth.mode,'cover');
  assert.ok(png.draws.some(d=>d.source==='ina-sayu-route-props-source-v1.png'&&d.h===72));
  await shot('cover-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(()=>window.lab.frame.commands>1000);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n,standard.commands);
  const light=await frame();
  assert.ok(light.rectBatches?.length&&light.draws.some(d=>d.kind==='rect_runs'));
  await shot('cover-light');
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyStealth,png.storyStealth);
  }
  await menu.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

try{
  await page.addInitScript(()=>{
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(image,...coords){
      const result=draw.call(this,image,...coords);
      if(this.canvas.id==='game'&&image.src?.includes('ina-sayu-route-native-tiers-')&&coords.length===8)
        window.patrolTile=coords.slice(0,4);
      return result;
    };
  });
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8913/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/ina-sayu-route'+suffix+'-fixture.json','utf8');
  const useFixture=()=>page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await useFixture();
  await load();
  await begin();
  const scene=await page.evaluate(async()=>{
    const {loadScenery,sceneryStatus}=await import('./scenery.js');
    await loadScenery(window.lab.frame);
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scene,{key:'sayuWatchpath',file:'ina-sayu-route-background-v1.png',state:'ready'});
  await page.selectOption('#playBackgroundTier','4096');
  await wait(()=>window.patrolTile?.join(',')==='0,0,512,288');
  const row=page.locator('[data-quest="'+quest+'"]');
  if(await row.getByRole('button',{name:'この依頼を追跡'}).count())
    await row.getByRole('button',{name:'この依頼を追跡'}).click();
  const maps=[];
  async function location(name,step){
    const link=page.locator('#trackedSurveyPoint');
    await wait(name=>document.querySelector('#trackedSurveyPoint')?.textContent===name+'の位置を見る',name);
    const url=new URL(await link.getAttribute('href'),page.url());
    assert.equal(url.searchParams.get('step'),String(step));
    maps.push(url.pathname+url.search);
  }
  await location('草むら',2);
  await key('KeyM');
  await wait(()=>window.lab.frame.worldMap);
  await page.locator('#atlasQuestFocus').click();
  await page.locator('#atlasQuestPoint').waitFor({state:'visible'});
  assert.equal(new URL(await page.locator('#atlasQuestPoint').getAttribute('href'),page.url()).search,new URL(maps[0],page.url()).search);
  await page.keyboard.press('Escape');
  await wait(()=>!window.lab.frame.worldMap);
  const initialKills=(await frame()).kills;
  await walk(443);
  await mode('cover');
  const commands=await compareCover();
  await collect(472,2);
  await location('洞穴',3);
  await walk(1012);
  await ground(480);
  assert.ok(!(await frame()).storyNearbyMilestone);
  await held('Space',()=>ground(392));
  await mode('cover');
  await collect(1012,3);
  await location('木の裏',4);
  await walk(1589);
  await ground(480);
  await mode('cover');
  await collect(1589,4);
  assert.equal((await frame()).kills,initialKills);
  await walk(2041);
  await key('ShiftRight');
  assert.ok((await frame()).actors[0].x<=2046);
  await collect(1943);
  await mode('hatch');
  await shot('hatch');
  await count(5);
  await walk(2135);
  await shot('open');
  await gate(2188,town);
  await collect(1135,6);
  await shot('nap');
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  const expected=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  assert.deepEqual(reward,expected.reward);
  await save();
  await page.reload();
  await wait(()=>window.lab?.frame);
  await load();
  await walk(1135);
  await wait(()=>window.lab.frame.storyNearbyMilestone?.label.includes('もう一度'));
  await key('KeyG');
  await wait(()=>window.lab.frame.storyNotice?.includes('ありがとう'));
  assert.equal((await frame()).mora,after.mora);
  await gate(1148,path);
  assert.ok((await frame()).actors[0].x>2058);
  await mode('open');

  await useFixture();
  await load();
  await begin();
  await walk(550);
  await mode('combat');
  assert.equal((await frame()).total,1);
  await shot('detected');
  await save();
  await load();
  await gate(454,path);
  await mode('combat');
  assert.equal((await frame()).total,1);
  const kills=(await frame()).kills;
  await walk(556);
  await held('KeyJ',()=>mode('cleared'));
  assert.equal((await frame()).kills,kills+1);
  await collect(472,2);
  await walk(1012);
  await ground(480);
  await held('Space',()=>ground(392));
  await collect(1012,3);
  assert.deepEqual(errors,[]);
  const proof={scene,threeCovers:true,quietWithoutKills:true,openedGateAndNap:true,shortcutAfterReload:true,
    detectedBattleReloaded:true,continuedAfterNormalCombat:true,rereadGift:true,maps,worldMapFocus:true,backgroundTier:4096,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,interact:f?.storyNearbyMilestone,
      stealth:f?.storyStealth,progress:f?.story?.quests['ina-sayu-quiet-route']};
  }));
  throw error;
}finally{
  await browser.close();
}
