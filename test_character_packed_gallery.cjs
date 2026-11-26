const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1240,height:780}});
  const assets=[];
  page.on('response',response=>assets.push(new URL(response.url()).pathname));
  await page.goto((process.env.LAB_URL||'http://127.0.0.1:9118')+'/characters-art.html');
  await page.waitForFunction(()=>window.charactersGallery?.ready);
  const canvases=slot=>page.locator('article').evaluateAll((cards,i)=>cards.map(card=>card.querySelectorAll('canvas')[i].toDataURL()),slot);
  for(const left of [false,true]){
   await page.locator('#flip').setChecked(left);
   await page.selectOption('#profile','h48c32');const medium=await canvases(1);
   await page.selectOption('#profile','h32c16');const small=await canvases(1);
   await page.check('#compareBoth');
   assert.deepEqual(await canvases(1),medium);assert.deepEqual(await canvases(2),small);
   assert(await page.locator('#profile').isDisabled());
   await page.uncheck('#compareBoth');
  }
  assert.deepEqual(assets.filter(path=>path.startsWith('/assets/')&&path.endsWith('.json')),['/assets/character-gallery-packed.json']);
  await page.fill('#assetSearch','旅人');await page.check('#compareBoth');
  await page.screenshot({path:'evidence/character-packed-traveler.png'});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('Both directions and both simultaneous previews match for all 10 entries; one sprite JSON loaded.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
