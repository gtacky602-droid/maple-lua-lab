import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 for(const name of ['ninianne','vivianne']){
  const url=new URL('map-art.html',process.env.LAB_URL||'http://127.0.0.1:9125/');
  url.search=new URLSearchParams({node:name+'-legend-bank',placements:'live'});
  url.hash='sharedLegendArt';await page.goto(url.href);
  const motion=page.locator('.lake-eye-study details');
  await motion.locator('summary').click();
  for(const pose of ['idle','brace','strike']){
   await motion.locator('select').selectOption(pose);
   await motion.locator('figure > canvas:first-of-type').nth(2).waitFor();
   const results=await motion.locator('figure > canvas:first-of-type').evaluateAll(cs=>cs.map(c=>{
    const rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    const eye=[];
    for(let i=0;i<rgba.length;i+=4){
     if(rgba[i]>=135&&rgba[i+1]>=220&&rgba[i+2]>=235&&rgba[i+3]>=128)eye.push([i/4%c.width,Math.floor(i/4/c.width)]);
    }
    return eye;
   }));
   for(const pixels of results)assert.ok(pixels.length>0,name+'/'+pose);
   // Each mask must have one contiguous cyan region, including diagonal neighbors.
   for(const pixels of results){
    const key=(x,y)=>x+','+y,remaining=new Set(pixels.map(([x,y])=>key(x,y)));
    const queue=[pixels[0]];remaining.delete(key(...pixels[0]));
    for(const [x,y] of queue)for(const dx of [-1,0,1])for(const dy of [-1,0,1]){
     if(remaining.delete(key(x+dx,y+dy)))queue.push([x+dx,y+dy]);
    }
    assert.equal(remaining.size,0,name+'/'+pose);
   }
   const readings=await motion.locator('figure small').allTextContents();
   assert.equal(readings.length,3);
   assert.ok(readings[2].includes('元PNGとの重なり'));
   const crops=await motion.locator('canvas[aria-label]').count();
   assert.equal(crops,3);
   console.log(name,pose,readings[2]);
   assert.ok(results[2].length>=12,name+'/'+pose);
   const center=pts=>pts.reduce(([x,y],[a,b])=>[x+a/pts.length,y+b/pts.length],[0,0]);
   const [a,,b]=results.map(center);
   assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1.5,name+'/'+pose);
   console.log(name,pose,'eye pixels PNG/32/16',results.map(p=>p.length));
  }
  await motion.screenshot({path:'evidence/'+name+'-strike-eye-profiles.png'});
 }
}finally{await browser.close()}
