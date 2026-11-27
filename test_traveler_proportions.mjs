import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const root=process.env.LAB_URL||'http://127.0.0.1:8769/';
const evidenceDir=process.env.LAB_EVIDENCE_DIR||'evidence';
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
 const label=(variant)=>page.locator(`[data-variant="${variant}"] .measurement`).innerText();
 assert.deepEqual(await Promise.all(['current','b','c'].map(label)),['約2.8頭身','約2.8頭身','約2.4頭身']);
 const matrix=[];
 for(const direction of ['right','left','front','back']){
  await select('direction',direction);
  assert.equal(await rendered().count(),{right:3,left:1,front:2,back:2}[direction]);
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
 const guideRows=variant=>page.locator(`[data-variant="${variant}"] canvas`).evaluateAll(canvases=>canvases.map(canvas=>{
  const pixels=canvas.getContext('2d').getImageData(5,0,1,canvas.height).data;
  const colors={crown:[244,207,123],chin:[154,233,227]};
  return Object.fromEntries(Object.entries(colors).map(([name,rgb])=>[
   name,Array.from({length:canvas.height},(_,y)=>y)
    .find(y=>rgb.every((value,i)=>pixels[y*4+i]===value))??null,
  ]));
 }));
 const clear=await guideRows('current');
 assert.deepEqual(clear,[{crown:null,chin:null},{crown:null,chin:null}]);
 await page.check('#headGuides');
 const guides=await guideRows('current');
 assert.deepEqual(guides[0],guides[1]);
 assert(guides[0].crown!==null&&guides[0].chin>guides[0].crown);
 await select('direction','left');
 assert.equal(await label('current'),'約2.9頭身');
 const leftGuides=await guideRows('current');
 assert.deepEqual(leftGuides[0],leftGuides[1]);
 assert(leftGuides[0].crown!==null&&leftGuides[0].chin>leftGuides[0].crown);
 await select('direction','back');
 assert.match(await label('b'),/背面は輪郭/);
 assert.deepEqual(await guideRows('b'),clear);
 await page.uncheck('#headGuides');
 await select('direction','right');
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
 await page.check('#headGuides');
 await page.locator('main').screenshot({path:evidenceDir+'/traveler-proportions-right.png'});
 await page.uncheck('#headGuides');
 await select('direction','back');
 await select('zoom','2');
 await select('backdrop','inazuma');
 await page.locator('#cards[data-backdrop="inazuma"]').waitFor();
 await page.locator('main').screenshot({path:evidenceDir+'/traveler-proportions-back.png'});
 await page.setViewportSize({width:390,height:844});
 await select('zoom','3');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile(evidenceDir+'/traveler-proportions-browser.json',JSON.stringify({
  browser:'Chrome',matrix,backdrops,footAnchorMatched:true,guides,mobileWidth:390,errors,
 },null,2)+'\n');
 console.log('Traveler proportions: 36 pose/zoom/profile combinations, aligned landmarks, four backdrops and mobile passed');
}finally{await browser.close()}
