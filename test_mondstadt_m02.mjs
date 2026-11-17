import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const qid='mond-old-trail';
const q=page.locator('[data-quest="'+qid+'"]');
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game');
const location=id=>page.waitForFunction(id=>window.lab.frame.story.node===id,id);

async function focus(){
 await canvas.scrollIntoViewIfNeeded();
 await canvas.click();
}
async function walk(x,{attack=false}={}){
 const f=await frame(), east=f.actors[f.active-1].x<x, key=east?'KeyD':'KeyA';
 await focus();
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
 await focus();
 await page.keyboard.down('Space');
 try{
  await page.waitForFunction(y=>{
   const f=window.lab.frame;
   return f.actors[f.active-1].y===y;
  },y);
 }finally{await page.keyboard.up('Space')}
}
async function through(id){
 await page.waitForFunction(id=>{
  const gate=window.lab.frame.storyNearbyPortal;
  return gate?.to===id&&gate.available;
 },id);
 await page.keyboard.press('KeyF');
 await location(id);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForSelector('[data-quest="mond-old-trail"][data-status="locked"]');
 assert.equal(await q.getByRole('button',{name:'受注',exact:true}).count(),0);
 assert.match(await q.innerText(),/先に「配達は、スライム待ち！」を報告する/);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/mondstadt-m02-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForSelector('[data-quest="mond-old-trail"][data-status="unaccepted"]');
 await q.getByRole('button',{name:'受注',exact:true}).click();
 await q.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#trackedQuestText').textContent.includes('手がかり') ||
   document.querySelector('#trackedQuestText').textContent.includes('車輪跡'));
 await walk(1330);
 await through('mond-road');
 await walk(895);
 await through('mond-old-road');
 await walk(740);
 assert.notEqual((await frame()).storyNearbyPortal?.to,'mond-old-canopy');
 await walk(520);
 await jump(390);
 await jump(300);
 await walk(740);
 await through('mond-old-canopy');
 await walk(510);
 await jump(390);
 await jump(305);
 await walk(700);
 await page.waitForFunction(()=>window.lab.frame.storyNearbyClue?.id==='red-cloth');
 assert.match(await page.locator('#nearbyCargoGo').innerText(),/枝の赤い布/);
 await page.keyboard.press('KeyG');
 await page.waitForFunction(()=>window.lab.frame.story.quests['mond-old-trail'].inspected['red-cloth']);
 await walk(855);
 await jump(220);
 await walk(1220);
 await through('mond-hill');
 await walk(662,{attack:true});
 await focus();
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.story.quests['mond-old-trail'].count===2);
 }finally{await page.keyboard.up('KeyJ')}
 await page.waitForSelector('[data-quest="mond-old-trail"][data-status="ready"]');
 assert.equal(await q.getByRole('button',{name:'報告',exact:true}).isEnabled(),false);

 const backdrop=await page.evaluate(async()=>{
  const {sceneryStatus,backgroundReady}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.equal(backdrop.key,'mondhill');
 assert.equal(backdrop.state,'ready');
 await page.locator('.game').screenshot({path:'evidence/mondstadt-m02-hill.png'});
 await walk(1650);
 await through('mond-road');
 await walk(104);
 await through('mond-town');
 const before=await frame();
 await q.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="mond-old-trail"][data-status="complete"]');
 const paid=await frame();
 assert.equal(paid.mora-before.mora,140);
 assert.equal(paid.progression.questXp-before.progression.questXp,2486);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.story.quests['mond-old-trail']?.status==='complete');
 assert.equal((await frame()).story.quests[qid].inspected['red-cloth'],true);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-m02-browser.json',JSON.stringify({errors,prerequisiteShown:true,
  realUpperRoute:true,inspectedRedCloth:true,ordinaryGuardCombat:true,shortcut:true,
  reporting:{xp:2486,mora:140},saveRestored:true,mobileWidth:true,backdrop},null,2)+'\n');
 console.log('M02 upper route by keyboard, guard combat, shortcut, report, reload and hill background passed');
}finally{await browser.close()}
