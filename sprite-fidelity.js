// Compare the visible actor masks independently of the background and encounter labels.
export function measureSpriteProfiles(paint,profiles,width,height,locateDifferences=false){
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
  return {profile,rectangles,fidelity:compareMasks(png,rgba,locateDifferences?width:0)};
 });
}

export function compareMasks(png,rect,width=0){
 const columns=width?Math.ceil(width/80):0;
 const tiles=width?Array.from({length:columns*Math.ceil(png.length/(4*width*45))},()=>({shape:0,color:0})):null;
 let union=0,overlap=0,error=0;
 for(let i=0;i<png.length;i+=4){
  const a=png[i+3]>=128,b=rect[i+3]>=128;
  if(!a&&!b)continue;
  union++;
  const pixel=i/4;
  const tile=tiles?.[Math.floor(pixel/width/45)*columns+Math.floor(pixel%width/80)];
  if(tile && a!==b)tile.shape++;
  if(a&&b){
   overlap++;
   const difference=Math.abs(png[i]-rect[i])+Math.abs(png[i+1]-rect[i+1])+Math.abs(png[i+2]-rect[i+2]);
   error+=difference;
   if(tile)tile.color+=difference;
  }
 }
 const locations={};
 if(tiles){
  for(const key of ['shape','color']){
   let best=0;
   for(let i=1;i<tiles.length;i++)if(tiles[i][key]>tiles[best][key])best=i;
   if(tiles[best]?.[key]>0)locations[key]={x:(best%columns)*80,y:Math.floor(best/columns)*45};
  }
 }
 return {...(tiles?{locations}:{}),union,overlap,overlapPercent:union?100*overlap/union:null,meanRgbError:overlap?error/(3*overlap):null};
}

export function measureSpriteFidelity(paint,profile,width,height){
 return measureSpriteProfiles(paint,[profile],width,height,true)[0].fidelity;
}
