export function entranceKey(from,x,y){
 return [from,x,y??480].join(',');
}

export function showArenaEntrances(panel,node,gates,profile){
 panel.hidden=!gates.length;
 panel.querySelector('ul').replaceChildren(...gates.map(gate=>{
  const item=document.createElement('li'),link=document.createElement('a');
  link.textContent=gate.name+(gate.label?'・'+gate.label:'');
  const params=new URLSearchParams({node:gate.from,to:node,gateX:gate.x,gateY:gate.y,placements:'live',profile});
  if(gate.fixture)params.set('fixture',gate.fixture);
  if(gate.after)params.set('phase','after');
  if(gate.afterArrival)params.set('afterArrival',gate.afterArrival);
  link.href='map-art.html?'+params;
  item.append(link);
  if(gate.condition)item.append('　'+gate.condition);
  return item;
 }));
}
