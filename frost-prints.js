import {loadScenery,scenery,sceneryDefinitions,sceneryKey,sceneryStatus} from './scenery.js';

export function initFrostPrints(dispatch){
 const panel=document.getElementById('frostPrints');
 const select=panel.querySelector('#frostSheet'),tier=panel.querySelector('#frostInk');
 const paper=panel.querySelector('canvas'),ctx=paper.getContext('2d',{willReadFrequently:true});
 const text=panel.querySelector('figcaption'),locate=panel.querySelector('button');
 let data,graph,signature='',revision=0;
 async function show(){
  const version=++revision,page=data?.entries[Number(select.value)];
  if(!page)return;
  const node=graph.nodes.find(n=>n.id===page.node);
  if(!node)return;
  const camera=Math.max(0,Math.min(page.x-480,node.width-960));
  const frame={campaign:{zone:'story:'+node.id},story:{active:true,node:node.id},storyGraph:graph,
               camera,platforms:node.platforms||[]};
  const key=sceneryKey(frame),definition=sceneryDefinitions[key],rectangles=Number(tier.value);
  const file=rectangles===0?definition.file:rectangles===6144?definition.decodedPreview:definition.decodedTiers;
  locate.onclick=()=>dispatch('world_map_focus:'+node.id);
  text.textContent=page.caption;
  delete paper.dataset.sheet;delete paper.dataset.tier;
  ctx.clearRect(0,0,paper.width,paper.height);
  await loadScenery(frame,file);
  if(version!==revision)return;
  if(sceneryStatus(frame,file).state!=='ready'){text.textContent=page.caption+'（背景を読み込めませんでした）';return}
  const tile=rectangles>0&&rectangles<6144?(rectangles-4096)/512:undefined;
  ctx.save();
  ctx.scale(paper.width/960,paper.height/540);
  scenery(ctx,frame,rectangles?file:undefined,tile,key);
  const inks=[data.stone,data.snow,page.ink];
  function rub(x,y,scale){
   for(const [dx,dy,w,h,color] of data.shape){
    ctx.fillStyle=inks[color-1];ctx.fillRect(x+dx*scale,y+dy*scale,w*scale,h*scale);
   }
  }
  rub(page.x-camera,page.y,1);
  // The pinned inset uses the same marks as the outcrop on the field.
  ctx.fillStyle='#473c35';ctx.fillRect(700,38,224,190);
  ctx.fillStyle='#efdfba';ctx.fillRect(704,42,216,182);
  rub(812,208,4);
  ctx.fillStyle='#725b43';ctx.fillRect(803,33,18,13);
  ctx.restore();
  paper.dataset.sheet=select.value;paper.dataset.tier=tier.value;
 }
 select.onchange=show;tier.onchange=show;
 return function update(next,storyGraph){
  const stamp=next?.entries.map(page=>page.node+'/'+page.x).join('|')||'';
  if(stamp===signature)return;
  signature=stamp;revision++;data=next;graph=storyGraph;panel.hidden=!next;
  if(!next)return;
  select.replaceChildren(...data.entries.map((p,i)=>new Option(p.title,String(i))));
  select.value=String(data.entries.length-1);
  show();
 };
}
