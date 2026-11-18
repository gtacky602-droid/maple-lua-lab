import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='mond-return-box-quest',town='mond-town',orchard='mond-library-orchard';
const prefix='evidence/mond-return-box';
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

async function walk(x){
  const f=await frame(),player=f.actors[f.active-1],right=x>player.x;
  if(Math.abs(player.x-x)<9)return;
  const direction=right?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(direction);
  try{
    await wait(({x,right})=>{
      const f=window.lab.frame,player=f.actors[f.active-1];
      return right?player.x>=x-7:player.x<=x+7;
    },{x,right});
  }finally{await page.keyboard.up(direction)}
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

async function combat(){
  await canvas.click();
  const hits=(await frame()).hits;
  await page.keyboard.down('KeyJ');
  try{
    await walk(1730);
    for(let i=0;i<3&&(await frame()).story.quests[quest]?.count===5;i++){
      await walk(i%2===0?1400:1740);
    }
    await count(6);
  }finally{await page.keyboard.up('KeyJ')}
  assert.ok((await frame()).hits>hits);
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const capture=async()=>{
    const f=await frame();
    assert.equal(f.storyReturnBox.chasing,true);
    return {t:f.t,x:f.storyReturnBox.x,y:f.storyReturnBox.y,calls:f.commands};
  };
  const png=await capture();
  await shot('chase-png');
  const mode=page.locator('#renderMode');
  await mode.selectOption('rect');
  await wait(()=>window.lab.frame.commands>1000);
  const standard=await capture();
  await mode.selectOption('h32c16');
  await wait(count=>window.lab.frame.commands<count,standard.calls);
  const light=await capture();
  await shot('chase-light');
  for(const image of [standard,light])assert.deepEqual([image.t,image.x,image.y],[png.t,png.x,png.y]);
  await mode.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.calls);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.calls,standard:standard.calls,light:light.calls};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8910/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/mond-return-box-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  await questButton('受注','active');
  await collect(340,1);
  await gate(758,orchard);
  const scene=await page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scene,{key:'mondOrchard',file:'mond-return-box-background-v1.png',state:'ready'});
  await collect(302,2);
  await walk(649);
  assert.ok(!(await frame()).storyNearbyMilestone);
  await canvas.click();
  await page.keyboard.down('Space');
  try{
    await wait(()=>window.lab.frame.actors[0].ground&&window.lab.frame.actors[0].y===399);
  }finally{await page.keyboard.up('Space')}
  await shot('clue');
  await collect(649,3);
  await collect(1000,4);
  await wait(()=>window.lab.frame.storyReturnBox?.y<465);
  const commands=await compare();
  await walk(1500);
  await count(5);
  assert.equal((await frame()).total,3);
  await shot('fight');
  await combat();
  await collect(1640,7);
  await gate(62,town);
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
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(town);
  await collect(340);
  await wait(()=>window.lab.frame.storyNotice?.includes('魔物観察記録'));
  await shot('archive');
  assert.deepEqual(errors,[]);
  const proof={scene,foundAllClues:true,climbedForMud:true,followedBox:true,foughtWithNormalAttack:true,
    returnedBook:true,archiveAfterReload:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,interact:f?.storyNearbyMilestone,
      box:f?.storyReturnBox,progress:f?.story?.quests['mond-return-box-quest']};
  }));
  throw error;
}finally{
  await browser.close();
}
