import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.LAB_URL??'http://127.0.0.1:19563/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 await page.goto(new URL('map-art.html?node=nod-west-frost-slope&placements=live',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready);
 const subject=page.locator('#liveSubject'),camera=await page.locator('#camera').inputValue();
 const enemies=(await subject.locator('option').evaluateAll(options=>options.map(o=>o.value))).filter(Boolean);
 assert(enemies.length>1);
 async function counts(){
  await page.locator('#compareSpriteProfiles').click();
  return page.locator('#spriteProfileTable tbody tr').evaluateAll(rows=>
   rows.map(row=>Number(row.cells[1].textContent.replaceAll(',',''))));
 }
 const combined=await counts();
 assert.equal(combined.length,3);
 assert(combined.every(count=>count>0));
 const sum=[0,0,0];
 for(const enemy of enemies){
  await subject.selectOption(enemy);
  await page.locator('#camera').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input'))},camera);
  (await counts()).forEach((count,i)=>sum[i]+=count);
 }
 assert.deepEqual(combined,sum);
 console.log(JSON.stringify({node:'nod-west-frost-slope',enemies:enemies.length,camera,combined,sum}));
}finally{await browser.close()}
