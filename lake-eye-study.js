import {spriteBounds,paintSprite,rectangleCount} from './sprite-layers.js';

let previousProfiles;
function loadPreviousProfiles(){
 return previousProfiles??=fetch('assets/lake-legend-gallery.json').then(response=>{
  if(!response.ok)throw Error('比較素材を読み込めません');
  return response.json();
 }).catch(error=>{previousProfiles=undefined;throw error});
}

const official='https://webstatic.hoyoverse.com/upload/op-public/2023/08/11/f13e999e59de3c81a58cc7f63ecde8de_4249075339798025693.png';
const studies={
 'tainted-water-splitting-phantasm':{
  eye:[86,37],note:'両腕の間にある水塊の、濃い縁に囲まれた単眼。',
  photos:[
   ['ゲーム画面・斜めから','https://img.game8.jp/8558399/7572f17c6c9d3bfd1cd44fa496f5a695.jpeg/original'],
   ['ゲーム画面・両腕を上げた姿','https://img.game8.jp/8558673/b86557334820be3e6ff11a0d33bae555.jpeg/original']]
 },
 'tainted-water-spouting-phantasm':{
  eye:[52,15],note:'胴の上に浮く小さな頭に単眼があり、横の泡とは離れている。',
  photos:[
   ['ゲーム画面・正面から','https://img.game8.jp/8558397/c9b289a7256fef585ec81a4e279e468f.jpeg/original'],
   ['ゲーム画面・放水中','https://img.game8.jp/8558672/0796177b17c99699246a5801916e51d1.jpeg/original']]
 }
};

// The approved v6 sheet reserves this opaque cyan for the single eye.
function eyePixels(canvas){
 const {width,height}=canvas,rgba=canvas.getContext('2d').getImageData(0,0,width,height).data;
 const pixels=new Set();
 let sumX=0,sumY=0;
 for(let i=0;i<rgba.length;i+=4){
  // Canvas coverage blends the eye with its rim between source pixels.
  if(rgba[i]<135 || rgba[i+1]<220 || rgba[i+2]<235 || rgba[i+3]<128)continue;
  const pos=i/4;
  pixels.add(pos);sumX+=pos%width;sumY+=Math.floor(pos/width);
 }
 return {pixels,x:sumX/pixels.size,y:sumY/pixels.size};
}

