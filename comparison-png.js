export function downloadComparison({canvases,labels,title,stats,note,filename,crop,onError}){
 const image=document.createElement('canvas'),w=canvases[0].width,h=canvases[0].height;
 const margin=20,gap=12,top=88;
 image.width=2*margin+canvases.length*w+(canvases.length-1)*gap;image.height=top+h+64+(crop?166:0);
 const ctx=image.getContext('2d');
 ctx.fillStyle='#102b33';ctx.fillRect(0,0,image.width,image.height);
 ctx.fillStyle='#e3f4f4';ctx.font='bold 26px "Yu Gothic UI", sans-serif';
 ctx.fillText(title,margin,36);
 ctx.font='18px "Yu Gothic UI", sans-serif';
 for(const [i,c] of canvases.entries()){
  const x=margin+i*(w+gap);
  ctx.fillStyle='#e3f4f4';ctx.fillText(labels[i],x,top-10);
  ctx.fillStyle='#26454b';ctx.fillRect(x,top,w,h);
  ctx.drawImage(c,x,top);
  if(crop){
   ctx.strokeStyle='#eef3cb';ctx.lineWidth=1;
   ctx.strokeRect(x+crop.x-.5,top+crop.y-.5,crop.size+1,crop.size+1);
   const cy=top+h+12,cx=x+Math.floor((w-144)/2);
   ctx.fillStyle='#26454b';ctx.fillRect(cx,cy,144,144);ctx.imageSmoothingEnabled=false;
   ctx.drawImage(c,crop.x,crop.y,crop.size,crop.size,cx,cy,144,144);
  }
 }
 ctx.fillStyle='#e3f4f4';ctx.font='16px "Yu Gothic UI", sans-serif';
 ctx.fillText(stats,margin,image.height-39,image.width-2*margin);
 ctx.fillText(note,margin,image.height-14,image.width-2*margin);
 image.toBlob(blob=>{
  if(!blob){onError();return}
  const link=document.createElement('a'),url=URL.createObjectURL(blob);
  link.download=filename;link.href=url;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 },'image/png');
}
