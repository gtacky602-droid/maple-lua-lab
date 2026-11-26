import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:19743/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const save=JSON.parse(await readFile('evidence/remaining-survey-save.json','utf8'));
 const id='anemo-commission';
 save.story.node='mond-town';
 save.story.quests[id]={status:'active',count:0};
 await page.addInitScript(({id,save})=>{
  localStorage.setItem('maple-lua-lab-tracked-quest',id);
  localStorage.setItem('maple-lua-lab.checkpoint.v1',JSON.stringify(save));
 },{id,save});
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 for(const [selector,gate] of [['#trackedRouteGate',true],['#trackedSurveyPoint',false]]){
  const link=page.locator(selector);
  await link.waitFor({state:'visible'});
  const opened=page.waitForEvent('popup');
  await link.click();
  const preview=await opened;
  await preview.waitForFunction(()=>window.mapArt?.ready);
  const url=new URL(preview.url());
  if(gate){
   assert.equal(url.searchParams.get('node'),'mond-town');
   assert(url.searchParams.get('to')&&url.searchParams.has('gateX'));
   assert.equal(await preview.locator('#gatePreview a').count(),1);
  }else{
   assert.notEqual(url.searchParams.get('node'),'mond-town');
   await preview.locator('#compareSpriteProfiles').click();
   assert.equal(await preview.locator('#spriteProfileTable tbody tr').count(),3);
  }
  console.log(selector,url.search);
  await preview.close();
 }
 await page.locator('#clearTrackedQuest').click();
 assert(await page.locator('#trackedRouteGate').isHidden());
 assert.equal(await page.locator('#trackedRouteGate').getAttribute('href'),null);
}finally{await browser.close()}
