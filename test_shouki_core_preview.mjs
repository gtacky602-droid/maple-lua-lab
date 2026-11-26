import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1300,height:860}});
 const url=new URL('map-art.html?node=shouki-godmaking-arena&placements=live&core=exposed',process.env.LAB_URL??'http://127.0.0.1:19743/');
 await page.goto(url.href);await page.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
 const control=page.locator('#shoukiCore');
 assert(await control.isVisible());assert.equal(await control.inputValue(),'exposed');
 const sample=()=>page.evaluate(()=>['png','rect'].map(id=>{
  const ctx=document.getElementById(id).getContext('2d'),x=480-mapArt.camera;
  return {edge:[...ctx.getImageData(x,280,1,1).data].slice(0,3),waist:[...ctx.getImageData(x-40,465,80,20).data].join(',')};
 }));
 for(const profile of ['legacy','h48c32','h32c16']){
  await page.selectOption('#profile',profile);
  await control.selectOption('opening');const opening=await sample();
  for(const [state,color] of [['shielded',[202,163,252]],['exposed',[185,242,169]]]){
   await control.selectOption(state);
   const link=new URL(await page.locator('#shoukiGallery').getAttribute('href'),url);
   assert.equal(link.searchParams.get('profile'),profile);
   assert.equal(link.searchParams.get('pose'),state==='exposed'?'armored':state);
   for(const [i,p] of (await sample()).entries()){
    assert.deepEqual(p.edge,color);assert.notDeepEqual(p.edge,opening[i].edge);
    assert(p.waist===opening[i].waist,profile+' waist '+state);
   }
  }
 }
 await page.locator('#rect').screenshot({path:'evidence/shouki-armored-field-core.png'});
 await page.locator('#sceneryDetail summary').click();
 await page.waitForFunction(()=>document.getElementById('detailLink').hasAttribute('href'));
 assert.equal(new URL(await page.locator('#detailLink').getAttribute('href'),url).searchParams.get('core'),'exposed');
 await control.selectOption('shielded');
 await page.locator('#shoukiGallery').click();
 await page.waitForFunction(()=>window.charactersGallery?.ready);
 assert(await page.locator('#palettePixels').isChecked());
 assert.equal(await page.locator('#shoukiForm').inputValue(),'shielded');
 const card=page.locator('article[data-id="shouki"]');
 for(const [pose,color] of [['shielded',[202,163,252]],['armored',[185,242,169]]]){
  await page.selectOption('#shoukiForm',pose);
  const colors=await card.locator('canvas').evaluateAll(cs=>cs.map(c=>Array.from(c.getContext('2d').getImageData(480,280,1,1).data).slice(0,3)));
  assert.deepEqual(colors,[color,color,color]);
  if(pose==='shielded')await card.screenshot({path:'evidence/shouki-native-shielded-gallery.png'});
 }
 await card.locator('a').click();
 await page.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await control.inputValue(),'exposed');
 assert.equal(await page.locator('#profile').inputValue(),'h32c16');
 console.log('Core colors and waist match on both canvases for all three profiles.');
}finally{await browser.close()}
