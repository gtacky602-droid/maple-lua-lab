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
 const calls=()=>page.locator('#draws').evaluate(el=>Number(el.textContent.replaceAll(',','')));
 const before=await calls();
 const savings=await page.evaluate(()=>lab.frame.draws.filter(d=>d.kind==='rect_runs')
  .reduce((n,d)=>n+lab.frame.rectBatches[d.batch-1].length-1,0));
 assert(savings>0);
 const canvas=page.locator('#game');
 const image=()=>canvas.evaluate(c=>c.toDataURL());
 const original=await image();
 await page.locator('#livePalettePixels').check();
 await page.waitForFunction(expected=>Number(document.querySelector('#draws').textContent.replaceAll(',',''))===expected,before-savings);
 const after=await calls();
 assert.notEqual(await image(),original);
 await canvas.screenshot({path:'evidence/mond-town-live-palette.png'});
 await page.locator('#livePalettePixels').uncheck();
 await page.waitForFunction(expected=>Number(document.querySelector('#draws').textContent.replaceAll(',',''))===expected,before);
 assert.equal(await image(),original);
 const swapped=await page.evaluate(async()=>{
  const {drawPaletteBatch}=await import('./sprite-images.js'),cache=new Map();
  const c=document.createElement('canvas');c.width=2;c.height=1;
  const ctx=c.getContext('2d');
  const draw={batch:1,x:0,y:0,w:2,h:1,gridWidth:2,gridHeight:1};
  const runs=[[0,0,1,1,'#ff0000'],[1,0,1,1,'#00ff00']];
  const costs=[drawPaletteBatch(ctx,draw,runs,cache),drawPaletteBatch(ctx,draw,structuredClone(runs),cache)];
  draw.flip=true;
  const blue=structuredClone(runs);blue[1][4]='#0000ff';
  costs.push(drawPaletteBatch(ctx,draw,blue,cache));
  return {costs,pixels:[...ctx.getImageData(0,0,2,1).data]};
 });
 assert.deepEqual(swapped,{costs:[3,1,3],pixels:[0,0,255,255,255,0,0,255]});
 console.log({before,after,savings});
 await page.locator('#renderMode').selectOption('sprite');
 assert.equal(await page.locator('#rectTransferControls').isVisible(),false);
 console.log(JSON.stringify(bytes));await page.goto('about:blank');
}finally{await browser.close();}
