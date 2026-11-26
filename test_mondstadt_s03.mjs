import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const qid='mond-bennett-cave';
const upper='mond-bennett-ledge', depth='mond-bennett-depth', old='mond-old-ground';
const quest=page.locator(`[data-quest="${qid}"]`);
const canvas=page.locator('#game');
const frame=()=>page.evaluate(()=>window.lab.frame);

async function focus(){
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
}
async function walk(x,attack=false){
 const f=await frame(), east=f.actors[f.active-1].x<x, key=east?'KeyD':'KeyA';
 await focus();
 if(attack)await page.keyboard.down('KeyJ');
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,actor=f.actors[f.active-1];
   return east?actor.x>=x-7:actor.x<=x+7;
  },{x,east});
 }finally{
  await page.keyboard.up(key);
  if(attack)await page.keyboard.up('KeyJ');
 }
}
async function jump(y){
 await focus();
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(y=>{
   const f=window.lab.frame;
   return f.actors[f.active-1].ground&&f.actors[f.active-1].y===y;
  },y);
 }finally{await page.keyboard.up('Space')}
}
async function through(id){
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.keyboard.press('KeyF');
 await page.waitForFunction(id=>window.lab.frame.story.node===id,id);
}
const backdrop=()=>page.evaluate(async()=>{
 const {sceneryStatus,backgroundReady}=await import('./scenery.js');
 await backgroundReady;
 return sceneryStatus(window.lab.frame);
});


async function interact(label,count){
 await page.getByRole('button',{name:'G：'+label,exact:true}).waitFor();
 await focus();
 await page.keyboard.press('KeyG');
 await page.waitForFunction(({qid,count})=>window.lab.frame.story.quests[qid]?.count===count,{qid,count});
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="locked"]`);
 const seed=JSON.parse(await fs.readFile('work/mondstadt-s03-fixture.json','utf8'));
 seed.mora=20000;
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',JSON.stringify(raw)),seed);
 await page.locator('#loadProgress').click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="unaccepted"]`);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await walk(1330);
 await through('mond-road');
 await walk(270);
 await jump(350);
 await through('mond-hill');
 await walk(895,true);
 await through(upper);
 assert.equal((await backdrop()).key,'windsplit');
 await walk(270);
 await interact('ベネットに洞窟の道を聞く',1);
 assert.ok((await frame()).draws.some(d=>d.source==='bennett-cave-guide-source-v1.png'));
 await walk(405);
 await focus();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>window.lab.frame.paused);
 await canvas.screenshot({path:'evidence/mondstadt-s03-guide.png'});
 const guideSource='bennett-cave-guide-source-v1.png';
 await page.locator('#renderMode').selectOption('rect');
 await page.waitForFunction(source=>!window.lab.frame.draws.some(d=>d.source===source),guideSource);
 const frozen=await frame(),standard=frozen.commands;
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(standard=>window.lab.frame.commands<standard*.65,standard);
 const lightFrame=await frame(),light=lightFrame.commands;
 assert.equal(lightFrame.t,frozen.t);
 await canvas.screenshot({path:'evidence/mondstadt-s03-guide-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await focus();
 await page.keyboard.press('KeyP');
 await page.waitForFunction(()=>!window.lab.frame.paused);
 await walk(590);
 await jump(400);
 await jump(315);
 await walk(1170);
 await interact('宝箱を開ける',2);
 assert.match((await frame()).storyCave.message,/箱の中は空/);
 await walk(1100);
 const pre=await frame();
 await canvas.screenshot({path:'evidence/mondstadt-s03-chest.png'});
 await focus();
 await page.keyboard.down('KeyA');
 try{
  await page.waitForFunction(()=>window.lab.frame.storyCave?.falling);
 }finally{await page.keyboard.up('KeyA')}
 const collapse=await frame();
 assert.ok(collapse.platforms.every(p=>p.x!==670));
 await page.waitForFunction(node=>window.lab.frame.story.node===node,depth);
 await page.waitForFunction(node=>document.getElementById('trackedQuestMap').dataset.node===node,depth);
 const point=new URL(await page.locator('#trackedSurveyPoint').getAttribute('href'),page.url());
 assert.equal(point.searchParams.get('node'),depth);
 const preview=await browser.newPage();await preview.goto(point.href);
 await preview.waitForFunction(()=>window.mapArt?.ready);
 assert.match(await preview.locator('#surveyPointNote').innerText(),/強化鉱石.*480, 480/);
 for(const id of ['png','rect']){
  const rgb=await preview.evaluate(id=>Array.from(document.getElementById(id).getContext('2d')
   .getImageData(483-mapArt.camera,444,1,1).data).slice(0,3),id);
  assert.deepEqual(rgb,[166,225,205]);
 }
 await preview.close();
 const landed=await frame();
 assert.equal(landed.returns,pre.returns);
 assert.deepEqual(landed.actors.map(a=>a.hp),pre.actors.map(a=>a.hp));
 assert.equal((await backdrop()).key,'windsplit');
 await canvas.screenshot({path:'evidence/mondstadt-s03-depth.png'});
 await walk(480);
 await interact('光る鉱石を拾う',4);
 assert.equal((await frame()).inventory.upgradeOre,1);
 await walk(1190,true);
 await through(old);
 await walk(1100,true);
 await through(depth);
 await walk(1190,true);
 await through(old);
 await walk(115,true);
 await through('mond-old-road');
 await walk(110);
 await through('mond-road');
 await walk(110,true);
 await through('mond-town');
 assert.match(await quest.innerText(),/967EXP \/ 160モラ/);
 const before=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(id=>window.lab.frame.story.quests[id].status==='complete',qid);
 const reported=await frame();
 assert.equal(reported.progression.questXp-before.progression.questXp,967);
 assert.equal(reported.mora-before.mora,160);

 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',qid);
 assert.equal((await frame()).inventory.upgradeOre,1);
 await page.getByText('聖遺物バッグ・5部位装備',{exact:true}).click();
 const beforeKit=(await frame()).inventory.items.length;
 await page.locator('[data-action="artifact_samples"]').click();
 await page.waitForFunction(count=>window.lab.frame.inventory.items.length===count,beforeKit+5);
 const previous=(await frame()).mora;
 const item=page.locator('#inventoryRows > div').nth(beforeKit);
 await item.getByRole('button',{name:'鉱石で+4強化（400モラ減）',exact:true}).click();
 await page.waitForFunction(index=>window.lab.frame.inventory.items[index].enhance===4,beforeKit);
 assert.equal((await frame()).inventory.upgradeOre,0);
 assert.equal(previous-(await frame()).mora,6800);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-s03-browser.json',JSON.stringify({
  browser:'Chrome',actual_controls:true,cave_platforms_and_collapse:true,shared_temporary_background:true,
  collapse_hp_preserved:true,two_way_shortcut:true,save_restore_and_ore_consumption:true,report:{xp:967,mora:160},
  guideComparison:{sameTick:frozen.t,standard,light}, viewport_390:true,errors
 },null,2)+'\n');
 console.log('Mondstadt S03 browser cave, safe collapse, shortcut, and ore enhancement passed');
}catch(error){
 console.error(await page.evaluate(id=>({
  node:window.lab?.frame.story.node,stage:window.lab?.frame.story.quests[id],
  portal:window.lab?.frame.storyNearbyPortal,cave:window.lab?.frame.storyCave,
  actor:window.lab?.frame.actors[0],inventory:window.lab?.frame.inventory
 }),qid),errors);
 throw error;
}finally{await browser.close()}
