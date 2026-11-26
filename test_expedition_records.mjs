import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
 await page.goto(base+'theater-preview.html#fieldTripTitle');
 for(const [menu,link,total] of [['fieldTripBoss','fieldTripMap',49],['challengeBoss','challengeMap',23]]){
  await page.waitForFunction(([id,n])=>document.getElementById(id).options.length===n,[menu,total]);
  for(const option of await page.locator('#'+menu+' option').all()){
   const value=await option.getAttribute('value');
   await page.selectOption('#'+menu,value);
   assert.ok((await page.getAttribute('#'+link,'href')).includes('node='));
   assert.ok(!(await option.textContent()).includes('undefined'));
  }
 }
 await page.goto(base);await page.waitForFunction(()=>window.lab?.frame);
 const file='evidence/original-weekly-expedition-save.json';
 await page.locator('#importSave').setInputFiles(file);
 const save=JSON.parse(await fs.readFile(file,'utf8'));
 await page.waitForFunction(id=>window.lab.frame.story?.node===id&&document.querySelector('#saveStatus').textContent.includes('再開'),save.story.node);
 const restored=await page.evaluate(()=>Object.values(localStorage).map(value=>{try{return JSON.parse(value)}catch{return null}}).find(value=>value?.endgame?.bosses));
 assert(restored);
 assert.equal(Object.entries(restored.endgame.bosses).filter(([id,v])=>id.startsWith('legend-')&&v.clears>=1).length,56);
 for(const id of ['original-tide-surveyor','original-twin-shuttle-loom'])assert.equal(restored.endgame.bosses[id].clears,1);
 console.log('49 field and 23 challenge records; save restored at',save.story.node);
}finally{await browser.close()}
