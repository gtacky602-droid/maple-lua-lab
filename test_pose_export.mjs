import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:19745/';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await mkdir('work/pose-exports',{recursive:true});
 for(const [group,boss,pose,native] of [
  ['field','legend-ichcahuipilli','idle',true],['field','legend-atlatl','brace',false],
  ['weekly','shouki','upper',true],['weekly','childe','delusion',false]
 ]){
  const params=new URLSearchParams({group,boss,pose,pixels:native?'1':'0'});
  await page.goto(new URL('weekly-poses.html?'+params,base).href);
  const save=page.locator('#saveComparison');
  await save.waitFor();
  const pending=page.waitForEvent('download');
  await save.click();
  const download=await pending;
  const file=download.suggestedFilename();
  assert.equal(file,boss+'-'+pose+(native?'-pixels':'')+'-comparison.png');
  const path='work/pose-exports/'+file;
  await download.saveAs(path);
  const b64=(await readFile(path)).toString('base64');
  const verified=await page.evaluate(async data=>{
   const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
   const sheet=document.createElement('canvas');
   sheet.width=image.width;sheet.height=image.height;
   const context=sheet.getContext('2d');context.drawImage(image,0,0);
   const source=[...document.querySelectorAll('main canvas')];
   return {width:image.width,height:image.height,panels:source.map((c,i)=>{
    const expected=document.createElement('canvas');expected.width=c.width;expected.height=c.height;
    const ctx=expected.getContext('2d');
    ctx.fillStyle='#26454b';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(c,0,0);
    const a=ctx.getImageData(0,0,c.width,c.height).data;
    const b=context.getImageData(20+i*(c.width+12),88,c.width,c.height).data;
    return a.every((v,j)=>v===b[j]);
   })};
  },b64);
  assert.deepEqual(verified.panels,[true,true,true]);
  assert.equal(verified.width,pose==='delusion'?2944:1504);
  console.log(file,verified.width,verified.height);
 }
}finally{await browser.close()}
