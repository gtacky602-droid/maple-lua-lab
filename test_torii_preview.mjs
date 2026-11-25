import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const {forest}=JSON.parse(await fs.readFile('content/worksite-props.json','utf8'));
const root=process.env.LAB_URL||'http://127.0.0.1:9117/';
const checks=[],pictures=[];
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const [node,room] of Object.entries(forest.rooms)){
  const url=new URL('map-art.html',root);
  url.search=new URLSearchParams({node,placements:'live',compare:'background',tier:'4096',forest:'search'});
  await page.goto(url.href);
  await page.waitForFunction(n=>window.mapArt?.node===n&&window.mapArt?.decodedBackgroundRectangles===4096,node);
  const host=page.locator('#forestPreview');
  assert.ok(await host.isVisible());
  if(room.entry){
   const size=JSON.parse(await fs.readFile('evidence/torii-layout-size.json','utf8'));
   await host.locator('summary').click();
   await page.waitForFunction(text=>document.querySelector('#forestPreview details p').textContent.includes(text),
    size.shared.jsonBytes.toLocaleString('ja-JP')+' B');
   assert.ok((await host.locator('details p').textContent()).includes(size.inline.jsonBytes.toLocaleString('ja-JP')+' B'));
  }
  const moving=room.search.some(p=>p[3]);
  assert.equal(await host.locator('input').isVisible(),moving);
  for(const phase of Object.keys(room)){
   if(room.entry)await host.locator('select').selectOption(phase);
   const stamps=moving?Array.from({length:60},(_,i)=>i):[0];
   const levels=[4096,4608,5120,5632,6144];
   for(const tier of levels){
    await page.selectOption('#backgroundTier',String(tier));
    await page.waitForFunction(t=>window.mapArt?.decodedBackgroundRectangles===t,tier);
    for(const beat of moving&&tier!==4096?[0,15,45]:stamps){
     const capture=tier===4096&&phase==='search'&&(!moving||beat===15||beat===45);
     const sample=await page.evaluate(({beat,runs,forest,capture,moving})=>{
      const host=document.getElementById('forestPreview');
      if(moving){
       const input=host.querySelector('input');
       input.value=String(beat);input.dispatchEvent(new Event('input'));
      }
      const camera=Number(document.getElementById('camera').value);
      const expected=new Map();
      let calls=0;
      for(const [id,x,y,lift] of runs){
       for(const [dx,dy,w,h,color] of forest.motifs[id]){
        const left=x+dx-camera,top=y+dy+(lift?forest.offsets[beat]:0);
        if(left+w<=0||left>=960)continue;
        calls++;
        for(let j=0;j<h;j++)for(let i=0;i<w;i++){
         if(left+i>=0&&left+i<960)expected.set((top+j)*960+left+i,parseInt(color.slice(1),16));
        }
       }
      }
      if(!host.querySelector('output').textContent.includes(calls+'矩形'))throw Error('draw count '+calls);
      const shots=[];
      for(const id of ['png','rect']){
       const src=document.getElementById(id),ctx=src.getContext('2d');
       const data=ctx.getImageData(0,0,src.width,src.height).data;
       for(const [index,rgb] of expected){
        const pos=index*4;
        if((data[pos]*65536+data[pos+1]*256+data[pos+2])!==rgb)throw Error('pixel '+index+' '+id);
       }
       if(capture){
        const strip=document.createElement('canvas');strip.width=352;strip.height=100;
        const pen=strip.getContext('2d');pen.imageSmoothingEnabled=false;
        [485,855].forEach((x,i)=>pen.drawImage(src,x-camera-55,412,116,70,i*177,0,174,100));
        shots.push(strip.toDataURL());
       }
      }
      return {calls,pixels:expected.size,shots};
     },{beat,runs:room[phase],forest,capture,moving});
     assert.ok(sample.pixels>0);
     checks.push({node,phase,tier,beat,calls:sample.calls,pixels:sample.pixels});
     if(capture)pictures.push({node,beat,shots:sample.shots});
    }
   }
  }
 }
 // A different field must not retain the forest's controls or drawings.
 await page.selectOption('#node','inazuma-town');
 await page.locator('#forestPreview').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 const sheet=await page.evaluate(async pictures=>{
  const c=document.createElement('canvas');c.width=742;c.height=554;
  const ctx=c.getContext('2d');ctx.fillStyle='#173538';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#fcf0d5';ctx.font='bold 20px sans-serif';ctx.fillText('稲妻・三つ灯籠の広場',12,27);
  ctx.font='15px sans-serif';ctx.fillText('元の背景画像',12,53);ctx.fillText('4,096矩形の仮背景',379,53);
  for(const [i,row] of pictures.entries()){
   const y=77+i*121;
   const name=row.node.endsWith('footprints')?'岩と木の実':row.node.endsWith('statues')?'石像　'+(row.beat+1)+' / 60':'水たまり';
   ctx.fillText(name,12,y);
   for(const [j,src] of row.shots.entries()){
    const img=new Image();img.src=src;await img.decode();ctx.drawImage(img,j?379:12,y+5);
   }
  }
  return c.toDataURL();
 },pictures);
 await fs.writeFile('evidence/inazuma-torii-clues.png',Buffer.from(sheet.split(',')[1],'base64'));
 await fs.writeFile('evidence/torii-preview-pixels.json',JSON.stringify(checks,null,2)+'\n');
 console.log(checks.length+' room, time and tier combinations matched both canvases.');
}finally{await browser.close()}
