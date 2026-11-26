// Guidance over the published graph only. Never moves the player or unlocks gates.
export function questTargetNode(q,graph){
 if(q.kind!=='boss')return q.target;
 return graph.nodes.find(n=>n.challenge===q.target)?.id??graph.bossNodes?.[q.target];
}

export function hasOptionalPath(q,state){
 return q?.anyPath&&state?.status==='complete'&&state.pathProgress&&
  q.paths.some(p=>(state.pathProgress[p.id]?.count??0)<p.steps.length);
}

export function pendingQuestPaths(q,state){
 if(!q.paths)return [];
 return q.paths.map(path=>{
  const count=state?.pathProgress?.[path.id]?.count??0;
  return {path,step:path.steps[count],count};
 }).filter(p=>p.step);
}

export function questDestinations(f,q,status,preferredNode){
 const optional=hasOptionalPath(q,f.story.quests?.[q.id]);
 const graph=f.storyGraph;
 const activeCount=f.story.quests?.[q.id]?.count??0;
 const milestone=status==='active'?q.itinerary?.[activeCount]:null;
 let branches;
 if(milestone?.kind==='paths'||optional){
  const pending=pendingQuestPaths(q,f.story.quests?.[q.id]);
  const local=pending.filter(({step})=>(step.from??step.node)===f.story.node);
  const started=pending.filter(p=>p.count>0);
  branches=(local.length?local:started.length?started:pending).map(p=>p.step);
 }
 const arrival=milestone?.kind==='arrive'&&milestone.from?milestone:
  branches?.find(s=>s.kind==='arrive'&&s.from);
 let target=status==='active'?questTargetNode(q,graph):q.hub;
 if(status==='active'&&q.itinerary)target=arrival?.from??milestone?.node;
 if(status==='active'&&q.sights&&f.story.quests?.[q.id]&&!f.story.quests[q.id].sights)target=q.sights.legacyTarget;
 if(status==='active'&&q.contest&&activeCount===4)target=q.contest.cape;
 if(status==='active'&&q.forest)target=q.forest.rooms[activeCount]?.node??q.target;
 if(status==='active'&&q.lantern){
  if(activeCount===0)target=q.hub;
  else if(activeCount<4)target=q.lantern.trail;
 }
 if(status==='active'&&q.cave&&activeCount===3)target=q.cave.depth;
 if(status==='active'&&q.roof){
  const stage=f.storyRoof?.retry?f.storyRoof.stage:activeCount;
  target=stage===q.roof.marks.length?q.roof.lookout:q.target;
 }
 if(status==='active'&&q.book&&(f.story.quests?.[q.id]?.count??0)<2)target=q.book.proof.node;
 const work=status==='active'&&f.story.quests?.[q.id]?.construction;
 if(work?.plan)target=q.construction.plans.find(plan=>plan.id===work.plan)?.site.node??target;
 if(status==='active'&&q.recovery&&f.story.quests?.[q.id]?.recovered)target=q.recovery.node;
 if(status==='active'&&q.delivery){
  const state=f.story.quests?.[q.id]?.delivery;
  const cache=q.delivery.cache.id;
  const canRecover=f.story.node===q.target && !state?.recovered;
  if(!canRecover && q.delivery.packages.some(p=>!state?.delivered[p.id]&&(p.id!==cache||state?.recovered)))target=q.hub;
 }
 const lookingForClues=status==='active'&&q.trail&&!f.story.quests?.[q.id]?.count;
 const ingredients=status==='active'&&q.cooking?.ingredients.filter(item=>!f.story.quests?.[q.id]?.cooking.gathered[item.id]);
 const marks=status==='active'&&q.stone?.marks.filter(item=>!f.story.quests?.[q.id]?.stone.marked[item.id]);
 const surveys=work&&q.construction.surveys.filter(item=>!work.surveyed[item.id]);
 const unfinished=ingredients?.length?ingredients:marks?.length?marks:surveys?.length?surveys:lookingForClues?q.trail.clues:null;
 const destinations=arrival?[arrival.from]:branches?branches.flatMap(item=>[item.node,...(item.alternatives??[]).map(place=>place.node)])
  :unfinished?unfinished.map(item=>item.node):[target,...(milestone?.alternatives??[]).map(item=>item.node)];
 const candidates=unfinished?.some(item=>item.node===preferredNode)?[preferredNode]:destinations;
 return {candidates,arrival};
}

export function windTiming(wind){
 return wind.calm?'風が弱まっています。通過できる時間はあと約'+wind.seconds+'秒':'風が弱まるまであと約'+wind.seconds+'秒';
}

