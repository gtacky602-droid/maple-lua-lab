import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(process.env.LAB_URL || 'http://127.0.0.1:9125/');
 await page.waitForFunction(()=>window.lab?.frame);
 assert.equal(await page.locator('#rectTransferControls').isVisible(),false);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story?.node==='mond-town');
 await page.locator('#pause').click();
 await page.waitForFunction(()=>window.lab.frame.paused);
 await page.locator('#renderMode').selectOption('h32c16');
 const bytes={};
 for(const packed of [true,false,true]){
  await page.locator('#packRectArt').setChecked(packed);
  const response=await page.waitForResponse(res=>{
   if(!res.url().endsWith('/api/frame'))return false;
   const req=res.request().postDataJSON();
   return req.profile==='h32c16' && req.packRectArt===packed;
  });
  const frame=await response.json();
  assert.equal(frame.paused,true);
  assert.equal(frame.draws.some(d=>d.kind==='rect_runs'),packed);
  const size=Number(response.headers()['content-length']);
  const coding=response.headers()['content-encoding'];
  assert.ok(size>0);
  await page.waitForFunction(()=>document.querySelector('#frameTransferSize').textContent.includes(' B'));
  const label=await page.locator('#frameTransferSize').textContent();
  assert.equal(label.includes('gzip'),coding==='gzip');
  bytes[packed?'packed':'inline']=size;
 }
 assert.ok(bytes.packed<bytes.inline,JSON.stringify(bytes));
 await page.locator('#renderMode').selectOption('sprite');
 assert.equal(await page.locator('#rectTransferControls').isVisible(),false);
 console.log(JSON.stringify(bytes));
}finally{await browser.close();}
