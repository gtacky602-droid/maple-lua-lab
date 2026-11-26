import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();
 const requests=[];
 page.on('request',request=>requests.push(new URL(request.url()).pathname));
 await page.goto(process.env.LAB_URL);
 await page.waitForFunction(()=>window.lab?.frame);
 assert(requests.includes('/assets/base-packed/legacy.json'));
 assert(!requests.includes('/assets/sprites.json'));
 const checked=await page.evaluate(async()=>{
  const {paintRectangleGrid}=await import('./sprite-layers.js');
  const {variants}=await (await fetch('assets/variants.json')).json();
  const context=()=>new OffscreenCanvas(146,146).getContext('2d');
  let count=0;
  for(const [profile,variant] of Object.entries(variants)){
   const {sprites}=await (await fetch('assets/base-packed/'+profile+'.json')).json();
   for(const [i,grid] of sprites.entries()){
    const a=context(),b=context(),source=variant.sprites[i];
    const w=grid.width*1.41,h=grid.height*1.41;
    for(const [x,y,rw,rh,color] of source.runs){
     a.fillStyle=color;a.fillRect(2+x*(w/grid.width),3+y*(h/grid.height),rw*(w/grid.width),rh*(h/grid.height));
    }
    paintRectangleGrid(b,grid,{x:2,y:3,width:w,height:h});
    const lhs=a.getImageData(0,0,146,146).data,rhs=b.getImageData(0,0,146,146).data;
    if(!lhs.every((v,k)=>v===rhs[k]))throw Error(profile+' sprite '+i);
    count++;
   }
  }
  return count;
 });
 assert.equal(checked,64);
 await page.goto(new URL('/compare.html#packedLegacy',process.env.LAB_URL).href);
 await page.waitForFunction(()=>document.querySelector('#labelB').textContent.includes('パレット圧縮'));
 for(let id=1;id<=8;id++){
  await page.locator('#asset').selectOption(String(id));
  assert(await page.evaluate(()=>document.querySelector('#portraitA').toDataURL()===document.querySelector('#portraitB').toDataURL()));
 }
 console.log(checked+' Chrome canvas comparisons and eight A/B portraits passed');
}finally{await browser.close()}
