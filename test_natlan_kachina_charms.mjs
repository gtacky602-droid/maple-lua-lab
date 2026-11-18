import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub', trail='natlan-charm-trail', quest='natlan-kachina-charms';
const prefix='evidence/nat-kachina-charms';
const source='nat-kachina-charms-props-source-v1.png';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'), errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:22000});
const at=node=>wait(id=>window.lab?.frame.story?.node===id,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const button=name=>page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
const screenshot=(name,selector='.game')=>page.locator(selector).screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
 await canvas.click();
 await page.keyboard.press(code);
}

async function held(code,predicate,arg){
 await canvas.click();
 await page.keyboard.down(code);
 try{await wait(predicate,arg)}finally{await page.keyboard.up(code)}
}

async function move(x){
 const f=await frame(), here=f.actors[f.active-1].x;
 if(Math.abs(here-x)<9)return;
 await held(here<x?'KeyD':'KeyA',({x,right})=>{
  const f=window.lab.frame, here=f.actors[f.active-1].x;
  return right?here>=x-5:here<=x+5;
 },{x,right:here<x});
}

async function collect(x,label){
 await move(x);
 await wait(label=>window.lab.frame.storyNearbyMilestone?.label===label,label);
 await key('KeyG');
}

async function gate(x,node){
 await move(x);
 await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node);
 await key('KeyF');
 await at(node);
}

async function load(){
 await page.locator('#loadProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('保存した進行で町から再開しました'));
 await at(hub);
}

async function compare(){
 await key('KeyP');
 await wait(()=>window.lab.frame.paused);
 const png=await frame();
 assert.ok(png.draws.some(d=>d.source==='kachina-idle-source-v2.png'&&d.y===365));
 assert.ok(png.draws.some(d=>d.source===source));
 await screenshot('trail-png');
 const render=page.locator('#renderMode');
 await render.selectOption('rect');
 await wait(n=>window.lab.frame.commands>n,png.commands);
 const standard=await frame();
 await render.selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n,standard.commands);
 const light=await frame();
 await screenshot('trail-light');
 for(const f of [standard,light]){
  assert.equal(f.t,png.t);
  assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  assert.equal(f.camera,png.camera);
 }
 await render.selectOption('sprite');
 await wait(n=>window.lab.frame.commands===n,png.commands);
 await key('KeyP');
 await wait(()=>!window.lab.frame.paused);
 return {png:png.commands,rect:standard.commands,light:light.commands};
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8926/');
 await wait(()=>window.lab?.frame);
 const seed=await fs.readFile('work/nat-kachina-charms-fixture.json','utf8');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 await button('受注');
 await count(0);
 await collect(452,'カチーナと採集の相談をする');
 await count(1);
 await gate(668,trail);
 assert.deepEqual(await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 }),{key:'natlanCharmTrail',file:'nat-kachina-charms-trail-background-v1.png',state:'ready'});
 await collect(331,'足元の青緑の小片を拾う');
 await count(2);
 await move(445);
 const calls=await compare();
 for(let remaining=2;remaining>0;remaining--){
  const f=await frame();
  const beast=f.draws.find(d=>d.source==='fanged-beast-idle-source-v1.png');
  if(!beast){
   await move(800);
  }else{
   const player=f.actors[0].x, enemy=beast.x+f.camera;
   await move(Math.abs(player-enemy)<35?player:enemy+(player<enemy?-30:30));
  }
  await canvas.click();
  await page.keyboard.down('KeyJ');
  await page.keyboard.down(remaining===2?'KeyD':'KeyA');
  try{
   await wait(n=>window.lab.frame.kills>=n,3-remaining);
  }finally{
   await page.keyboard.up(remaining===2?'KeyD':'KeyA');
   await page.keyboard.up('KeyJ');
  }
 }
 await count(3);
 await collect(1116,'カチーナから紫の小片を受け取る');
 await count(4);
 await move(1480);
 assert.equal((await frame()).storyNearbyMilestone,undefined);
 await held('Space',()=>window.lab.frame.actors[0].y===386&&window.lab.frame.storyNearbyMilestone?.label.includes('大岩'));
 await collect(1480,'大岩のふもとで琥珀色の小片を拾う');
 await count(5);
 await gate(1740,hub);
 await collect(452,'石飾りの色と並びを選ぶ');
 const preview=page.locator('#stoneOrnaments');
 await preview.waitFor();
 const before=await page.locator('#stoneOrnamentsPreview').evaluate(c=>c.toDataURL());
 await page.locator('#stoneColor').selectOption('purple');
 await wait(()=>window.lab.frame.storyStonePair?.color==='purple');
 await page.locator('#stonePattern').selectOption('row');
 await wait(()=>window.lab.frame.storyStonePair?.pattern==='row');
 const changed=await page.locator('#stoneOrnamentsPreview').evaluate(c=>c.toDataURL());
 assert.notEqual(changed,before);
 await screenshot('workshop','#stoneOrnaments');
 await page.setViewportSize({width:390,height:844});
 const bounds=await preview.boundingBox();
 assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 assert.ok(await page.locator('#stoneOrnamentsConfirm').isVisible());
 await screenshot('mobile','#stoneOrnaments');
 await page.setViewportSize({width:1280,height:960});
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load();
 await collect(452,'石飾りの色と並びを選ぶ');
 await wait(()=>window.lab.frame.storyStonePair?.color==='purple'&&window.lab.frame.storyStonePair.pattern==='row');
 assert.equal(await page.locator('#stoneOrnamentsPreview').evaluate(c=>c.toDataURL()),changed);
 await page.locator('#stoneOrnamentsConfirm').click();
 await count(6);
 await button('報告');
 await button('カチーナを同行に選ぶ');
 await wait(()=>window.lab.frame.companion.id==='kachina');
 await move(427);
 await screenshot('exhibit');
 await collect(452,'完成した石飾りを見る');
 await wait(()=>window.lab.frame.storyStonePair?.panel==='read');
 assert.equal(await page.locator('#stoneOrnamentsPreview').evaluate(c=>c.toDataURL()),changed);
 await page.keyboard.press('Escape');
 await preview.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 const proof={ordinaryCombat:true,highShelfCameo:true,jumpToOutcrop:true,
  twoDistinctLooks:true,mobileWorkshop:true,draftReload:true,joinedAndPersistentDisplay:true,calls,errors};
 await fs.writeFile(prefix+'-web.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Kachina browser playthrough passed',calls);
}catch(err){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,quest:f?.story?.quests['natlan-kachina-charms'],camera:f?.camera,actors:f?.actors,
   kills:f?.kills,nearby:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,view:f?.storyStonePair,notice:f?.storyNotice};
 }));
 await page.screenshot({path:'work/nat-kachina-charms-web-failure.png'});
 throw err;
}finally{
 await browser.close();
}