export function lakeEyeStudy(enemy,legend){
 const study=studies[enemy.id];
 if(!study||legend.source!=='fontaine-lake-legend-poses-source-v6.png')return;
 const section=document.createElement('section'),title=document.createElement('h3');
 section.className='lake-eye-study';title.textContent='単眼の見え方';
 const note=document.createElement('p');note.textContent=study.note;
 const strip=document.createElement('div');strip.className='eye-crops';
 for(const [quality,label,previous] of [[null,'元PNG'],['h48c32','32色版'],['h32c16','従来の16色版',true],['h32c16','目元を補正した16色版']]){
  const figure=document.createElement('figure'),caption=document.createElement('figcaption');
  const canvas=document.createElement('canvas');canvas.width=36;canvas.height=26;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const [cx,cy]=study.eye,[,,width,height]=legend.box;
  const bounds={x:18-cx,y:13-cy,width,height};
  const count=document.createElement('small');
  function draw(art){
   paintSprite(ctx,art,legend.image,bounds,quality);
   if(quality)count.textContent='全身 '+rectangleCount(art.profiles[quality])+'矩形';
   canvas.dataset.ready='true';
  }
  if(previous){
   const key=enemy.id==='tainted-water-splitting-phantasm'?'ninianne':'vivianne';
   loadPreviousProfiles().then(poses=>draw(poses[key])).catch(error=>{count.textContent=error.message});
  }else draw(legend);
  caption.textContent=label;figure.append(caption,canvas,document.createElement('br'),count);strip.append(figure);
 }
 const refs=document.createElement('p');
 for(const [label,url] of [['公式紹介図・通常個体の2種',official],...study.photos]){
  const link=document.createElement('a');link.href=url;link.textContent=label;
  link.target='_blank';link.rel='noopener';if(refs.childNodes.length)refs.append(' ／ ');refs.append(link);
 }
 const motion=document.createElement('details'),summary=document.createElement('summary');
 summary.textContent='待機・構え・攻撃の単眼を比較';
 const controls=document.createElement('label'),pose=document.createElement('select');
 controls.append('姿勢 ',pose);
 pose.add(new Option('待機','idle'));pose.add(new Option('構え','brace'));pose.add(new Option('攻撃','strike'));
 const pixelLabel=document.createElement('label'),pixels=document.createElement('input');
 pixels.type='checkbox';pixelLabel.append(pixels,'矩形を原寸で合成してから拡大');
 const poseData=new Map([['idle',legend]]);
 const images=document.createElement('div');images.className='eye-crops';
 const status=document.createElement('p');status.setAttribute('role','status');
 let revision=0;
 async function drawMotion(){
  const ticket=++revision;
  images.replaceChildren();status.textContent='読み込み中';
  const name=enemy.id==='tainted-water-splitting-phantasm'?'ninianne':'vivianne';
  try{
   const selected=pose.value;
   let data=poseData.get(selected);
   if(!data){
    const response=await fetch('assets/field-packed/lake-'+name+'-field-'+selected+'-sprites-v6.json');
    if(!response.ok)throw Error(response.status);
    data=await response.json();poseData.set(selected,data);
   }
   if(ticket!==revision)return;
   const scale=legend.h/legend.box[3],bounds=spriteBounds(data,data.box[3]*scale);
   let reference;
   for(const [profile,label] of [[null,'元PNG'],['h48c32','32色'],['h32c16','16色']]){
    const card=document.createElement('figure'),caption=document.createElement('figcaption'),canvas=document.createElement('canvas');
    canvas.width=Math.ceil(bounds.width)+8;canvas.height=Math.ceil(bounds.height)+8;
    canvas.style.width=canvas.width+'px';canvas.style.height='auto';canvas.style.maxWidth='100%';
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    ctx.translate(4-bounds.x,canvas.height-4);paintSprite(ctx,data,legend.image,bounds,profile,pixels.checked);
    caption.textContent=label+(profile?'・'+rectangleCount(data.profiles[profile])+'矩形':'');
    const eye=eyePixels(canvas);
    if(!profile)reference=eye;
    card.append(caption,canvas);
    if(reference.pixels.size){
     const detail=document.createElement('canvas'),reading=document.createElement('small');
     detail.width=36;detail.height=26;detail.setAttribute('aria-label',label+'の目元の拡大');
     const crop=detail.getContext('2d');
     crop.drawImage(canvas,Math.round(reference.x)-18,Math.round(reference.y)-13,36,26,0,0,36,26);
     let overlap=0;
     for(const pixel of eye.pixels)if(reference.pixels.has(pixel))overlap++;
     const union=eye.pixels.size+reference.pixels.size-overlap;
     reading.textContent='目の明るい水色 '+eye.pixels.size+'画素'+(profile?' ／ 元PNGとの重なり '+(100*overlap/union).toFixed(1)+'%':'');
     if(profile&&eye.pixels.size)reading.textContent+=' ／ 目の中心のずれ '+Math.hypot(eye.x-reference.x,eye.y-reference.y).toFixed(2)+' px';
     card.append(document.createElement('br'),detail,document.createElement('br'),reading);
    }
    images.append(card);
   }
   status.textContent='';
  }catch(error){if(ticket===revision)status.textContent='姿勢の読み込みに失敗しました。 '+error.message}
 }
 const requested=new URL(location.href).searchParams;
 if([...pose.options].some(o=>o.value===requested.get('eyePose'))){
  pose.value=requested.get('eyePose');pixels.checked=requested.get('eyePixels')==='1';motion.open=true;
 }
 pose.onchange=pixels.onchange=()=>{
  const url=new URL(location.href);url.searchParams.set('eyePose',pose.value);
  if(pixels.checked)url.searchParams.set('eyePixels','1');else url.searchParams.delete('eyePixels');
  history.replaceState(history.state,'',url);drawMotion();
 };
 motion.ontoggle=()=>{if(motion.open&&!images.childElementCount)drawMotion()};
 motion.append(summary,controls,pixelLabel,images,status);
 section.append(title,note,strip,motion,refs);
 return section;
}
