import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
// Keep both canvases on the same raster backend while comparing fractional rectangle edges.
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1320,height:940}});
 const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const q=graph.quests.find(row=>row.id==='ina-sayu-quiet-route');
 const steps=q.itinerary.filter(s=>s.cover);
 const errors=[],results=[],images=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.goto(new URL('map-art.html?placements=live&node='+q.target+'&quest='+q.id+'&step=2&tier=4096',base).href);
 for(const [i,step] of steps.entries()){
  const number=i+2;
  if(i){
   const panel=page.locator('#localQuestSteps');
   if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();
   await panel.locator('li[value="'+number+'"] a').click();
  }
  await page.waitForFunction(n=>window.mapArt?.ready&&document.querySelector('#surveyPointNote').dataset.step===String(n),number);
  for(const tier of [4096,4608,5120,5632,6144]){
   await page.selectOption('#backgroundTier',String(tier));
   await page.waitForFunction(t=>window.mapArt?.decodedBackgroundRectangles===t,tier);
   const result=await page.evaluate(async({cover,tier,node})=>{
    const art=await (await fetch('assets/ina-sayu-route-'+cover.art+'-sprites-v1.json')).json();
    const image=new Image();image.src='assets/'+art.source;await image.decode();
    const scene=window.mapArt,height=cover.height,width=height*art.box[2]/art.box[3];
    const left=cover.x+cover.w/2-scene.camera-width/2,top=cover.y-height;
    const {scenery}=await import('./scenery.js');
    const field={camera:scene.camera,platforms:node.platforms,campaign:{zone:'story:'+node.id},story:{active:true,node:node.id},storyScenery:node.scenery};
    const samples={};
    for(const id of ['png','rect']){
     const ref=document.createElement('canvas');ref.width=960;ref.height=540;
     const ctx=ref.getContext('2d');
     const tile=id==='rect'&&tier<6144?(tier-4096)/512:undefined;
     scenery(ctx,field,id==='rect'?scene.decodedBackgroundFile:undefined,tile);
     const backing=document.createElement('canvas');
     backing.width=960;backing.height=540;
     const bg=backing.getContext('2d');
     bg.drawImage(ref,0,0);
     const empty=bg.getImageData(0,0,960,540).data;
     ctx.imageSmoothingEnabled=false;
     if(id==='png'){
      ctx.save();ctx.translate(cover.x+cover.w/2-scene.camera,cover.y);
      ctx.drawImage(image,...art.box,-width/2,-height,width,height);
      ctx.restore();
     }
     else{
      const profile=art.profiles[scene.profile];
      for(const [x,y,w,h,color] of profile.runs){
       ctx.fillStyle=color;
       ctx.fillRect(left+x*width/profile.width,top+y*height/profile.height,w*width/profile.width+.05,h*height/profile.height+.05);
      }
     }
     const source=ctx.getImageData(0,0,960,540).data;
     const got=document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data;
     let count=0,equal=0,deltaSum=0,maxDelta=0;
     for(let y=Math.ceil(top+4);y<cover.y-16;y++)for(let x=Math.ceil(left);x<left+width;x++){
      const p=4*(y*960+x);
      if(Math.max(...[0,1,2].map(c=>Math.abs(source[p+c]-empty[p+c])))<24)continue;
      count++;
      const delta=Math.max(...[0,1,2].map(c=>Math.abs(source[p+c]-got[p+c])));
      if(!delta)equal++;
      deltaSum+=delta;maxDelta=Math.max(maxDelta,delta);
     }
     samples[id]={equal,count,meanDelta:deltaSum/count,maxDelta};
    }
    return {tier,art:cover.art,profile:scene.profile,camera:scene.camera,samples};
   },{cover:step.cover,tier,node:graph.nodes.find(n=>n.id===q.target)});
   for(const sample of Object.values(result.samples)){
    assert.ok(sample.count>500&&sample.equal===sample.count,JSON.stringify(result));
   }
   results.push(result);
   if(tier===4096){
    const src=await page.evaluate(s=>{
     const out=document.createElement('canvas');
     out.width=640;out.height=178;
     const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=false;
     for(const [i,id] of ['png','rect'].entries())
      ctx.drawImage(document.getElementById(id),s.x-window.mapArt.camera-160,s.y-145,320,178,320*i,0,320,178);
     return out.toDataURL();
    },step);
    images.push({name:step.name,src});
   }
  }
 }
 const gallery=await browser.newPage({viewport:{width:700,height:790}});
 await gallery.setContent('<style>body{margin:18px;background:#122d32;color:#edf4e5;font:16px system-ui}p{margin:8px 0 3px}img{display:block;image-rendering:pixelated}</style><main><b>木陰の見回り道　｜　左：元PNG　右：16色・背景4,096矩形</b></main>');
 await gallery.evaluate(async rows=>{
  for(const {name,src} of rows){
   const p=document.createElement('p');p.textContent=name;
   const img=new Image();img.src=src;await img.decode();
   document.querySelector('main').append(p,img);
  }
 },images);
 await gallery.locator('main').screenshot({path:'evidence/sayu-hideouts-comparison.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/sayu-hideouts-pixels.json',JSON.stringify(results,null,2)+'\n');
 console.log(results.length+' cover/tier comparisons passed');
}finally{await browser.close()}
