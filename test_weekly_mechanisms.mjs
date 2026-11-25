import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const scenes=JSON.parse(await fs.readFile('content/weekly-opening-parts.json','utf8'));
const nodes=JSON.parse(await fs.readFile('content/story-graph.json','utf8')).nodes;
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
const report={};
try{
 for(const [id,scene] of Object.entries(scenes)){
  const page=await browser.newPage({viewport:{width:1420,height:920}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const node=nodes.find(n=>n.id===id);
  const refs=JSON.parse(await fs.readFile('work/weekly-mechanisms/'+id+'.json','utf8'));
  await page.goto(base+'map-art.html?placements=live&background=original&node='+id);
  await page.waitForFunction(n=>window.mapArt?.count===n&&window.mapArt.backgroundState==='ready',scene.parts.length);
  const parts=await page.evaluate(()=>window.mapArt.placements);
  assert.deepEqual(parts,scene.parts.map(({id,species,x,y,flip})=>({id,species,x,y,flip})));
  const pixels={};
  for(const profile of ['legacy','h48c32','h32c16']){
   await page.selectOption('#profile',profile);
   const result=await page.evaluate(async({png,rect,node})=>{
    const {scenery,loadScenery}=await import('./scenery.js');
    const frame={camera:0,platforms:node.platforms,campaign:{zone:'story:'+node.id},story:{active:true,node:node.id},storyScenery:node.scenery};
    await loadScenery(frame);
    const render=async(id,draws)=>{
     const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
     const ctx=canvas.getContext('2d');scenery(ctx,frame);ctx.imageSmoothingEnabled=false;
     const cache=new Map();
     for(const d of draws){
      if(d.kind==='rect'){ctx.fillStyle=d.color;ctx.fillRect(d.x,d.y,d.w,d.h)}
      else if(d.kind==='text'){
       ctx.font=`bold ${d.size}px 'Yu Gothic UI',sans-serif`;ctx.textAlign='center';ctx.lineWidth=3;
       ctx.strokeStyle='#2a484868';ctx.strokeText(d.text,d.x,d.y);ctx.fillStyle=d.color;ctx.fillText(d.text,d.x,d.y);
      }else{
       if(!cache.has(d.source)){const img=new Image();img.src='assets/'+d.source;await img.decode();cache.set(d.source,img)}
       ctx.save();ctx.translate(d.x,d.y);if(d.flip)ctx.scale(-1,1);
       ctx.drawImage(cache.get(d.source),...d.box,-d.w*(d.anchorX??.5),-d.h,d.w,d.h);ctx.restore();
      }
     }
     const expected=ctx.getImageData(0,0,960,540).data;
     const actual=document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data;
     let diff=0;
     for(let i=0;i<actual.length;i+=4)if(actual[i]!==expected[i]||actual[i+1]!==expected[i+1]||actual[i+2]!==expected[i+2]||actual[i+3]!==expected[i+3])diff++;
     return diff;
    };
    return {png:await render('png',png),rect:await render('rect',rect)};
   },{png:refs.png,rect:refs[profile],node});
   assert.deepEqual(result,{png:0,rect:0},id+' '+profile+' '+JSON.stringify(result));
   const rectangles=refs[profile].filter(d=>d.kind==='rect').length;
   assert.ok((await page.locator('#viewportCost').innerText()).includes(rectangles.toLocaleString('ja-JP')+'個'));
   pixels[profile]={rectangles,differentPixels:result};
  }
  if(scene.parts.length>1){
   for(const part of scene.parts){
    await page.selectOption('#liveSubject',part.id);
    assert.equal(await page.evaluate(()=>window.mapArt.shownCount),1);
   }
   await page.selectOption('#liveSubject','');
  }
  await page.locator('main').screenshot({path:'evidence/'+id+'-mechanisms.png'});
  assert.deepEqual(errors,[]);
  report[id]={parts,profiles:pixels};
  await page.close();console.log(id);
 }
 await fs.writeFile('evidence/weekly-mechanism-placements.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close()}
