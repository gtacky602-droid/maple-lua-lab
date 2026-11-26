import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const url=new URL('map-art.html?node=anemo-field-basin&placements=live',process.env.LAB_URL??'http://127.0.0.1:19743/');
 await page.goto(url.href);
 await page.waitForFunction(()=>window.mapArt?.ready);
 const strip=page.locator('#spriteComparisonStrip'),compare=page.locator('#compareSpriteProfiles');
 await compare.click();
 async function inspect(){
  const sizes=await strip.locator('canvas').evaluateAll(items=>items.map(c=>[c.width,c.height]));
  assert.equal(sizes.length,4);
  assert(sizes.every(([w,h])=>w===sizes[0][0]&&h===sizes[0][1]));
  const cells=await page.locator('#spriteProfileTable tbody tr').evaluateAll(rows=>rows.map(r=>[Number(r.cells[1].textContent.replaceAll(',','')),r.cells[4].textContent]));
  assert.equal(cells[2][1],((cells[2][0]-cells[0][0])*100/cells[0][0]).toFixed(1)+'%');
  return sizes[0];
 }
 const group=await inspect();
 await strip.screenshot({path:'evidence/anemo-field-profile-strip.png'});
 await page.locator('#liveSubject').selectOption('boss-20040201');
 assert.equal(await strip.locator('canvas').count(),0);
 await compare.click();
 const core=await inspect();
 assert(core[0]<group[0]);
 await page.setViewportSize({width:390,height:844});
 assert(await strip.evaluate(e=>e.scrollWidth<=e.clientWidth));
 console.log({group,core});
}finally{await browser.close()}
