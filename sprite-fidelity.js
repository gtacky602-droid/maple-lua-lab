// Compare the visible actor masks independently of the background and encounter labels.
export function measureSpriteProfiles(paint,profiles,width,height){
 const raster=quality=>{
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=false;
  const rectangles=paint(ctx,quality);
  return {rgba:ctx.getImageData(0,0,width,height).data,rectangles};
 };
 const png=raster(null).rgba;
 return profiles.map(profile=>{
  const {rgba,rectangles}=raster(profile);
  return {profile,rectangles,fidelity:compareMasks(png,rgba)};
 });
}

export function compareMasks(png,rect){
 let union=0,overlap=0,error=0;
 for(let i=0;i<png.length;i+=4){
  const a=png[i+3]>=128,b=rect[i+3]>=128;
  if(a||b)union++;
  if(a&&b){
   overlap++;
   for(let c=0;c<3;c++)error+=Math.abs(png[i+c]-rect[i+c]);
  }
 }
 return {union,overlap,overlapPercent:union?100*overlap/union:null,meanRgbError:overlap?error/(3*overlap):null};
}

export function measureSpriteFidelity(paint,profile,width,height){
 return measureSpriteProfiles(paint,[profile],width,height)[0].fidelity;
}
