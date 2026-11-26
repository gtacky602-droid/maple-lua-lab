import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
const atlas=JSON.parse(await readFile('content/world-atlas.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 for(const file of ['mond-liyue-survey-save','ina-sum-survey-save']){
  const path='evidence/'+file+'.json';
  const save=JSON.parse(await readFile(path,'utf8'));
  await page.locator('#importSave').setInputFiles(path);
  await page.waitForFunction(id=>window.lab.frame.story?.node===id && document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存'),save.story.node);
  await page.locator('#atlasOpen').click();
  await page.locator('#worldAtlas').waitFor();
  for(const region of atlas.regions){
   const entry=page.locator('#atlasRegion option[value="'+region.id+'"]');
   const visited=region.points.filter(p=>save.story.visited[p.id]).length;
   assert.equal(await entry.innerText(),region.name+'（'+visited+'／'+region.points.length+'）');
  }
  const routes=await page.evaluate(()=>window.lab.frame.worldMap.routes);
  const labels=await page.locator('#atlasRoutes li button').allTextContents();
  for(const [i,route] of routes.entries()){
   assert.equal(route.visited,Boolean(save.story.visited[route.id]));
   assert(labels[i].includes(route.visited?'訪問済み':'未訪問'));
  }
  await page.locator('#atlasClose').click();
  await page.locator('#worldAtlas').waitFor({state:'hidden'});
 }
 console.log('Atlas region totals and outgoing gate labels verified against both saved adventures.');
}finally{await browser.close();}
