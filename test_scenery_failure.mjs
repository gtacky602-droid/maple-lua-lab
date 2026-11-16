import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
try {
 for(const [file,node] of [['tunigi-background-v1.png','tunigi-depth'],['mondstadt-background.png','novokichev-camp']]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/'+file,route=>route.fulfill({status:404,body:'missing fixture'}));
  await page.goto('http://127.0.0.1:8769/map-art.html');await page.waitForFunction(()=>window.mapArt?.ready);
  await page.selectOption('#node',node);
  const state=await page.evaluate(()=>window.mapArt),label=await page.locator('#context').textContent();
  if(state.backgroundState!=='error'||!label.includes('単色で表示')||!label.includes(file)||errors.length)throw Error(JSON.stringify({state,label,errors}));
  await page.selectOption('#node','liyue-entry');
  if((await page.evaluate(()=>window.mapArt.backgroundState))!=='ready')throw Error('Healthy background affected');
  results.push({file,node,errorReported:true,healthyNodeUnaffected:true,errors});await page.close();
 }
 await fs.writeFile('evidence/scenery-failure.json',JSON.stringify({results},null,2));console.log('Missing regional and fallback backgrounds reported; healthy nodes remain usable');
}finally{await browser.close()}
