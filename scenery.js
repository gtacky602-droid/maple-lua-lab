// Prototype host scenery. Production will use the actual 3D scene behind Lua UI.
export const sceneryDefinitions={
 tulpaField:{file:'tulpa-field-background-v1.png',zones:['story:tulpa-field-grotto'],note:'潮影の洞の仮背景'},
 icewindField:{file:'icewind-field-background-v1.png',zones:['story:icewind-promenade','story:icewind-coppelia-field','story:icewind-coppelius-field'],note:'氷風組曲の舞台の仮背景'},
 legatusField:{file:'legatus-field-background-v1.png',zones:['story:nostoi-castle-approach','story:legatus-field-hall'],note:'色褪せた城の仮背景'},
 suanniField:{file:'suanni-field-background-v1.png',zones:['story:suanni-field-sanctum'],note:'懸練山の石庭の仮背景'},
 qucusaurField:{file:'qucusaur-field-background-v1.png',zones:['story:qucusaur-field-cavern'],note:'金焔の岩窟の仮背景'},
 generatorField:{file:'field-generator-field-background-v1.png',zones:['story:field-generator-field-chamber'],note:'重力試験室の仮背景'},
 seahorseField:{file:'seahorse-field-background-v1.png',zones:['story:seahorse-field-cavern'],note:'真珠珊瑚の洞の仮背景'},
 emperorField:{file:'emperor-field-background-v1.png',zones:['story:emperor-field-cove'],note:'熔殻の洞の仮背景'},
 baptistField:{file:'baptist-field-background-v1.png',zones:['story:baptist-field-sanctuary'],note:'三環の祭場の仮背景'},
 wenutField:{file:'wenut-field-background-v1.png',zones:['story:wenut-field-cavern'],note:'風蝕の砂洞の仮背景'},
 asimonField:{file:'asimon-field-background-v1.png',zones:['story:asimon-field-ruins'],note:'砂鏡の遺構の仮背景'},
 dendroHypostasisField:{file:'dendro-hypostasis-field-background-v1.png',zones:['story:dendro-hypostasis-field-den'],note:'枯蔓の洞の仮背景'},
 aeonblightField:{file:'aeonblight-field-background-v1.png',zones:['story:aeonblight-field-chamber'],note:'機翼の間の仮背景'},
 electroVineField:{file:'electro-regisvine-field-background-v1.png',zones:['story:electro-regisvine-field-cave'],note:'紫脈の石窟の仮背景'},
 bathysmalField:{file:'bathysmal-field-background-v1.png',zones:['story:bathysmal-field-sanctum'],note:'双影の石庭の仮背景'},
 ruinSerpentField:{file:'ruin-serpent-field-background-v1.png',zones:['story:ruin-serpent-field-pit'],note:'巨蛇岩穴の掘削場の仮背景'},
 wolflordField:{file:'wolflord-field-background-v1.png',zones:['story:wolflord-field-ruins'],note:'鶴観の霧浜遺跡の仮背景'},
 hydroHypostasisField:{file:'hydro-hypostasis-field-background-v1.png',zones:['story:hydro-hypostasis-field-cove'],note:'潮紋の洞の仮背景'},
 pyroHypostasisField:{file:'pyro-hypostasis-field-background-v1.png',zones:['story:pyro-hypostasis-field-terrace'],note:'燎火の石浜の仮背景'},
 cryoHypostasisField:{file:'cryo-hypostasis-field-background-v1.png',zones:['story:cryo-hypostasis-field-basin'],note:'霜輪の窪地の仮背景'},
 thunderField:{file:'thunder-field-background-v1.png',zones:['story:thunder-field-crest'],note:'雷鳴の岩峰の仮背景'},
 arrayField:{file:'array-field-background-v1.png',zones:['story:array-field-court'],note:'機巧の石庭の仮背景'},
 maguuField:{file:'maguu-field-background-v1.png',zones:['story:maguu-field-dojo'],note:'剣鬼の古庭の仮背景'},
 oceanidField:{file:'oceanid-field-background-v1.png',zones:['story:oceanid-field-reservoir'],note:'軽策の水鏡の仮背景'},
 primoField:{file:'primo-geovishap-field-background-v1.png',zones:['story:primo-field-vault'],note:'伏竜の石窟の仮背景'},
 geoField:{file:'geo-hypostasis-field-background-v1.png',zones:['story:geo-field-court'],note:'層石の円庭の仮背景'},
 pyroField:{file:'pyro-regisvine-field-background-v1.png',zones:['story:pyro-field-grotto'],note:'燠火の岩窟の仮背景'},
 electroField:{file:'electro-hypostasis-field-background-v1.png',zones:['story:electro-field-shelf'],note:'雷紋の岩棚の仮背景'},
 cryoField:{file:'cryo-regisvine-field-background-v1.png',zones:['story:cryo-field-grove'],note:'霜花の洞窟の仮背景'},
 mondroof:{file:'mond-rooftops-background-v1.png',zones:['story:mond-roof-route'],note:'赤い屋根と風車を見上げる仮背景'},
 mondlookout:{file:'mond-windmill-lookout-background-v1.png',zones:['story:mond-windmill-lookout'],note:'城門・草地・丘を見渡す仮背景'},
 windsplit:{file:'mond-windsplit-cave-background-v1.png',zones:['story:mond-bennett-ledge','story:mond-bennett-depth'],note:'風で入口が開いた石灰洞窟の仮背景'},
 mondrest:{file:'mond-roadside-rest-background-v1.png',zones:['story:mond-roadside-rest'],note:'木陰と街道を描いた休憩所の仮背景'},
 inazumatown:{file:'inazuma-castle-town-background-v1.png',zones:['story:inazuma-town'],note:'桜並木と港の夕方を描いた城下の仮背景'},
 seacave:{file:'inazuma-sea-cave-background-v1.png',zones:['story:inazuma-sea-cave'],note:'洞穴から夕暮れの海が見えるラボ仮背景'},
 shiomicape:{file:'inazuma-shiomi-cape-background-v1.png',zones:['story:inazuma-shiomi-cape'],note:'潮見の岬の夕景を描いたラボ仮背景'},
 toriiforest:{file:'inazuma-torii-forest-background-v1.png',zones:['story:inazuma-torii-footprints','story:inazuma-torii-statues','story:inazuma-torii-reflections','story:inazuma-torii-thicket'],note:'鎮守の森の色と鳥居を参照した共通の仮背景'},
 liyuequarry:{file:'liyue-quarry-background-v1.png',zones:['story:liyue-river-trail','story:liyue-cliff-planks','story:liyue-quarry-post','story:liyue-quarry-storage','story:liyue-book-camp'],note:'川沿い・桟道・石切り場・宝盗団の拠点で共用する仮背景'},
 mondrestored:{file:'mond-restored-road-background-v1.png',zones:['story:mond-restored-road'],clearedZones:['story:mond-watchtower'],note:'見張り討伐後の街道の仮画像'},
 mondhill:{file:'mond-hill-background-v1.png',region:null,zones:['story:mond-hill','story:mond-watchtower','story:anemo-field-basin'],note:'見張り台と赤い旗の試作構図'},
 chasm:{file:'chasm-background-v1.png',region:'層岩巨淵・地下鉱区',zones:[],note:'岩層や青い光を参照したラボ仮背景（坑道と足場は試作）'},
 wingspan:{file:'wingspan-background-v1.png',region:'翼の峰',zones:[],note:'巨龍の公式紹介を参照したラボ仮背景（地形・入口は試作）'},
 novokichev:{file:'novokichev-background-v1.png',region:'ノヴォキッチェヴ（仮構造）',zones:[],note:'地下探索路の仮画像（市街地・最深部の採用未確定）'},
 nodspecial:{file:'nodspecial-background-v1.png',region:'ナド・クライ特別地域（仮）',zones:[],note:'場所・構造未確定の独自案（月明かりの湖畔）'},
 dornman:{file:'dornman-background-v1.png',region:'ドーンマンポート',zones:[]},
 simulanka:{file:'simulanka-background-v1.png',region:'シムランカ',zones:[]},
 veluriyam:{file:'veluriyam-background-v1.png',region:'ヴェルーリヤ・ミラージュ',zones:[]},
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
const grayCrystal={image:new Image(),box:[382,175,762,667]};
grayCrystal.image.src='assets/tunigi-gray-crystal-source-v1.png';
const decorations=new Map([['tunigi-depth',[
 {art:grayCrystal,x:207,y:480,height:78},
 {art:grayCrystal,x:742,y:480,height:94,flip:true},
 {art:grayCrystal,x:1250,y:480,height:112},
]]]);
export const backgroundReady=Promise.all([
 ...Object.entries(sceneryDefinitions).map(async([key,definition])=>{const image=new Image();backgrounds[key]=image;backgroundStates[key]='loading';image.src='assets/'+definition.file;try{await image.decode();backgroundStates[key]=image.naturalWidth&&image.naturalHeight?'ready':'error'}catch{backgroundStates[key]='error'}}),
 grayCrystal.image.decode().catch(()=>{}), // An optional prop may be absent while its region remains playable.
]);
// Explicit prototype mappings; stale story state must not recolor unrelated lab fights.
export function sceneryKey(frame){
 const zone=frame.campaign?.zone;
 const location=zone==='town'&&frame.story?.active?'story:'+frame.story.node:zone;
 for(const [key,definition] of Object.entries(sceneryDefinitions))if(definition.zones.includes(location)||(frame.storyCleared&&definition.clearedZones?.includes(location)))return key;
 if(frame.story?.active&&(zone==='town'||zone?.startsWith('story:'))){
  const node=frame.storyGraph?.nodes?.find(n=>n.id===frame.story.node);
  for(const [key,definition] of Object.entries(sceneryDefinitions))if(definition.region&&node?.region===definition.region)return key;
 }
 return 'mondstadt';
}
export function sceneryStatus(frame){
 const key=sceneryKey(frame);return {key,file:sceneryDefinitions[key].file,state:backgroundStates[key]??'loading'};
}
function drawDecorations(ctx,frame,camera){
 const node=frame.story?.node,placements=decorations.get(node);
 if(!placements||!frame.story.active||frame.campaign?.zone!==`story:${node}`)return;
 ctx.imageSmoothingEnabled=false;
 for(const {art,x,y,height,flip} of placements){
  const {image,box}=art;
  if(!image.complete||!image.naturalWidth)continue;
  const width=height*box[2]/box[3],screenX=x-camera;
  if(screenX+width/2<=0||screenX-width/2>=960)continue;
  ctx.save();ctx.translate(screenX,y);
  if(flip)ctx.scale(-1,1);
  ctx.drawImage(image,...box,-width/2,-height,width,height);
  ctx.restore();
 }
}
export function scenery(ctx,frame){
 ctx.save();ctx.imageSmoothingEnabled=true;
 const key=sceneryKey(frame),background=backgrounds[key];
 if(background.complete&&background.naturalWidth){
  // The temporary image has only 200px of overscan. Stop its parallax at
  // either image edge even when the playable map extends farther.
  const w=1160,h=540,offset=Math.max(0,Math.min(1,(frame.camera||0)/1920))*(w-960);
  ctx.drawImage(background,-offset,0,w,h);
 }else{ctx.fillStyle='#c5decc';ctx.fillRect(0,0,960,540)}
 // Lab-only terrain proxies. These will be 3D set dressing and colliders in the game.
 const inazuma=key==='inazumatown'||key==='inazuma'||key==='toriiforest'||key==='shiomicape';
 const stone=['seacave','windsplit','cryoField','pyroField','electroField','geoField','primoField','oceanidField','maguuField','arrayField','thunderField','pyroHypostasisField','hydroHypostasisField','wolflordField','ruinSerpentField','bathysmalField','electroVineField','aeonblightField','dendroHypostasisField','baptistField','seahorseField','generatorField','tulpaField','icewindField','legatusField','suanniField','qucusaurField','enkanomiya','nodspecial','novokichev','chasm'].includes(key);
 const roof=key==='mondroof',lookout=key==='mondlookout',sandstone=['asimonField','wenutField','emperorField'].includes(key);
 const camera=frame.camera||0,snow=['snezhnaya','dragonspine','cryoHypostasisField','wingspan'].includes(key);
 drawDecorations(ctx,frame,camera);
 for(const p of frame.platforms||[]){
  const x=p.x-camera;if(x+p.w<0||x>960)continue;
  ctx.fillStyle=key==='bygone'?'#436c7b':key==='ochkanatlan'?'#687275':key==='tunigi'?'#94704f':key==='golden'?'#ad9064':sandstone?'#765540':stone?'#555d80':key==='voyage'?'#765641':roof?'#866058':lookout?'#776b61':snow?'#6f8197':key==='natlan'?'#a16646':key==='fontaine'?'#9c9b9e':key==='liyue'?'#887653':inazuma?'#686174':p.y===480?'#655c43':'#756d56';ctx.fillRect(x,p.y,p.w,p.y===480?60:24);
  ctx.fillStyle=key==='bygone'?'#92aea9':key==='ochkanatlan'?'#8d9b82':key==='tunigi'?'#bd966c':key==='golden'?'#d7b981':sandstone?'#ad7952':stone?'#858cab':key==='voyage'?'#ac8258':roof?'#b2846c':lookout?'#ab9e86':snow?'#c9dded':key==='fontaine'?'#bbbfc5':inazuma?'#697b79':'#508451';ctx.fillRect(x,p.y,p.w,7);ctx.fillStyle=key==='bygone'?'#e0d6a3':key==='ochkanatlan'?'#c7d0be':key==='tunigi'?'#ead2a0':key==='golden'?'#f7e3b1':sandstone?'#dfae73':stone?'#c4c8dd':key==='voyage'?'#d6b17a':roof?'#efbb94':lookout?'#dfcba6':snow?'#f1f7ff':key==='fontaine'?'#f0e9da':inazuma?'#c5bbd2':'#bed088';ctx.fillRect(x,p.y,p.w,2);
  ctx.fillStyle=key==='bygone'?'#b6baaa':key==='ochkanatlan'?'#a5ada5':key==='tunigi'?'#c2a17c':key==='golden'?'#dfc998':sandstone?'#886047':stone?'#949bb9':key==='voyage'?'#b69069':roof?'#ac796d':lookout?'#a19583':snow?'#a1b7cc':'#a09675';for(let n=0;n<p.w;n+=40){if(x+n>-40&&x+n<960)ctx.fillRect(x+n+5,p.y+11,27,5)}
 }
 ctx.restore();
}
