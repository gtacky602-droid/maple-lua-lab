const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {items}=require('./content/boss-art-gallery.json');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const jsonRequests=[];
  page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/assets/')&&path.endsWith('.json'))jsonRequests.push(path)});
  await page.goto((process.env.LAB_URL||'http://127.0.0.1:9118')+'/bosses-art.html?q=ronova&both=1&zoom=1');
  await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:120000});
  assert.equal(await page.locator('article').count(),items.length);
  for(const id of ['ronova','shouki','narwhal']){
   const item=items.find(entry=>entry.id===id);
   await page.fill('#assetSearch',id);
   const card=page.locator('article[data-id="'+id+'"]');
   for(const left of [false,true]){
    await page.locator('#flip').setChecked(left);
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
  assert.deepEqual(jsonRequests,['/assets/boss-gallery-packed.json']);
  await page.fill('#assetSearch','正機の神');await page.uncheck('#flip');
  await page.screenshot({path:'evidence/boss-packed-shouki.png'});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log(items.length+' cards; layered, wide-coordinate and Shouki renders verified in both directions.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
