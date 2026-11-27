import {downloadComparison} from './comparison-png.js';
import {compareMasks} from './sprite-fidelity.js';

export function characterDetail(article){
 const canvases=[...article.querySelectorAll('canvas')];
 const markers=canvases.map(canvas=>{
  const wrap=document.createElement('div'),marker=document.createElement('i');
  wrap.className='detail-canvas';marker.hidden=true;
  canvas.replaceWith(wrap);wrap.append(canvas,marker);
  return marker;
 });
 const details=document.createElement('details');
 details.innerHTML='<summary>全身・部分の画質を測る</summary><p>元PNGで気になる箇所を押すと、実寸24×24pxの範囲を比較します。矢印キーでも位置を選べます。</p><button type="button">全身に戻す</button> <button type="button" class="save-comparison" disabled>比較画像をPNGで保存</button> <output></output>';
 article.append(details);
 const crops=document.createElement('div');crops.className='character-crops';details.append(crops);
 const output=details.querySelector('output'),reset=details.querySelector('button'),source=canvases[0];
 const save=details.querySelector('.save-comparison');
 let focus,zoom,flip,profiles=[],crop;
 save.onclick=()=>{
  const direction=flip?'左向き':'右向き',labels=['元PNG',...profiles];
  const merged=document.querySelector('#palettePixels')?.checked;
  downloadComparison({canvases:canvases.slice(0,labels.length),labels,
   title:article.querySelector('h2').textContent+' ／ '+direction+'・'+zoom+'倍',
   stats:article.querySelector('.stats').textContent,
   note:(merged?'原寸合成':'表示倍率で描画')+' ／ '+(crop?'実寸24×24pxの選択範囲 ／ ':'')+output.textContent,
   filename:[article.dataset.id,flip?'left':'right',zoom+'x',profiles.length===2?'both':document.querySelector('#profile').value,
    merged?'pixels':'rect',crop?('crop-'+crop.x+'-'+crop.y):'full'].join('-')+'.png',crop,
   onError:()=>{output.textContent='PNGを書き出せませんでした。'}});
 };
 function measure(){
  const active=details.open&&focus;
  const size=24*zoom;
  const x=active?Math.max(0,Math.min(source.width-size,Math.round(focus.x-size/2))):0;
  const y=active?Math.max(0,Math.min(source.height-size,Math.round(focus.y-size/2))):0;
  crop=active?{x,y,size}:null;
  const w=active?size:source.width,h=active?size:source.height;
  for(const marker of markers){
   marker.hidden=!active;
   if(active)Object.assign(marker.style,{left:x/source.width*100+'%',top:y/source.height*100+'%',width:w/source.width*100+'%',height:h/source.height*100+'%'});
  }
  source.tabIndex=details.open?0:-1;
  crops.replaceChildren();
  if(!details.open)return;
  reset.disabled=!focus;
  function pixels(canvas){
   const data=canvas.getContext('2d').getImageData(x,y,w,h).data;
   const floor=canvas.height-15-y;
   if(floor>=0&&floor<h)data.fill(0,4*w*floor,4*w*(floor+1));
   return data;
  }
  if(active){
   for(const [i,label] of ['元PNG',...profiles].entries()){
    const figure=document.createElement('figure'),caption=document.createElement('figcaption');
    caption.textContent=label;
    const crop=document.createElement('canvas');
    crop.width=w;crop.height=h;
    crop.getContext('2d').drawImage(canvases[i],x,y,w,h,0,0,w,h);
    figure.append(caption,crop);crops.append(figure);
   }
  }
  const original=pixels(source);
  output.textContent=profiles.map((label,i)=>{
   const m=compareMasks(original,pixels(canvases[i+1]));
   return label+'　'+(m.union?'形の重なり '+m.overlapPercent.toFixed(1)+'% ／ 平均色差 '+(m.meanRgbError?.toFixed(2)??'—')+' / 255':'範囲内に絵がありません');
  }).join(' ｜ ');
 }
 source.setAttribute('aria-label','元PNGの比較位置');
 source.onclick=e=>{
  if(!details.open)return;
  const r=source.getBoundingClientRect();
  focus={x:(e.clientX-r.left)*source.width/r.width,y:(e.clientY-r.top)*source.height/r.height};measure();
 };
 source.onkeydown=e=>{
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(!details.open||!delta)return;
  e.preventDefault();focus??={x:source.width/2,y:source.height-15-42*zoom};
  focus.x=Math.max(0,Math.min(source.width,focus.x+delta[0]*zoom));
  focus.y=Math.max(0,Math.min(source.height,focus.y+delta[1]*zoom));measure();
 };
 details.ontoggle=measure;reset.onclick=()=>{focus=null;measure()};
 return (scale,left,labels)=>{
  if(scale!==zoom||left!==flip)focus=null;
  zoom=scale;flip=left;profiles=labels;measure();
 };
}
