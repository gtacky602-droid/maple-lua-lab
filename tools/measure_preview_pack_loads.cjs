const {chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const result={};
 try{
  const mapReady=()=>window.mapArt?.ready&&window.mapArt.backgroundState==='ready';
  for(const [name,path,ready] of [['enemy','/enemies-art.html',()=>document.querySelectorAll('.stats').length>25&&document.querySelector('.stats')?.textContent],['map','/map-art.html?node=mond-road&background=original',mapReady],['shouki','/map-art.html?node=shouki-godmaking-arena&placements=live&background=original',mapReady]]){
   const records={};
   for(const side of ['before','after']){
    const page=await browser.newPage();
    await page.addInitScript(()=>performance.setResourceTimingBufferSize(4096));
    if(side==='before'){
     for(const file of ['map-art.js','characters-art.js','sprite-layers.js']){
      const body=execFileSync('git',['show','d47ea6df:'+file]);
      await page.route('**/'+file,route=>route.fulfill({contentType:'text/javascript',body}));
     }
    }
    await page.goto(new URL(path,process.env.LAB_URL).href);
    await page.waitForFunction(ready);
    await page.waitForLoadState('networkidle');
    const stats=await page.evaluate(()=>{
     const entries=performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname.startsWith('/assets/')&&new URL(e.name).pathname.endsWith('.json'));
     return {requests:entries.length,assetJsonBytes:entries.reduce((n,e)=>n+e.decodedBodySize,0)};
    });
    const hash=createHash('sha256');
    for(const image of await page.locator(name==='enemy'?'.pair canvas':'#png,#rect').evaluateAll(xs=>xs.map(x=>x.toDataURL())))hash.update(image);
    records[side]={...stats,canvasSha256:hash.digest('hex')};
    await page.close();
   }
   if(records.before.canvasSha256!==records.after.canvasSha256||records.before.assetJsonBytes<=records.after.assetJsonBytes)throw Error(JSON.stringify(records));
   result[name]=records;
  }
  fs.writeFileSync('evidence/preview-packed-loads.json',JSON.stringify({baseline:'d47ea6df',metric:'Chrome decodedBodySize for /assets/*.json; one fresh page per measurement',pages:result},null,2)+'\n');
  console.log(JSON.stringify(result));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
