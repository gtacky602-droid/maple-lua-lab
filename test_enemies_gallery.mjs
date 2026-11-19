import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const layouts=JSON.parse(await fs.readFile('content/enemy-art-layout.json','utf8'));
const bosses=JSON.parse(await fs.readFile('content/boss-art-gallery.json','utf8')).items;
for(const [enemy,boss] of [
 ['tainted-water-spouting-phantasm','lake-vivianne-idle-v5-a'],
 ['tainted-water-splitting-phantasm','lake-ninianne-idle-v5-a'],
]){
 assert.equal(layouts[enemy].file,bosses.find(item=>item.id===boss).file);
}
const sharedCrabs=bosses.filter(item=>item.id.endsWith('-shared-sternshield'));
assert.equal(sharedCrabs.length,2);
assert.equal(sharedCrabs[0].file,sharedCrabs[1].file);
const [ordinaryCrab,namedCrab]=await Promise.all([
 layouts['sternshield-crab'].file,sharedCrabs[0].file,
].map(async file=>JSON.parse(await fs.readFile('assets/'+file,'utf8'))));
assert.deepEqual(ordinaryCrab.box,namedCrab.box);
assert.equal(ordinaryCrab.anchorX,namedCrab.anchorX);
const expected=[...Object.keys(layouts),'hydro-slime-reference','pyro-slime-reference'].sort();
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));

try{
 const base=process.env.LAB_URL||'http://127.0.0.1:8769';
 await page.goto(base+'/enemies-art.html');
 await page.waitForFunction(()=>window.charactersGallery?.ready);
 const actual=await page.locator('#cards article').evaluateAll(cards=>cards.map(c=>c.dataset.id).sort());
 assert.deepEqual(actual,expected);
 for(const profile of ['legacy','h48c32','h32c16'])for(const zoom of ['1','2','3']){
  await page.selectOption('#profile',profile);await page.selectOption('#zoom',zoom);
  await page.check('#flip');await page.uncheck('#flip');
 }
 const clipped=await page.evaluate(()=>[...document.querySelectorAll('#cards article')].some((card,i)=>{
  const {dimensions,zoom}=window.charactersGallery,d=dimensions[i];
  return [...card.querySelectorAll('canvas')].some(c=>c.height<d.h*zoom+30||c.width<d.w*zoom+30);
 }));
 assert(!clipped,'Large asset clipped');
 await page.selectOption('#zoom','2');
 await page.screenshot({path:'evidence/enemies-gallery.png',fullPage:true});
 const state=await page.evaluate(()=>window.charactersGallery);
 assert.equal(state.count,expected.length);
 assert(state.dimensions.every(d=>Math.abs(d.w/d.h-d.ratio)<1e-9),'Aspect ratio mismatch');
 await page.setViewportSize({width:390,height:844});
 const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(mobileOverflow,false);assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/enemies-gallery.json',JSON.stringify({errors,state,combinations:18,mobileOverflow},null,2));
 console.log(`${state.count} enemy candidates, 3 profiles, 3 zooms and both facings passed`);
}finally{await browser.close()}
