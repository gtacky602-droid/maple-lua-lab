import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await page.waitForFunction(()=>window.lab?.frame);
 for(const [name,done] of [['hidden',5],['growth',16]]){
  await page.locator('#importSave').setInputFiles('evidence/'+name+'-expedition-save.json');
  await page.waitForFunction(full=>window.lab.frame.story?.node==='fontaine-hub'&&Boolean(window.lab.frame.story.quests['growth-weekly']?.status==='complete')===full,done===16);
  await page.selectOption('#questFilter','growth:all');
  assert.equal(await page.locator('#questJournal [data-quest]').count(),16);
  await page.selectOption('#questFilter','growth:pending');
  assert.equal(await page.locator('#questJournal [data-quest]').count(),16-done);
  assert.ok((await page.textContent('#chapterProgress')).includes(done+' / 16件'));
 }
 console.log('5/16 and 16/16 verified');
}finally{await browser.close()}
