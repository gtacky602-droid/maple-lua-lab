import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome'});
try{
 for(const [node,species] of [['fairy-knight-twins-legend-court','hunters-ray'],['fading-veteran-legend-wreck','blubberbeast']]){
  const name='legend-'+species+'-shared-idle-sprites-v1.json';
  const compact=await readFile('assets/placement-palettes/'+name);
  const full=await readFile('assets/placement-packed/'+name);
  let expected;
  for(const standalone of [true,false]){
   const page=await browser.newPage(),requests=[];
   const path='/assets/placement-palettes/'+name;
   if(standalone)await page.route('**'+path,r=>r.fulfill({contentType:'application/json',body:full}));
   page.on('request',r=>requests.push(new URL(r.url()).pathname));
   const url=new URL('map-art.html',process.env.LAB_URL||'http://127.0.0.1:9125/');
   url.search=new URLSearchParams({node,placements:'live',idle:'candidate',sharedProfiles:'all'});
   url.hash='sharedLegendArt';await page.goto(url.href);
   const views=page.locator('.shared-profile-views').first();
   await views.locator('canvas').nth(2).waitFor();
   assert((await page.locator('#sharedLegendArt figcaption').first().textContent()).includes(compact.length+' B'));
   const capture=()=>views.locator('canvas').evaluateAll(cs=>cs.map(c=>c.toDataURL()));
   const images=await capture();
   await page.uncheck('#compareSharedProfiles');await page.selectOption('#profile','legacy');
   images.push(...await capture());
   assert.equal(images.length,4);
   if(standalone)expected=images;else assert.deepEqual(images,expected);
   assert.equal(requests.filter(r=>r===path).length,1);
   assert(!requests.includes('/assets/placement-packed/'+name));
   await page.close();
  }
  console.log(species,full.length,'->',compact.length,'bytes; all four canvases identical');
 }
}finally{await browser.close()}
