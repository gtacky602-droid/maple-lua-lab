import {spriteBounds,paintSprite} from './sprite-layers.js';
import {lakeEyeStudy} from './lake-eye-study.js';

// Only identical source images and crop rectangles qualify as shared idle art.
export function setupSharedLegendArt(layouts,assets){
 const panel=document.createElement('details'),heading=document.createElement('summary'),rows=document.createElement('div');
 panel.id='sharedLegendArt';panel.hidden=true;heading.textContent='同じ待機絵を使う通常敵と大きさを比較';
 panel.open=location.hash==='#sharedLegendArt';
 panel.append(heading,rows);document.querySelector('main').after(panel);
 const key=art=>JSON.stringify([art.source,art.box]);
 const ordinary=new Map();
 for(const [id,layout] of Object.entries(layouts)){
  const art=assets[id+'-reference']??assets[id],source=key(art);
  if(!ordinary.has(source))ordinary.set(source,[]);
  ordinary.get(source).push({id,art,name:(layout.name??id).split('（')[0]});
 }
 let current=[],last='',jumpToPanel=panel.open;
 function draw(){
  rows.replaceChildren();
  if(!panel.open)return;
  for(const {enemy,legend,name,profile} of current){
   const figure=document.createElement('figure'),caption=document.createElement('figcaption');
   const link=document.createElement('a');
   link.href='enemies-art.html?'+new URLSearchParams({q:enemy.id,profile,zoom:'1'});
   link.target='_blank';link.rel='noopener';link.textContent=enemy.name;
   caption.append(link,'（'+enemy.art.h+' px） ／ '+name+'（'+Number(legend.h.toFixed(2))+' px）');
   const canvas=document.createElement('canvas');
   const a=spriteBounds(enemy.art,enemy.art.h),b=spriteBounds(legend,legend.h);
   const cell=Math.ceil(Math.max(a.width,b.width))+24;
   canvas.width=cell*2;canvas.height=Math.ceil(Math.max(a.height,b.height))+16;
   canvas.style.width='min(100%, '+canvas.width+'px)';canvas.style.height='auto';
   canvas.setAttribute('aria-label',enemy.name+'と'+name+'の等倍率比較');
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
   ctx.fillStyle='#20414b';ctx.fillRect(0,0,canvas.width,canvas.height);
   for(const [i,art,box] of [[0,enemy.art,a],[1,legend,b]]){
    ctx.save();ctx.translate((i+.5)*cell-box.x-box.width/2,canvas.height-6);
    paintSprite(ctx,art,art.image,box,profile);ctx.restore();
   }
   figure.append(caption,canvas);rows.append(figure);
   const study=lakeEyeStudy(enemy,legend);
   if(study)rows.append(study);
  }
 }
 panel.ontoggle=draw;
 return (items,profile,artFor,nameFor)=>{
  const next=items.flatMap(e=>{
   const legend=artFor(e);
   return (ordinary.get(key(legend))??[]).map(enemy=>({enemy,legend,name:nameFor(e),profile}));
  });
  const signature=JSON.stringify(next.map(r=>[r.enemy.id,r.name,r.legend.h,r.profile]));
  if(signature===last)return;
  last=signature;current=next;panel.hidden=!next.length;draw();
  if(jumpToPanel&&next.length){jumpToPanel=false;requestAnimationFrame(()=>panel.scrollIntoView())}
 };
}
