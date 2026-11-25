import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export async function captureFrozenStage(page,prefix,{include32=false}={}){
 await page.evaluate(()=>{
  if(!window.lab.frame.paused)window.lab.action('pause');
 });
 await page.waitForFunction(()=>window.lab.frame.paused);
 const frozen=await page.evaluate(()=>window.lab.frame.t);
 let reference;
 const profiles=[['sprite','source'],['h32c16','16']];
 if(include32)profiles.push(['h48c32','32']);
 for(const [mode,name] of profiles){
  if(name==='32'){
   await page.selectOption('#renderMode','sprite');
   await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.kind==='rect_runs'));
  }
  await page.selectOption('#renderMode',mode);
  await page.waitForFunction(packed=>window.lab.frame.draws.some(d=>d.kind==='rect_runs')===packed,name!=='source');
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const data=await page.locator('#game').evaluate(async(c,source)=>{
   if(!source)return c.toDataURL();
   const base=new Image();base.src=source;await base.decode();
   const canvas=document.createElement('canvas');canvas.width=c.width;canvas.height=c.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(base,0,0);
   const original=ctx.getImageData(0,0,c.width,c.height).data;
   const frame=c.getContext('2d').getImageData(0,0,c.width,c.height);
   const delta=ctx.createImageData(c.width,c.height);
   for(let i=0;i<original.length;i+=4){
    if(original[i+3]!==255||frame.data[i+3]!==255)throw new Error('Expected an opaque stage');
    if(original[i]!==frame.data[i]||original[i+1]!==frame.data[i+1]||original[i+2]!==frame.data[i+2])
     delta.data.set(frame.data.subarray(i,i+4),i);
   }
   ctx.putImageData(delta,0,0);
   const patch=canvas.toDataURL(),overlay=new Image();overlay.src=patch;await overlay.decode();
   ctx.drawImage(base,0,0);ctx.drawImage(overlay,0,0);
   const rebuilt=ctx.getImageData(0,0,c.width,c.height).data;
   if(!rebuilt.every((v,i)=>v===frame.data[i]))throw new Error('Decoded overlay changed the frame');
   return patch;
  },reference??null);
  if(name==='source')reference=data;
  const suffix=name==='16'?'delta':name==='32'?'delta32':name;
  await fs.writeFile('evidence/'+prefix+'-'+suffix+'.png',Buffer.from(data.split(',')[1],'base64'));
  assert.equal(await page.evaluate(()=>window.lab.frame.t),frozen);
 }
 await page.evaluate(()=>window.lab.action('pause'));
 await page.waitForFunction(()=>!window.lab.frame.paused);
}
