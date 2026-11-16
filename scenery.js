// Prototype host scenery. Production will use the actual 3D scene behind Lua UI.
export const sceneryDefinitions={
 mondstadt:{file:'mondstadt-background.png',region:'モンド',zones:[]},
 liyue:{file:'liyue-background-v1.png',region:'璃月',zones:['geo','oceanid','primo','pyro_regisvine']},
 inazuma:{file:'inazuma-background-v1.png',region:'稲妻',zones:['thunder','array','maguu']},
 fontaine:{file:'fontaine-background-v1.png',region:'フォンテーヌ',zones:[]},
 natlan:{file:'natlan-background-v1.png',region:'ナタ',zones:[]},
 sumeru:{file:'sumeru-background-v1.png',region:'スメール',zones:[]}
};
const backgrounds={};
export const backgroundReady=Promise.all(Object.entries(sceneryDefinitions).map(async([key,definition])=>{const image=new Image();backgrounds[key]=image;image.src='assets/'+definition.file;await image.decode().catch(()=>{});}));
// Explicit prototype mappings; stale story state must not recolor unrelated lab fights.
export function sceneryKey(frame){
 const zone=frame.campaign?.zone;
 for(const [key,definition] of Object.entries(sceneryDefinitions))if(definition.zones.includes(zone))return key;
 if(frame.story?.active&&(zone==='town'||zone?.startsWith('story:'))){
  const node=frame.storyGraph?.nodes?.find(n=>n.id===frame.story.node);
  for(const [key,definition] of Object.entries(sceneryDefinitions))if(node?.region===definition.region)return key;
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
  ctx.fillStyle=key==='natlan'?'#a16646':key==='fontaine'?'#9c9b9e':key==='liyue'?'#887653':key==='inazuma'?'#686174':p.y===480?'#655c43':'#756d56';ctx.fillRect(x,p.y,p.w,p.y===480?60:24);
  ctx.fillStyle=key==='fontaine'?'#bbbfc5':key==='inazuma'?'#697b79':'#508451';ctx.fillRect(x,p.y,p.w,7);ctx.fillStyle=key==='fontaine'?'#f0e9da':key==='inazuma'?'#c5bbd2':'#bed088';ctx.fillRect(x,p.y,p.w,2);
  ctx.fillStyle='#a09675';for(let n=0;n<p.w;n+=40){if(x+n>-40&&x+n<960)ctx.fillRect(x+n+5,p.y+11,27,5)}
 }
 ctx.restore();
}
