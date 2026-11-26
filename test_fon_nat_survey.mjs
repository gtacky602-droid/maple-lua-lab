import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const guide=JSON.parse(await readFile('content/fon-nat-survey-guide.json','utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(base+'theater-preview.html#fonNatSurvey');
 await page.locator('#surveyQuest option').first().waitFor({state:'attached'});
 for(const [i,q] of guide.entries()){
  await page.selectOption('#surveyQuest',{index:i});
  for(const [j,step] of q.steps.entries()){
   await page.selectOption('#surveyStep',{index:j});
   const url=new URL(await page.locator('#surveyMap').evaluate(el=>el.href));
   assert.equal(url.searchParams.get('node'),step.node);
   assert.equal(url.searchParams.get('to'),step.to??null);
   assert((await page.locator('#surveyMark').innerText()).includes(step.place));
  }
 }
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/fon-nat-survey-save.json');
 await page.waitForFunction(()=>window.lab.frame.story?.node==='natlan-hub' && document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存'));
 await page.locator('#allyFire').click();
 await page.waitForFunction(()=>window.lab.frame.holdAllyFire && document.querySelector('#allyFire').getAttribute('aria-pressed')==='true');
 await page.locator('#allyFire').click();
 await page.waitForFunction(()=>!window.lab.frame.holdAllyFire && document.querySelector('#allyFire').getAttribute('aria-pressed')==='false');
 await page.locator('#atlasOpen').click();
 for(const [id,n] of [['region-05',169],['region-06',199]]){
  assert((await page.locator('#atlasRegion option[value="'+id+'"]').innerText()).includes('（'+n+'／'+n+'）'));
 }
 console.log('Survey guide steps, restored map counts and both ally attack settings verified.');
}finally{await browser.close();}
