export function compareOpeningPixels(page,png,rect,node,camera=0,ids=['png','rect']){
 return page.evaluate(async({png,rect,node,camera,ids})=>{
  const {scenery,loadScenery}=await import('./scenery.js');
  const {drawCombatRect,omitCombatDraw,combatOpacity}=await import('./sprite-images.js');
  const {paintBandedSprite}=await import('./sprite-layers.js');
  const frame={camera,platforms:node.platforms,storySwim:Boolean(node.swim),campaign:{zone:'story:'+node.id},story:{active:true,node:node.id},storyGraph:{nodes:[node]}};
  await loadScenery(frame);
  const render=async(id,draws)=>{
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
   const ctx=canvas.getContext('2d');scenery(ctx,frame);ctx.imageSmoothingEnabled=false;
   const cache=new Map();
   for(const d of draws){
    if(omitCombatDraw(d))continue;
    ctx.globalAlpha=combatOpacity(d);
    if(d.kind==='rect'){drawCombatRect(ctx,d)}
    else if(d.kind==='text'){
     ctx.font=`bold ${d.size}px 'Yu Gothic UI',sans-serif`;ctx.textAlign='center';ctx.lineWidth=3;
     ctx.strokeStyle='#2a484868';ctx.strokeText(d.text,d.x,d.y);ctx.fillStyle=d.color;ctx.fillText(d.text,d.x,d.y);
    }else{
     if(!cache.has(d.source)){const img=new Image();img.src='assets/'+d.source;await img.decode();cache.set(d.source,img)}
     ctx.save();ctx.translate(d.x,d.y);if(d.rotation)ctx.rotate(d.rotation);if(d.flip)ctx.scale(-1,1);
     paintBandedSprite(ctx,cache.get(d.source),d.box,-d.w*(d.anchorX??.5),-d.h*(d.anchorY??1),d.w,d.h,d.bodyBand);ctx.restore();
    }
   }
   const expected=ctx.getImageData(0,0,960,540).data;
   const actual=document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data;
   let diff=0;
   for(let i=0;i<actual.length;i+=4)if(actual[i]!==expected[i]||actual[i+1]!==expected[i+1]||actual[i+2]!==expected[i+2]||actual[i+3]!==expected[i+3])diff++;
   return diff;
  };
  return {png:await render(ids[0],png),rect:await render(ids[1],rect)};
 },{png,rect,node,camera,ids});
}
