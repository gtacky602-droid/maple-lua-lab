import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
const suffix=process.argv.includes('--earned')?'-earned':'';
const fixtures=JSON.parse(await fs.readFile('work/itto-course'+suffix+'-frames.json','utf8'));
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const node=graph.nodes.find(n=>n.ittoGames);
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1350,height:960}});
 const errors=[],results=[],shots=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('map-art.html?node='+node.id+'&placements=live&round=3&tier=4096',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready&&window.mapArt.decodedBackgroundRectangles===4096);
 assert.equal(await page.inputValue('#questPropStage'),'2');
 for(const i of [1,2,3]){
  await page.selectOption('#questPropStage',String(i-1));
  for(const tier of [4096,4608,5120,5632,6144]){
   await page.selectOption('#backgroundTier',String(tier));
   await page.waitForFunction(t=>window.mapArt?.ready&&window.mapArt.decodedBackgroundRectangles===t,tier);
   const counts=await page.evaluate(async({node,tier,layers})=>{
    const {scenery}=await import('./scenery.js');
    const frame={camera:0,platforms:node.platforms,campaign:{zone:'story:'+node.id},story:{active:true,node:node.id},storyScenery:node.scenery};
    const atlas=new Image();atlas.src='assets/ina-itto-games-props-source-v1.png';await atlas.decode();
    const counts={};
    for(const [id,draws] of [['png',layers.sprite],['rect',layers.rect]]){
     const file=id==='rect'?window.mapArt.decodedBackgroundFile:undefined;
     const tile=id==='rect'&&tier<6144?(tier-4096)/512:undefined;
     const ref=document.createElement('canvas');ref.width=960;ref.height=540;
     const ctx=ref.getContext('2d');scenery(ctx,frame,file,tile);
     const background=ctx.getImageData(0,0,960,540).data;
     ctx.imageSmoothingEnabled=false;
     for(const d of draws){
      if(d.kind==='boss_sprite'){
       ctx.save();ctx.translate(d.x,d.y);ctx.drawImage(atlas,...d.box,-d.w*d.anchorX,-d.h,d.w,d.h);ctx.restore();
      }else if(d.kind==='rect'){
       ctx.fillStyle=d.color;ctx.fillRect(d.x,d.y,d.w,d.h);
      }else{
       ctx.save();ctx.font='bold '+d.size+'px "Yu Gothic UI",sans-serif';ctx.textAlign='center';
       ctx.strokeStyle='#2a484868';ctx.lineWidth=3;ctx.strokeText(d.text,d.x,d.y);
       ctx.fillStyle=d.color;ctx.fillText(d.text,d.x,d.y);ctx.restore();
      }
     }
     const reference=ctx.getImageData(0,0,960,540).data;
     const actual=document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data;
     let changed=0,checked=0;
     for(let p=0;p<actual.length;p+=4){
      if(reference[p]===background[p]&&reference[p+1]===background[p+1]&&reference[p+2]===background[p+2])continue;
      checked++;
      if(reference[p]!==actual[p]||reference[p+1]!==actual[p+1]||reference[p+2]!==actual[p+2])changed++;
     }
     counts[id]={changed,checked};
    }
    return counts;
   },{node,tier,layers:fixtures[i]});
   for(const {changed,checked} of Object.values(counts)){
    assert.ok(checked>500&&changed===0,JSON.stringify({i,tier,counts}));
   }
   results.push({round:i,tier,counts});
   if(tier===4096){
    const src=await page.evaluate(()=>{
     const canvas=document.createElement('canvas');canvas.width=960;canvas.height=200;
     const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
     for(const [j,id] of ['png','rect'].entries())
      ctx.drawImage(document.getElementById(id),0,140,960,400,j*480,0,480,200);
     return canvas.toDataURL();
    });
    shots.push({label:await page.locator('#questPropStage option:checked').innerText(),src});
   }
  }
 }
 const gallery=await browser.newPage({viewport:{width:990,height:830}});
 await gallery.setContent('<style>body{background:#202338;color:#fff3db;font:16px system-ui;margin:12px}p{margin:8px 0 2px}img{display:block;image-rendering:pixelated}</style><main><b>荒瀧天下一・三番勝負　｜　左：元PNG　右：16色・背景4,096矩形</b></main>');
 await gallery.evaluate(async rows=>{
  for(const {label,src} of rows){
   const p=document.createElement('p');p.textContent=label;
   const img=new Image();img.src=src;await img.decode();document.querySelector('main').append(p,img);
  }
 },shots);
 await gallery.locator('main').screenshot({path:'evidence/itto-course-comparison.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/itto-course-map-pixels.json',JSON.stringify(results,null,2)+'\n');
 console.log(results.length+' stage and background combinations match gameplay Lua.');
}finally{await browser.close()}
