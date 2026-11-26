import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const qid='mond-windmill', town='mond-town', roof='mond-roof-route', view='mond-windmill-lookout';
const quest=page.locator(`[data-quest="${qid}"]`);
const canvas=page.locator('#game');
const frame=()=>page.evaluate(()=>window.lab.frame);

async function focus(){
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
}
async function walk(x){
 const f=await frame(), east=f.actors[f.active-1].x<x, key=east?'KeyD':'KeyA';
 await focus();
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,actor=f.actors[f.active-1];
   return east?actor.x>=x-7:actor.x<=x+7;
  },{x,east});
 }finally{
  await page.keyboard.up(key);
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


async function interact(label){
 await page.getByRole('button',{name:'G：'+label,exact:true}).waitFor();
 await focus();
 await page.keyboard.press('KeyG');
}
const stage=n=>page.waitForFunction(n=>window.lab.frame.storyRoof?.stage===n,n);
async function air(y){
 await page.waitForFunction(()=>window.lab.frame.storyRoof?.flight);
 await page.waitForFunction(y=>{
  const f=window.lab.frame,a=f.actors[f.active-1];
  return !f.storyRoof.flight&&a.ground&&a.y===y;
 },y);
}

const preview=await browser.newPage();
async function checkFlag(step,node,x,y,color){
 const link=page.locator('#trackedSurveyPoint');
 await page.waitForFunction(({step,node})=>{
  const href=document.getElementById('trackedSurveyPoint').getAttribute('href');
  if(!href)return false;
  const params=new URL(href,location.href).searchParams;
  return params.get('node')===node&&params.get('step')===String(step);
 },{step,node});
 await preview.goto(new URL(await link.getAttribute('href'),page.url()).href);
 await preview.waitForFunction(()=>window.mapArt?.ready);
 assert((await preview.locator('#surveyPointNote').innerText()).includes('（'+x+', '+y+'）'));
 for(const id of ['png','rect']){
  const rgb=await preview.evaluate(({id,x,y})=>Array.from(document.getElementById(id).getContext('2d')
   .getImageData(x-mapArt.camera+8,y-24,1,1).data).slice(0,3),{id,x,y});
  assert.deepEqual(rgb,color);
 }
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="locked"]`);
 assert.match(await quest.innerText(),/Lv16/);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/mondstadt-s05-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="unaccepted"]`);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await walk(620);
 await through(roof);
 assert.equal((await backdrop()).key,'mondroof');
 assert.equal((await frame()).total,0);
 await checkFlag(1,roof,329,395,[237,104,112]);
 await walk(329);
 await jump(395);
 await interact('屋根の赤い目印を調べる');
 await stage(1);
 await checkFlag(2,roof,584,310,[95,168,229]);
 await walk(498);
 await jump(310);
 await walk(584);
 await interact('見張りの青い目印を調べる');
 await stage(2);
 await checkFlag(3,roof,965,145,[237,195,95]);
 const beforeFall=await frame();
 await focus();
 await page.keyboard.down('KeyS');
 try{
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.lab.frame.storyRoof?.falls===1);
 }finally{await page.keyboard.up('KeyS')}
 const recovered=await frame();
 assert.equal(recovered.actors[0].y,310);
 assert.deepEqual(recovered.actors.map(a=>a.hp),beforeFall.actors.map(a=>a.hp));
 assert.equal(recovered.mora,beforeFall.mora);
 assert.equal(recovered.returns,beforeFall.returns);
 await walk(716);
 await canvas.screenshot({path:'evidence/mondstadt-s05-rooftops.png'});
 await walk(742);
 await interact('風車へ上がる気流に乗る');
 await air(145);
 await walk(965);
 await interact('風車の黄色い目印を調べる');
 await stage(3);
 await checkFlag(4,view,563,480,[237,195,95]);
 assert((await page.locator('#trackedRouteGate').getAttribute('href')).includes('to='+view));
 await page.locator('#trackedQuestMap').click();
 const atlasLink=page.locator('#atlasQuestObjectives a[href*="quest=mond-windmill"][href*="step=4"]');
 await atlasLink.waitFor();
 assert.equal(new URL(await atlasLink.getAttribute('href'),page.url()).searchParams.get('node'),view);
 await page.keyboard.press('Escape');
 assert.match((await frame()).storyRoof.message,/黄色い目印が飛んだ/);
 await walk(1045);
 await interact('展望台へ上がる気流に乗る');
 await air(112);
 await walk(1395);
 await through(view);
 assert.equal((await backdrop()).key,'mondlookout');
 await walk(563);
 await interact('飛ばされた目印を拾い、景色を眺める');
 await stage(4);
 await walk(645);
 await canvas.screenshot({path:'evidence/mondstadt-s05-lookout.png'});
 const record=(await frame()).story.quests[qid].roof.bestTicks;
 assert.ok(record>0);
 await walk(1150);
 await through(town);
 assert.match(await quest.innerText(),/2,004EXP \/ 210モラ/);
 assert.match(await quest.innerText(),/記録/);
 assert.equal((await quest.innerText()).includes('風車の風読み'),record<=26*60);
 const before=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForFunction(id=>window.lab.frame.story.quests[id].status==='complete',qid);
 const after=await frame();
 assert.equal(after.progression.questXp-before.progression.questXp,2004);
 assert.equal(after.mora-before.mora,210);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開'));
 await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',qid);
 assert.equal((await frame()).story.quests[qid].roof.bestTicks,record);
 await walk(965);
 await through(view);
 await walk(1150);await through(town);
 await walk(620);await through(roof);
 await walk(185);await interact('屋根巡回の記録に挑戦する');
 await stage(0);await checkFlag(1,roof,329,395,[237,104,112]);
 assert.match(await page.locator('#trackedQuestText').innerText(),/記録に再挑戦中/);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-s05-browser.json',JSON.stringify({
  browser:'Chrome',actual_controls:true,three_markers_and_two_currents:true,fall_returned_to_roof:true,
  lookouts_and_town_shortcut:true,bestTicks:record,save_reload:true, report:{xp:2004,mora:210},
  viewport_390:true,errors
 },null,2)+'\n');
 console.log('Mondstadt S05 Chrome roofs, fall recovery, wind currents, report and saved shortcut passed');
}catch(error){
 console.error(await page.evaluate(id=>({
  node:window.lab?.frame.story.node,quest:window.lab?.frame.story.quests[id],
  portal:window.lab?.frame.storyNearbyPortal,nearby:window.lab?.frame.storyNearbyRoof,
  roof:window.lab?.frame.storyRoof,actor:window.lab?.frame.actors[0]
 }),qid),errors);
 throw error;
}finally{await browser.close()}
