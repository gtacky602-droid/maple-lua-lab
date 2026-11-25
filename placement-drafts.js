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
// Earlier placement drafts stored absolute heights. Shelf order and horizontal spans are unchanged.
const forestShelfHeights=[480,390,352,394,350];
const westIslandHeights=[480,408,369,404,378];
const mondRuinsHeights=[480,397,358,404,360];
const previousHeights=new Map([
 ['sites-hunt-7092',mondRuinsHeights],['sites-hunt-7111',mondRuinsHeights],['sites-hunt-7137',mondRuinsHeights],
 ['sites-hunt-15949',[480,398,345,396,348]],['sites-hunt-17223',westIslandHeights],
 ['sites-hunt-18667',westIslandHeights],['sites-hunt-20369',westIslandHeights],['sites-hunt-24906',westIslandHeights],
 ['sites-hunt-12788',westIslandHeights],['sites-hunt-12791',westIslandHeights],['sites-hunt-12794',westIslandHeights],
 ['sites-hunt-12778',[480,398,345,396,348]],
 ['sites-hunt-12781',[480,408,369,404,378]],['sites-hunt-12784',[480,408,369,404,378]],
 ['sites-hunt-28751',forestShelfHeights],['sites-hunt-28754',forestShelfHeights],
 ['sites-hunt-28755',forestShelfHeights],['sites-hunt-28757',[480,398,345,396,348]],
]);
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
   const oldHeights=previousHeights.get(id);
   const spansX=p=>e.x>=p.x&&e.x<=p.x+p.w;
   const support=node.platforms.find(p=>p.y===e.y&&spansX(p))
    ?? (oldHeights && node.platforms.find((p,i)=>oldHeights[i]===e.y&&spansX(p)));
   if(!support)throw Error(`${id}: 足場に接地していない個体があります。`);
   return {id:e.id,species:e.species,x:e.x,y:support.y,flip:e.flip};
  });
 }
 return {version:1,status:'visual-only draft; not canonical spawn geography or live combat placement',nodes};
}

// Inputs have already passed draft validation; identity is the stable spawn ID.
export function comparePlacements(baseline,draft){
 const before=new Map(baseline.map(e=>[e.id,e])),after=new Map(draft.map(e=>[e.id,e]));
 const added=draft.filter(e=>!before.has(e.id)),removed=baseline.filter(e=>!after.has(e.id)),changed=[];
 for(const e of draft){const old=before.get(e.id);if(!old)continue;const fields=['species','x','y','flip'].filter(k=>old[k]!==e[k]);if(fields.length)changed.push({id:e.id,before:old,after:e,fields})}
 return {added,removed,changed,unchanged:draft.length-added.length-changed.length};
}
