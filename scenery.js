// Prototype host scenery. Production will use the actual 3D scene behind Lua UI.
export const sceneryDefinitions={
 tulpaField:{file:'tulpa-field-background-v1.png',zones:['story:tulpa-field-grotto'],note:'潮影の洞の仮背景'},
 icewindField:{file:'icewind-field-background-v1.png',zones:['story:icewind-promenade','story:icewind-coppelia-field','story:icewind-coppelius-field'],note:'氷風組曲の舞台の仮背景'},
 legatusField:{file:'legatus-field-background-v1.png',zones:['story:nostoi-castle-approach','story:legatus-field-hall'],note:'色褪せた城の仮背景'},
 suanniField:{file:'suanni-field-background-v1.png',zones:['story:suanni-field-sanctum'],note:'懸練山の石庭の仮背景'},
 qucusaurField:{file:'qucusaur-field-background-v1.png',zones:['story:qucusaur-field-cavern'],note:'金焔の岩窟の仮背景'},
 yumkaField:{file:'yumka-field-background-v1.png',zones:['story:yumka-field-ravine'],note:'山王の峡谷の仮背景'},
 configDeviceField:{file:'config-device-field-background-v1.png',zones:['story:config-device-field-workshop'],note:'秘源の機構室の仮背景'},
 papillaField:{file:'papilla-field-background-v1.png',zones:['story:papilla-field-hollow'],note:'紫影の石窟の仮背景'},
 lavaDragonField:{file:'lava-dragon-field-background-v1.png',zones:['story:atocpan-lava-field'],note:'アトクパンの溶岩棚の仮背景'},
 overseerField:{file:'overseer-field-background-v1.png',zones:['story:atocpan-overseer-ruin'],note:'統御の遺構の仮背景'},
 duckleField:{file:'knuckle-duckle-field-background-v1.png',zones:['story:nod-duckle-workyard'],note:'工房裏の試運転場の仮背景'},
 battleshipField:{file:'battleship-field-background-v1.png',zones:['story:nod-battleship-depot'],note:'陸巡艦の整備庫の仮背景'},
 herraField:{file:'frostnight-herra-field-background-v1.png',zones:['story:nod-herra-terrace'],note:'霜夜の石壇の仮背景'},
 nightmareField:{file:'whisperer-nightmares-field-background-v1.png',zones:['story:nod-nightmare-shore'],note:'煙雲の山の昏き浜の仮背景'},
 moonflyField:{file:'moonfly-field-background-v1.png',zones:['story:nod-moonfly-hollow'],note:'幻月蝶の岩窟の仮背景'},
 moongeckoField:{file:'moongecko-field-background-v1.png',zones:['story:nod-gecko-depths'],note:'波追いの峠の月石洞の仮背景'},
 spiritspeakerField:{file:'spiritspeaker-field-background-v1.png',zones:['story:spiritspeaker-field-grotto'],note:'謎煙の修練窟の仮背景'},
 vigilField:{file:'fallen-vigil-field-background-v1.png',zones:['story:windrest-vigil-court'],note:'風息山の石庭の仮背景'},
 flugelField:{file:'flugel-field-background-v1.png',zones:['story:flugel-tundra-basin'],note:'古獣の氷原の西谷の仮背景'},
 driftingSnowField:{file:'drifting-snow-field-background-v1.png',zones:['story:drifting-snow-court'],note:'氷冠の雪庭の仮背景'},
 immortalConstructField:{file:'immortal-construct-field-background-v1.png',zones:['story:immortal-construct-root-hollow'],note:'赤葉の根洞の仮背景'},
 wavebinderField:{file:'wavebinder-field-background-v1.png',zones:['story:wavebinder-tide-cavern'],note:'西港の潮洞の仮背景'},
 dawnVein:{file:'dawn-vein-background-v1.png',zones:['story:dawn-vein-mine', 'story:dawn-vein-deep'],note:'星脈坑の仮背景'},
 dawnGlass:{file:'dawn-glass-background-v1.png',zones:['story:dawn-glass-ridge', 'story:dawn-glass-divide', 'story:dawn-crystal-field'],note:'暁晶尾根の仮背景'},
 ochkaCliff:{file:'ochka-cliff-background-v1.png',zones:['story:ochka-tide-stairs', 'story:ochka-patched-court'],note:'寄港地奥の仮背景'},
 ochkaKiln:{file:'ochka-kiln-background-v1.png',zones:['story:ochka-sifting-kiln'],note:'選鉱室の仮背景'},
 auroraGlass:{file:'aurora-glass-background-v1.png',zones:['story:aurora-ice-cut', 'story:aurora-ice-shelf'],note:'極光谷の仮背景'},
 thermalRavine:{file:'thermal-ravine-background-v1.png',zones:['story:aurora-steam-channel', 'story:aurora-mineral-terraces'],note:'湯気谷の仮背景'},
 coastalLookout:{file:'coastal-lookout-background-v1.png',zones:['story:dornman-wind-stairs', 'story:dornman-flag-trestle'],note:'港の高台と渡り廊下の仮背景'},
 windwardWorks:{file:'windward-works-background-v1.png',zones:['story:dornman-windworks'],note:'機関室の仮背景'},
 whitePassSnow:{file:'white-pass-wood-background-v1.png',zones:['story:winter-frontier-switchback', 'story:white-pass-cut', 'story:white-pass-woods', 'story:white-pass-ridge'],note:'白虹峠へ続く雪道の仮背景'},
 whitePassCoach:{file:'white-pass-coach-background-v1.png',zones:['story:white-pass-coach'],note:'列車内の仮背景'},
 whitePassStation:{file:'steam-stabling-depot-background-v1.png',zones:['story:white-pass-station'],note:'終着駅の共用仮背景'},
 whiteRainbowBasin:{file:'white-rainbow-background-v1.png',zones:['story:white-rainbow-basin'],note:'高原の仮背景'},
 snowRailTransfer:{file:'snow-rail-transfer-background-v1.png',zones:['story:snow-rail-transfer'],note:'雪線の積替場の仮背景'},
 steamStablingDepot:{file:'steam-stabling-depot-background-v1.png',zones:['story:steam-stabling-depot'],note:'蒸気留置庫の仮背景'},
 clothService:{file:'cloth-service-walk-background-v1.png',zones:['story:cloth-service-walk'],note:'作業路の仮背景'},
 threadlineRelay:{file:'threadline-relay-background-v1.png',zones:['story:threadline-relay'],note:'配電室の仮背景'},
 buriedWeaving:{file:'buried-weaving-background-v1.png',zones:['story:buried-weaving-room'],note:'織房の仮背景'},
 tideCalibration:{file:'tide-calibration-background-v1.png',zones:['story:tide-calibration-hall'],note:'潮位較正室の仮背景'},
 andriusWeekly:{file:'andrius-weekly-background-v1.png',zones:['story:andrius-wolf-ring'],note:'狼の領の仮背景'},
 dvalinWeekly:{file:'dvalin-weekly-background-v1.png',zones:['story:dvalin-sky-arena'],note:'風龍の空域の仮背景'},
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
 mirageTrack:{file:'mirage-track-background-v1.png',zones:['story:veluriyam-trolley-out','story:veluriyam-trolley-back','story:veluriyam-petal-stop','story:veluriyam-rail-end','story:veluriyam-petal-lookout']},
 veluriyam:{file:'veluriyam-background-v1.png',region:'ヴェルーリヤ・ミラージュ',zones:[]},
 goldenDock:{file:'golden-dock-background-v1.png',zones:['story:golden-mainland-coast'],note:'小舟の桟橋の仮背景'},
 goldenGrotto:{file:'golden-grotto-background-v1.png',zones:['story:golden-shadow-grotto','story:golden-tide-pocket'],note:'小洞窟と小浜の仮背景'},
 golden:{file:'golden-background-v1.png',region:'金リンゴ群島',zones:[]},
 tunigiExcavation:{file:'tunigi-excavation-background-v1.png',zones:['story:tunigi-vent-shelf','story:tunigi-baffle-workshop','story:tunigi-elite-passage','story:tunigi-fragment-vault','story:tunigi-return-shelter']},
 tunigi:{file:'tunigi-background-v1.png',region:'トゥニギの黒淵',zones:[]},
 ochkanatlan:{file:'ochkanatlan-background-v1.png',region:'オシカ・ナタ',zones:[]},
 bygoneResonance:{file:'bygone-resonance-background-v1.png',zones:['story:bygone-resonance-chamber','story:bygone-inscribed-hall','story:bygone-listening-gallery','story:bygone-bell-archive'],note:'共鳴石と記録室の仮背景'},
 bygone:{file:'bygone-background-v1.png',region:'往日の海',zones:[]},
 enkanLampDark:{file:'enkan-lamp-chamber-dark-v1.png',region:null,zones:['story:enkan-lamp-chamber'],lightMode:'dark',note:'消灯した灯室の仮背景'},
 enkanLamp:{file:'enkan-lamp-chamber-background-v1.png',region:null,zones:['story:enkan-lamp-chamber','story:enkan-route-gallery'],note:'局所の灯室と小間の仮背景'},
 enkanomiya:{file:'enkanomiya-background-v1.png',region:'淵下宮',zones:[]},
 chenyuPavilion:{file:'chenyu-tea-pavilion-background-v1.png',region:null,zones:['story:chenyu-tea-pavilion'],note:'展望亭と茶畑の仮背景'},
 chenyu:{file:'chenyu-background-v1.png',region:'沈玉の谷',zones:[]},
 spineRidge:{file:'spine-ridge-background-v1.png',region:null,zones:['story:spine-trace-ridge'],note:'霜紋の稜線の仮背景'},
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
 for(const [key,definition] of Object.entries(sceneryDefinitions)){
  if(definition.lightMode&&frame.storyLocalLight?.mode!==definition.lightMode)continue;
  if(definition.zones.includes(location)||(frame.storyCleared&&definition.clearedZones?.includes(location)))return key;
 }
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
  const w=1160,h=540,offset=(frame.voyage?.scroll??Math.max(0,Math.min(1,(frame.camera||0)/1920)))*(w-960);
  ctx.drawImage(background,-offset,0,w,h);
 }else{ctx.fillStyle='#c5decc';ctx.fillRect(0,0,960,540)}
 // Lab-only terrain proxies. These will be 3D set dressing and colliders in the game.
 const inazuma=key==='inazumatown'||key==='inazuma'||key==='toriiforest'||key==='shiomicape';
 const stone=['seacave','windsplit','cryoField','pyroField','electroField','geoField','primoField','oceanidField','maguuField','arrayField','thunderField','pyroHypostasisField','hydroHypostasisField','wolflordField','ruinSerpentField','bathysmalField','electroVineField','aeonblightField','dendroHypostasisField','baptistField','seahorseField','generatorField','tulpaField','icewindField','legatusField','suanniField','qucusaurField','configDeviceField','papillaField','overseerField','duckleField','battleshipField','herraField','nightmareField','moonflyField','moongeckoField','spiritspeakerField','vigilField','flugelField','driftingSnowField','immortalConstructField','wavebinderField','dvalinWeekly','andriusWeekly','tideCalibration','buriedWeaving','clothService','threadlineRelay','dawnVein','ochkaCliff','ochkaKiln','coastalLookout','windwardWorks','thermalRavine','whitePassCoach','whitePassStation','steamStablingDepot','enkanomiya','enkanLamp','enkanLampDark','nodspecial','novokichev','chasm'].includes(key);
 const roof=key==='mondroof',lookout=key==='mondlookout',sandstone=['asimonField','wenutField','emperorField','lavaDragonField','tunigiExcavation'].includes(key);
 const bygone=key==='bygone'||key==='bygoneResonance';
 const golden=key==='golden'||key==='goldenDock';
 const camera=frame.camera||0,snow=['snezhnaya','dragonspine','cryoHypostasisField','wingspan','snowRailTransfer','spineRidge','whitePassSnow','whiteRainbowBasin','auroraGlass','dawnGlass'].includes(key);
 drawDecorations(ctx,frame,camera);
 for(const p of frame.platforms||[]){
  const x=p.x-camera;if(x+p.w<0||x>960)continue;
  if(p.trolleyTrack){
   ctx.fillStyle='#4a675f';ctx.fillRect(x,p.y+36,p.w,24);
   ctx.fillStyle='#9b8066';for(let i=0;i<p.w;i+=29)ctx.fillRect(x+i,p.y+39,Math.min(14,p.w-i),7);
   ctx.fillStyle='#657f82';ctx.fillRect(x,p.y+36,p.w,4);
   continue;
  }
  if(p.resonanceBridge){
   ctx.fillStyle='#365060';ctx.fillRect(x,p.y,p.w,18);
   ctx.fillStyle='#9bd3ba';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle='#d9c88c';for(let i=13;i<p.w-12;i+=24)ctx.fillRect(x+i,p.y+7,5,4);
   continue;
  }
  if(key==='goldenGrotto'){
   ctx.fillStyle='#546479';ctx.fillRect(x,p.y,p.w,p.y===480?60:23);
   ctx.fillStyle='#a1a296';ctx.fillRect(x,p.y,p.w,6);
   ctx.fillStyle='#dbc19f';for(let i=5;i<p.w-10;i+=43)ctx.fillRect(x+i,p.y+1,Math.min(24,p.w-i),3);
   continue;
  }
  if(p.airflowDeck){
   ctx.fillStyle=p.preview?'#81728a':'#796353';ctx.fillRect(x,p.y,p.w,17);
   ctx.fillStyle=p.preview?'#cdb7df':'#a5d7b6';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle='#d2a476';for(let i=7;i<p.w-6;i+=21)ctx.fillRect(x+i,p.y+7,4,5);
   continue;
  }
  if(p.shadowBridge){
   ctx.fillStyle='#536a93';ctx.fillRect(x,p.y,p.w,18);
   ctx.fillStyle='#b7e1e9';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle='#7e9bb8';for(let i=8;i<p.w-12;i+=26)ctx.fillRect(x+i,p.y+8,16,3);
   continue;
  }
  if(p.cover){
   const h=480-p.y;
   ctx.fillStyle='#565e4c';ctx.fillRect(x,p.y,p.w,h);
   ctx.fillStyle='#7c8067';ctx.fillRect(x,p.y+3,p.w-14,h-16);
   ctx.fillStyle='#a9aa88';ctx.fillRect(x,p.y,p.w,7);
   ctx.fillStyle='#687d4d';ctx.fillRect(x+6,p.y,p.w*.65,5);
   ctx.fillStyle='#656b52';for(let i=14;i<p.w-15;i+=24)ctx.fillRect(x+i,p.y+23+(i%19),4,h*.44);
   continue;
  }
  ctx.fillStyle=bygone?'#436c7b':key==='ochkanatlan'?'#687275':key==='tunigi'?'#94704f':golden?'#ad9064':sandstone?'#765540':stone?'#555d80':key==='voyage'?'#765641':roof?'#866058':lookout?'#776b61':snow?'#6f8197':key==='natlan'?'#a16646':key==='fontaine'?'#9c9b9e':key==='liyue'?'#887653':inazuma?'#686174':p.y===480?'#655c43':'#756d56';ctx.fillRect(x,p.y,p.w,p.y===480?60:24);
  ctx.fillStyle=bygone?'#92aea9':key==='ochkanatlan'?'#8d9b82':key==='tunigi'?'#bd966c':golden?'#d7b981':sandstone?'#ad7952':stone?'#858cab':key==='voyage'?'#ac8258':roof?'#b2846c':lookout?'#ab9e86':snow?'#c9dded':key==='fontaine'?'#bbbfc5':inazuma?'#697b79':'#508451';ctx.fillRect(x,p.y,p.w,7);ctx.fillStyle=bygone?'#e0d6a3':key==='ochkanatlan'?'#c7d0be':key==='tunigi'?'#ead2a0':golden?'#f7e3b1':sandstone?'#dfae73':stone?'#c4c8dd':key==='voyage'?'#d6b17a':roof?'#efbb94':lookout?'#dfcba6':snow?'#f1f7ff':key==='fontaine'?'#f0e9da':inazuma?'#c5bbd2':'#bed088';ctx.fillRect(x,p.y,p.w,2);
  ctx.fillStyle=bygone?'#b6baaa':key==='ochkanatlan'?'#a5ada5':key==='tunigi'?'#c2a17c':golden?'#dfc998':sandstone?'#886047':stone?'#949bb9':key==='voyage'?'#b69069':roof?'#ac796d':lookout?'#a19583':snow?'#a1b7cc':'#a09675';for(let n=0;n<p.w;n+=40){if(x+n>-40&&x+n<960)ctx.fillRect(x+n+5,p.y+11,27,5)}
 }
 ctx.restore();
}
