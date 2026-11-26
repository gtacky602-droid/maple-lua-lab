import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const json=async path=>JSON.parse(await readFile(path,'utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
const survey=await json('evidence/complete-atlas-survey.json'),graph=await json('content/story-graph.json');
const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 await page.goto(base+'theater-preview.html#completeAtlas');
 await page.locator('#surveyArea option').first().waitFor({state:'attached'});
 for(const area of survey.regions){
  await page.selectOption('#surveyArea',area.id);
  assert((await page.locator('#surveyTotal').innerText()).includes(area.visited+' ／ '+area.total+'地点'));
 }
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 for(const name of ['northern-gates-save','visited-lift-survey-save']){
  const file='evidence/'+name+'.json',save=await json(file);
  await page.locator('#importSave').setInputFiles(file);
  await page.waitForFunction(id=>window.lab.frame.story?.node===id && document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存'),save.story.node);
  if(name==='northern-gates-save'){
   const region=nodes.get('snezhnaya-hub').region;
   await page.selectOption('#questFilter','area:'+region);
   const ids=await page.locator('#questJournal [data-quest]').evaluateAll(items=>items.map(el=>el.dataset.quest));
   assert.deepEqual(ids,graph.quests.filter(q=>nodes.get(q.hub)?.region===region && save.story.quests[q.id]?.status!=='complete' && (!q.legacyOnly||save.story.quests[q.id])).map(q=>q.id));
  }
  await page.locator('#atlasOpen').click();
  if(name==='northern-gates-save'){
   for(const a of survey.regions)assert((await page.locator('#atlasRegion option[value="'+a.id+'"]').innerText()).includes('（'+a.visited+'／'+a.total+'）'));
  }else{
   await page.selectOption('#atlasVisits','visited');
   assert.equal(await page.locator('#atlasField option[value="liyue-cart-lift"]').count(),1);
  }
  await page.locator('#atlasClose').click();
  await page.locator('#worldAtlas').waitFor({state:'hidden'});
 }
 console.log('24 region totals, alternate visited lift and live regional quest filter verified.');
}finally{await browser.close();}
