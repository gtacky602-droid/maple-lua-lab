// Retain the Lua field's ordering and pixel rounding at both battle scales.
export function lanternRectangles(art,placements,camera){
 const rects=[];
 for(const [kind,x,y,scale] of placements){
  for(const [dx,dy,w,h,color] of art.motifs[kind]){
   rects.push([Math.floor(x-camera+dx*scale),Math.floor(y+dy*scale),w*scale,h*scale,color]);
  }
 }
 return rects;
}

export function lanternPacking(art){
 // The source scales have at most two decimal places. Avoid counting binary
 // floating-point noise as extra bytes in the inline alternative.
 const inlineRuns=placements=>lanternRectangles(art,placements,0).map(([x,y,w,h,c])=>
  [x,y,Number(w.toFixed(2)),Number(h.toFixed(2)),c]);
 const inline={node:art.node,curtain:inlineRuns([art.curtain]),
  stages:art.stages.map(({label,focusX,placements})=>({label,focusX,rects:inlineRuns(placements)}))};
 const bytes=obj=>new TextEncoder().encode(JSON.stringify(obj)).length;
 return {inline:bytes(inline),shared:bytes(art)};
}

export function lanternPreview(host,art,render){
 const replay=host.querySelector('input'),cost=host.querySelector('output'),details=host.querySelector('details');
 replay.onchange=render;
 details.ontoggle=()=>{
  const note=details.querySelector('p');
  if(!details.open||note.textContent)return;
  const sizes=lanternPacking(art);
  note.textContent='3場面の絵と配置を個別に保存：'+sizes.inline.toLocaleString('ja-JP')+
   ' B ／ 図柄を共用：'+sizes.shared.toLocaleString('ja-JP')+' B（JSON）。';
 };
 return {
  reset(node,query){
   host.hidden=node!==art.node;
   replay.checked=!host.hidden&&query?.get('replay')==='1';
  },
  rectangles(stage,camera){
   if(host.hidden||!stage?.placements)return [];
   const placements=replay.checked?stage.placements:[art.curtain,...stage.placements];
   const drawn=lanternRectangles(art,placements,camera).filter(([x,,w])=>x+w>0&&x<960);
   cost.textContent='この画角の灯籠・水面・葉の幕 '+drawn.length+'矩形';
   return drawn;
  }
 };
}
