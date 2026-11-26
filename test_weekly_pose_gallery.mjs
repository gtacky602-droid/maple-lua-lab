import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const manifest=JSON.parse(await readFile('content/weekly-pose-files.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(new URL('weekly-poses.html?boss=andrius&pose=awake-ready',process.env.LAB_URL||'http://127.0.0.1:9125/').href);
 await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('矩形'));
 assert.equal(await page.locator('#pose').inputValue(),'awake-ready');
 const bosses=await page.locator('#boss option').evaluateAll(opts=>opts.map(o=>o.value));
 let count=0;
 for(const boss of bosses){
  await page.selectOption('#boss',boss);
  const poses=await page.locator('#pose option').evaluateAll(opts=>opts.map(o=>o.value));
  for(const pose of poses){
   await page.selectOption('#pose',pose);
   await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('矩形'));
   const painted=await page.locator('canvas').evaluateAll(list=>list.map(c=>{
    const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    return !c.hidden&&data.some((v,i)=>i%4===3&&v>0);
   }));
   assert.deepEqual(painted,[true,true,true],boss+'/'+pose);
   if(boss==='primal_fire'&&['flame','dual'].includes(pose)){
    const purple=await page.locator('canvas').evaluateAll(cs=>cs.map(c=>{
     const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
     return pixels.some((v,i)=>i%4===0&&v===189&&pixels[i+1]===154&&pixels[i+2]===255);
    }));
    assert.deepEqual(purple,Array(3).fill(pose==='dual'));
   }
   count++;
  }
 }
 assert.equal(count,Object.values(manifest).reduce((n,v)=>n+Object.keys(v).length,0)+2);
 console.log(bosses.length+' bosses, '+count+' poses, all three canvases painted');
}finally{await browser.close()}
