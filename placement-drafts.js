export const MAX_DRAFT_BYTES=512*1024;
export const MAX_NODE_PLACEMENTS=128;
export const MAX_TOTAL_PLACEMENTS=1024;
// Convert authored spawn support indices to the visual editor's grounded coordinates.
export function liveNodeDraft(input,graph,nodeId,species){
 const node=graph.nodes.find(n=>n.id===nodeId);
 if(!node||input?.version!==1||!input.nodes||Array.isArray(input.nodes))throw Error('本編配置の形式が不正です。');
 const items=input.nodes[nodeId];
 if(items===undefined&&!node.hub&&!node.peaceful)throw Error('この戦闘地点の本編配置がありません。');
 if(items!==undefined&&!Array.isArray(items))throw Error('本編配置の個体一覧が不正です。');
 const aliases={'hydro-slime':'hydro-slime-reference','pyro-slime':'pyro-slime-reference'};
 const converted=(items??[]).map(e=>{
  if(!e||!Number.isInteger(e.platform)||!node.platforms[e.platform])throw Error('本編配置の足場番号が不正です。');
  const support=node.platforms[e.platform];
  if(e.x<support.x||e.x>support.x+support.w)throw Error('本編配置が指定足場の外にあります。');
  return {id:e.id,species:aliases[e.art]??e.art,x:e.x,y:support.y,flip:false};
 });
 return validatePlacementDraft({version:1,nodes:{[nodeId]:converted}},graph,species).nodes[nodeId];
}
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
