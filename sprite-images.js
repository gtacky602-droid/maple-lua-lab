// Shared source roster for live rendering and same-state comparisons.
export const spriteImageNames=[...Array.from({length:4},(_,i)=>'array-part-'+(i+1)+'-source-v1.png'),'hydro-slime-idle-source-v2.png','pyro-slime-idle-source-v1.png','armored-crab-idle-source-v2.png','nobushi-idle-source-v1.png','dendro-fungus-idle-source-v1.png','ruin-guard-idle-source-v1.png','hilichurl-idle-source-v1.png','wanderer-idle-source-v2.png','emilie-idle-source-v2.png','kachina-idle-source-v2.png','columbina-idle-source-v2.png','mitya-idle-source-v2.png','amber-idle-source-v2.png','traveler-idle-source-v2.png','ayaka-idle-source-v3.png','beidou-idle-source-v3.png','thunder-source-v1.png','array-source-v1.png','maguu-slash-source-v1.png','maguu-stance-source-v1.png','maguu-mask-source-v1.png','maguu-source-v1.png','primo-source-v1.png','oceanid-crane-source-v1.png','oceanid-mallard-source-v1.png','oceanid-ferret-source-v1.png','oceanid-crab-source-v1.png','oceanid-raptor-source-v1.png','oceanid-frog-source-v1.png','oceanid-finch-source-v1.png','oceanid-source-v1.png','oceanid-boar-source-v1.png','geo-shell-source-v1.png','geo-core-source-v1.png','geo-pillar-source-v1.png','electro-shell-source-v1.png','electro-core-source-v1.png','anemo-shell-source-v1.png','anemo-core-source-v1.png','farka-source-v1.png','pyro-regisvine-source-v1.png',...Array.from({length:4},(_,i)=>'farka-actions/0'+(i+1)+'.png')];
export const atlasNames=['cryo-regisvine-source-v1.png','atlas-transparent.png'];
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
  const images=await loadImageSet([...spriteImageNames,...atlasNames],{onProgress:(done,total)=>{if(status)status.textContent=`画像を読み込み中 ${done} / ${total}`}});
  return {bossImages:images,bossAtlas:images[atlasNames[0]],atlas:images[atlasNames[1]]};
 }catch(error){if(status)status.textContent=error.message;throw error}
}
