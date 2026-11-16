export const MAX_DRAFT_BYTES=512*1024;
export const MAX_NODE_PLACEMENTS=128;
export const MAX_TOTAL_PLACEMENTS=1024;
export function validatePlacementDraft(input,graph,species){
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 if(!object(input)||input.version!==1||!object(input.nodes))throw Error('対応する配置案JSON（version 1）を選んでください。');
 const known=new Map(graph.nodes.map(n=>[n.id,n])),allowed=new Set(species),nodes={};let total=0;
 for(const [id,items] of Object.entries(input.nodes)){
  const node=known.get(id);if(!node)throw Error(`不明な地点です: ${id}`);
  if(!Array.isArray(items)||items.length>MAX_NODE_PLACEMENTS)throw Error(`${id}: 1地点の配置は${MAX_NODE_PLACEMENTS}体までです。`);
  total+=items.length;if(total>MAX_TOTAL_PLACEMENTS)throw Error(`全地点の配置は${MAX_TOTAL_PLACEMENTS}体までです。`);
  const ids=new Set();nodes[id]=items.map(e=>{
   if(!object(e)||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(e.id)||ids.has(e.id))throw Error(`${id}: 個体IDが不正または重複しています。`);ids.add(e.id);
   if(!allowed.has(e.species))throw Error(`${id}: 未対応の敵種です。`);
   if(!Number.isFinite(e.x)||!Number.isFinite(e.y)||e.x<0||e.x>node.width||typeof e.flip!=='boolean')throw Error(`${id}: 座標または向きが不正です。`);
   if(!node.platforms.some(p=>p.y===e.y&&e.x>=p.x&&e.x<=p.x+p.w))throw Error(`${id}: 足場に接地していない個体があります。`);
   return {id:e.id,species:e.species,x:e.x,y:e.y,flip:e.flip};
  });
 }
 return {version:1,status:'visual-only draft; not canonical spawn geography or live combat placement',nodes};
}
