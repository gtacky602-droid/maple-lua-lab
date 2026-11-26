const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const catalog=require('./content/motion-pose-files.json');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
 try{
  const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1050,height:760}});
  await page.goto((process.env.LAB_URL||'http://127.0.0.1:9118')+'/characters-art.html');
  await page.click('a[href="traveler-run-compare.html"]');
  await page.click('#quality summary');
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
    for(const region of ['upper','lower','all']){
     await page.selectOption('#bodyRegion',region);
     const actual=await page.locator('#quality tbody tr').allTextContents();
     assert.equal(actual.length,2);
     assert(actual.every(r=>/色[\d.]+%[\d.]+$/.test(r)),file+' '+region);
     assert.equal(await page.locator('.motion-frame[data-band]').count(),region==='all'?0:3);
     if(side==='right'&&phase===2&&region==='lower')await page.locator('main').screenshot({path:'evidence/traveler-run-foot-comparison.png'});
    }
    if(phase!==4)await page.click('#step');
   }
  }
  await page.click('#play');
  await page.waitForFunction(()=>document.getElementById('phase').dataset.file.includes('left-sprites-v3'));
  await page.click('#play');
  await page.screenshot({path:'evidence/traveler-run-packed-preview.png'});
  const jumps=require('./content/traveler-jump-preview.json');
  for(const side of ['left','right']){
   await page.selectOption('#side',side);
   for(const motion of ['tap','hold']){
    await page.selectOption('#motion',motion);
    const samples=jumps[side][motion];
    for(const [i,s] of samples.entries()){
     const label=(i+1)+' / '+samples.length+' コマ・'+(s.ground?'接地':'地面から '+s.lift.toFixed(1)+' px');
     await page.waitForFunction(text=>document.querySelector('#phase').textContent===text,label);
     assert.equal(await page.locator('#phase').getAttribute('data-file'),catalog[side][s.pose]);
     assert.equal(await page.locator('#quality tbody tr').count(),2);
     if(!s.ground){
      const bottom=await page.locator('#h32c16').evaluate(c=>{
       const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
       for(let y=c.height-14;y>=0;y--)for(let x=0;x<c.width;x++)if(pixels[(y*c.width+x)*4+3])return y;
      });
      assert(Math.abs(bottom-(168-s.lift*.62))<4);
     }
     if(i+1<samples.length)await page.click('#step');
    }
   }
  }
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
