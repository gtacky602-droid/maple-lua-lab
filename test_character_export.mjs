import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await mkdir('work/pose-exports',{recursive:true});
 for(const [id,focused] of [['traveler',true],['amber',false]]){
  const params=new URLSearchParams({q:id,zoom:'2',both:focused?'1':'0',flip:focused?'0':'1',pixels:'1'});
  await page.goto(new URL('characters-art.html?'+params,process.env.LAB_URL||'http://127.0.0.1:19745/').href);
  await page.waitForFunction(()=>window.charactersGallery?.ready);
  const card=page.locator('article:visible').first();
  await card.locator('summary').click();
  const src=card.locator('.pair canvas').first();
  if(focused){
   const r=await src.boundingBox();
   await src.click({position:{x:r.width*.53,y:r.height*.55}});
   assert(!(await card.locator('output').innerText()).includes('範囲内に絵がありません'));
  }
  const event=page.waitForEvent('download');
  await card.locator('.save-comparison').click();
  const dl=await event,path='work/pose-exports/'+dl.suggestedFilename();
  await dl.saveAs(path);
  const data=(await readFile(path)).toString('base64');
  const identical=await card.evaluate(async (card,{data,focused})=>{
   const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();
   const sheet=document.createElement('canvas');sheet.width=im.width;sheet.height=im.height;
   const out=sheet.getContext('2d');out.drawImage(im,0,0);
   const src=card.querySelector('.pair canvas'),w=src.width,h=src.height;
   const parts=focused?card.querySelectorAll('.character-crops canvas'):[...card.querySelectorAll('.pair canvas')].slice(0,2);
   if(sheet.width!==40+w*parts.length+(parts.length-1)*12||sheet.height!==88+h+64+(focused?166:0))return false;
   return [...parts].every((c,i)=>{
    const expected=document.createElement('canvas');expected.width=focused?144:w;expected.height=focused?144:h;
    const ctx=expected.getContext('2d');ctx.fillStyle='#26454b';ctx.fillRect(0,0,expected.width,expected.height);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(c,0,0,expected.width,expected.height);
    const actual=out.getImageData(20+i*(w+12)+(focused?Math.floor((w-144)/2):0),focused?88+h+12:88,expected.width,expected.height).data;
    return ctx.getImageData(0,0,expected.width,expected.height).data.every((v,j)=>v===actual[j]);
   });
  },{data,focused});
  assert(identical,path);console.log(path);
 }
}finally{await browser.close()}
