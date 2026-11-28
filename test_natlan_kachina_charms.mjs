import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='natlan-hub', trail='natlan-charm-trail', quest='natlan-kachina-charms';
const checkpoint=process.env.LAB_CHARMS_CHECKPOINT;
const prefix=process.env.LAB_CHARMS_OUTPUT||'evidence/nat-kachina-charms';
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

async function save(){
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 return page.evaluate(()=>localStorage.getItem('maple-lua-lab.checkpoint.v1'));
}

async function reload(){
 await page.reload();
 await wait(()=>window.lab?.frame);
 await load();
}

async function holdAlly(){
 if((await frame()).holdAllyFire)return;
 await page.locator('#allyFire').click();
 await wait(()=>window.lab.frame.holdAllyFire);
}

async function fight(ready){
 for(let attempt=0;attempt<28;attempt++){
  if(await page.evaluate(ready,quest))return;
  const f=await frame(),player=f.actors[0];
  const beasts=f.draws.filter(d=>d.source==='fanged-beast-idle-source-v1.png').map(d=>d.x+f.camera);
  if(!beasts.length){
   await move(800);
   continue;
  }
  const enemy=beasts.reduce((nearest,x)=>Math.abs(x-player.x)<Math.abs(nearest-player.x)?x:nearest);
  const direction=enemy>=player.x?1:-1;
  if(Math.abs(enemy-player.x)>34)await move(enemy-25*direction);
  await held(direction>0?'KeyD':'KeyA',dir=>window.lab.frame.actors[0].dir===dir,direction);
  const time=(await frame()).t;
  await held('KeyJ',start=>window.lab.frame.t>=start+.35,time);
 }
 assert.fail('The watched beast did not fall to normal attacks');
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
 const seed=await fs.readFile(checkpoint||'work/nat-kachina-charms-fixture.json','utf8');
 const input=JSON.parse(seed);
 assert.equal(input.story.quests[quest],undefined);
 if(checkpoint)assert.equal(input.story.quests['natlan-sunset-duel'].status,'complete');
 await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
 await load();
 assert.equal((await frame()).progression.level,input.progression.level);
 await holdAlly();
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
 await fight(quest=>Object.keys(window.lab.frame.story.quests[quest]?.sweep??{}).length===1);
 const partial=JSON.parse(await save()).story.quests[quest];
 assert.equal(partial.count,2);
 assert.equal(Object.keys(partial.sweep).length,1);
 await reload();
 await holdAlly();
 await gate(668,trail);
 await wait(()=>window.lab.frame.total===1);
 assert.deepEqual((await frame()).story.quests[quest].sweep,partial.sweep);
 await fight(quest=>window.lab.frame.story.quests[quest]?.count===3);
 await count(3);
 await collect(1116,'カチーナから紫の小片を受け取る');
 await count(4);
 await move(1480);
 assert.equal((await frame()).storyNearbyMilestone,undefined);
 assert.ok((await frame()).draws.some(d=>d.text==='ジャンプ長押しで上の足場へ'));
 await screenshot('ledge-cue','#game');
 await key('KeyM');
 await wait(id=>window.lab.frame.worldMap?.selected?.id===id,trail);
 assert.match(await page.locator('#atlasQuestObjectives').innerText(),/大岩の真下でジャンプを長押し/);
 await page.keyboard.press('KeyM');
 await wait(()=>!window.lab.frame.worldMap);
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
 await save();
 await reload();
 await collect(452,'石飾りの色と並びを選ぶ');
 await wait(()=>window.lab.frame.storyStonePair?.color==='purple'&&window.lab.frame.storyStonePair.pattern==='row');
 assert.equal(await page.locator('#stoneOrnamentsPreview').evaluate(c=>c.toDataURL()),changed);
 await page.locator('#stoneOrnamentsConfirm').click();
 await count(6);
 const beforeReport=await frame();
 await button('報告');
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 const reported=await frame();
 const reward=[reported.progression.questXp-beforeReport.progression.questXp,reported.mora-beforeReport.mora];
 assert.deepEqual(reward,[1319124,4800]);
 await button('カチーナを同行に選ぶ');
 await wait(()=>window.lab.frame.companion.id==='kachina');
 const done=await save();
 const saved=JSON.parse(done);
 const preserved=Object.entries(input.story.quests).filter(([,state])=>state.status==='complete');
 for(const [key,record] of preserved)assert.deepEqual(saved.story.quests[key],record,key);
 if(checkpoint)await fs.writeFile(prefix+'-complete.json',done+'\n');
 await reload();
 const restored=await frame();
 assert.equal(restored.companion.id,'kachina');
 assert.deepEqual(restored.starterEquipment?.weapon,{name:'山歩きの入門長柄',atk:1});
 assert.deepEqual(restored.starterEquipment?.flower,{name:'山道の石花',hp:10});
 assert.equal(restored.progression.questXp,reported.progression.questXp);
 assert.equal(restored.mora,reported.mora);
 await move(427);
 await screenshot('exhibit');
 await collect(452,'完成した石飾りを見る');
 await wait(()=>window.lab.frame.storyStonePair?.panel==='read');
 assert.equal(await page.locator('#stoneOrnamentsPreview').evaluate(c=>c.toDataURL()),changed);
 await page.keyboard.press('Escape');
 await preview.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 const proof={ordinaryCombat:true,highShelfCameo:true,jumpToOutcrop:true,
  partialSweepReload:true,ledgeCue:true,atlasLedgeGuide:true,twoDistinctLooks:true,mobileWorkshop:true,draftReload:true,
  joinedAndPersistentDisplay:true,sourceSha256:createHash('sha256').update(seed).digest('hex'),
  startLevel:input.progression.level,reportedLevel:restored.progression.level,priorCompleted:preserved.length,
  reward,restoredGear:restored.starterEquipment,calls,errors};
 await fs.writeFile(prefix+'-web.json',JSON.stringify(proof,null,2)+'\n');
 console.log('Kachina browser playthrough passed',calls);
}catch(err){
 console.error(await page.evaluate(()=>{
  const f=window.lab?.frame;
  return {node:f?.story?.node,quest:f?.story?.quests['natlan-kachina-charms'],camera:f?.camera,actors:f?.actors,
   kills:f?.kills,nearby:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,view:f?.storyStonePair,notice:f?.storyNotice};
 }));
 await page.screenshot({path:prefix+'-failure.png'});
 throw err;
}finally{
 await browser.close();
}
