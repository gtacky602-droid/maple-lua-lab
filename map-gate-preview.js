// Match physical coordinates because discovery can hide individual exits from Lua's M-map.
export function setupGatePreview(panel, camera, liveView, query, render, showDarkRoom) {
 const select=panel.querySelector('select'),link=panel.querySelector('a'),position=panel.querySelector('output');
 let active=null;
 function selectGate(node,nodes){
  const index=Number(select.value);
  active=index>0?node.exits[index-1]:null;
  link.hidden=position.hidden=!active;
  if(active){
   const y=active.y??480;
   camera.value=Math.max(0,Math.min(Number(camera.max),active.x-480));
   position.textContent=(node.swim||node.toyDive?'水中':y<480?'上段':y>480?'下段':'地上')+'（'+active.x+', '+y+'）';
   link.textContent=nodes.get(active.to).name+'の景色を見る';
  }
 }
 return {
  darkGate(){return Boolean(active?.darkOnly)},
  reset(node,nodes,initial){
   active=null;
   select.replaceChildren(new Option('表示しない',''));
   if(liveView)node.exits.forEach((edge,i)=>{
    if(!Number.isFinite(edge.x)||node.voyage?.destination===edge.to||!nodes.has(edge.to))return;
    const label=nodes.get(edge.to).name;
    const option=new Option((edge.rideLabel??label)+'（'+edge.x+', '+(edge.y??480)+'）',String(i+1));
    Object.assign(option.dataset,{to:edge.to,gateX:edge.x,gateY:edge.y??480});
    select.add(option);
   });
   panel.hidden=select.length===1;
   panel.open=false;
   if(initial&&query.has('gateX')&&query.has('gateY')){
    const index=node.exits.findIndex(e=>e.to===query.get('to')&&e.x===Number(query.get('gateX'))&&
     (e.y??480)===Number(query.get('gateY')));
    const value=String(index+1);
    if(index>=0&&Array.from(select.options).some(o=>o.value===value)){
     select.value=value;panel.open=true;
    }
   }
   selectGate(node,nodes);
   select.onchange=()=>{selectGate(node,nodes);if(active?.darkOnly)showDarkRoom();render()};
  },
  updateLink(params){
   if(!active)return;
   const target=new URLSearchParams(params);
   target.set('placements','live');target.set('node',active.to);target.delete('phase');target.delete('light');
   link.href='map-art.html?'+target;
  },
  draw(ctx,offset,dark){
   if(!active || (active.darkOnly&&!dark))return;
   const x=Math.round(active.x-offset),y=Math.round(active.y??480);
   // The pointed tip is the exact portal coordinate, even on a raised platform.
   ctx.save();
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-9,y-13);ctx.lineTo(x+9,y-13);ctx.closePath();
   ctx.fillStyle='#ffe680';ctx.strokeStyle='#3c2818';ctx.lineWidth=2;ctx.fill();ctx.stroke();
   ctx.restore();
  },
 };
}
