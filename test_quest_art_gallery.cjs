const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const catalog=require('./content/quest-pose-files.json');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
 try{
  const page=await browser.newPage({viewport:{width:1050,height:740}});
  const base=process.env.LAB_URL||'http://127.0.0.1:9118';
  await page.goto(base+'/field-enemy-guide.html');
  await page.click('a[href="quest-art.html"]');
  let profiles=0;
  for(const [group,entry] of Object.entries(catalog)){
   await page.selectOption('#group',group);
   for(const [key,file] of Object.entries(typeof entry==='string'?{idle:entry}:entry)){
    await page.selectOption('#part',key);
    await page.waitForFunction(f=>document.querySelector('#source').dataset.file===f,file);
    const original=require('./assets/'+file);
    assert(await page.evaluate(async art=>{
     const {paintSprite}=await import('./sprite-layers.js');
     const toggle=document.querySelector('#nativePixels');
     const source=document.querySelector('#source');
     const reference=source.getContext('2d').getImageData(0,0,source.width,source.height).data;
     for(const native of [false,true]){
      if(toggle.checked!==native)toggle.click();
      for(const profile of ['h48c32','h32c16']){
       const actual=document.getElementById(profile),c=document.createElement('canvas');
       c.width=actual.width;c.height=actual.height;
       const [,,w,h]=art.box,k=Math.min((c.width-16)/w,(c.height-12)/h);
       const bounds={x:(c.width-w*k)/2,y:c.height-6-h*k,width:w*k,height:h*k};
       const ctx=c.getContext('2d',{willReadFrequently:true});
       paintSprite(ctx,art,null,bounds,profile,native);
       const rgba=ctx.getImageData(0,0,c.width,c.height).data;
       let union=0,both=0;
       for(let i=3;i<rgba.length;i+=4){
        const a=rgba[i]>=128,b=reference[i]>=128;
        if(a||b)union++;
        if(a&&b)both++;
       }
       const expected=(100*both/union).toFixed(1)+'%';
       if(!actual.closest('figure').querySelector('small').textContent.includes(expected))throw Error(profile+' '+native+' '+expected+' '+actual.closest('figure').textContent);
       const actualPixels=actual.getContext("2d").getImageData(0,0,c.width,c.height).data;
       const diff=rgba.findIndex((v,i)=>v!==actualPixels[i]);
       if(diff>=0)throw Error(art.source+" "+profile+" native="+native+" pixel mismatch "+diff+" "+rgba[diff]+"/"+actualPixels[diff]);
      }
     }
     return true;
    },original),file);
    profiles+=4;
   }
  }
  await page.goto(base+'/quest-art.html?group=noelleArt&part=seated&pixels=1');
  await page.waitForFunction(()=>document.getElementById('source').dataset.file==='noelle-rest-seated-sprites-v1.json');
  assert(await page.locator('#nativePixels').isChecked());
  console.log(await page.locator('.art small').allTextContents());
  await page.screenshot({path:'evidence/quest-art-noelle-native.png'});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log(profiles+' palette renders match; direct link and mobile width passed.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
