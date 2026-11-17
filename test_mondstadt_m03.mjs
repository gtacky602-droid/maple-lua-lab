import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const qid='mond-watchtower-clear';
const quest=page.locator('[data-quest="mond-watchtower-clear"]');
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
 await page.waitForFunction(id=>window.lab.frame.story.node===id,id);
}
const backdrop=()=>page.evaluate(async()=>{
 const {sceneryStatus,backgroundReady}=await import('./scenery.js');
 await backgroundReady;
 return sceneryStatus(window.lab.frame);
});

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForSelector('[data-quest="mond-watchtower-clear"][data-status="locked"]');
 assert.match(await quest.innerText(),/看板の向こうに、何がある？/);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
                     await fs.readFile('work/mondstadt-m03-fixture.json','utf8'));
 await page.locator('#loadProgress').click();
 await page.waitForSelector('[data-quest="mond-watchtower-clear"][data-status="unaccepted"]');
 await quest.getByRole('button',{name:'受注',exact:true}).click();
 await quest.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await walk(1330);
 await through('mond-road');
 await walk(270);
 await jump(350);
 await through('mond-hill');
 await walk(1160);
 await jump(377);
 await through('mond-watchtower');
 const before=await backdrop();
 assert.deepEqual([before.key,before.state],['mondhill','ready']);
 assert.match(await page.locator('#storyElite').innerText(),/街道の大親分.*45 \/ 45/);
 await page.locator('.game').screenshot({path:'evidence/mondstadt-m03-before.png'});
 await walk(780,true);
 await focus();
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(()=>window.lab.frame.storyCleared&&window.lab.frame.total===0);
 }finally{await page.keyboard.up('KeyJ')}
 await page.waitForSelector('[data-quest="mond-watchtower-clear"][data-status="ready"]');
 assert.equal(await page.locator('#storyElite').isVisible(),false);
 const after=await backdrop();
 assert.deepEqual([after.key,after.state],['mondrestored','ready']);
 await walk(160);
 await page.locator('.game').screenshot({path:'evidence/mondstadt-m03-after.png'});
 await walk(1650);
 await through('mond-restored-road');
 assert.equal((await frame()).total,0);
 await walk(1330);
 await through('mond-town');
 const balance=await frame();
 await quest.getByRole('button',{name:'報告',exact:true}).click();
 await page.waitForSelector('[data-quest="mond-watchtower-clear"][data-status="complete"]');
 const paid=await frame();
 assert.equal(paid.mora-balance.mora,220);
 assert.equal(paid.progression.questXp-balance.progression.questXp,4771);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
 assert.equal((await frame()).story.quests[qid].status,'complete');
 await walk(1150);
 await through('mond-restored-road');
 await walk(104);
 await through('mond-watchtower');
 assert.equal((await frame()).total,0);
 assert.deepEqual(await backdrop(),after);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/mondstadt-m03-browser.json',JSON.stringify({
  errors,prerequisiteShown:true,ordinaryCombat:true,backgroundChange:[before.file,after.file],
  peacefulRoad:true,reward:{xp:4771,mora:220},saveRestored:true,clearedTowerOnReturn:true,mobileWidth:true
 },null,2)+'\n');
 console.log('M03 browser combat, changed scenery, peaceful return, report and reload passed');
}finally{await browser.close()}
