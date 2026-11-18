const partHeight={shelfHigh:109,shelfLow:42,desk:56,windowOut:118,windowIn:118};
const partBase={shelfHigh:203,shelfLow:201,desk:227,windowOut:158,windowIn:158};

export function initReadingModel(images,dispatch){
 const panel=document.getElementById('readingModel');
 const canvas=document.getElementById('readingModelCanvas'),ctx=canvas.getContext('2d');
 const stops=document.getElementById('readingModelStops'),positions=new Map();
 const partPicker=document.getElementById('readingModelPart');
 const partRow=document.getElementById('readingModelPartRow');
 const partLabel=document.getElementById('readingModelPartLabel');
 const summary=document.getElementById('readingModelSummary');
 const hint=document.getElementById('readingModelHint');
 const confirm=document.getElementById('readingModelConfirm');
 const close=document.getElementById('readingModelClose');
 let selectedField,previous,from,to,transition;
 partPicker.onchange=()=>dispatch('story_model_set:'+selectedField+':'+partPicker.value);
 close.onclick=()=>dispatch('story_model_close');
 confirm.onclick=()=>dispatch('story_model_confirm');

 function paint(view,pawn){
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#203737';ctx.fillRect(0,0,690,306);
  ctx.beginPath();ctx.moveTo(65,268);ctx.lineTo(110,91);ctx.lineTo(611,91);ctx.lineTo(635,268);ctx.closePath();
  ctx.fillStyle='#775745';ctx.fill();
  ctx.strokeStyle='#e3be8b';ctx.lineWidth=3;ctx.stroke();
  ctx.save();ctx.clip();
  ctx.strokeStyle='#b2825a';ctx.lineWidth=2;
  for(let y=103;y<269;y+=18){
   ctx.beginPath();ctx.moveTo(61,y);ctx.lineTo(635,y);ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle='#d5dda8b0';ctx.setLineDash([6,7]);ctx.lineWidth=2;
  for(const p of view.stations){
   for(const link of p.links){
    if(p.id>=link)continue;
    const target=positions.get(link);
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(target.x,target.y);ctx.stroke();
   }
  }
  ctx.setLineDash([]);
  const drawOrder=[...view.parts.filter(part=>part.key.startsWith('window')),
                  ...view.parts.filter(part=>!part.key.startsWith('window'))];
  for(const part of drawOrder){
   const sprite=images[part.source];
   if(!sprite?.naturalWidth)continue;
   const height=partHeight[part.key],width=height*part.box[2]/part.box[3];
   ctx.save();ctx.translate(75+part.x*.46,partBase[part.key]);
   if(part.flip)ctx.scale(-1,1);
   ctx.drawImage(sprite,...part.box,-width/2,-height,width,height);
   ctx.restore();
  }
  ctx.textAlign='center';ctx.font="15px 'Yu Gothic UI', sans-serif";
  for(const stop of view.stations){
   ctx.fillStyle=view.seen[stop.id]?'#d7d9a5':'#779a92';
   ctx.fillRect(stop.x-4,stop.y-4,8,8);
   ctx.fillStyle='#253632ec';ctx.fillRect(stop.x-26,stop.y+10,52,22);
   ctx.fillStyle='#fff4d1';ctx.fillText(stop.label,stop.x,stop.y+26);
  }
  ctx.fillStyle='#412e2e';ctx.fillRect(pawn.x-12,pawn.y-8,24,8);
  ctx.fillStyle='#e4ad60';ctx.fillRect(pawn.x-11,pawn.y-12,22,5);
  ctx.fillRect(pawn.x-7,pawn.y-23,14,11);
  ctx.fillStyle='#ffe2a4';ctx.fillRect(pawn.x-6,pawn.y-28,12,8);
  ctx.fillStyle='#efbd7a';ctx.fillRect(pawn.x-8,pawn.y-23,16,3);
 }

 return function update(view){
  panel.hidden=!view;
  if(!view){previous=from=to=undefined;return}
  const signature=JSON.stringify(view);
  const changed=previous!==signature;
  const now=performance.now();
  if(changed){
   if(!positions.size){
    for(const stop of view.stations){
     positions.set(stop.id,stop);
     const b=document.createElement('button');
     b.type='button';b.dataset.modelTo=stop.id;b.textContent=stop.label;
     b.onclick=()=>dispatch('story_model_move:'+stop.id);
     stops.append(b);
    }
   }
   if(to?.id!==view.here.id){from=to??view.here;to=view.here;transition=now}
   for(const button of stops.children){
    const id=button.dataset.modelTo;
    button.disabled=!view.here.links.includes(id);
    if(view.here.id===id)button.setAttribute('aria-current','step');
    else button.removeAttribute('aria-current');
   }
   partRow.hidden=!view.choices;
   if(selectedField!==view.here.field){
    selectedField=view.here.field;
    partPicker.replaceChildren(...(view.choices??[]).map(item=>new Option(item.label,item.id)));
    partLabel.textContent=view.here.label+'の配置';
   }
   if(view.choices)partPicker.value=view.selected;
   const r=view.result;
   summary.textContent=`駒の位置 ${view.here.label} ｜ 巡った場所 ${r.visited}/${r.total} ｜ 収納 ${r.storage}枠（必要 ${r.required}） ｜ 眺め ${r.view?'見える':'遮られる'} ｜ 窓の開閉 ${r.clear?'開けられる':'戸が机に当たる'}`;
   hint.textContent=view.here.hint+' '+r.feedback;
   confirm.disabled=!r.ready;
   previous=signature;
  }
  const progress=Math.max(0,Math.min(1,(now-transition)/230));
  if(changed||from!==to){
   const pawn={x:from.x+(to.x-from.x)*progress,y:from.y+(to.y-from.y)*progress};
   paint(view,pawn);
   if(progress===1)from=to;
  }
 };
}
