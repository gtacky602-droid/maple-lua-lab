export function initStoneOrnaments(images, dispatch) {
 const panel=document.getElementById('stoneOrnaments');
 const canvas=document.getElementById('stoneOrnamentsPreview');
 const ctx=canvas.getContext('2d');
 const selectors={
  color:{input:document.getElementById('stoneColor'),options:'colors'},
  pattern:{input:document.getElementById('stonePattern'),options:'patterns'},
 };
 const tools=document.getElementById('stoneOrnamentsTools');
 const confirm=document.getElementById('stoneOrnamentsConfirm');
 let painted='';
 ctx.imageSmoothingEnabled=false;

 for(const [field,{input}] of Object.entries(selectors)){
  input.addEventListener('change',()=>dispatch(`story_charm_${field}:${input.value}`));
 }
 confirm.onclick=()=>dispatch('story_charm_confirm');
 document.getElementById('stoneOrnamentsClose').onclick=()=>dispatch('story_charm_close');

 return view=>{
  panel.hidden=!view;
  if(!view){
   if(panel.contains(document.activeElement))document.activeElement.blur();
   return;
  }
  const crafting=view.panel==='craft';
  tools.hidden=!crafting;
  confirm.disabled=view.paused;
  for(const [field,{input,options}] of Object.entries(selectors)){
   if(!input.options.length)input.replaceChildren(...view[options].map(option=>new Option(option.label,option.id)));
   input.value=view[field];
   input.disabled=view.paused;
  }
  const key=view.color+'/'+view.pattern;
  if(key===painted)return;
  painted=key;
  const color=view.colors.find(option=>option.id===view.color);
  const pattern=view.patterns.find(option=>option.id===view.pattern);
  canvas.setAttribute('aria-label',`旅人とカチーナの石飾り。中央の色は${color.label.replace('が中央','')}、並びは${pattern.label}。`);
  ctx.fillStyle='#4c3129';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#ffedcf';
  ctx.font='15px sans-serif';
  ctx.textAlign='center';
  for(const item of view.items){
   const [sx,sy,sw,sh]=item.box;
   const w=item.h*sw/sh;
   const image=images[item.source];
   if(image?.naturalWidth)ctx.drawImage(image,sx,sy,sw,sh,Math.round(item.x-w/2),Math.round(item.y-item.h),Math.round(w),Math.round(item.h));
   if(item.owner)ctx.fillText(item.owner,item.x,138);
  }
 };
}
