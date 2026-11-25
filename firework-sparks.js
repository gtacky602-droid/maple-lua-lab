import {combatOpacity} from './sprite-images.js';

export function drawFireworkSparks(ctx,batch){
 const {points,styles,glow,bright}=batch;
 for(let i=0;i<points.length;i+=3){
  const x=points[i],y=points[i+1];
  const [size,alpha]=styles[points[i+2]-1];
  ctx.globalAlpha=combatOpacity({opacity:alpha*.55});
  ctx.fillStyle=glow;
  ctx.fillRect(x-size,y-size,size*2,size*2);
  ctx.globalAlpha=combatOpacity({opacity:alpha});
  ctx.fillStyle=bright;
  ctx.fillRect(x-size/2,y-size/2,size,size);
 }
 return 2*points.length/3;
}
