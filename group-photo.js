const choices=['formal','candid'];

export function initGroupPhoto(images,dispatch){
 const panel=document.getElementById('groupPhoto');
 const title=document.getElementById('groupPhotoTitle');
 const status=document.getElementById('groupPhotoStatus');
 const controls=document.getElementById('groupPhotoLayout');
 const prints=document.getElementById('groupPhotoPrints');
 const seat=document.getElementById('groupPhotoSeat');
 const riser=document.getElementById('groupPhotoRiser');
 const confirm=document.getElementById('groupPhotoConfirm');
 const layouts=Object.fromEntries(choices.map(id=>[id,{
  box:document.getElementById('groupPhoto-'+id),
  canvas:document.querySelector('#groupPhoto-'+id+' canvas'),
  caption:document.querySelector('#groupPhoto-'+id+' figcaption'),
  button:document.querySelector('#groupPhoto-'+id+' button')
 }]));
 let last;
 seat.onchange=()=>dispatch('story_photo_seat:'+seat.value);
 riser.onchange=()=>dispatch('story_photo_riser:'+riser.value);
 confirm.onclick=()=>dispatch('story_photo_confirm');
 document.getElementById('groupPhotoClose').onclick=()=>dispatch('story_photo_close');
 for(const id of choices)layouts[id].button.onclick=()=>dispatch('story_photo_publish:'+id);

 function paint(canvas,items){
  const ctx=canvas.getContext('2d');
  const {width,height}=canvas;
  const background=images['fon-navia-photo-terrace-background-v1.png'];
  ctx.fillStyle='#779ca1';
  ctx.fillRect(0,0,width,height);
  ctx.imageSmoothingEnabled=false;
  if(background?.naturalWidth)ctx.drawImage(background,0,0,width,height);
  for(const item of items){
   const sprite=images[item.source];
   if(!sprite?.naturalWidth)continue;
   const h=item.h*1.2,w=h*item.box[2]/item.box[3];
   const x=width/2+(item.x-1384)*1.2,y=height-18+(item.y-480)*1.2;
   ctx.save();
   ctx.translate(x,y);
   if(item.flip)ctx.scale(-1,1);
   ctx.drawImage(sprite,...item.box,-w/2,-h,w,h);
   ctx.restore();
  }
 }

 function options(select,items,selection){
  if(!select.length)select.replaceChildren(...items.map(item=>new Option(item.label,item.id)));
  select.value=selection;
 }

 return function update(view){
  panel.hidden=!view?.panel;
  if(!view?.panel){last=undefined;return}
  const signature=JSON.stringify(view);
  if(signature===last)return;
  last=signature;
  const arranging=view.panel==='layout',choosing=view.panel==='choose';
  title.textContent=arranging?'椅子と台の配置':choosing?'掲示する写真を選ぶ':'水路の写真掲示板';
  status.textContent=arranging?(view.ready?'全員の顔が見えています。':'荷受け係と菓子屋の顔が重なっています。'):
      choosing?'写真を一枚選んで、広場で報告します。':'';
  controls.hidden=!arranging;
  prints.classList.toggle('group-photo-two',choosing);
  if(arranging){
   options(seat,view.seats,view.seat);
   options(riser,view.risers,view.riser);
   confirm.disabled=!view.ready||view.paused;
  }
  for(const id of choices){
   const {box,canvas,caption,button}=layouts[id];
   const items=view.preview[id];
   box.hidden=!items;
   button.hidden=!choosing;
   button.disabled=!!view.paused;
   if(!items)continue;
   caption.textContent=arranging?'構図のプレビュー':view.prints.find(print=>print.id===id).label;
   paint(canvas,items);
  }
 };
}
