// Guidance over the published graph only. Never moves the player or unlocks gates.
export function questRouteText(f,q,status){
 if(!f.story?.active||!q||(status==='complete'&&!q.repeatable))return '';
 const graph=f.storyGraph,nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 const target=status==='active'?(q.kind==='boss'?graph.nodes.find(n=>n.challenge===q.target)?.id:q.target):q.hub;
 if(!nodes.has(target))return '目的地は未公開または未登録です。';
 const from=f.story.node;if(!nodes.has(from))return '';
 if(from===target)return status==='active'?'目的地に到着しています。':'受注・報告の拠点にいます。';
 const queue=[[from]],seen=new Set([from]);let path;
 for(let i=0;i<queue.length;i++){
  const current=queue[i],node=nodes.get(current.at(-1));
  for(const edge of node.exits||[]){
   if(!nodes.has(edge.to)||seen.has(edge.to))continue;
   const next=[...current,edge.to];if(edge.to===target){path=next;break}
   seen.add(edge.to);queue.push(next);
  }
  if(path)break;
 }
 if(!path)return '公開中の地点からつながる経路がありません。';
 const next=nodes.get(path[1]),edge=nodes.get(from).exits.find(e=>e.to===next.id);
 const required=Math.max(...path.slice(1).map(id=>nodes.get(id).level||1));
 const notes=[];
 if((f.progression?.level??0)<required)notes.push(`経路上にLv${required}が必要な地点があります`);
 if(edge.windowStart!==undefined){
  const elapsed=f.voyage?.elapsed;
  if(elapsed===undefined)notes.push('寄港中のみ下船できます');
  else if(elapsed+1e-8<edge.windowStart)notes.push(`寄港まで約${Math.ceil(edge.windowStart-elapsed)}秒`);
  else if(elapsed+1e-8>=edge.windowEnd)notes.push('寄港時間を過ぎています。出発港へ戻り、再乗船してください');
  else notes.push(`寄港中：下船できる残り時間は約${Math.ceil(edge.windowEnd-elapsed)}秒`);
 }else if(edge.requiresArrival)notes.push(`船の到着を待ちます${f.voyage?`（約${Math.ceil(f.voyage.seconds)}秒）`:''}`);
 else notes.push('次の地点の門へ歩いて移動してください');
 if(f.paused)notes.push('一時停止中');
 return `次は ${next.name} → 目的地：${nodes.get(target).name}（残り${path.length-1}区間・拠点移動を除く接続経路）。${notes.join('。')}。`;
}
