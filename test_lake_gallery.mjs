import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1100,height:900}});
 await page.goto((process.env.LAB_URL || 'http://127.0.0.1:9118')+'/theater-preview.html#lakeLegends');
 const section=page.locator('#lakeLegends');
 await section.scrollIntoViewIfNeeded();
 for(const width of [1100,390]){
  await page.setViewportSize({width,height:900});
  for(const profile of ['source','h48c32','h32c16']){
   await page.selectOption('#lakeProfile',profile);
   await page.waitForFunction(p=>[...document.querySelectorAll('.lakeVariant')].every(c=>c.dataset.profile===p),profile);
   for(const card of await section.locator('figure').all()){
    const result=await card.evaluate(el=>{
     const [a,b]=Array.from(el.querySelectorAll('canvas'),c=>c.toDataURL());
     const c=el.querySelector('.lakeVariant'),rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
     return {equal:a===b,visible:rgba.some((x,i)=>i%4===3 && x),right:el.getBoundingClientRect().right,
      node:new URL(el.querySelector('a').href).searchParams.get('node'),id:el.dataset.lake};
    });
    assert.equal(result.equal,profile==='source');assert(result.visible);assert(result.right<=width);
    assert.equal(result.node,result.id+'-legend-bank');
   }
  }
  if(width===1100)await section.screenshot({path:'evidence/lake-legends-expedition.png'});
 }
 console.log('Both cards rendered across all profiles at desktop and mobile widths.');
} finally {await browser.close();}
