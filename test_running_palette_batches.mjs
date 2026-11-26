import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(new URL('traveler-run-compare.html',process.env.LAB_URL??'http://127.0.0.1:19743/').href);
 const rows=await page.evaluate(async()=>{
  const {drawPaletteBatch}=await import('./sprite-images.js');
  const owner=crypto.randomUUID();let session,storyGraphRevision;
  async function frame(extra){
   const response=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({session,owner,storyGraphRevision,steps:0,packRectArt:true,render:'rect',profile:'h32c16',...extra})});
   const f=await response.json();if(!response.ok)throw Error(f.error);
   session=f.session;storyGraphRevision=f.storyGraphRevision;return f;
  }
  const rows=[];
  try{
   await frame({actions:['story_start']});
   for(const direction of ['right','left']){
    const cache=new Map(),poses=new Set();
    let direct=0,cached=0,draws=0,warm=0;
    const make=()=>{const c=document.createElement('canvas');c.width=960;c.height=540;return c.getContext('2d')};
    const actual=make(),reference=make();
    for(let i=0;i<24;i++){
     const f=await frame({input:{[direction]:true},steps:4});
     const png=await frame({render:'sprite'});
     const pose=png.draws.find(d=>d.source?.includes('traveler-run-'+direction));
     if(pose)poses.add(pose.source);
     const fresh=new Map();
     for(const ctx of [actual,reference])ctx.clearRect(0,0,960,540);
     for(const d of f.draws.filter(d=>d.kind==='rect_runs')){
      const runs=f.rectBatches[d.batch-1];
      const calls=drawPaletteBatch(actual,d,runs,cache);
      drawPaletteBatch(reference,d,runs,fresh);
      direct+=runs.length;cached+=calls;draws++;if(calls===1)warm++;
     }
     if(actual.canvas.toDataURL()!==reference.canvas.toDataURL())throw Error('Pose mismatch '+direction+' '+i);
    }
    rows.push({direction,frames:24,poses:[...poses],batchDraws:draws,reused:warm,directCalls:direct,paletteCalls:cached});
   }
  }finally{await fetch('/api/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,owner})})}
  return rows;
 });
 for(const r of rows){
  assert.equal(r.poses.length,4,JSON.stringify(r));assert(r.reused>0 && r.directCalls>r.paletteCalls,JSON.stringify(r));
 }
 await writeFile('evidence/traveler-running-palette-calls.json',JSON.stringify(rows,null,2)+'\n');
 console.log(rows);
}finally{await browser.close()}
