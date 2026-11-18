import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='mond-night-banner-quest',town='mond-town',hill='mond-night-hill';
const prefix='evidence/mond-night-banner';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg,timeout=20000)=>page.waitForFunction(fn,arg,{timeout});
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
  if(Math.abs(player.x-x)<9)return;
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

async function compareShadow(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='mond-night-banner-props-source-v1.png'));
  await shot('shadow-png');
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await wait(()=>window.lab.frame.commands>1000);
  const standard=await frame();
  await mode.selectOption('h32c16');
  await wait(count=>window.lab.frame.commands<count,standard.commands);
  const light=await frame();
  await shot('shadow-light');
  for(const variant of [standard,light])assert.equal(variant.t,png.t);
  await mode.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function killLower(x,id){
  await walk(x);
  await held('KeyJ',()=>wait(({quest,id})=>window.lab.frame.story.quests[quest].sweep?.[id],{quest,id}));
}

async function load(){
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8911/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/mond-night-banner-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await load();
  await questButton('受注','active');
  await collect(1068,1);
  await gate(851,hill);
  const scene=await page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scene,{key:'mondNightHill',file:'mond-night-banner-background-v1.png',state:'ready'});
  assert.equal((await frame()).total,0);
  await walk(175);
  const commands=await compareShadow();
  await collect(225,2);
  await walk(718);
  assert.ok(!(await frame()).storyNearbyMilestone);
  await held('Space',()=>ground(396));
  await collect(718,3);
  await walk(1065);
  await ground(480);
  await collect(1065,4);
  assert.equal((await frame()).total,3);
  await walk(1232);
  await shot('flyers');
  await walk(1160);
  await killLower(1178,'mond-night-slime-a');
  await killLower(1315,'mond-night-slime-b');
  await walk(1540);
  await held('Space',()=>ground(405));
  await held('KeyJ',()=>count(5));
  await walk(1470);
  await ground(480);
  await collect(1470,6);
  await walk(1705);
  await held('Space',()=>ground(405));
  await collect(1705,7);
  await walk(1620);
  await shot('repaired');
  await gate(61,town);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora,
    after.inventory.upgradeOre-before.inventory.upgradeOre];
  const expected=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  assert.deepEqual(reward,expected.reward);
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await load();
  await gate(851,hill);
  assert.equal((await frame()).total,0);
  await walk(1705);
  await held('Space',()=>ground(405));
  await collect(1705);
  await wait(()=>window.lab.frame.storyNotice?.includes('黒き翼の正体を記したわ'));
  assert.deepEqual(errors,[]);
  const proof={scene,movingShadowFound:true,climbedForWind:true,threeSlimesWithNormalAttack:true,
    repairedBeforeReport:true,bannerAndDialogueAfterReload:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,interact:f?.storyNearbyMilestone,
      progress:f?.story?.quests['mond-night-banner-quest']};
  }));
  throw error;
}finally{
  await browser.close();
}
