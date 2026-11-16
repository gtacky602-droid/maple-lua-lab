// Prototype host scenery. Production will use the actual 3D scene behind Lua UI.
const background=new Image();background.src='assets/mondstadt-background.png';
export const backgroundReady=background.decode().catch(()=>{});
export function scenery(ctx,frame){
 ctx.save();ctx.imageSmoothingEnabled=true;
 if(background.complete&&background.naturalWidth){
  const w=1160,h=540,offset=(frame.camera||0)/1920*(w-960);
  ctx.drawImage(background,-offset,0,w,h);
 }else{ctx.fillStyle='#c5decc';ctx.fillRect(0,0,960,540)}
 // Lab-only terrain proxies. These will be 3D set dressing and colliders in the game.
 const camera=frame.camera||0;
 for(const p of frame.platforms||[]){
  const x=p.x-camera;if(x+p.w<0||x>960)continue;
  ctx.fillStyle=p.y===480?'#655c43':'#756d56';ctx.fillRect(x,p.y,p.w,p.y===480?60:24);
  ctx.fillStyle='#508451';ctx.fillRect(x,p.y,p.w,7);ctx.fillStyle='#bed088';ctx.fillRect(x,p.y,p.w,2);
  ctx.fillStyle='#a09675';for(let n=0;n<p.w;n+=40){if(x+n>-40&&x+n<960)ctx.fillRect(x+n+5,p.y+11,27,5)}
 }
 ctx.restore();
}
