// Prototype host scenery. Production will use the actual 3D scene behind Lua UI.
export const sceneryDefinitions={
 golden:{file:'golden-background-v1.png',region:'金リンゴ群島',zones:[]},
 tunigi:{file:'tunigi-background-v1.png',region:'トゥニギの黒淵',zones:[]},
 ochkanatlan:{file:'ochkanatlan-background-v1.png',region:'オシカ・ナタ',zones:[]},
 bygone:{file:'bygone-background-v1.png',region:'往日の海',zones:[]},
 enkanomiya:{file:'enkanomiya-background-v1.png',region:'淵下宮',zones:[]},
 chenyu:{file:'chenyu-background-v1.png',region:'沈玉の谷',zones:[]},
 dragonspine:{file:'dragonspine-background-v1.png',region:'ドラゴンスパイン',zones:[]},
 voyage:{file:'voyage-background-v1.png',region:'航路',zones:[]},
 snezhnaya:{file:'snezhnaya-background-v1.png',region:'スネージナヤ',zones:[]},
 nodkrai:{file:'nodkrai-background-v1.png',region:'ナド・クライ',zones:[]},
 mondstadt:{file:'mondstadt-background.png',region:'モンド',zones:[]},
 liyue:{file:'liyue-background-v1.png',region:'璃月',zones:['geo','oceanid','primo','pyro_regisvine']},
 inazuma:{file:'inazuma-background-v1.png',region:'稲妻',zones:['thunder','array','maguu']},
 fontaine:{file:'fontaine-background-v1.png',region:'フォンテーヌ',zones:[]},
 natlan:{file:'natlan-background-v1.png',region:'ナタ',zones:[]},
 sumeru:{file:'sumeru-background-v1.png',region:'スメール',zones:[]}
};
const backgrounds={},backgroundStates={};
export const backgroundReady=Promise.all(Object.entries(sceneryDefinitions).map(async([key,definition])=>{const image=new Image();backgrounds[key]=image;backgroundStates[key]='loading';image.src='assets/'+definition.file;try{await image.decode();backgroundStates[key]=image.naturalWidth&&image.naturalHeight?'ready':'error'}catch{backgroundStates[key]='error'}}));
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
export function sceneryStatus(frame){
 const key=sceneryKey(frame);return {key,file:sceneryDefinitions[key].file,state:backgroundStates[key]??'loading'};
}
export function scenery(ctx,frame){
 ctx.save();ctx.imageSmoothingEnabled=true;
 const key=sceneryKey(frame),background=backgrounds[key];
 if(background.complete&&background.naturalWidth){
  const w=1160,h=540,offset=(frame.camera||0)/1920*(w-960);
  ctx.drawImage(background,-offset,0,w,h);
 }else{ctx.fillStyle='#c5decc';ctx.fillRect(0,0,960,540)}
 // Lab-only terrain proxies. These will be 3D set dressing and colliders in the game.
 const camera=frame.camera||0,snow=key==='snezhnaya'||key==='dragonspine';
 for(const p of frame.platforms||[]){
  const x=p.x-camera;if(x+p.w<0||x>960)continue;
  ctx.fillStyle=key==='bygone'?'#436c7b':key==='ochkanatlan'?'#687275':key==='tunigi'?'#94704f':key==='golden'?'#ad9064':key==='enkanomiya'?'#555d80':key==='voyage'?'#765641':snow?'#6f8197':key==='natlan'?'#a16646':key==='fontaine'?'#9c9b9e':key==='liyue'?'#887653':key==='inazuma'?'#686174':p.y===480?'#655c43':'#756d56';ctx.fillRect(x,p.y,p.w,p.y===480?60:24);
  ctx.fillStyle=key==='bygone'?'#92aea9':key==='ochkanatlan'?'#8d9b82':key==='tunigi'?'#bd966c':key==='golden'?'#d7b981':key==='enkanomiya'?'#858cab':key==='voyage'?'#ac8258':snow?'#c9dded':key==='fontaine'?'#bbbfc5':key==='inazuma'?'#697b79':'#508451';ctx.fillRect(x,p.y,p.w,7);ctx.fillStyle=key==='bygone'?'#e0d6a3':key==='ochkanatlan'?'#c7d0be':key==='tunigi'?'#ead2a0':key==='golden'?'#f7e3b1':key==='enkanomiya'?'#c4c8dd':key==='voyage'?'#d6b17a':snow?'#f1f7ff':key==='fontaine'?'#f0e9da':key==='inazuma'?'#c5bbd2':'#bed088';ctx.fillRect(x,p.y,p.w,2);
  ctx.fillStyle=key==='bygone'?'#b6baaa':key==='ochkanatlan'?'#a5ada5':key==='tunigi'?'#c2a17c':key==='golden'?'#dfc998':key==='enkanomiya'?'#949bb9':key==='voyage'?'#b69069':snow?'#a1b7cc':'#a09675';for(let n=0;n<p.w;n+=40){if(x+n>-40&&x+n<960)ctx.fillRect(x+n+5,p.y+11,27,5)}
 }
 ctx.restore();
}
