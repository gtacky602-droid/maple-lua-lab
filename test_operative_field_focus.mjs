import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL??'http://127.0.0.1:19563/';
const browser=await chromium.launch({channel:'chrome'});
const results=[],panels=[];
try{
 const page=await browser.newPage();
 for(const [family,ordinary,subject,legend,height] of [
  ['frost','sites-hunt-63738-pocket-1','sites-hunt-63738-pocket-1-guardian','yseut-legend-court',104],
  ['wind','fontaine-field','fontaine-field-fatui-wind-operative','deianeira-legend-lab',116]
 ]){
  const file='fatui-'+family+'-operative-shared-idle-sprites-v2.json';
  const original=execFileSync('git',['show','18741862:assets/field-packed/'+file]);
  for(const node of [ordinary,legend]){
   const url=new URL('map-art.html',base);
   url.search=new URLSearchParams({node,placements:'live',profile:'h32c16',...(node===legend?{idle:'candidate'}:{subject})});
   const samples=[],images=[];
   for(const previous of [true,false]){
    if(previous)await page.route('**/field-packed/'+file,route=>route.fulfill({contentType:'application/json',body:original}));
    else await page.unrouteAll();
    await page.goto(url.href);
    await page.waitForFunction(()=>window.mapArt?.ready,undefined,{timeout:60000}).catch(async error=>{throw new Error(node+' '+(await page.locator('#status').textContent()),{cause:error})});
    const pose=await page.evaluate(()=>{const s=window.mapArt;const i=s.visuals.findIndex(v=>v.source?.includes('operative-shared-idle-source'));return {visual:s.visuals[i],px:s.placements[i]?.x-s.camera}});
    assert.equal(pose.visual.height,height);
    await page.locator('#compareSpriteProfiles').click();
    const rows=await page.locator('#spriteProfileTable tbody tr').evaluateAll(lines=>lines.map(tr=>{
     const [,count,shape,color]=[...tr.cells].map(c=>c.textContent);
     return [Number(count.replaceAll(',','')),parseFloat(shape),parseFloat(color)];
    }));
    samples.push(rows);
    if(node===legend){
     const crops=await page.evaluate(({visual,px})=>['png','rect'].map(id=>{
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=132;
      canvas.getContext('2d').drawImage(document.getElementById(id),Math.round(px-80),visual.y-126,160,132,0,0,160,132);
      return canvas.toDataURL();
     }),pose);
     if(previous)images.push(...crops);else images.push(crops[1]);
    }
   }
   for(const i of [1,2]){
    assert(samples[1][i][0]<=samples[0][i][0] && samples[1][i][1]>samples[0][i][1] && samples[1][i][2]<samples[0][i][2],JSON.stringify({node,samples}));
   }
   results.push({node,height,before:samples[0],after:samples[1]});
   if(images.length)panels.push(images);
  }
 }
 await page.setContent('<style>body{margin:0}main{display:inline-block;background:#19323a;color:white;font:16px sans-serif;text-align:center;padding:6px}section{display:flex}figure{margin:5px}img{width:240px;height:198px;image-rendering:pixelated}</style><main>'+panels.map(row=>'<section>'+row.map((im,i)=>'<figure><img src="'+im+'"><figcaption>'+['元のPNG','16色・変更前','16色・変更後'][i]+'</figcaption></figure>').join('')+'</section>').join('')+'</main>');
 await page.locator('main').screenshot({path:'evidence/operative-field-focus.png'});
 await writeFile('evidence/operative-field-focus.json',JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(results));
}finally{await browser.close()}

