const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const catalog=require('./content/motion-pose-files.json');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1050,height:760}});
  await page.goto((process.env.LAB_URL||'http://127.0.0.1:9118')+'/characters-art.html');
  await page.click('a[href="traveler-run-compare.html"]');
  for(const side of ['right','left']){
   await page.selectOption('#side',side);
   for(let phase=1;phase<=4;phase++){
    const file=catalog[side][phase];
    await page.waitForFunction(f=>document.getElementById('phase').dataset.file===f,file);
    assert(await page.evaluate(async({art,phase})=>{
     const {spriteBounds,paintSprite}=await import('./sprite-layers.js');
     for(const profile of ['h48c32','h32c16']){
      const visible=document.getElementById(profile),ref=document.createElement('canvas');
      ref.width=visible.width;ref.height=visible.height;const ctx=ref.getContext('2d');
      ctx.translate(ref.width/2,ref.height-12);
      paintSprite(ctx,art,null,spriteBounds(art,1.6*(phase===1?88:88*art.box[3]/100)),profile);
      ctx.fillStyle='#adc7bb';ctx.fillRect(-56,0,112,1);
      if(ref.toDataURL()!==visible.toDataURL())return false;
     }
     return true;
    },{art:require('./assets/'+file),phase}),file);
    if(phase!==4)await page.click('#step');
   }
  }
  await page.click('#play');
  await page.waitForFunction(()=>document.getElementById('phase').dataset.file.includes('left-sprites-v3'));
  await page.click('#play');
  await page.screenshot({path:'evidence/traveler-run-packed-preview.png'});
  await page.click('#measure summary');
  await page.waitForFunction(()=>document.getElementById('measure').dataset.loaded==='ready');
  assert.equal(await page.locator('#measure tbody tr:last-child td').last().innerText(),require('./evidence/motion-load.json').after.total.toLocaleString('ja-JP'));
  await page.click('#wire summary');
  await page.waitForFunction(()=>document.getElementById('wire').dataset.loaded==='ready');
  for(const scene of ['running','return_box','oceanid']){
   await page.selectOption('#wireScene',scene);
   const values=await page.locator('#wire tbody tr td:nth-child(3)').allTextContents();
   assert.deepEqual(values,require('./evidence/frame-wire-sizes.json').filter(s=>s.scene===scene).map(s=>s.wireBytes.toLocaleString('ja-JP')));
  }
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('8 poses and 16 reduced renders matched; playback, stepping, both directions and mobile width verified');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
