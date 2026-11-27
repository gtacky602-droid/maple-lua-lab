export function spriteBounds(art,height,bottom=0){
 const width=height*art.box[2]/art.box[3];
 return {x:-width*(art.anchorX??.5),y:bottom-height,width,height};
}

const decoded=new WeakMap();
function rectangleBytes(grid){
 const geometry=grid.geometry??grid;
 if(!decoded.has(geometry))decoded.set(geometry,Uint8Array.from(atob(geometry.data),c=>c.charCodeAt(0)));
 return decoded.get(geometry);
}
function recordStride(grid){
 if(grid.planarXY16)return 7;
 return grid.wide?9:5;
}
export function rectangleCount(grid){
 return grid.runs?grid.runs.length:rectangleBytes(grid).length/recordStride(grid);
}
export function packedGeometrySize(grid){
 return rectangleBytes(grid).byteLength;
}

export function bodyRow(row,height,band){
 if(band==null)return row;
 const cut=height*.28;
 return row<=cut?row*(band/.28):height*band+(row-cut)*((1-band)/.72);
}

export function paintBandedSprite(ctx,image,box,x,y,w,h,band){
 if(band==null){
  ctx.drawImage(image,...box,x,y,w,h);
  return 1;
 }
 const [left,top,cols,rows]=box;
 const cut=Math.round(rows*.28),head=h*band;
 ctx.drawImage(image,left,top,cols,cut,x,y,w,head);
 ctx.drawImage(image,left,top+cut,cols,rows-cut,x,y+head,w,h-head);
 return 2;
}

export function paintSprite(ctx,art,image,bounds,profile,palettePixels=false){
 const {x,y,width,height}=bounds;
 if(!profile){
  paintBandedSprite(ctx,image,art.box,x,y,width,height,art.bodyBand);
  return;
 }
 if(palettePixels)paintPalettePixels(ctx,art.profiles[profile],bounds);
 else paintRectangleGrid(ctx,art.profiles[profile],bounds,.05);
}

// Reconstruct the palette grid at integer coordinates before scaling the whole sprite.
const paletteCanvases=new WeakMap();
function paintPalettePixels(ctx,grid,{x,y,width,height}){
 let canvas=paletteCanvases.get(grid);
 if(!canvas){
  canvas=document.createElement('canvas');
  canvas.width=grid.width;canvas.height=grid.height;
  paintRectangleGrid(canvas.getContext('2d'),grid,{x:0,y:0,width:grid.width,height:grid.height});
  paletteCanvases.set(grid,canvas);
 }
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(canvas,x,y,width,height);ctx.restore();
}

export function paintRectangleGrid(ctx,grid,{x,y,width,height},overlap=0){
 const {width:columns,height:rows}=grid;
 const sx=width/columns,sy=height/rows;
 function draw(left,top,w,h,color){
  ctx.fillStyle=color;
  ctx.fillRect(x+left*sx,y+top*sy,w*sx+overlap,h*sy+overlap);
 }
 forEachRectangle(grid,draw);
}

export function openingRects(ctx,grid,bounds,x,y,flip,clip,paint,band){
 const left=x+(flip?-bounds.x-bounds.width:bounds.x);
 const top=y+bounds.y;
 let count=0;
 forEachRectangle(grid,(column,row,w,h,color)=>{
  const rx=left+(flip?grid.width-column-w:column)*bounds.width/grid.width;
  const start=bodyRow(row,grid.height,band);
  const height=band==null?h:bodyRow(row+h,grid.height,band)-start;
  const ry=top+start*bounds.height/grid.height;
  const rw=w*bounds.width/grid.width+.05,rh=height*bounds.height/grid.height+.05;
  if(clip && (rx>=ctx.canvas.width+1 || rx+rw<=-1 || ry>=ctx.canvas.height+1 || ry+rh<=-1))return;
  if(paint){ctx.fillStyle=color;ctx.fillRect(rx,ry,rw,rh)}
  count++;
 });
 return count;
}

export function forEachRectangle(grid,draw){
 if(grid.runs){
  for(const run of grid.runs)draw(...run);
 }else{
  const bytes=rectangleBytes(grid);
  if(grid.planarXY16){
   const count=bytes.length/7;
   for(let i=0;i<count;i++){
    const x=bytes[i]+256*bytes[count+i],y=bytes[2*count+i]+256*bytes[3*count+i];
    draw(x,y,bytes[4*count+i],bytes[5*count+i],grid.palette[bytes[6*count+i]]);
   }
  }else if(grid.wide){
   const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   for(let i=0;i<bytes.length;i+=9)draw(view.getUint16(i,true),view.getUint16(i+2,true),view.getUint16(i+4,true),view.getUint16(i+6,true),grid.palette[bytes[i+8]]);
  }else{
   for(let i=0;i<bytes.length;i+=5)draw(bytes[i],bytes[i+1],bytes[i+2],bytes[i+3],grid.palette[bytes[i+4]]);
  }
 }
}

// Five chest-target rectangles from weekly-shouki.lua, anchored to the machine's waist.
export function drawShoukiCore(ctx,box,height,x,floor,sourceY,exposed){
 const y=floor-height*(box[1]+box[3]-sourceY)/box[3];
 ctx.save();ctx.fillStyle=exposed?'#b9f2a9':'#caa3fc';
 ctx.globalAlpha=.22;ctx.fillRect(x-18,y-19,36,38);ctx.globalAlpha=1;
 ctx.fillRect(x-19,y-21,38,4);ctx.fillRect(x-19,y+17,38,4);
 ctx.fillRect(x-21,y-17,4,34);ctx.fillRect(x+17,y-17,4,34);ctx.restore();
}
