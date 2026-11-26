const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const catalog=require('./content/quest-pose-files.json');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
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
     for(const profile of ['h48c32','h32c16']){
      const actual=document.getElementById(profile),c=document.createElement('canvas');
      c.width=actual.width;c.height=actual.height;
      const [,,w,h]=art.box,k=Math.min((c.width-16)/w,(c.height-12)/h);
      const bounds={x:(c.width-w*k)/2,y:c.height-6-h*k,width:w*k,height:h*k};
      paintSprite(c.getContext('2d'),art,null,bounds,profile);
      if(c.toDataURL()!==actual.toDataURL())return false;
     }
     return true;
    },original),file);
    profiles+=2;
   }
  }
  await page.goto(base+'/quest-art.html?group=noelleArt&part=seated');
  await page.waitForFunction(()=>document.getElementById('source').dataset.file==='noelle-rest-seated-sprites-v1.json');
  await page.screenshot({path:'evidence/quest-art-noelle.png'});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log(profiles+' palette renders match; direct link and mobile width passed.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
