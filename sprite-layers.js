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
export function rectangleCount(grid){
 return grid.runs?grid.runs.length:rectangleBytes(grid).length/(grid.wide?9:5);
}
export function packedGeometrySize(grid){
 return rectangleBytes(grid).byteLength;
}

export function paintSprite(ctx,art,image,bounds,profile){
 const {x,y,width,height}=bounds;
 if(!profile){
  ctx.drawImage(image,...art.box,x,y,width,height);
  return;
 }
 paintRectangleGrid(ctx,art.profiles[profile],bounds,.05);
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

export function openingRects(ctx,grid,bounds,x,y,flip,clip,paint){
 const left=x+(flip?-bounds.x-bounds.width:bounds.x);
 const top=y+bounds.y;
 let count=0;
 forEachRectangle(grid,(column,row,w,h,color)=>{
  const rx=left+(flip?grid.width-column-w:column)*bounds.width/grid.width;
  const ry=top+row*bounds.height/grid.height;
  const rw=w*bounds.width/grid.width+.05,rh=h*bounds.height/grid.height+.05;
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
  if(grid.wide){
   const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   for(let i=0;i<bytes.length;i+=9)draw(view.getUint16(i,true),view.getUint16(i+2,true),view.getUint16(i+4,true),view.getUint16(i+6,true),grid.palette[bytes[i+8]]);
  }else{
   for(let i=0;i<bytes.length;i+=5)draw(bytes[i],bytes[i+1],bytes[i+2],bytes[i+3],grid.palette[bytes[i+4]]);
  }
 }
}
