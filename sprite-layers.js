export function spriteBounds(art,height,bottom=0){
 const width=height*art.box[2]/art.box[3];
 return {x:-width*(art.anchorX??.5),y:bottom-height,width,height};
}

const decoded=new WeakMap();
function rectangleBytes(grid){
 if(!decoded.has(grid))decoded.set(grid,Uint8Array.from(atob(grid.data),c=>c.charCodeAt(0)));
 return decoded.get(grid);
}
export function rectangleCount(grid){
 return grid.runs?grid.runs.length:rectangleBytes(grid).length/5;
}

export function paintSprite(ctx,art,image,bounds,profile){
 const {x,y,width,height}=bounds;
 if(!profile){
  ctx.drawImage(image,...art.box,x,y,width,height);
  return;
 }
 const grid=art.profiles[profile],{width:columns,height:rows,runs}=grid;
 const sx=width/columns,sy=height/rows;
 function draw(left,top,w,h,color){
  ctx.fillStyle=color;
  ctx.fillRect(x+left*sx,y+top*sy,w*sx+.05,h*sy+.05);
 }
 if(runs){
  for(const run of runs)draw(...run);
 }else{
  const bytes=rectangleBytes(grid);
  for(let i=0;i<bytes.length;i+=5)draw(bytes[i],bytes[i+1],bytes[i+2],bytes[i+3],grid.palette[bytes[i+4]]);
 }
}
