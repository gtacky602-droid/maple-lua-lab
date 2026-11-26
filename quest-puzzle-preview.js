import {initRockView} from './rock-view.js';
export function setupPuzzlePreview(marker,focus,redraw){
 const box=document.createElement('div');
 box.hidden=true;
 box.innerHTML='<label>操作場所 <select></select></label> <label>紙の形 <select></select></label> <button type="button">できる足場を見る</button> <output></output>';
 marker.after(box);
 const [station,form]=box.querySelectorAll('select');
 const jump=box.querySelector('button'),message=box.querySelector('output');
 const silhouette=document.createElement('figure');
 silhouette.hidden=true;
 silhouette.innerHTML='<canvas width="340" height="108"></canvas><figcaption></figcaption>';
 box.append(silhouette);
 const drawView=initRockView(silhouette,silhouette.querySelector('figcaption'),silhouette.querySelector('canvas'));
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
  const selected=shape(index);
  viewingShape=false;
  jump.textContent='できる足場を見る';
  jump.disabled=!selected?.platforms?.length&&!selected?.wall;
  message.textContent=selected?.line??site.hint??'';
  drawView(library?.[point.node]?.[index]?.view);
  focus({...point,x:site.x,y:site.y,name:site.name});
 }
 station.onchange=()=>{show();redraw()};
 form.onchange=()=>{choices[station.selectedIndex]=Number(form.value);show();redraw()};
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
     if(point?.stations){drawView(library[point.node][station.selectedIndex]?.view);redraw()}
    }).catch(()=>{loading=null;if(point?.stations)message.textContent='装置の画像を読み込めませんでした。'});
   }
   station.replaceChildren(...point.stations.map(s=>new Option(s.name)));
   station.selectedIndex=point.initialStation??0;
   choices=point.stations.map(s=>s.initial??0);
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
     ctx.fillRect(x-camera,y,w,h);
    }
   }
  }
 };
}
