import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const root=process.env.LAB_URL||'http://127.0.0.1:8769/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1300,height:840}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const cards=page.locator('#cards');
const select=(id,value)=>page.locator('#'+id).selectOption(value);
const rendered=()=>page.locator('[data-variant] .pair:visible');
const renderedHeights=()=>page.locator('[data-variant] canvas:visible').evaluateAll(canvases=>
 canvases.map(canvas=>{
  const {width,height}=canvas,ctx=canvas.getContext('2d'),floor=Number(canvas.dataset.floor);
  const pixels=ctx.getImageData(0,0,width,height).data;
  let top=Infinity,bottom=-1;
  for(let y=0;y<floor;y++)for(let x=0;x<width;x++){
   const i=(y*width+x)*4;
   if(pixels[i]===41&&pixels[i+1]===76&&pixels[i+2]===85)continue;
   top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  return {top,bottom,floor};
 })
);

try{
 await page.goto(new URL('characters-art.html',root).href);
 await page.getByRole('link',{name:'旅人の頭身を比較'}).click();
 await page.locator('#cards[data-ready="true"]').waitFor();
 assert.equal(await rendered().count(),3);
 const matrix=[];
 for(const direction of ['right','front','back']){
  await select('direction',direction);
  assert.equal(await rendered().count(),direction==='right'?3:2);
  for(const zoom of [1,2,3]){
   await select('zoom',String(zoom));
   for(const profile of ['legacy','h48c32','h32c16']){
    await select('profile',profile);
    const expected=88*zoom;
    const sizes=await renderedHeights();
    for(const {top,bottom,floor} of sizes){
     assert.ok(Math.abs(top-(floor-expected))<=4,{direction,zoom,profile,top});
     assert.ok(bottom>=floor-3&&bottom<floor,{direction,zoom,profile,bottom});
    }
    const stats=await page.locator('.pair:visible + .stats').allTextContents();
    const profileHeight={legacy:88,h48c32:66,h32c16:44}[profile];
    assert.ok(stats.every(text=>text.includes('×'+profileHeight+'px')));
    matrix.push({direction,zoom,profile,visible:sizes.length/2});
   }
  }
 }
 await select('direction','right');
 await select('zoom','1');
 await select('profile','h32c16');
 const backdrops={};
 for(const backdrop of ['mond','liyue','inazuma','fontaine']){
  await select('backdrop',backdrop);
  await page.locator(`#cards[data-backdrop="${backdrop}"]`).waitFor();
  backdrops[backdrop]=await cards.locator('canvas').first().evaluate(canvas=>
   [...canvas.getContext('2d').getImageData(0,0,1,1).data]);
 }
 assert.equal(new Set(Object.values(backdrops).map(value=>value.join(','))).size,4);
 await select('backdrop','mond');
 await page.locator('#cards[data-backdrop="mond"]').waitFor();
 await select('zoom','2');
 await page.locator('main').screenshot({path:'evidence/traveler-proportions-right.png'});
 await select('direction','back');
 await select('zoom','2');
 await select('backdrop','inazuma');
 await page.locator('#cards[data-backdrop="inazuma"]').waitFor();
 await page.locator('main').screenshot({path:'evidence/traveler-proportions-back.png'});
 await page.setViewportSize({width:390,height:844});
 await select('zoom','3');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/traveler-proportions-browser.json',JSON.stringify({
  browser:'Chrome',matrix,backdrops,footAnchorMatched:true,mobileWidth:390,errors,
 },null,2)+'\n');
 console.log('Traveler proportions: 27 pose/zoom/profile combinations, four backdrops and mobile passed');
}finally{await browser.close()}
