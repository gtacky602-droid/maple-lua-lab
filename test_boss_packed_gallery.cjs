const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {items}=require('./content/boss-art-gallery.json');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const jsonRequests=[];
  page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/assets/')&&path.endsWith('.json'))jsonRequests.push(path)});
  const pngRequests=[];
  page.on('request',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/assets/')&&path.endsWith('.png'))pngRequests.push(path)});
  await page.goto((process.env.LAB_URL||'http://127.0.0.1:9118')+'/bosses-art.html?q=ronova&both=1&zoom=1');
  await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:120000});
  assert.equal(await page.locator('article').count(),items.length);
  const index=require('./assets/placement-pose-index.json');
  const poseRequests=new Set(['/assets/placement-pose-index.json']);
  const ronovaSources=new Set();
  for(const item of items.filter(item=>(item.id+' '+item.name).toLowerCase().includes('ronova'))){
   for(const file of [item.file,item.rear?.file].filter(Boolean)){
    ronovaSources.add('/assets/'+index[file].sourceImage);poseRequests.add('/assets/'+index[file].poseFile);
   }
  }
  assert.deepEqual(jsonRequests.toSorted(),[...poseRequests].sort());
  assert.deepEqual(new Set(pngRequests),ronovaSources);
  console.log('Filtered pose JSON bytes:',await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/')&&r.name.endsWith('.json')).reduce((sum,r)=>sum+r.encodedBodySize,0)));
  const bytes=require('node:fs').statSync;
  const pngBytes=paths=>[...paths].reduce((sum,path)=>sum+bytes('.'+path).size,0);
  const allSources=new Set(Object.values(require('./assets/boss-gallery-packed.json')).map(art=>'/assets/'+art.source));
  const arena=Object.values(require('./content/boss-arena-index.json')).flat().find(entry=>entry.opening);
  allSources.add('/assets/'+require('./assets/weekly-packed/'+arena.opening.file).source);
  console.log('Ronova PNGs:',pngRequests.length,pngBytes(ronovaSources),'bytes; full source set:',allSources.size,pngBytes(allSources),'bytes.');
  for(const id of ['ronova','shouki','narwhal','legend-blubberbeast-shared','legend-hunters-ray-shared']){
   const item=items.find(entry=>entry.id===id);
   await page.fill('#assetSearch',id);
   if(id==='shouki')await page.selectOption('#shoukiForm','candidate');
   const card=page.locator('article[data-id="'+id+'"]');
   for(const left of [false,true]){
    await page.locator('#flip').setChecked(left);
    await page.waitForFunction(()=>window.charactersGallery?.ready);
    const art=require('./assets/'+(left&&item.leftFile||item.file));
    const rear=item.rear&&require('./assets/'+item.rear.file);
    const result=await card.evaluate(async(card,{item,art,rear,left})=>{
     const {paintSprite,spriteBounds}=await import('./sprite-layers.js');
     const checks=[];
     for(const [index,profile] of ['h48c32','h32c16'].entries()){
      const actual=card.querySelectorAll('canvas')[index+1],c=document.createElement('canvas');
      c.width=actual.width;c.height=actual.height;
      const ctx=c.getContext('2d');ctx.save();ctx.translate(c.width/2,c.height-15);
      if(rear)paintSprite(ctx,rear,null,spriteBounds(rear,item.rear.height,item.rear.bottom),profile);
      if(left&&!item.leftFile)ctx.scale(-1,1);
      paintSprite(ctx,art,null,spriteBounds(art,item.height),profile);
      ctx.restore();ctx.fillStyle='#dae5cc';ctx.fillRect(0,c.height-15,c.width,1);
      checks.push(c.toDataURL()===actual.toDataURL());
     }
     return checks;
    },{item,art,rear,left});
    assert.deepEqual(result,[true,true],id);
    if(rear)assert((await card.locator('.stats').innerText()).includes((art.profiles.h32c16.runs.length+rear.profiles.h32c16.runs.length)+'矩形'));
   }
  }
  const asymmetric=items.find(item=>item.id==='xbalanque-guard');
  await page.uncheck('#flip');
  await page.fill('#assetSearch',asymmetric.id);
  await page.waitForFunction(()=>window.charactersGallery.ready);
  const leftSource='/assets/'+require('./assets/'+asymmetric.leftFile).source;
  assert(!pngRequests.includes(leftSource));
  await page.check('#flip');
  await page.waitForFunction(()=>window.charactersGallery.ready);
  assert.equal(pngRequests.filter(path=>path===leftSource).length,1);
  await page.uncheck('#flip');await page.check('#flip');
  assert.equal(pngRequests.filter(path=>path===leftSource).length,1);
  assert(!jsonRequests.includes('/assets/boss-gallery-packed.json'));
  await page.click('#clearAssetSearch');
  await page.waitForFunction(()=>window.charactersGallery.ready);
  assert.equal(jsonRequests.filter(path=>path==='/assets/boss-gallery-packed.json').length,1);
  assert.equal(await page.locator('article:visible').count(),items.length);
  await page.fill('#assetSearch','正機の神');await page.uncheck('#flip');
  await page.waitForFunction(()=>window.charactersGallery.ready);
  await page.screenshot({path:'evidence/boss-packed-shouki.png'});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log(items.length+' cards; layered, wide-coordinate and Shouki renders verified in both directions.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
