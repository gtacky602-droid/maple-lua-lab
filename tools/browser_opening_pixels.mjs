export function compareOpeningPixels(page,png,rect,node,camera=0){
 return page.evaluate(async({png,rect,node,camera})=>{
  const {scenery,loadScenery}=await import('./scenery.js');
  const frame={camera,platforms:node.platforms,campaign:{zone:'story:'+node.id},story:{active:true,node:node.id},storyGraph:{nodes:[node]},storyScenery:node.scenery};
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
 },{png,rect,node,camera});
}
