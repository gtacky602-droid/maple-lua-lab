export function spriteBounds(art,height,bottom=0){
 const width=height*art.box[2]/art.box[3];
 return {x:-width*(art.anchorX??.5),y:bottom-height,width,height};
}

export function paintSprite(ctx,art,image,bounds,profile){
 const {x,y,width,height}=bounds;
 if(!profile){
  ctx.drawImage(image,...art.box,x,y,width,height);
  return;
 }
 const {width:columns,height:rows,runs}=art.profiles[profile];
 const sx=width/columns,sy=height/rows;
 for(const [left,top,w,h,color] of runs){
  ctx.fillStyle=color;
  ctx.fillRect(x+left*sx,y+top*sy,w*sx+.05,h*sy+.05);
 }
}
