// Prototype host scenery. Production will use the actual 3D scene behind Lua UI.
const backgrounds={};
export const backgroundReady=Promise.all(Object.entries({mondstadt:'mondstadt-background.png',inazuma:'inazuma-background-v1.png',liyue:'liyue-background-v1.png'}).map(async([key,file])=>{const image=new Image();backgrounds[key]=image;image.src='assets/'+file;await image.decode().catch(()=>{});}));
// Explicit prototype mappings. Do not infer a region from stale story state in a lab fight.
export function sceneryKey(frame){
 const zone=frame.campaign?.zone;
 if(['thunder','array','maguu'].includes(zone))return 'inazuma';
 if(['geo','oceanid','primo','pyro_regisvine'].includes(zone))return 'liyue';
 if(frame.story?.active&&(zone==='town'||zone?.startsWith('story:'))){
  const node=frame.storyGraph?.nodes?.find(n=>n.id===frame.story.node);
  if(node?.region==='稲妻')return 'inazuma';
  if(node?.region==='璃月')return 'liyue';
 }
 return 'mondstadt';
}
export function scenery(ctx,frame){
 ctx.save();ctx.imageSmoothingEnabled=true;
 const key=sceneryKey(frame),background=backgrounds[key];
 if(background.complete&&background.naturalWidth){
  const w=1160,h=540,offset=(frame.camera||0)/1920*(w-960);
  ctx.drawImage(background,-offset,0,w,h);
 }else{ctx.fillStyle='#c5decc';ctx.fillRect(0,0,960,540)}
 // Lab-only terrain proxies. These will be 3D set dressing and colliders in the game.
 const camera=frame.camera||0;
 for(const p of frame.platforms||[]){
  const x=p.x-camera;if(x+p.w<0||x>960)continue;
  ctx.fillStyle=key==='liyue'?'#887653':key==='inazuma'?'#686174':p.y===480?'#655c43':'#756d56';ctx.fillRect(x,p.y,p.w,p.y===480?60:24);
  ctx.fillStyle=key==='inazuma'?'#697b79':'#508451';ctx.fillRect(x,p.y,p.w,7);ctx.fillStyle=key==='inazuma'?'#c5bbd2':'#bed088';ctx.fillRect(x,p.y,p.w,2);
  ctx.fillStyle='#a09675';for(let n=0;n<p.w;n+=40){if(x+n>-40&&x+n<960)ctx.fillRect(x+n+5,p.y+11,27,5)}
 }
 ctx.restore();
}
