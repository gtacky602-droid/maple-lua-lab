// Shared source roster for live rendering and same-state comparisons.
const tideSurveyorSource='tide-surveyor-source-v1.png';
const travelerRunFrames=['left','right'].flatMap(side=>[2,3,4].map(phase=>`traveler-run-${side}-${phase}-source-v1.png`));
export const spriteImageNames=["frost-commander-normal-idle-source-v1.png","final-field-legend-poses-source-v1.png","snez-late-field-legend-poses-source-v1.png","snez-first-field-legend-poses-source-v1.png","nod-north-field-legend-poses-source-v1.png","nod-first-field-legend-poses-source-v1.png","natlan-highland-legend-poses-source-v1.png","natlan-final-legend-poses-source-v1.png","natlan-atocpan-totem-poses-source-v1.png","natlan-wayob-duo-poses-source-v1.png","natlan-northwest-legend-poses-source-v1.png","natlan-cliff-trial-poses-source-v1.png","natlan-north-trial-poses-source-v1.png","natlan-night-trial-poses-source-v1.png","natlan-toyac-legend-poses-source-v1.png","natlan-first-legend-poses-source-v1.png","fontaine-corrouge-poses-source-v1.png","fontaine-bubble-poses-source-v1.png","fontaine-echo-poses-source-v1.png","fontaine-lake-legend-poses-source-v6.png","fontaine-ray-pair-poses-source-v1.png","fontaine-iron-viscount-poses-source-v1.png","fontaine-lake-legend-poses-source-v4.png","fontaine-ocean-judge-poses-source-v1.png","fontaine-lake-legend-poses-source-v3.png","fontaine-dry-legend-poses-source-v1.png","legend-poses-source-v2.png","fontaine-lake-legend-poses-source-v1.png","branch-legend-poses-source-v1.png","farka-body-left-source-v1.png","farka-body-right-source-v1.png","farka-sword-source-v1.png","ronova-idle-left-source-v1.png","ronova-idle-right-source-v1.png","ronova-wings-source-v1.png","rerir-idle-left-source-v1.png","rerir-idle-right-source-v1.png","xbalanque-guard-left-source-v1.png","xbalanque-guard-right-source-v1.png","xbalanque-punch-left-source-v1.png","xbalanque-punch-right-source-v1.png","capitano-strike-left-source-v1.png","capitano-strike-right-source-v1.png","capitano-battle-left-source-v1.png","capitano-battle-right-source-v1.png","capitano-ice-sword-source-v1.png","beidou-stygian-left-source-v1.png","beidou-stygian-right-source-v2.png","heretic-weekly-idle-source-v1.png","false-moon-weekly-idle-source-v1.png","gate-weekly-king-source-v1.png","gate-weekly-queen-source-v1.png","gosoythoth-idle-source-v1.png","knave-weekly-single-source-v1.png","knave-weekly-double-source-v1.png",'narwhal-idle-source-v1.png','narwhal-phantom-idle-source-v1.png','apep-dark-idle-source-v1.png','apep-prime-idle-source-v1.png','shouki-idle-source-v1.png','raiden-boss-idle-source-v1.png','raiden-weekly-normal-source-v1.png','signora-idle-source-v1.png','signora-flame-idle-source-v1.png','azhdaha-idle-source-v1.png','childe-idle-source-v1.png','childe-foul-idle-source-v1.png','nat-iansan-training-props-source-v1.png','nat-xilonen-course-props-source-v1.png','nat-kinich-ambush-props-source-v1.png','nat-mualani-surf-props-source-v1.png','nat-kachina-charms-props-source-v1.png','fon-freminet-dive-props-source-v1.png','fon-lyney-magic-props-source-v1.png','fon-navia-people-props-source-v1.png','fon-navia-photo-props-source-v1.png','fon-navia-photo-terrace-background-v1.png','fon-furina-cues-props-source-v1.png','fon-emilie-scent-props-source-v1.png','sum-nahida-map-props-source-v1.png','sum-kaveh-room-props-source-v1.png','sum-collei-guide-props-source-v1.png','sum-collei-guest-source-v1.png','sum-fungus-visitors-props-source-v1.png','sum-wanderer-sign-props-source-v1.png','ina-tea-case-props-source-v1.png','ina-itto-games-props-source-v1.png','ina-sayu-route-props-source-v1.png','ina-fireworks-props-source-v1.png','mond-night-banner-props-source-v1.png','mond-return-box-props-source-v1.png','sne-snow-match-props-source-v1.png','sne-survey-props-source-v1.png','nod-lantern-patrol-props-source-v1.png','nod-moon-bloom-bud-source-v1.png','nod-moon-bloom-plants-source-v1.png','nod-moon-bloom-wildlife-source-v1.png','nod-rumor-witnesses-source-v1.png','nod-rumor-boards-source-v1.png','nod-appraisal-parts-source-v1.png','nod-appraisal-equipment-source-v1.png','coastal-gifts-source-v1.png','moon-crab-source-v1.png','moon-crab-cracked-source-v1.png','river-racer-source-v1.png','natlan-trial-raft-source-v1.png','natlan-race-flag-source-v1.png','grand-finale-source-v1.png','stage-wave-source-v1.png','parcel-meka-source-v1.png','canopy-fungus-source-v1.png','paper-lantern-source-v1.png','mirage-trolley-source-v1.png','bellgate-source-v1.png','wind-ring-source-v1.png','plate-tail-source-v1.png','tea-boulder-source-v1.png','rime-hare-source-v1.png','ice-crawler-source-v1.png','prism-walker-source-v1.png','rubble-sifter-source-v1.png','windward-tower-source-v1.png','frost-antler-source-v1.png','snow-rail-sprites-source-v1.png','twin-shuttle-loom-source-v1.png',tideSurveyorSource,...travelerRunFrames,...Array.from({length:4},(_,i)=>'array-part-'+(i+1)+'-source-v1.png'),'hydro-slime-idle-source-v2.png','pyro-slime-idle-source-v1.png','cryo-slime-idle-source-v1.png','fanged-beast-idle-source-v1.png','armored-crab-idle-source-v2.png','frostarm-lawachurl-idle-source-v1.png','hunter-seeker-idle-source-v1.png','nobushi-idle-source-v1.png','treasure-scout-idle-source-v1.png','danuki-dance-source-v1.png','noelle-rest-poses-source-v1.png','bennett-cave-guide-source-v1.png','jadeplume-idle-source-v1.png','jadeplume-field-actions-source-v1.png','cryo-regisvine-field-actions-source-v1.png','wolflord-field-poses-source-v1.png','ruin-serpent-field-poses-source-v1.png','bathysmal-field-poses-source-v1.png','electro-regisvine-field-poses-source-v1.png','aeonblight-field-poses-source-v1.png','dendro-hypostasis-field-poses-source-v1.png','dendro-hypostasis-idle-source-v1.png','asimon-field-poses-source-v1.png','wenut-field-poses-source-v1.png','baptist-field-poses-source-v1.png','emperor-field-poses-source-v1.png','seahorse-field-poses-source-v1.png','field-generator-field-poses-source-v1.png','tulpa-field-poses-source-v1.png','coppelia-field-poses-source-v1.png','coppelius-field-poses-source-v1.png','legatus-field-poses-source-v1.png','legatus-idle-source-v1.png','suanni-field-poses-source-v1.png','suanni-idle-source-v1.png','qucusaur-field-poses-source-v1.png','qucusaur-idle-source-v1.png','yumka-field-poses-source-v1.png','yumka-idle-source-v1.png','config-device-field-poses-source-v1.png','config-device-idle-source-v1.png','papilla-field-poses-source-v1.png','papilla-idle-source-v1.png','lava-dragon-field-poses-source-v1.png','lava-dragon-idle-source-v1.png','lava-dragon-molten-idle-source-v1.png','overseer-field-poses-source-v1.png','overseer-idle-source-v1.png','knuckle-duckle-field-poses-source-v1.png','knuckle-duckle-idle-source-v1.png','battleship-field-poses-source-v1.png','battleship-idle-source-v1.png','frostnight-herra-field-poses-source-v1.png','frostnight-herra-idle-source-v1.png','whisperer-nightmares-field-poses-source-v1.png','whisperer-nightmares-idle-source-v1.png','moonfly-field-poses-source-v1.png','moonfly-idle-source-v1.png','moongecko-field-poses-source-v1.png','moongecko-idle-source-v1.png','spiritspeaker-field-poses-source-v1.png','fallen-vigil-field-poses-source-v1.png','flugel-field-poses-source-v1.png','drifting-snow-field-poses-source-v1.png','immortal-construct-field-poses-source-v1.png','wavebinder-field-poses-source-v1.png','dvalin-weekly-body-source-v1.png','dvalin-weekly-parts-source-v1.png','andrius-weekly-normal-source-v1.png','andrius-weekly-awake-source-v1.png','andrius-weekly-awake-actions-source-v1.png','tulpa-idle-source-v1.png','field-generator-idle-source-v1.png','seahorse-idle-source-v1.png','baptist-idle-source-v1.png','asimon-idle-source-v1.png','aeonblight-idle-source-v2.png','electro-regisvine-idle-source-v1.png','rimebiter-idle-source-v1.png','bolteater-idle-source-v1.png','hydro-hypostasis-idle-source-v2.png','hydro-hypostasis-field-poses-source-v1.png','pyro-hypostasis-idle-source-v2.png','pyro-hypostasis-field-poses-source-v1.png','cryo-hypostasis-idle-source-v1.png','cryo-hypostasis-field-poses-source-v1.png','dendro-fungus-idle-source-v1.png','ruin-guard-idle-source-v1.png','hilichurl-idle-source-v1.png','wanderer-idle-right-source-v3.png','wanderer-idle-left-source-v3.png','emilie-idle-source-v2.png','kachina-idle-source-v2.png','columbina-idle-source-v3.png','mitya-idle-source-v2.png','amber-idle-source-v3.png','amber-bow-source-v3.png','traveler-idle-source-v3.png','traveler-idle-left-source-v1.png','traveler-run-right-source-v3.png','traveler-run-left-source-v3.png','ayaka-idle-right-source-v4.png','ayaka-idle-left-source-v4.png','beidou-idle-right-source-v4.png','beidou-idle-left-source-v4.png','thunder-source-v1.png','thunder-field-poses-source-v1.png','array-source-v1.png','array-field-poses-source-v1.png','maguu-slash-source-v1.png','maguu-stance-source-v1.png','maguu-mask-source-v1.png','maguu-source-v1.png','primo-source-v1.png','primo-geovishap-field-actions-source-v1.png','oceanid-crane-source-v1.png','oceanid-mallard-source-v1.png','oceanid-ferret-source-v1.png','oceanid-crab-source-v1.png','oceanid-raptor-source-v1.png','oceanid-frog-source-v1.png','oceanid-finch-source-v1.png','oceanid-source-v1.png','oceanid-boar-source-v1.png','geo-shell-source-v1.png','geo-core-source-v1.png','geo-pillar-source-v1.png','electro-shell-source-v1.png','electro-core-source-v1.png','anemo-shell-source-v1.png','anemo-core-source-v1.png','farka-source-v1.png','pyro-regisvine-source-v1.png','pyro-regisvine-field-actions-source-v1.png',...Array.from({length:4},(_,i)=>'farka-actions/0'+(i+1)+'.png')];
export const atlasNames=['cryo-regisvine-source-v1.png','atlas-transparent.png'];
const deferredSprites=new Set(['frost-commander-normal-idle-source-v1.png','final-field-legend-poses-source-v1.png','snez-late-field-legend-poses-source-v1.png','snez-first-field-legend-poses-source-v1.png','nod-north-field-legend-poses-source-v1.png','nod-first-field-legend-poses-source-v1.png','natlan-highland-legend-poses-source-v1.png','natlan-final-legend-poses-source-v1.png','natlan-atocpan-totem-poses-source-v1.png','natlan-wayob-duo-poses-source-v1.png','natlan-northwest-legend-poses-source-v1.png','natlan-cliff-trial-poses-source-v1.png','natlan-north-trial-poses-source-v1.png','natlan-night-trial-poses-source-v1.png','natlan-toyac-legend-poses-source-v1.png','natlan-first-legend-poses-source-v1.png','fontaine-corrouge-poses-source-v1.png','fontaine-bubble-poses-source-v1.png','fontaine-echo-poses-source-v1.png','fontaine-lake-legend-poses-source-v6.png','fontaine-ray-pair-poses-source-v1.png','fontaine-iron-viscount-poses-source-v1.png','fontaine-lake-legend-poses-source-v4.png','fontaine-ocean-judge-poses-source-v1.png','fontaine-lake-legend-poses-source-v3.png','fontaine-dry-legend-poses-source-v1.png','legend-poses-source-v2.png','branch-legend-poses-source-v1.png','fontaine-lake-legend-poses-source-v1.png']);

