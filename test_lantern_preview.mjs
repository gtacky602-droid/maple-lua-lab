import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const root=process.env.LAB_URL||'http://127.0.0.1:9117/';
const {contest}=JSON.parse(await fs.readFile('content/worksite-props.json','utf8'));
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage(),errors=[],checks=[],images=[];
 page.on('pageerror',e=>errors.push(e.message));
 const url=new URL('map-art.html',root);
 url.search=new URLSearchParams({node:contest.node,placements:'live',contest:2,tier:4096,compare:'background'});
 await page.goto(url.href);
 await page.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===4096);
 const host=page.locator('#contestPreview'),replay=host.locator('input');
 assert.equal(await page.locator('#questPropStage').inputValue(),'1');
 await host.locator('summary').click();
 await page.waitForFunction(()=>document.querySelector('#contestPreview p').textContent.includes('JSON'));
 const packing=await host.locator('p').textContent();
 for(const [index,stage] of contest.stages.entries()){
  await page.selectOption('#questPropStage',String(index));
  for(const tier of [4096,4608,5120,5632,6144]){
   await page.selectOption('#backgroundTier',String(tier));
   await page.waitForFunction(t=>window.mapArt?.decodedBackgroundRectangles===t,tier);
   for(const rematch of [false,true]){
    await replay.setChecked(rematch);
    const take=tier===4096&&!rematch;
    const sample=await page.evaluate(({contest,stage,index,rematch,take})=>{
     const camera=Number(document.querySelector('#camera').value);
     const expected=new Map();
     let calls=0;
     for(const [name,wx,wy,k] of rematch?stage.placements:[contest.curtain,...stage.placements]){
      for(const [dx,dy,w,h,color] of contest.motifs[name]){
       const x=Math.floor(wx+dx*k-camera),y=Math.floor(wy+dy*k);
       const right=x+w*k,bottom=y+h*k;
       if(right<=0||x>=960)continue;
       calls++;
       for(let j=y;j<Math.ceil(bottom);j++)for(let i=Math.max(0,x);i<Math.min(960,Math.ceil(right));i++){
        const key=j*960+i;
        if(i+1>right||j+1>bottom)expected.delete(key);
        else expected.set(key,color);
       }
      }
     }
     if(!document.querySelector('#contestPreview output').textContent.includes(calls+'矩形'))throw Error('count');
     const crops=[];
     for(const layer of ['png','rect']){
      const canvas=document.getElementById(layer),ctx=canvas.getContext('2d');
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      for(const [key,color] of expected){
       const i=key*4,rgb=pixels[i]*65536+pixels[i+1]*256+pixels[i+2];
       if(rgb!==parseInt(color.slice(1),16))throw Error([layer,index,key,color,rgb.toString(16)]);
      }
      if(take){
       const strip=document.createElement('canvas');strip.width=428;strip.height=152;
       const pen=strip.getContext('2d');pen.imageSmoothingEnabled=false;
       if(index===1){
        for(const [i,[,x]] of stage.placements.filter(p=>p[0]==='lantern').entries())
         pen.drawImage(canvas,x-camera-66,361,132,130,143*i,12,132,130);
       }else pen.drawImage(canvas,stage.focusX-camera-214,338,428,152,0,0,428,152);
       crops.push(strip.toDataURL());
      }
     }
     return {calls,pixels:expected.size,crops};
    },{contest,stage,index,rematch,take});
    assert.ok(sample.pixels>0);
    checks.push({phase:index+1,tier,rematch,calls:sample.calls,pixels:sample.pixels});
    if(take)images.push({label:stage.label,shots:sample.crops});
   }
  }
 }
 // Pan to the physical exit; the curtain must disappear when revisiting the challenge.
 await page.locator('#camera').evaluate(slider=>{slider.value='440';slider.dispatchEvent(new Event('input'))});
 const gate=async()=>page.evaluate(()=>['png','rect'].map(id=>
  Array.from(document.getElementById(id).getContext('2d').getImageData(882,391,1,1).data).slice(0,3).join(',')));
 await replay.uncheck();
 assert.deepEqual(await gate(),['36,59,53','36,59,53']);
 await replay.check();
 assert.ok((await gate()).every(color=>color!=='36,59,53'));
 await page.selectOption('#node','inazuma-town');
 await host.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 const sheet=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=888;c.height=604;
  const ctx=c.getContext('2d');ctx.fillStyle='#183039';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#ffebce';ctx.font='bold 20px sans-serif';ctx.fillText('稲妻・千化け大灯籠',12,28);
  ctx.font='15px sans-serif';ctx.fillText('元の背景画像',12,54);ctx.fillText('4,096矩形の仮背景',448,54);
  for(const [i,row] of rows.entries()){
   const y=80+176*i;ctx.fillText(row.label,12,y);
   for(const [j,src] of row.shots.entries()){
    const img=new Image();img.src=src;await img.decode();ctx.drawImage(img,j?448:12,y+6);
   }
  }
  return c.toDataURL();
 },images);
 await fs.writeFile('evidence/inazuma-lantern-comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 await fs.writeFile('evidence/lantern-comparison-checks.json',JSON.stringify({packing,gateAfterReplay:true,checks},null,2)+'\n');
 console.log(checks.length+' arena comparisons. '+packing);
}finally{await browser.close()}
