// Compare the visible actor masks independently of the background and encounter labels.
export function measureSpriteProfiles(paint,profiles,width,height,locateDifferences=false,onRaster){
 const raster=quality=>{
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=false;
  const rectangles=paint(ctx,quality);
  const rgba=ctx.getImageData(0,0,width,height).data;
  if(onRaster)onRaster(quality,canvas,rgba);
  return {rgba,rectangles};
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

// Use one crop for all four views so lost outlines and detached parts stay comparable.
export function spriteComparisonStrip(container,paint,options,width,height){
 const rasters=[];
 let left=width,top=height,right=-1,bottom=-1;
 const rows=measureSpriteProfiles(paint,options.map(o=>o.value),width,height,false,(profile,canvas,rgba)=>{
  rasters.push({profile,canvas});
  for(let y=0;y<height;y++){
   for(let x=0,i=(y*width)*4+3;x<width;x++,i+=4){
    if(!rgba[i])continue;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
   }
  }
 });
 container.replaceChildren();
 if(right<left)return rows;
 for(const {profile,canvas} of rasters){
  const figure=document.createElement('figure'),caption=document.createElement('figcaption');
  caption.textContent=options.find(o=>o.value===profile)?.textContent??'元PNG';
  const crop=document.createElement('canvas');
  crop.width=right-left+1;crop.height=bottom-top+1;
  crop.getContext('2d').drawImage(canvas,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
  figure.append(caption,crop);container.append(figure);
 }
 return rows;
}