export function spriteImageFor(source,images,atlas){
 if(!images[source]&&deferredSprites.has(source)){
  const image=new Image();
  images[source]=image;
  image.src='assets/'+source;
 }
 return images[source]||atlas;
}
const reducedTransparency=globalThis.matchMedia?.('(prefers-reduced-transparency: reduce)');
const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
export function omitCombatDraw(draw){
 return (draw.motionOnly&&reducedMotion?.matches)||((draw.motionOnly||draw.translucentFill)&&reducedTransparency?.matches);
}
export function drawCombatRect(ctx,draw){
 ctx.fillStyle=draw.color;
 if(!draw.rotation){
  ctx.fillRect(draw.x,draw.y,draw.w,draw.h);
  return;
 }
 ctx.save();
 ctx.translate(draw.x,draw.y);
 ctx.rotate(draw.rotation);
 ctx.fillRect(0,0,draw.w,draw.h);
 ctx.restore();
}
export function combatOpacity(draw){
 return reducedTransparency?.matches ? 1 : (draw.opacity??1);
}
const tintedSprites=new WeakMap();
export function elementTintedSprite(image,tint){
 if(!tint)return image;
 let variants=tintedSprites.get(image);
 if(!variants)tintedSprites.set(image,variants=new Map());
 const key=tint.join(',');
 if(variants.has(key))return variants.get(key);
 const canvas=document.createElement('canvas');
 canvas.width=image.naturalWidth;
 canvas.height=image.naturalHeight;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 const data=pixels.data;
 // Match the blue-scale palette mapping used for the Lua rectangle commands.
 for(let i=0;i<data.length;i+=4){
  const r=data[i],g=data[i+1],b=data[i+2];
  if(!data[i+3]||b-r<32||g-r<12||b-g<8)continue;
  for(let c=0;c<3;c++)data[i+c]=Math.round(r+(b-r)*tint[c]/255);
 }
 ctx.putImageData(pixels,0,0);
 variants.set(key,canvas);
 return canvas;
}
// Bound parallel decoding so adding art does not create a serial startup queue.
export async function loadImageSet(names,{concurrency=6,onProgress=()=>{},makeImage=()=>new Image()}={}){
 if(!Number.isInteger(concurrency)||concurrency<1)throw Error('Image concurrency must be a positive integer');
 const unique=[...new Set(names)],images={};let cursor=0,completed=0;
 onProgress(0,unique.length);
 async function worker(){
  while(cursor<unique.length){const name=unique[cursor++],image=makeImage();image.src='assets/'+name;
   try{await image.decode()}catch{throw Error(`画像を読み込めません：${name}。ページを再読み込みしてください。`)}
   images[name]=image;onProgress(++completed,unique.length);
  }
 }
 // Settle all workers before returning a failure, preventing late progress overwrites.
 const results=await Promise.allSettled(Array.from({length:Math.min(concurrency,unique.length)},worker));
 const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
 return images;
}
export async function loadSpriteImages(status){
 try{
  const images=await loadImageSet([...spriteImageNames.filter(name=>!deferredSprites.has(name)),...atlasNames],{onProgress:(done,total)=>{if(status)status.textContent=`画像を読み込み中 ${done} / ${total}`}});
  return {bossImages:images,bossAtlas:images[atlasNames[0]],atlas:images[atlasNames[1]]};
 }catch(error){if(status)status.textContent=error.message;throw error}
}
