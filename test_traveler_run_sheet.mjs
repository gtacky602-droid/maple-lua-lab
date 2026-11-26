import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.LAB_URL??'http://127.0.0.1:19745/';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 await mkdir('work/pose-exports',{recursive:true});
 for(const side of ['left','right'])for(const region of ['face','upper','lower','all']){
  const params=new URLSearchParams({side,motion:'run',frame:3,region,pixels:'1'});
  await page.goto(new URL('traveler-run-compare.html?'+params,base).href);
  const save=page.locator('#runSheet');
  await page.waitForFunction(()=>!document.querySelector('#runSheet').disabled);
  const download=page.waitForEvent('download');await save.click();
  const file=await download,path='work/pose-exports/'+file.suggestedFilename();
  await file.saveAs(path);
  const b64=(await readFile(path)).toString('base64');
  const values=[];
  for(let i=0;i<4;i++){
   const current=(i+2)%4;
   assert((await page.locator('#phase').innerText()).startsWith(String(current+1)+' / 4'));
   values[current]=await page.locator('#quality tbody tr').last().locator('td').nth(1).textContent();
   assert(await page.evaluate(async ({b64,region,current})=>{
    const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();
    const sheet=document.createElement('canvas');sheet.width=image.width;sheet.height=image.height;
    const ctx=sheet.getContext('2d');ctx.drawImage(image,0,0);
    const whole=region==='all',width=whole?240:320,rh=whole?212:152;
    return [...document.querySelectorAll('.art canvas')].every((c,i)=>{
     const tile=document.createElement('canvas');tile.width=width;tile.height=rh-30;
     const g=tile.getContext('2d');g.fillStyle='#26454b';g.fillRect(0,0,width,tile.height);g.imageSmoothingEnabled=false;
     if(whole)g.drawImage(c,0,0);
     else{
      const style=c.parentElement.style;
      const v=key=>Math.round(parseFloat(style.getPropertyValue(key))*(key==='--x'||key==='--w'?c.width:c.height)/100);
      const w=v('--w'),h=v('--h'),scale=Math.max(1,Math.floor(Math.min(width/w,(rh-30)/h)));
      g.drawImage(c,v('--x'),v('--y'),w,h,Math.floor((width-w*scale)/2),0,w*scale,h*scale);
     }
     const a=g.getImageData(0,0,width,tile.height).data,b=ctx.getImageData(20+i*(width+12),88+current*rh+(whole?28:30),width,tile.height).data;
     const j=a.findIndex((v,j)=>v!==b[j]);if(j>=0)throw Error(JSON.stringify({current,region,i,j,a:a[j],b:b[j]}));return true;
    });
   },{b64,region,current}));
   await page.locator('#step').click();
  }
  console.log(side,region,values.join(' / '));
 }
}finally{await browser.close()}
