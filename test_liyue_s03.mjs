import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const root=process.env.LAB_URL||'http://127.0.0.1:8769';
const qid='liyue-book-rescue', port='liyue-harbor', field='liyue-field', camp='liyue-book-camp';
const quest=page.locator(`[data-quest="${qid}"]`), canvas=page.locator('#game');
const button=name=>page.getByRole('button',{name,exact:true});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);

const frame=()=>page.evaluate(()=>window.lab.frame);
const current=id=>page.waitForFunction(id=>window.lab?.frame.story.node===id,id);
const progress=n=>page.waitForFunction(({qid,n})=>window.lab.frame.story.quests[qid]?.count===n,{qid,n});
const height=y=>page.waitForFunction(y=>{
 const f=window.lab.frame,a=f.actors[f.active-1];
 return a.ground&&a.y===y;
},y);
async function walk(x,attack=false){
 const f=await frame(),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
 if(attack)await page.keyboard.down('KeyJ');
 await page.keyboard.down(key);
 try{
  await page.waitForFunction(({x,east})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return east?a.x>=x-7:a.x<=x+7;
  },{x,east});
 }finally{
  await page.keyboard.up(key);
  if(attack)await page.keyboard.up('KeyJ');
 }
}
async function jump(y){
 await page.keyboard.down('Space');
 try{await height(y)}finally{await page.keyboard.up('Space')}
}
async function through(id){
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.keyboard.press('KeyF');
 await current(id);
}
async function defeat(id){
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(id=>window.lab.frame.story.quests['liyue-book-rescue'].book.defeated[id],id);
 }finally{await page.keyboard.up('KeyJ')}
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/liyue-s03-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current(port);
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await walk(1380);
 await through(field);
 await walk(530,true);
 await button('G：落ちた試し刷りを調べる').click();
 await progress(1);
 assert.match(await page.locator('#storyBookText').innerText(),/二本の柱/);
 await walk(820,true);
 await jump(350);
 await page.keyboard.press('KeyG');
 await page.waitForFunction(()=>window.lab.frame.storyNotice.includes('二股の木'));
 await progress(1);
 await walk(1120,true);
 await page.waitForFunction(()=>{
  const f=window.lab.frame;
  return f.actors[f.active-1].ground;
 });
 const ledge=await frame();
 if(ledge.actors[ledge.active-1].y!==390)await jump(390);
 await button('G：石門の道しるべを調べる').click();
 await progress(2);
 await walk(1220);
 await through(camp);
 assert.ok((await frame()).draws.some(d=>d.source==='treasure-scout-idle-source-v1.png'));
 await walk(415,true);
 await defeat('liyue-book-scout-1');
 await walk(1030,true);
 await defeat('liyue-book-scout-3');
 await walk(840);
 await jump(392);
 await defeat('liyue-book-scout-2');
 await progress(3);
 await walk(1250);
 await button('G：新刊と版木の箱を回収する').click();
 await progress(4);
 await walk(110);
 await through(field);
 await walk(110,true);
 await through(port);
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
 await walk(485);
 await button('G：読書台で読む').click();
 await page.waitForFunction(()=>window.lab.frame.storyBook?.title==='石門を越えた侠客');
 await page.locator('.game').screenshot({path:'evidence/liyue-s03-reading.png'});
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 assert.equal((await frame()).story.quests[qid].status,'complete');
 await walk(485);
 await button('G：読書台で読む').waitFor();
 assert.equal(await page.locator('#storyBook').isHidden(),true);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1200,height:900});
 await page.goto(root+'/map-art.html?node='+camp);
 await page.waitForFunction(()=>window.mapArt?.node==='liyue-book-camp');
 await page.selectOption('#profile','h32c16');
 const comparison=await page.evaluate(()=>window.mapArt);
 assert.equal(comparison.count,3);
 assert.ok(comparison.grounded&&comparison.backgroundState==='ready');
 assert.ok(comparison.visuals.every(v=>v.source==='treasure-scout-idle-source-v1.png'));
 await page.locator('#camera').fill('480');
 await page.locator('#camera').dispatchEvent('input');
 await page.locator('#rect').screenshot({path:'evidence/liyue-s03-scout-rect.png'});
 await page.locator('#png').screenshot({path:'evidence/liyue-s03-scout-png.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/liyue-s03-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, wrong_and_correct_landmarks:true, scout_art_in_combat:true,
  three_foes_and_recovery:true, report_and_optional_reading:true, resume_and_viewport_390:true,
  png_vs_44px_16_color_map_comparison:true, errors
 },null,2)+'\n');
 console.log('Liyue S03 Chrome landmark, camp, reading and scout comparison passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  status:document.querySelector('#status')?.textContent,
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests['liyue-book-rescue'],
  actor:window.lab?.frame.actors[0],
 })),errors);
 throw error;
}finally{await browser.close()}
