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
  const source=card.locator('.pair canvas').first();
  await source.focus();await source.press('ArrowRight');
  assert.equal(await card.locator('.character-crops canvas').count(),3);
  await card.getByRole('button',{name:'全身に戻す'}).click();
 }
 await page.locator('#assetSearch').fill('traveler');
 const card=page.locator('article:visible'),png=card.locator('canvas').first();
 const all=await card.locator('output').innerText(),r=await png.boundingBox();
 await png.click({position:{x:r.width*.5,y:r.height*.49}});
 assert.equal(await card.locator('.detail-canvas i:visible').count(),3);
 const region=await card.locator('output').innerText();
 assert.notEqual(region,all);assert(!region.includes('範囲内に絵がありません'));
 const crops=card.locator('.character-crops canvas');
 assert.equal(await crops.count(),3);
 async function verifyCrops(){
  assert(await card.evaluate(article=>{
   const originals=article.querySelectorAll('.pair canvas');
   return [...article.querySelectorAll('.character-crops canvas')].every((crop,i)=>{
    const canvas=originals[i],marker=canvas.parentElement.querySelector('i');
    const x=Math.round(parseFloat(marker.style.left)*canvas.width/100);
    const y=Math.round(parseFloat(marker.style.top)*canvas.height/100);
    const data=canvas.getContext('2d').getImageData(x,y,crop.width,crop.height).data;
    const actual=crop.getContext('2d').getImageData(0,0,crop.width,crop.height).data;
    return data.every((v,j)=>v===actual[j]);
   });
  }));
 }
 await verifyCrops();
 await card.screenshot({path:'evidence/traveler-face-profile-comparison.png'});
 async function facePixels(){
  return crops.evaluateAll(nodes=>nodes.map(c=>{
   const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   let partial=0;
   for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0&&pixels[i]<255)partial++;
   return {partial,png:c.toDataURL()};
  }));
 }
 const before=await facePixels();
 await page.check('#palettePixels');await verifyCrops();
 const after=await facePixels();
 assert.equal(before[0].png,after[0].png);
 for(let i=1;i<=2;i++){assert(before[i].partial>0);assert.equal(after[i].partial,0)}
 console.log('Face partial-alpha pixels before/after:',before.map(p=>p.partial),after.map(p=>p.partial),await card.locator('output').innerText());
 await card.screenshot({path:'evidence/traveler-face-palette-pixels.png'});
 await page.uncheck('#palettePixels');
 assert.deepEqual(await facePixels(),before);
 const marker=card.locator('.detail-canvas i').first();
 const left=await marker.evaluate(el=>el.style.left);
 await png.press('ArrowRight');assert.notEqual(await marker.evaluate(el=>el.style.left),left);
 await verifyCrops();
 await page.uncheck('#compareBoth');assert.equal(await crops.count(),2);
 await verifyCrops();await page.check('#compareBoth');
 await card.getByRole('button',{name:'全身に戻す'}).click();
 assert.equal(await card.locator('output').innerText(),all);assert.equal(await crops.count(),0);
 await png.click({position:{x:4,y:4}});
 assert((await card.locator('output').innerText()).includes('範囲内に絵がありません'));
 await page.check('#flip');assert.equal(await card.locator('.detail-canvas i:visible').count(),0);
 console.log(all,region);
}finally{await browser.close()}
