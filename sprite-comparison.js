const images=new Map();
export async function json(path){
 const res=await fetch(path);
 if(!res.ok)throw Error(path);
 return res.json();
}
export function sheet(file){
 if(!images.has(file)){
  const img=new Image();img.src='assets/'+file;
  images.set(file,img.decode().then(()=>img).catch(e=>{images.delete(file);throw e}));
 }
 return images.get(file);
}
export function paint(canvas,art,profile,img){
 const ctx=canvas.getContext('2d'),[,,w,h]=art.box;
 const scale=Math.min((canvas.width-16)/w,(canvas.height-12)/h);
 const x=(canvas.width-w*scale)/2,y=canvas.height-6-h*scale;
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
 if(!profile){ctx.drawImage(img,...art.box,x,y,w*scale,h*scale);return}
 const grid=art.profiles[profile],sx=w*scale/grid.width,sy=h*scale/grid.height;
 const bytes=Uint8Array.from(atob(grid.data),c=>c.charCodeAt(0));
 for(let i=0;i<bytes.length;i+=5){
  const left=Math.round(x+bytes[i]*sx),top=Math.round(y+bytes[i+1]*sy);
  ctx.fillStyle=grid.palette[bytes[i+4]];
  ctx.fillRect(left,top,Math.round(x+(bytes[i]+bytes[i+2])*sx)-left,Math.round(y+(bytes[i+1]+bytes[i+3])*sy)-top);
 }
 const rectangles=bytes.length/5;
 canvas.closest('figure').querySelector('small').textContent=grid.width+' × '+grid.height+' px・'+rectangles+'矩形';
 return rectangles;
}
