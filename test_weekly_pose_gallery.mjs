import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const manifest=JSON.parse(await readFile('content/weekly-pose-files.json','utf8'));
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
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
   if(boss==='narwhal'&&['arrival','inside','return'].includes(pose)){
    const replay=JSON.parse(await readFile('evidence/narwhal-access-views.json','utf8'));
    const shot=replay.views[pose];
    assert.equal(new URL(await page.locator('#arena').getAttribute('href'),page.url()).searchParams.get('node'),shot.node);
    const matches=await page.locator('canvas').first().evaluate(async(canvas,shot)=>{
     const {scenery}=await import('./scenery.js');
     const spec=await (await fetch('content/weekly-pose-files.json')).json();
     const art=await (await fetch('assets/weekly-packed/'+spec.narwhalWeeklyArt[shot.pose])).json();
     const c=document.createElement('canvas');c.width=960;c.height=540;
     const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
     scenery(ctx,{story:{active:true,node:shot.node},campaign:{zone:'story:'+shot.node},camera:shot.camera,platforms:shot.platforms,t:shot.tick/60});
     const image=new Image();image.src='assets/'+art.source;await image.decode();
     const width=shot.height*art.box[2]/art.box[3];
     ctx.translate(shot.x,shot.y);if(shot.flip)ctx.scale(-1,1);
     ctx.drawImage(image,...art.box,-width*(art.anchorX??.5),-shot.height,width,shot.height);
     return c.toDataURL()===canvas.toDataURL();
    },shot);
    assert(matches,pose);
    if(pose==='inside')await page.locator('main').screenshot({path:'evidence/narwhal-inner-profiles.png'});
   }
   count++;
  }
 }
 assert.equal(count,Object.values(manifest).reduce((n,v)=>n+Object.keys(v).length,0)+5);
 console.log(bosses.length+' bosses, '+count+' poses, all three canvases painted');
}finally{await browser.close()}
