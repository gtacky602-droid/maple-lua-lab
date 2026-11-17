import {chromium} from 'playwright';import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=new URL(process.env.LAB_URL||'http://127.0.0.1:8769/');
try{
 await page.goto(new URL('compare.html',base).href);await page.waitForFunction(()=>window.compareLab?.frame);
 await page.locator('#farkaCompare').click();await page.waitForFunction(()=>window.compareLab.frame.boss?.name==='ファルカ模擬戦');
 await page.locator('#left').selectOption('png');await page.locator('#right').selectOption('h32c16');await page.waitForFunction(()=>window.compareLab.frame.comparisons[0].profile==='png'&&window.compareLab.frame.comparisons[1].profile==='h32c16');
 await page.locator('.scenes').screenshot({path:'evidence/farka-art-compare.png'});
 const result=await page.evaluate(()=>({t:window.compareLab.frame.t,comparisons:window.compareLab.frame.comparisons.map(f=>({profile:f.profile,commands:f.commands})),pngBoss:window.compareLab.frame.comparisons[0].draws.some(d=>d.source==='farka-source-v1.png')}));
 assert.equal(result.pngBoss,true);

 await page.goto(new URL('bosses-art.html?q=farka-chibi',base).href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>window.charactersGallery.visibleCount),1);
 const directionChecks=[];
 for(const key of ['legacy','h48c32','h32c16']){
  await page.selectOption('#profile',key);
  for(const side of ['right','left']){
   await page.locator('#flip').setChecked(side==='left');
   const art=await page.evaluate(()=>window.charactersGallery.dimensions.find(d=>d.id==='farka-chibi'));
   assert.equal(art.source,`farka-chibi-${side}-source-v1.png`);
   assert.equal(art.h,152);
   assert(Math.abs(art.w/art.h-art.ratio)<1e-9);
   directionChecks.push({side,profile:key,source:art.source});
  }
 }

 await page.goto(new URL('map-art.html?node=mond-town',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready,null,{timeout:60000});
 const canvas=page.locator('#png');
 for(const [species,x] of [['character-traveler',155],['boss-farka',355],['boss-farka-chibi',555],['boss-farka-chibi',775]]){
  await page.selectOption('#species',species);
  const {width,height}=await canvas.boundingBox();
  await canvas.click({position:{x:x/960*width,y:478/540*height}});
 }
 await page.locator('#placements button').last().click();await page.locator('#flipSelected').click();
 await page.locator('#clearSelection').click();
 const map=await page.evaluate(()=>({grounded:window.mapArt.grounded,visuals:window.mapArt.visuals}));
 assert.equal(map.grounded,true);
 assert.deepEqual(map.visuals.map(v=>[v.source,v.height,v.y]),[
  ['traveler-idle-source-v3.png',88,480],['farka-source-v1.png',110,480],
  ['farka-chibi-right-source-v1.png',152,480],['farka-chibi-left-source-v1.png',152,480],
 ]);
 await page.selectOption('#profile','h32c16');
 await page.locator('main').screenshot({path:'evidence/farka-chibi-map-comparison.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/farka-art-browser.json',JSON.stringify({errors,...result,directionChecks,map},null,2));
 console.log('Farka old live pose and both new idle candidates passed browser comparison');
}finally{await browser.close()}