export function questRoute(f,q,status,preferredNode){
 const optional=hasOptionalPath(q,f.story?.quests?.[q?.id]);
 if(!f.story?.active||!q||f.storyLift||(status==='complete'&&!q.repeatable&&!optional))return {text:''};
 const graph=f.storyGraph,nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 const {candidates,arrival}=questDestinations(f,q,status,preferredNode);
 const targets=new Set(candidates.filter(id=>nodes.has(id)));
 if(!targets.size)return {text:'目的地は未公開または未登録です。'};
 const from=f.story.node;if(!nodes.has(from))return {text:''};
 if(status==='active'&&q.cave&&f.storyCave?.falling&&targets.has(q.cave.depth)){
  return {node:q.cave.depth,text:'床が崩れて落下中です。着地すると下層の鉱石を拾えます。'};
 }
 if(targets.has(from)&&!arrival)return {node:from,text:status==='active'||optional?'目的地に到着しています。':'受注・報告の拠点にいます。'};
 function meetsRule(rule){
  const questState=f.story.quests?.[rule.quest];
  if(rule.unreported)return questState?.status!=='complete';
  const state=rule.path?questState?.pathProgress?.[rule.path]:questState;
  if(rule.before!==undefined&&state?.count>=rule.before)return false;
  if(rule.construction)return state?.status==='complete'&&state.construction?.plan===rule.construction;
  const requiresBranch=rule.path&&graph.quests?.some(q=>q.id===rule.quest&&q.anyPath);
  return (!requiresBranch&&questState?.status==='complete')||(rule.count!==undefined&&state?.count>=rule.count&&(!rule.recovery||state?.recovered));
 }
 function gateOpen(edge){
  if(edge.roofTrialStage&&f.storyRoof?.retry&&f.storyRoof.stage<edge.roofTrialStage)return false;
  const rule=edge.requires;
  return !rule||meetsRule(rule)||(rule.alternative&&meetsRule(rule.alternative));
 }
 function connections(node){
  const exits=node.exits??[];
  const ride=node.voyage;
  return ride && !exits.some(e=>e.to===ride.destination)?[...exits,{to:ride.destination}]:exits;
 }
 if(arrival&&(!nodes.has(arrival.node)||!connections(nodes.get(arrival.from)).some(edge=>edge.to===arrival.node&&gateOpen(edge))))
  return {text:'指定された出発地点の門から通れる経路がありません。'};
 const elapsed=f.voyage?.elapsed;
 const missed=edge=>edge.windowEnd!==undefined && elapsed+1e-8>=edge.windowEnd;
 const currentStops=connections(nodes.get(from));
 const missedStop=currentStops.some(edge=>missed(edge)&&(targets.has(edge.to)||arrival?.from===from&&arrival.node===edge.to));
 const nextRide=currentStops.some(missed);
 const level=f.progression?.level??0;
 function routeAtLevel(limit){
  if(arrival&&(nodes.get(arrival.node).level||1)>limit)return;
  if(arrival&&targets.has(from)&&currentStops.some(e=>e.to===arrival.node&&gateOpen(e)&&!missed(e)))return [from,arrival.node];
  // Reboarding after a missed stop starts a new trip with a fresh stop window.
  const queue=[[from]],seen=new Set(nextRide?[]:[from]);
  for(let i=0;i<queue.length;i++){
   const current=queue[i],node=nodes.get(current.at(-1));
   for(const edge of connections(node)){
    if(i===0&&missed(edge))continue;
    if(i!==0&&node.voyage?.source===edge.to)continue;
    if(!nodes.has(edge.to)||seen.has(edge.to)||!gateOpen(edge)||(nodes.get(edge.to).level||1)>limit)continue;
    const next=[...current,edge.to];if(targets.has(edge.to))return arrival?[...next,arrival.node]:next;
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
 if(!path)return {text:'公開中の地点からつながる経路がありません。'};
 const next=nodes.get(path[1]);
 const actor=f.actors?.find(a=>a.id===f.active);
 const gates=connections(nodes.get(from)).filter(e=>e.to===next.id&&gateOpen(e)&&!missed(e));
 const distance=e=>Math.abs(actor.x-e.x)+Math.abs(actor.y-(e.y??480));
 const edge=gates.length>1&&Number.isFinite(actor?.x)&&Number.isFinite(actor?.y)
  ?gates.reduce((best,e)=>distance(e)<distance(best)?e:best):gates[0];
 const required=Math.max(...path.slice(1).map(id=>nodes.get(id).level||1));
 const notes=[];
 if(missedStop)notes.push(f.voyage?.kind==='trolley'?'停留所を通過しました':'寄港時間を過ぎています');
 const vehicle=nodes.get(from).voyage;
 const automatic=vehicle?.destination===edge.to;
 const portal=Array.isArray(f.storyPortals)&&f.storyPortals.find(p=>p.gateX===edge.x&&p.to===edge.to&&p.y===(edge.y??480));
 const wind=portal?.wind;
 const needsDark=edge.darkOnly && f.storyLocalLight?.mode!=='dark';
 if(level<required)notes.push(`現在のレベルでは通れません。経路上にLv${required}が必要な地点があります`);
 if(needsDark){
  const control=nodes.get(from).localLight?.controls.find(c=>!c.darkOnly);
  if(control && actor){
   const dx=control.x-actor.x;
   const direction=Math.abs(dx)<54?'近く':dx>0?'右手':'左手';
   notes.push(`${direction}の操作盤でGを押して消灯してください`);
  }else notes.push('室内の操作盤でGを押して消灯してください');
 }else if(!automatic&&actor&&Number.isFinite(actor.x)&&Number.isFinite(actor.y)&&Number.isFinite(edge.x)){
  const dx=edge.x-actor.x;
  if(Math.abs(dx)>=90)notes.push(`次の門は${dx>0?'右':'左'}にあります`);
  else if(Math.abs(actor.y-(edge.y??480))>=60)notes.push(edge.y===undefined?'門の横位置まで来ています。地上へ降りてください':'門のある足場へ移動してください');
  else if(wind&&!wind.calm)notes.push('風待ちの入口に着きました');
  else if(f.voyage?.kind==='trolley'&&edge.windowStart!==undefined)notes.push('停車したら「F：途中下車する」で降りられます');
  else if(next.voyage?.kind==='train')notes.push('乗り場に着きました。「F：列車に乗る」で進めます');
  else if(next.voyage?.kind==='trolley')notes.push('乗り場に着きました。「F：トロッコに乗る」で進めます');
  else if(edge.boatSeconds)notes.push('桟橋に着きました。「F：小舟に乗る」で進めます');
  else if(edge.waterwaySeconds)notes.push('乗り継ぎ場に着きました。「F：水路を渡る」で進めます');
  else notes.push(edge.liftSeconds?'昇降台の近くです。「F：昇降台に乗る」で進めます':'次の門の近くです。移動条件を満たすと「F：この門を通る」で進めます');
 }
 if(wind)notes.push(windTiming(wind));
 if(edge.windowStart!==undefined){
  const elapsed=f.voyage?.elapsed;
  if(f.voyage?.kind==='trolley'){
   if(elapsed+1e-8<edge.windowStart)notes.push('停留所に近づいています');
   else notes.push('停車中。途中下車できます');
  }else if(elapsed===undefined)notes.push('寄港中のみ下船できます');
  else if(elapsed+1e-8<edge.windowStart)notes.push(`寄港まで約${Math.ceil(edge.windowStart-elapsed)}秒`);
  else notes.push(`寄港中：下船できる残り時間は約${Math.ceil(edge.windowEnd-elapsed)}秒`);
 }else if(automatic){
  const seconds=f.voyage?.seconds;
  const name=vehicle.kind==='train'?'列車':vehicle.kind==='trolley'?'トロッコ':'船';
  notes.push(`${name}に乗ったまま${next.name}へ。到着すると自動で降ります${Number.isFinite(seconds)&&seconds>0?`（あと約${Math.ceil(seconds)}秒）`:''}`);
 }
 else if(edge.darkOnly)notes.push(needsDark?'消灯すると影の足場と門が現れます':'消灯中。影の足場へ跳び、上段の門を通ってください');
 else if(vehicle?.source===edge.to)notes.push(path[2]===from?'出発港へ戻る門を使い、もう一度乗船してください':'出発港へ戻る門を使ってください');
 else if(!wind||wind.calm)notes.push('次の地点の門へ歩いて移動してください');
 if(f.paused)notes.push('一時停止中');
 const focus=arrival && from!==arrival.from ? arrival.from : path.at(-1);
 const reported=node=>f.story.quests?.[node.locationAfterReport?.quest]?.status==='complete';
 let params,gateLabel;
 if(automatic){
  params=new URLSearchParams({node:next.id,voyage:from,placements:'live',compare:'background'});
  if(reported(next))params.set('phase','after');
  gateLabel=next.name+'の到着位置を見る';
 }else if(Number.isFinite(edge.x)){
  params=new URLSearchParams({node:from,to:edge.to,gateX:edge.x,gateY:edge.y??480,placements:'live',compare:'background'});
  if(portal?.sealState)params.set('fixture',portal.sealState);
  if(reported(nodes.get(from)))params.set('phase','after');
  if(reported(next))params.set('afterArrival',next.id);
  gateLabel='次の門の位置を見る';
 }
 const gateUrl=params?'map-art.html?'+params:undefined;
 return {node:focus,gateUrl,gateLabel,text:`次は ${next.name} → 目的地：${nodes.get(path.at(-1)).name}（残り${path.length-1}区間・拠点移動を除く接続経路）。${notes.join('。')}。`};
}

export function questRouteText(f,q,status){
 return questRoute(f,q,status).text;
}
