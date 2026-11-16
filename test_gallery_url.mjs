import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.LAB_URL||'http://127.0.0.1:8771';
const ready=()=>page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
const state=()=>page.evaluate(()=>window.charactersGallery);
const visible=()=>page.locator('#cards article:not([hidden])').count();
try{
 for(const [file,q] of [['bosses-art.html','正機'],['characters-art.html','旅人'],['enemies-art.html','ヒルチャール']]){
  await page.goto(`${base}/${file}?q=${encodeURIComponent(q)}&profile=h48c32&zoom=3&flip=1`);await ready();
  const s=await state();assert.equal(s.query,q);assert.equal(s.profile,'h48c32');assert.equal(s.zoom,3);assert.equal(s.flip,true);assert.equal(await visible(),1);
  assert.equal(await page.locator('#comparisonLink').getAttribute('href'),page.url());
  await page.selectOption('#profile','legacy');await page.selectOption('#zoom','1');await page.uncheck('#flip');
  const url=page.url();assert.equal(new URL(url).searchParams.get('profile'),'legacy');assert.equal(new URL(url).searchParams.get('zoom'),'1');assert.equal(new URL(url).searchParams.has('flip'),false);
  await page.reload();await ready();assert.equal((await state()).profile,'legacy');assert.equal((await state()).zoom,1);assert.equal(await visible(),1);
  await page.click('#clearAssetSearch');assert.equal(new URL(page.url()).searchParams.has('q'),false);assert.equal(await visible(),(await state()).count);
 }
 await page.goto(`${base}/bosses-art.html?q=SHOUKI&profile=bad&zoom=-1&flip=yes`);await ready();
 assert.equal((await state()).profile,'h32c16');assert.equal((await state()).zoom,2);assert.equal((await state()).flip,false);assert.equal(await visible(),1);
 // Unmatched text remains literal, produces an empty state, and round-trips safely.
 await page.fill('#assetSearch','<img src=x onerror=alert(1)> & 月');assert.equal(await visible(),0);const emptyUrl=page.url();await page.reload();await ready();assert.equal(await visible(),0);assert.equal((await state()).query,'<img src=x onerror=alert(1)> & 月');assert.equal(page.url(),emptyUrl);
 await page.fill('#assetSearch','ＳＨＯＵＫＩ');assert.equal(await visible(),1);await page.selectOption('#profile','h48c32');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'evidence/gallery-url-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/gallery-url-test.json',JSON.stringify({pages:3,queryRestore:true,settingsRestore:true,reload:true,invalidSettingsDefault:true,clearFilter:true,emptyStateRoundtrip:true,literalInput:true,nfkc:true,mobileOverflow:false,errors},null,2));
 console.log('Gallery links: 3 galleries, reload, invalid settings, literal query and mobile passed');
}finally{await browser.close()}
