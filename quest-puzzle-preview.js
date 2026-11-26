import {initRockView} from './rock-view.js';
export function setupPuzzlePreview(marker,focus,redraw){
 const box=document.createElement('div');
 box.hidden=true;
 box.innerHTML='<label>操作場所 <select></select></label> <label>紙の形 <select></select></label> <button type="button">できる足場を見る</button> <output></output>';
 marker.after(box);
 const [station,form]=box.querySelectorAll('select');
 const jump=box.querySelector('button'),message=box.querySelector('output');
 const wallJump=document.createElement('button');
 wallJump.type='button';wallJump.textContent='遮蔽の壁を見る';wallJump.hidden=true;
 jump.after(wallJump);
 const returnView=document.createElement('button');
 returnView.type='button';returnView.textContent='元の観察地点に戻る';returnView.hidden=true;
 box.append(returnView);
 const restore=document.createElement('button');
 restore.type='button';restore.textContent='地図を開いた時の折り方に戻す';restore.hidden=true;
 box.append(restore);
 const silhouette=document.createElement('figure');
 silhouette.hidden=true;
 silhouette.innerHTML='<canvas width="340" height="108"></canvas><figcaption></figcaption>';
 box.append(silhouette);
 const drawView=initRockView(silhouette,silhouette.querySelector('figcaption'),silhouette.querySelector('canvas'));
 const reference=silhouette.cloneNode(true);
 reference.setAttribute('aria-label','元の観察地点の岩影');
 const selectedLabel=document.createElement('span');selectedLabel.textContent='選択中の観察地点';
 silhouette.prepend(selectedLabel);
 for(const fig of [silhouette,reference])fig.style.width='min(100%,342px)';
 const originalLabel=document.createElement('span');originalLabel.textContent='元の観察地点';
 reference.prepend(originalLabel);
 const views=document.createElement('div');
 views.style.cssText='display:flex;flex-wrap:wrap;gap:12px';
 box.append(views);views.append(silhouette,reference);
 const drawReference=initRockView(reference,reference.querySelector('figcaption'),reference.querySelector('canvas'));
 function drawRockViews(){
  const devices=library?.[point.node],index=station.selectedIndex,origin=point.initialStation??0;
  drawView(devices?.[index]?.view);
  drawReference(index!==origin?devices?.[origin]?.view:undefined);
  selectedLabel.hidden=reference.hidden;
 }
 let point=null,choices=[],library,loading,viewingShape=false;
 function shape(index){
  return point?.stations[index].forms?.[choices[index]-1];
 }
 function show(){
  const index=station.selectedIndex,site=point.stations[index];
  form.parentElement.hidden=jump.hidden=!site.forms;
  if(site.forms){
   const options=site.forms.map((s,i)=>new Option(s.label,String(i+1)));
   if(!site.initial)options.unshift(new Option('未調整','0'));
   form.replaceChildren(...options);
   form.value=String(choices[index]);
  }
  returnView.hidden=point.stations.length<2 || point.stations[0].angle==null;
  returnView.disabled=index===(point.initialStation??0);
  restore.hidden=!point.forms;
  restore.disabled=!point.forms || choices.every((value,i)=>value===point.forms[i]);
  const selected=shape(index);
  viewingShape=false;
  jump.textContent='できる足場を見る';
  jump.disabled=!selected?.platforms?.length&&!selected?.wall;
  wallJump.hidden=!selected?.wall || !selected.platforms?.length;
  message.textContent=selected?.line??site.hint??'';
  drawRockViews();
  focus({...point,x:site.x,y:site.y,name:site.name});
 }
 returnView.onclick=()=>{station.selectedIndex=point.initialStation??0;show();redraw()};
 restore.onclick=()=>{choices=point.forms.slice();show();redraw()};
 station.onchange=()=>{show();redraw()};
 form.onchange=()=>{choices[station.selectedIndex]=Number(form.value);show();redraw()};
 wallJump.onclick=()=>{
  const wall=shape(station.selectedIndex).wall;
  viewingShape=true;
  document.getElementById('camera').value=wall.x+wall.w/2-480;
  jump.textContent='操作盤へ戻る';
  redraw();
 };
 jump.onclick=()=>{
  const selected=shape(station.selectedIndex),p=selected.platforms?.[0]??selected.wall;
  viewingShape=!viewingShape;
  const site=point.stations[station.selectedIndex];
  document.getElementById('camera').value=(viewingShape?p.x+p.w/2:site.x)-480;
  jump.textContent=viewingShape?'操作盤へ戻る':'できる足場を見る';
  redraw();
 };
 return {
  reset(next){
   point=next;
   box.hidden=!point?.stations;
   if(box.hidden)return;
   if(!library&&!loading){
    loading=fetch('content/quest-puzzle-stations.json').then(r=>{
     if(!r.ok)throw Error(r.status);
     return r.json();
    }).then(data=>{
     library=data;
     if(point?.stations){drawRockViews();redraw()}
    }).catch(()=>{loading=null;if(point?.stations)message.textContent='装置の画像を読み込めませんでした。'});
   }
   station.replaceChildren(...point.stations.map(s=>new Option(s.name)));
   station.selectedIndex=point.initialStation??0;
   choices=point.forms?.slice()??point.stations.map(s=>s.initial??0);
   show();
  },
  draw(ctx,camera){
   if(box.hidden)return;
   for(const [i,site] of point.stations.entries()){
    for(const [dx,dy,value,h,color] of library?.[point.node]?.[i]?.rows??[]){
     ctx.fillStyle=color;
     if(typeof value==='number')ctx.fillRect(site.x-camera+dx,site.y+dy,value,h);
     else{
      ctx.save();ctx.font=h+'px sans-serif';ctx.textAlign='center';
      ctx.fillText(value,site.x-camera+dx,site.y+dy);ctx.restore();
     }
    }
    if(site.forms&&choices[i]){
     ctx.fillStyle='#fff3c7';ctx.fillRect(site.x-camera-15+10*(choices[i]-1),site.y-37,7,7);
    }
    const selected=shape(i);
    if(!selected)continue;
    ctx.fillStyle=site.color;
    for(const p of selected.platforms??[])ctx.fillRect(p.x-camera,p.y,p.w,6);
    if(selected.wall){
     const {x,y,w,h}=selected.wall;
     ctx.fillStyle='#7d8881';ctx.fillRect(x-camera,y,w,h);
     ctx.fillStyle='#ced2ae';ctx.fillRect(x-camera+2,y+2,w-4,h-5);
    }
   }
  }
 };
}
