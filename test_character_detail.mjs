import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1120,height:880}});
 await page.goto(new URL('characters-art.html?both=1',process.env.LAB_URL||'http://127.0.0.1:9125/').href);
 await page.waitForFunction(()=>window.charactersGallery?.ready);
 for(const card of await page.locator('article').all()){
  await card.locator('summary').click();
  await card.locator('output').filter({hasText:/32色.*形の重なり.*16色.*形の重なり/}).waitFor();
 }
 await page.locator('#assetSearch').fill('traveler');
 const card=page.locator('article:visible'),png=card.locator('canvas').first();
 const all=await card.locator('output').innerText(),r=await png.boundingBox();
 await png.click({position:{x:r.width*.5,y:r.height*.49}});
 assert.equal(await card.locator('.detail-canvas i:visible').count(),3);
 const region=await card.locator('output').innerText();
 assert.notEqual(region,all);assert(!region.includes('範囲内に絵がありません'));
 await card.screenshot({path:'evidence/traveler-face-profile-comparison.png'});
 const marker=card.locator('.detail-canvas i').first();
 const left=await marker.evaluate(el=>el.style.left);
 await png.press('ArrowRight');assert.notEqual(await marker.evaluate(el=>el.style.left),left);
 await card.getByRole('button',{name:'全身に戻す'}).click();
 assert.equal(await card.locator('output').innerText(),all);
 await png.click({position:{x:4,y:4}});
 assert((await card.locator('output').innerText()).includes('範囲内に絵がありません'));
 await page.check('#flip');assert.equal(await card.locator('.detail-canvas i:visible').count(),0);
 console.log(all,region);
}finally{await browser.close()}
