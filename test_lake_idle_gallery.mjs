import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:8982/';
const prefix=['lake-vivianne','lake-ninianne'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1360,height:900}});
const failures=[];
page.on('pageerror',error=>failures.push(error.message));

try{
 const gallery=new URL('bosses-art.html?q=湖辺の&zoom=1',base);
 await page.goto(gallery.href);
 await page.waitForFunction(()=>window.charactersGallery?.ready,null,{timeout:60000});
 const assetIds=await page.locator('#cards article:not([hidden])').evaluateAll(cards=>cards.map(card=>card.dataset.id));
 for(const id of prefix){
  for(const suffix of ['water-shading','idle-v5-a','idle-v5-b'])assert.ok(assetIds.includes(id+'-'+suffix));
 }
 for(const profile of ['legacy','h48c32','h32c16']){
  await page.selectOption('#profile',profile);
  assert.equal(await page.evaluate(()=>window.charactersGallery.profile),profile);
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await page.setViewportSize({width:1360,height:900});

 const metrics=await page.evaluate(async prefix=>{
  const {spriteBounds,paintSprite}=await import('/sprite-layers.js');
  async function image(src){
   const bmp=new Image();
   bmp.src='/assets/'+src;
   await bmp.decode();
   return bmp;
  }
  async function frame(name,variant){
   const asset=variant==='v4'?name+'-field-idle-sprites-v4.json':name+'-field-idle-'+variant+'-sprites-v5.json';
   const response=await fetch('/assets/'+asset);
   if(!response.ok)throw Error(asset);
   const data=await response.json();
   return {data,image:await image(data.source)};
  }
  const backdrop=await image('fontaine-background-v1.png');
  const canvas=document.createElement('canvas');
  canvas.width=1344;
  canvas.height=392;
  canvas.style.cssText='width:1344px;max-width:100%;height:auto;display:block;background:#182c37';
  canvas.id='lakeIdleProof';
  document.body.replaceChildren(canvas);
  document.body.style.margin='0';
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  const width=218,height=126,margin=8;
  function label(text,x,y){
   ctx.fillStyle='#ecf7fa';
   ctx.fillText(text,x,y);
  }
  const metrics={};
  const names=['湖辺のヴィヴィアン','湖辺のニニアン'];
  const variants=['v4','a','b'];
  for(const [row,id] of prefix.entries()){
   const y=18+row*190;
   ctx.font='bold 17px "Yu Gothic", sans-serif';
   label(names[row],12,y+2);
   ctx.font='14px "Yu Gothic", sans-serif';
   for(const [col,variant] of variants.entries()){
    const {data,image}=await frame(id,variant);
    metrics[id+'-'+variant]=Object.fromEntries(Object.entries(data.profiles).map(([profile,value])=>[profile,value.runs.length]));
    const groupX=margin+col*2*(width+4);
    label(['第4稿','第5稿 A・大きな色面','第5稿 B・斜めの奥行き'][col],groupX+4,y+25);
    for(const [i,profile] of [null,'h32c16'].entries()){
     const x=groupX+i*(width+2), top=y+44;
     label(profile?'軽量16色':'元PNG',x+4,top-3);
     ctx.drawImage(backdrop,690,582,400,248,x,top,width,height);
     ctx.save();
     ctx.beginPath();
     ctx.rect(x,top,width,height);
     ctx.clip();
     ctx.translate(x+width/2,top+height-5);
     const bounds=spriteBounds(data,114);
     if(bounds.x < -width/2 || bounds.x+bounds.width > width/2)throw Error('Comparison clips '+id+' '+variant);
     paintSprite(ctx,data,image,bounds,profile);
     ctx.restore();
    }
   }
  }
  return metrics;
 },prefix);
 for(const runs of Object.values(metrics))assert.ok(runs.legacy>runs.h48c32&&runs.h48c32>runs.h32c16);
 assert.deepEqual(failures,[]);
 await page.locator('#lakeIdleProof').screenshot({path:'evidence/lake-legend-idle-v5-comparison.png'});
 await fs.writeFile('evidence/lake-legend-idle-v5-browser.json',JSON.stringify({
  profiles:['legacy','h48c32','h32c16'],heightToPivot:114,background:'fontaine-background-v1.png',
  addedCandidates:4,mobileOverflow:false,metrics
 },null,2)+'\n');
 console.log('Chrome passed original and 16-color lake art comparison at a common display height.');
}finally{
 await browser.close();
}
