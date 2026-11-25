// The field and both backgrounds use placements and integer motion offsets exported from Lua.
function forestRectangles(data,placements,beat,camera,width){
 const rects=[];
 for(const [motif,x,y,lifts] of placements){
  const top=y+(lifts?data.offsets[beat]:0);
  for(const [dx,dy,w,h,color] of data.motifs[motif]){
   const left=x-camera+dx;
   if(left+w>0&&left<width)rects.push([left,top+dy,w,h,color]);
  }
 }
 return rects;
}

export function forestSketches(host,data,count){
 const labels={prints:'木の実のそばの足跡',statue:'宙に浮く石像',water:'水面に映った化け狸'};
 for(const note of data.notes.slice(0,count)){
  const link=document.createElement('a'),canvas=document.createElement('canvas');
  canvas.width=132;canvas.height=78;canvas.setAttribute('aria-hidden','true');
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#eadbb8';ctx.fillRect(0,0,132,78);
  const beat=data.offsets.indexOf(Math.min(...data.offsets));
  for(const [x,y,w,h,color] of forestRectangles(data,data.rooms[note.node].search,beat,note.x-59,132)){
   ctx.fillStyle=color;ctx.fillRect(x,y-406,w,h);
  }
  const params=new URLSearchParams({node:note.node,placements:'live',forest:'search',compare:'background',tier:'4096'});
  if(note.kind==='statue')params.set('beat',beat);
  link.href='map-art.html?'+params;link.target='_blank';link.rel='noopener';
  link.append(canvas,labels[note.kind]);host.append(link);
 }
}

export function forestPreview(host,data,render){
 const phase=host.querySelector('select'),time=host.querySelector('input'),note=host.querySelector('output');
 let room;
 phase.onchange=render;
 time.oninput=render;
 time.max=String(data.offsets.length-1);
 const detail=host.querySelector('details'),sizes=detail.querySelector('p');
 detail.ontoggle=()=>{
  if(!detail.open||sizes.textContent)return;
  const rooms={};
  for(const [node,phases] of Object.entries(data.rooms)){
   rooms[node]={};
   for(const [key,placements] of Object.entries(phases)){
    rooms[node][key]=placements.flatMap(([motif,x,y,...motion])=>
     data.motifs[motif].map(([dx,dy,w,h,color])=>[x+dx,y+dy,w,h,color,...motion]));
   }
  }
  const bytes=obj=>new TextEncoder().encode(JSON.stringify(obj)).length;
  const before=bytes({rooms,offsets:data.offsets,notes:data.notes}),after=bytes(data);
  sizes.textContent='同じ形を地点ごとに保存：'+before.toLocaleString('ja-JP')+' B ／ 図柄を共用：'+
   after.toLocaleString('ja-JP')+' B（'+(100*(1-after/before)).toFixed(1)+'%減）。小物の配置・動き・手帳用の位置を含むJSON。';
 };

 function reset(node,query){
  room=data.rooms[node];
  host.hidden=!room;
  if(!room)return;
  phase.replaceChildren();
  if(room.entry)phase.add(new Option('初めて鳥居をくぐった時','entry'));
  phase.add(new Option('左右を見比べる時','search'));
  const requested=query?.get('forest');
  if(requested&&Object.hasOwn(room,requested))phase.value=requested;
  phase.parentElement.hidden=phase.options.length<2;
  const beat=Number(query?.get('beat'));
  time.value=String(Number.isInteger(beat)&&beat>=0&&beat<data.offsets.length?beat:0);
 }

 function rectangles(camera,width){
  if(!room)return [];
  const placements=room[phase.value],beat=Number(time.value);
  const moving=placements.some(p=>p[3]);
  time.parentElement.hidden=!moving;
  const rects=forestRectangles(data,placements,beat,camera,width);
  note.textContent=(moving?'動き '+(beat+1)+' / '+data.offsets.length+' ｜ ':'')+
   'この画角の広場の小物 '+rects.length+'矩形';
  return rects;
 }
 return {reset,rectangles};
}
