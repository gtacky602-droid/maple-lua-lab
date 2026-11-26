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
 let previous=new Map();
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
  const current=new Map();
  for(let x=0;x<row.length;){
   let end=x+1;
   while(end<row.length&&row[end]===row[x])end++;
   if(row[x]){
    const key=[x,end,row[x]].join(','),prior=previous.get(key);
    const run=prior??[left+x,y,end-x,1,row[x]];
    if(prior)run[3]++;else runs.push(run);
    current.set(key,run);
   }
   x=end;
  }
  previous=current;
 }
 return {...art,profiles:{...art.profiles,h32c16:{width,height,runs,colors:palette.size}}};
}
