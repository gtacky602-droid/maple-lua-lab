import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const current=graph.quests.filter(q=>!q.legacyOnly);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await page.waitForFunction(()=>window.lab?.frame);
 for(const [file,count] of [['northern-gates-save',200],['boss-commission-tour-save',269],['remaining-survey-save',280]]){
  const path='evidence/'+file+'.json',save=JSON.parse(await readFile(path,'utf8'));
  await page.locator('#importSave').setInputFiles(path);
  await page.waitForFunction(n=>document.querySelector('#questStoryProgress')?.textContent.includes('報告済み '+n+' ／ '),count);
  await page.selectOption('#questFilter','complete');
  const actual=await page.locator('#questJournal [data-quest]').evaluateAll(rows=>rows.map(r=>r.dataset.quest).sort());
  const expected=current.filter(q=>save.story.quests[q.id]?.status==='complete').map(q=>q.id).sort();
  assert.deepEqual(actual,expected);assert.equal(actual.length,count);
  assert((await page.locator('#questStoryProgress').innerText()).includes('旧セーブ専用 4件'));
 }
 assert.equal(current.length,280);
 console.log('Restored 200, 269, and 280 reports; all current quest IDs match the final journal.');
}finally{await browser.close();}
