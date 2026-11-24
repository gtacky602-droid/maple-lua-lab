import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(15000);
const url=process.env.LAB_URL||'http://127.0.0.1:9080';
const guide=page.locator('#natlanGearGuide');
const save=JSON.parse(await fs.readFile('work/fontaine-fresh-route/natlan-save.json','utf8'));
const state=()=>page.evaluate(()=>window.lab.frame);

async function restore(data){
 await page.locator('#importSave').setInputFiles({
  name:'natlan-gear.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data)),
 });
 await page.waitForFunction(()=>window.lab?.frame.story.node==='natlan-hub'&&
  document.querySelector('#saveStatus').textContent.includes('ファイルの進行で町から再開'));
}

try{
 await page.goto(url);
 await page.waitForFunction(()=>window.lab?.frame);
 await restore(save);
 assert.equal((await state()).progression.level,100);
 assert.equal(await page.locator('#natlanGearEquip').isVisible(),true);
 assert.equal(await page.locator('#natlanGearRoute').isVisible(),false);
 await guide.screenshot({path:'evidence/natlan-gear-guide-mobile.png'});
 const before=await state();
 await page.locator('#natlanGearEquip').click();
 await page.waitForFunction(()=>document.querySelector('#natlanGearGuide').hidden);
 const after=await state();
 const equipped=after.inventory.items.filter(item=>item.owner===1);
 assert.deepEqual(equipped.map(item=>item.slot).sort(),[1,2]);
 assert.equal(after.mora,before.mora);
 assert.ok(after.actors[0].atk>before.actors[0].atk);
 assert.ok(after.actors[0].maxhp>before.actors[0].maxhp);
 await page.locator('#saveProgress').click();
 await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-hub'&&
  window.lab.frame.inventory.items.filter(item=>item.owner===1).length===2);
 assert.equal(await guide.isVisible(),false);

 const empty=structuredClone(save);
 empty.inventory.items=[];
 empty.inventory.ground=[];
 await restore(empty);
 assert.equal(await page.locator('#natlanGearEquip').isVisible(),false);
 assert.equal(await page.locator('#natlanGearRoute').isVisible(),true);
 await page.locator('#natlanGearRoute').click();
 await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town'&&
  window.lab.frame.worldMap?.selected?.id==='ridge-watch-domain'&&
  window.lab.frame.worldMap.guide?.status==='ready');
 assert.equal(await page.locator('#worldAtlas').isVisible(),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'evidence/natlan-gear-recovery-atlas-mobile.png'});
 const route=(await state()).worldMap.guide.stops.map(stop=>stop.id);
 assert.equal(route.at(-1),'ridge-watch-domain');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!window.lab.frame.worldMap);

 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/natlan-gear-guide-browser.json',JSON.stringify({
  level:100,mobileWidth:390,carried:{slots:[1,2],atkBefore:before.actors[0].atk,atkAfter:after.actors[0].atk,
   hpBefore:before.actors[0].maxhp,hpAfter:after.actors[0].maxhp,savedAndRestored:true},
  empty:{returnedToMondstadt:true,route,escapeClosesMap:true},errors
 },null,2)+'\n');
 console.log('Natlan gear guide: equipped held artifacts, resumed a save, and opened the domain route.');
}finally{await browser.close()}
