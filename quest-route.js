// Guidance over the published graph only. Never moves the player or unlocks gates.
export function questRouteText(f,q,status){
 if(!f.story?.active||!q||f.storyLift||(status==='complete'&&!q.repeatable))return '';
 const graph=f.storyGraph,nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 let target=status==='active'?(q.kind==='boss'?graph.nodes.find(n=>n.challenge===q.target)?.id:q.target):q.hub;
 if(status==='active'&&q.book&&(f.story.quests?.[q.id]?.count??0)<2)target=q.book.proof.node;
 if(status==='active'&&q.recovery&&f.story.quests?.[q.id]?.recovered)target=q.recovery.node;
 if(status==='active'&&q.delivery){
  const state=f.story.quests?.[q.id]?.delivery;
  const cache=q.delivery.cache.id;
  if(q.delivery.packages.some(p=>!state?.delivered[p.id]&&(p.id!==cache||state?.recovered)))target=q.hub;
 }
 const lookingForClues=status==='active'&&q.trail&&!f.story.quests?.[q.id]?.count;
 const ingredients=status==='active'&&q.cooking?.ingredients.filter(item=>!f.story.quests?.[q.id]?.cooking.gathered[item.id]);
 const marks=status==='active'&&q.stone?.marks.filter(item=>!f.story.quests?.[q.id]?.stone.marked[item.id]);
 const unfinished=ingredients?.length?ingredients:marks?.length?marks:lookingForClues?q.trail.clues:null;
 const destinations=unfinished?unfinished.map(item=>item.node):[target];
 const targets=new Set(destinations.filter(id=>nodes.has(id)));
 if(!targets.size)return '目的地は未公開または未登録です。';
 const from=f.story.node;if(!nodes.has(from))return '';
 if(targets.has(from))return status==='active'?'目的地に到着しています。':'受注・報告の拠点にいます。';
 function meetsRule(rule){
  const state=f.story.quests?.[rule.quest];
  return state?.status==='complete'||(rule.count!==undefined&&state?.count>=rule.count&&(!rule.recovery||state?.recovered));
 }
 function gateOpen(edge){
  const rule=edge.requires;
  return !rule||meetsRule(rule)||(rule.alternative&&meetsRule(rule.alternative));
 }
 const level=f.progression?.level??0;
 function routeAtLevel(limit){
  const queue=[[from]],seen=new Set([from]);
  for(let i=0;i<queue.length;i++){
   const current=queue[i],node=nodes.get(current.at(-1));
   for(const edge of node.exits||[]){
    if(!nodes.has(edge.to)||seen.has(edge.to)||!gateOpen(edge)||(nodes.get(edge.to).level||1)>limit)continue;
    const next=[...current,edge.to];if(targets.has(edge.to))return next;
    seen.add(edge.to);queue.push(next);
   }
  }
 }
 // Prefer the shortest level-eligible route. If none exists, show the route
 // needing the smallest level increase, then the fewest transitions.
 let path=routeAtLevel(level);
 if(!path)for(const limit of [...new Set([...nodes.values()].map(n=>n.level||1))].filter(n=>n>level).sort((a,b)=>a-b)){
  path=routeAtLevel(limit);if(path)break;
 }
 if(!path)return '公開中の地点からつながる経路がありません。';
 const next=nodes.get(path[1]),edge=nodes.get(from).exits.find(e=>e.to===next.id);
 const required=Math.max(...path.slice(1).map(id=>nodes.get(id).level||1));
 const notes=[];
 if(level<required)notes.push(`現在のレベルでは通れません。経路上にLv${required}が必要な地点があります`);
 const actor=f.actors?.find(a=>a.id===f.active);
 if(actor&&Number.isFinite(actor.x)&&Number.isFinite(actor.y)&&Number.isFinite(edge.x)){
  const dx=edge.x-actor.x;
  if(Math.abs(dx)>=90)notes.push(`次の門は${dx>0?'右':'左'}にあります`);
  else if(Math.abs(actor.y-(edge.y??480))>=60)notes.push(edge.y===undefined?'門の横位置まで来ています。地上へ降りてください':'門のある足場へ移動してください');
  else notes.push(edge.liftSeconds?'昇降台の近くです。「F：昇降台に乗る」で進めます':'次の門の近くです。移動条件を満たすと「F：この門を通る」で進めます');
 }
 if(edge.windowStart!==undefined){
  const elapsed=f.voyage?.elapsed;
  if(elapsed===undefined)notes.push('寄港中のみ下船できます');
  else if(elapsed+1e-8<edge.windowStart)notes.push(`寄港まで約${Math.ceil(edge.windowStart-elapsed)}秒`);
  else if(elapsed+1e-8>=edge.windowEnd)notes.push('寄港時間を過ぎています。出発港へ戻り、再乗船してください');
  else notes.push(`寄港中：下船できる残り時間は約${Math.ceil(edge.windowEnd-elapsed)}秒`);
 }else if(edge.requiresArrival){
  const seconds=f.voyage?.seconds;
  if(Number.isFinite(seconds)&&seconds<=0)notes.push('船は到着しています。下船する門へ進んでください');
  else notes.push(`船の到着を待ちます${Number.isFinite(seconds)?`（約${Math.ceil(seconds)}秒）`:''}`);
 }
 else notes.push('次の地点の門へ歩いて移動してください');
 if(f.paused)notes.push('一時停止中');
 return `次は ${next.name} → 目的地：${nodes.get(path.at(-1)).name}（残り${path.length-1}区間・拠点移動を除く接続経路）。${notes.join('。')}。`;
}
