import {paintSprite} from './sprite-layers.js';

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

export function lakeEyeStudy(enemy,legend){
 const study=studies[enemy.id];
 if(!study||legend.source!=='fontaine-lake-legend-poses-source-v6.png')return;
 const section=document.createElement('section'),title=document.createElement('h3');
 section.className='lake-eye-study';title.textContent='単眼の見え方';
 const note=document.createElement('p');note.textContent=study.note;
 const strip=document.createElement('div');strip.className='eye-crops';
 for(const [quality,label] of [[null,'元PNG'],['h48c32','32色版'],['h32c16','16色版']]){
  const figure=document.createElement('figure'),caption=document.createElement('figcaption');
  const canvas=document.createElement('canvas');canvas.width=36;canvas.height=26;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const [cx,cy]=study.eye,[,,width,height]=legend.box;
  paintSprite(ctx,legend,legend.image,{x:18-cx,y:13-cy,width,height},quality);
  caption.textContent=label;figure.append(caption,canvas);strip.append(figure);
 }
 const refs=document.createElement('p');
 for(const [label,url] of [['公式紹介図・通常個体の2種',official],...study.photos]){
  const link=document.createElement('a');link.href=url;link.textContent=label;
  link.target='_blank';link.rel='noopener';if(refs.childNodes.length)refs.append(' ／ ');refs.append(link);
 }
 section.append(title,note,strip,refs);
 return section;
}
