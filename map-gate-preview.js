// Match story.lua's traveler arrival and 960px camera for a physical gate.
export function arrivalCamera(from,gate,destination){
 let x=gate.arrivalX;
 if(x==null){
  const back=destination.exits.findLast(edge=>edge.to===from&&!edge.returnOnly);
  const ride=gate.liftSeconds||gate.boatSeconds||gate.waterwaySeconds||gate.phaseSeconds;
  x=back&&back.x>=720?destination.width-160:160;
  if(ride&&back)x=back.x;
 }
 return Math.max(0,Math.min(Math.round(x-400),destination.width-960));
}

// Match physical coordinates because discovery can hide individual exits from Lua's M-map.
export function setupGatePreview(panel, camera, liveView, query, render, showDarkRoom, fixtures) {
 const select=panel.querySelector('select'),link=panel.querySelector('a'),position=panel.querySelector('output');
 const control=panel.querySelector('#fixtureControl'),state=control.querySelector('input');
 state.onchange=render;
 let active=null,arrival=0;
 function selectGate(node,nodes,initial=false){
  const index=Number(select.value);
  active=index>0?node.exits[index-1]:null;
  control.hidden=!active?.routeFixture;
  state.checked=initial && active?.to===query.get('to') && query.get('fixture')==='open';
  panel.querySelector('#focusGate').hidden=link.hidden=position.hidden=!active;
  if(active){
   arrival=arrivalCamera(node.id,active,nodes.get(active.to));
   const y=active.y??480;
   camera.value=Math.max(0,Math.min(Number(camera.max),active.x-480));
   position.textContent=(node.swim||node.toyDive?'水中':y<480?'上段':y>480?'下段':'地上')+'（'+active.x+', '+y+'）';
   link.textContent=nodes.get(active.to).name+'の景色を見る';
  }
 }
 return {
  selectedGate(){return active},
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
   selectGate(node,nodes,initial);
   select.onchange=()=>{selectGate(node,nodes);if(active?.darkOnly)showDarkRoom();render()};
  },
  updateLink(params){
   if(!active)return;
   const target=new URLSearchParams(params);
   target.set('placements','live');target.set('node',active.to);target.delete('phase');target.delete('light');
   target.set('camera',arrival);
   target.set('from',params.get('node'));target.set('departureX',active.x);
   link.href='map-art.html?'+target;
  },
  draw(ctx,offset,dark){
   if(!active || (active.darkOnly&&!dark))return;
   const x=Math.round(active.x-offset),y=Math.round(active.y??480);
   const art=fixtures[active.routeFixture];
   if(art){
    ctx.save();
    for(const rows of [art.base,state.checked?art.open:art.closed,art.cap??[]]){
     for(const [dx,dy,w,h,color] of rows){
      ctx.fillStyle=color;ctx.fillRect(x+dx,y+dy,w,h);
     }
    }
    ctx.restore();
   }
   // The pointed tip is the exact portal coordinate, even on a raised platform.
   ctx.save();
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-9,y-13);ctx.lineTo(x+9,y-13);ctx.closePath();
   ctx.fillStyle='#ffe680';ctx.strokeStyle='#3c2818';ctx.lineWidth=2;ctx.fill();ctx.stroke();
   ctx.restore();
  },
 };
}
