import {forEachRectangle} from './sprite-layers.js';

// Sample the eyes and fringe from the source at 88px, keeping the shipped palette.
export function travelerFaceCandidate(art,image,side){
 const grid=art.profiles.h32c16,scale=88/grid.height;
 const width=grid.width*scale,height=grid.height*scale;
 const box=side==='left'?[6,18,31,39]:[49,18,75,39];
 const [left,top,right,bottom]=box,runs=[],palette=new Set();
 forEachRectangle(grid,(x,y,w,h,color)=>{
  palette.add(color);
  x*=scale;y*=scale;w*=scale;h*=scale;
  const l=Math.max(x,left),r=Math.min(x+w,right),t=Math.max(y,top),b=Math.min(y+h,bottom);
  if(l>=r||t>=b){runs.push([x,y,w,h,color]);return}
  if(y<t)runs.push([x,y,w,t-y,color]);
  if(b<y+h)runs.push([x,b,w,y+h-b,color]);
  if(x<l)runs.push([x,t,l-x,b-t,color]);
  if(r<x+w)runs.push([r,t,x+w-r,b-t,color]);
 });
 const raster=document.createElement('canvas');raster.width=width;raster.height=height;
 const ctx=raster.getContext('2d');ctx.imageSmoothingEnabled=false;
 ctx.drawImage(image,...art.box,0,0,width,height);
 const colors=[...palette].map(hex=>({hex,r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)}));
 const pixels=ctx.getImageData(left,top,right-left,bottom-top).data;
 const rows=[];
 for(let y=top;y<bottom;y++){
  const row=[];
  for(let x=left;x<right;x++){
   const i=((y-top)*(right-left)+x-left)*4;
   if(pixels[i+3]<128){row.push(null);continue}
   let distance=Infinity,nearest;
   for(const c of colors){
    const d=(pixels[i]-c.r)**2+(pixels[i+1]-c.g)**2+(pixels[i+2]-c.b)**2;
    if(d<distance){distance=d;nearest=c.hex}
   }
   row.push(nearest);
  }
  rows.push(row);
 }
 runs.push(...coverFacePixels(rows,left,top));
 return {...art,profiles:{...art.profiles,h32c16:{width,height,runs,colors:palette.size}}};
}

// Each candidate covers exactly the same opaque palette pixels. Keep the shorter list.
function coverFacePixels(rows,left,top){
 function cover(columns){
  const span=columns?rows.length:rows[0].length;
  const lines=columns?rows[0].length:rows.length;
  const rectangles=[];
  let previous=new Map();
  for(let line=0;line<lines;line++){
   const current=new Map();
   for(let start=0;start<span;){
    const color=columns?rows[start][line]:rows[line][start];
    let end=start+1;
    while(end<span&&(columns?rows[end][line]:rows[line][end])===color)end++;
    if(color){
     const key=[start,end,color].join(','),prior=previous.get(key);
     const rect=prior??(columns?[left+line,top+start,1,end-start,color]:[left+start,top+line,end-start,1,color]);
     if(prior)rect[columns?2:3]++;
     else rectangles.push(rect);
     current.set(key,rect);
    }
    start=end;
   }
   previous=current;
  }
  return rectangles;
 }
 const remaining=rows.map(row=>row.slice()),blocks=[];
 for(let y=0;y<rows.length;y++){
  for(let x=0;x<rows[y].length;x++){
   const color=remaining[y][x];
   if(!color)continue;
   let width=rows[y].length-x,bestWidth=1,bestHeight=1;
   for(let end=y;end<rows.length&&remaining[end][x]===color;end++){
    let w=1;
    while(w<width&&remaining[end][x+w]===color)w++;
    width=w;
    const height=end-y+1;
    if(width*height>=bestWidth*bestHeight){bestWidth=width;bestHeight=height}
   }
   blocks.push([left+x,top+y,bestWidth,bestHeight,color]);
   for(let yy=y;yy<y+bestHeight;yy++)remaining[yy].fill(null,x,x+bestWidth);
  }
 }
 // Colors never overlap, so each can use its cheapest exact cover independently.
 const options=[cover(false),cover(true),blocks],result=[];
 for(const color of new Set(blocks.map(rect=>rect[4]))){
  const choices=options.map(rects=>rects.filter(rect=>rect[4]===color));
  result.push(...choices.reduce((best,next)=>next.length<best.length?next:best));
 }
 return result;
}
