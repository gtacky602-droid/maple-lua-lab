import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {forEachRectangle,rectangleCount} from './sprite-layers.js';
const manifest=JSON.parse(await readFile('content/weekly-pose-files.json','utf8'));
for(const file of new Set(Object.values(manifest).flatMap(group=>Object.values(group)))){
 const packed=JSON.parse(await readFile('assets/weekly-packed/'+file,'utf8'));
 const original=JSON.parse(await readFile('assets/'+file,'utf8'));
 for(const [key,grid] of Object.entries(packed.profiles)){
  const rows=original.profiles[key].runs;
  assert.equal(rectangleCount(grid),rows.length);
  let index=0;
  forEachRectangle(grid,(...row)=>assert.deepEqual(row,rows[index++]));
  assert.equal(index,rows.length);
 }
}
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 await page.goto(new URL('weekly-poses.html?boss=andrius&pose=awake-ready&pixels=1',process.env.LAB_URL||'http://127.0.0.1:9125/').href);
 await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('矩形'));
 assert.equal(await page.locator('#pose').inputValue(),'awake-ready');
 const pixels=page.locator('#palettePixels');
 assert(await pixels.isChecked());
 const snapshots=()=>page.locator('canvas').evaluateAll(cs=>cs.map(c=>c.toDataURL()));
 const native=await snapshots();
 await pixels.uncheck();
 const direct=await snapshots();
 assert.equal(native[0],direct[0]);
 assert.notEqual(native[1],direct[1]);
 assert.notEqual(native[2],direct[2]);
 assert.equal(new URL(page.url()).searchParams.has('pixels'),false);
 await pixels.check();
 assert.deepEqual(await snapshots(),native);
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
   if(boss==='knave'&&pose==='moon'){
    const art=JSON.parse(await readFile('assets/weekly-packed/'+manifest.knaveWeeklyArt.double,'utf8'));
    const bytes=['h48c32','h32c16'].map(key=>Buffer.from(art.profiles[key].data,'base64').length);
    const expected=((1-bytes[1]/bytes[0])*100).toFixed(1);
    const status=await page.locator('#result').innerText();
    assert(status.includes(expected+'%減'));
    assert(status.includes(bytes.map(n=>n.toLocaleString()+' B').join(' → ')));
   }
   if(boss==='primal_fire'&&['flame','dual'].includes(pose)){
    const purple=await page.locator('canvas').evaluateAll(cs=>cs.map(c=>{
     const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
     return pixels.some((v,i)=>i%4===0&&v===189&&pixels[i+1]===154&&pixels[i+2]===255);
    }));
    assert.deepEqual(purple,Array(3).fill(pose==='dual'));
   }
   if((boss==='signora'&&['frost','emerging','blaze'].includes(pose))||(boss==='childe'&&['water','delusion','legacy-form'].includes(pose))||(boss==='narwhal'&&['arrival','inside','return'].includes(pose))||(boss==='knave'&&['court','frenzy','moon'].includes(pose))){
    const replay=JSON.parse(await readFile('evidence/'+boss+'-access-views.json','utf8'));
    const shot=replay.views[pose];
    assert.equal(new URL(await page.locator('#arena').getAttribute('href'),page.url()).searchParams.get('node'),shot.node);
    const matches=await page.locator('canvas').first().evaluate(async(canvas,{shot,boss})=>{
     const {scenery}=await import('./scenery.js');
     const spec=await (await fetch('content/weekly-pose-files.json')).json();
     const art=await (await fetch('assets/weekly-packed/'+spec[boss+'WeeklyArt'][shot.pose])).json();
     const c=document.createElement('canvas');c.width=960;c.height=540;
     const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
     scenery(ctx,{story:{active:true,node:shot.node},campaign:{zone:'story:'+shot.node},camera:shot.camera,platforms:shot.platforms,t:shot.tick/60});
     const image=new Image();image.src='assets/'+art.source;await image.decode();
     const width=shot.height*art.box[2]/art.box[3];
     function layer(rows){for(const [x,y,w,h,color,a] of rows??[]){ctx.globalAlpha=a;ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}ctx.globalAlpha=1}
     layer(shot.behind);ctx.save();ctx.translate(shot.x,shot.y);if(shot.flip)ctx.scale(-1,1);
     ctx.drawImage(image,...art.box,-width*(art.anchorX??.5),-shot.height,width,shot.height);
     ctx.restore();layer(shot.front);
     return c.toDataURL()===canvas.toDataURL();
    },{shot,boss});
    assert(matches,pose);
    if(boss==='signora'){
     const expected=shot.device==='霜眼'?[139,229,243]:[255,150,76];
     const posts=shot.behind.filter(r=>r[2]===16&&r[3]===48).map(r=>[r[0]+2,r[1]+2]);
     assert.equal(posts.length,2);
     const devices=await page.locator('canvas').evaluateAll((cs,points)=>cs.flatMap(c=>points.map(([x,y])=>
      [...c.getContext('2d').getImageData(x,y,1,1).data].slice(0,3))),posts);
     assert.deepEqual(devices,Array(6).fill(expected));
     if(pose==='blaze')await page.locator('main').screenshot({path:'evidence/signora-blaze-arena-profiles.png'});
    }
    if(pose==='legacy-form')await page.locator('main').screenshot({path:'evidence/childe-foul-arena-profiles.png'});
    if(pose==='moon')await page.locator('main').screenshot({path:'evidence/knave-moon-profiles.png'});
    if(pose==='inside')await page.locator('main').screenshot({path:'evidence/narwhal-inner-profiles.png'});
   }
   count++;
  }
 }
 assert.equal(count,Object.values(manifest).reduce((n,v)=>n+Object.keys(v).length,0)+14);
 console.log(bosses.length+' bosses, '+count+' poses, all three canvases painted');
}finally{await browser.close()}
