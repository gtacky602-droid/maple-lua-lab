import {spriteBounds,paintSprite,rectangleCount} from './sprite-layers.js';
import {lakeEyeStudy} from './lake-eye-study.js';
import {compareMasks} from './sprite-fidelity.js';

// Compare exact crops or explicitly paired palette variants from the gallery.
export function setupSharedLegendArt(layouts,assets){
 const panel=document.createElement('details'),heading=document.createElement('summary'),rows=document.createElement('div');
 panel.id='sharedLegendArt';panel.hidden=true;heading.textContent='通常敵と待機絵の輪郭・大きさを比較';
 panel.open=location.hash==='#sharedLegendArt';
 const controls=document.createElement('label'),compare=document.createElement('input');
 compare.type='checkbox';compare.id='compareSharedProfiles';
 compare.checked=new URL(location.href).searchParams.get('sharedProfiles')==='all';
 controls.append(compare,'元PNG・32色・16色を並べる');
 panel.append(heading,controls,rows);document.querySelector('main').after(panel);
 const key=art=>JSON.stringify([art.source,art.box]);
 const ordinary=new Map(),byId=new Map();
 for(const [id,layout] of Object.entries(layouts)){
  const art=assets[id+'-reference']??assets[id],source=key(art);
  if(!ordinary.has(source))ordinary.set(source,[]);
  const enemy={id,art,name:(layout.name??id).split('（')[0]};
  ordinary.get(source).push(enemy);byId.set(id,enemy);
 }
 let current=[],last='',jumpToPanel=panel.open;
 function draw(){
  rows.replaceChildren();
  if(!panel.open)return;
  for(const {enemy,legend,name,profile} of current){
   const figure=document.createElement('figure'),caption=document.createElement('figcaption');
   const link=document.createElement('a');
   const params=new URLSearchParams({q:enemy.id,profile,zoom:'1'});
   if(compare.checked)params.set('both','1');
   link.href='enemies-art.html?'+params;
   link.target='_blank';link.rel='noopener';link.textContent=enemy.name;
   caption.append(link,'（'+enemy.art.h+' px） ／ '+name+'（'+Number(legend.h.toFixed(2))+' px）');
   const a=spriteBounds(enemy.art,enemy.art.h),b=spriteBounds(legend,legend.h);
   const cell=Math.ceil(Math.max(a.width,b.width))+24;
   if(legend.ordinaryVariant)caption.append(' ／ 同じ輪郭の色違い候補');
   if(legend.palettePoseBytes)caption.append(' ／ 通常型の読込後に追加するJSON '+legend.palettePoseBytes.toLocaleString('ja-JP')+' B（単独版 '+legend.fullPoseBytes.toLocaleString('ja-JP')+' B）');
   figure.append(caption);
   const views=document.createElement('div');views.className='shared-profile-views';
   views.style.cssText='display:flex;flex-wrap:wrap;gap:12px';
   let reference;
   for(const selected of compare.checked?[null,'h48c32','h32c16']:[profile]){
    const view=document.createElement('div'),canvas=document.createElement('canvas');
    view.style.maxWidth='100%';
    canvas.width=cell*2;canvas.height=Math.ceil(Math.max(a.height,b.height))+16;
    canvas.style.width='min(100%, '+canvas.width+'px)';canvas.style.height='auto';canvas.style.display='block';
    const quality=selected===null?'元PNG':selected==='h48c32'?'32色':selected==='h32c16'?'16色':'標準';
    canvas.setAttribute('aria-label',quality+'・'+enemy.name+'と'+name+'の等倍率比較');
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    for(const [i,art,box] of [[0,enemy.art,a],[1,legend,b]]){
     ctx.save();ctx.translate((i+.5)*cell-box.x-box.width/2,canvas.height-6);
     paintSprite(ctx,art,art.image,box,selected);ctx.restore();
    }
    if(compare.checked){
     const label=document.createElement('small');
     label.textContent=quality+(selected?'　通常 '+rectangleCount(enemy.art.profiles[selected])+'矩形 ／ 地方伝説 '+rectangleCount(legend.profiles[selected])+'矩形':'');
     view.append(label,canvas);
     const pixels=[0,cell].map(x=>ctx.getImageData(x,0,cell,canvas.height).data);
     if(!selected)reference=pixels;
     else{
      const scores=pixels.map((rgba,i)=>compareMasks(reference[i],rgba));
      const metrics=document.createElement('small');
      metrics.className='shared-profile-metrics';
      metrics.style.display='block';
      metrics.textContent=scores.map((score,i)=>{
       const side=i===0?'通常':'地方伝説';
       return side+' '+(score.union?score.overlapPercent.toFixed(1)+'%／'+(score.meanRgbError?.toFixed(2)??'—'):'—');
      }).join('　');
      view.append(metrics);
     }
    }
    ctx.globalCompositeOperation='destination-over';
    ctx.fillStyle='#20414b';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!compare.checked)view.append(canvas);
    views.append(view);
   }
   if(compare.checked){
    const note=document.createElement('small');
    note.textContent='各個体の元PNGに対する輪郭の重なり（%）と平均色差（0〜255）';
    figure.append(views,note);
   }else figure.append(views);
   rows.append(figure);
   const study=lakeEyeStudy(enemy,legend);
   if(study)rows.append(study);
  }
 }
 compare.onchange=()=>{
  const url=new URL(location.href);
  if(compare.checked)url.searchParams.set('sharedProfiles','all');else url.searchParams.delete('sharedProfiles');
  history.replaceState(history.state,'',url);draw();
 };
 const shortcut=document.getElementById('openSharedLegendArt');
 shortcut.onclick=()=>{panel.open=true};
 panel.ontoggle=draw;
 return (items,profile,artFor,nameFor)=>{
  const next=items.flatMap(e=>{
   const legend=artFor(e);
   const matches=legend.ordinaryVariant?[byId.get(legend.ordinaryVariant)]:(ordinary.get(key(legend))??[]);
   return matches.map(enemy=>({enemy,legend,name:nameFor(e),profile}));
  });
  const signature=JSON.stringify(next.map(r=>[r.enemy.id,r.name,r.legend.h,r.profile]));
  if(signature===last)return;
  last=signature;current=next;shortcut.hidden=panel.hidden=!next.length;draw();
  if(jumpToPanel&&next.length){jumpToPanel=false;requestAnimationFrame(()=>panel.scrollIntoView())}
 };
}
