import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const root=process.env.LAB_URL||'http://127.0.0.1:8769';
const qid='inazuma-moving-lantern', port='inazuma-port', road='inazuma-road', town='inazuma-town';
const trail='inazuma-lantern-trail', clearing='inazuma-lantern-clearing';
const quest=page.locator(`[data-quest="${qid}"]`), canvas=page.locator('#game');
const ally=page.locator('[data-quest="ayaka-join"]');
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const frame=()=>page.evaluate(()=>window.lab.frame);
const current=(id,timeout=15000)=>page.waitForFunction(id=>window.lab?.frame.story.node===id,id,{timeout});
const progress=n=>page.waitForFunction(({qid,n})=>window.lab.frame.story.quests[qid]?.count===n,{qid,n});
const button=name=>page.getByRole('button',{name,exact:true});

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
 try{
  await page.waitForFunction(y=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return a.ground&&a.y===y;
  },y);
 }finally{await page.keyboard.up('Space')}
}
async function through(id){
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.keyboard.press('KeyF');
 await current(id);
}

try{
 await page.goto(root);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/inazuma-m01-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await current('liyue-harbor');
 await walk(720);
 await through('liyue-ferry');
 await current(port,45000);
 assert.equal(await ally.getAttribute('data-status'),'locked');
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await ally.getByRole('button',{name:'受注',exact:true}).waitFor();
 await quest.getByRole('button',{name:'この依頼を追跡'}).click();
 await walk(452);
 const start=(await frame()).storyPortLanternX;
 assert.ok(start>240);
 await page.waitForFunction(start=>window.lab.frame.storyPortLanternX>start+12,start);
 await walk(409);
 const watching=await frame();
 await page.waitForFunction(t=>window.lab.frame.t>t+.6,watching.t);
 assert.equal((await frame()).storyPortLanternX,watching.storyPortLanternX);
 await button('G：綾華に話しかける').click();
 await progress(1);
 await walk(1380);
 await through(road);
 await walk(1380,true);
 await through(town);
 await walk(580);
 await through(trail);
 await walk(305);
 await button('G：箱に残った葉っぱを調べる').click();
 await progress(2);
 await walk(670,true);
 await jump(391);
 await page.keyboard.press('KeyG');
 await progress(3);
 await walk(1100,true);
 await button('G：木の実の食べ跡を調べる').click();
 await progress(4);
 await walk(1590,true);
 await through(clearing);
 await walk(440);
 await button('G：左の灯籠を調べる').click();
 await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('葉っぱは見当たりません'));
 await progress(4);
 await walk(640);
 await button('G：中央の灯籠を調べる').click();
 await progress(5);
 assert.ok((await frame()).draws.some(d=>d.source==='danuki-dance-source-v1.png'));
 await page.locator('.game').screenshot({path:'evidence/inazuma-m01-reveal.png'});
 await button('G：化け狸から絵を受け取る').click();
 await progress(6);
 await page.locator('#storyLanternNotes summary').click();
 assert.match(await page.locator('#storyLanternNoteText').innerText(),/鳥居、大灯籠、海/);
 await walk(1210);
 await through(town);
 await walk(110);
 await through(road);
 await walk(110,true);
 await through(port);
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector(`[data-quest="${qid}"][data-status="complete"]`);
 assert.match(await page.locator('#storyLanternNoteText').innerText(),/笑顔/);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('町から再開しました'));
 assert.equal((await frame()).storyLanternNote.smile,true);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1200,height:900});
 await page.goto(root+'/characters-art.html?q=bake-danuki');
 await page.waitForFunction(()=>window.charactersGallery?.ready);
 await page.selectOption('#profile','h32c16');
 await page.selectOption('#zoom','3');
 const card=page.locator('[data-id="bake-danuki"]');
 assert.match(await card.innerText(),/188矩形/);
 await card.screenshot({path:'evidence/inazuma-m01-danuki-comparison.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/inazuma-m01-browser.json',JSON.stringify({
  browser:'Chrome', actual_controls:true, existing_voyage:true, moving_lantern_and_turning:true,
  three_clues_and_wrong_lantern_retry:true, danuki_visible_and_invitation_collected:true,
  smile_survives_restore:true, viewport_390:true, png_and_28px_comparison:true, errors
 },null,2)+'\n');
 console.log('Inazuma M01 Chrome voyage, lantern puzzles, Danuki art, report and restore passed');
}catch(error){
 console.error(await page.evaluate(()=>({
  status:document.querySelector('#status')?.textContent,
  node:window.lab?.frame.story.node,
  quest:window.lab?.frame.story.quests['inazuma-moving-lantern'],
  actor:window.lab?.frame.actors[0],
 })),errors);
 throw error;
}finally{await browser.close()}
