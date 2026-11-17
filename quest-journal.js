import {questRouteText} from './quest-route.js';
export function questStatus(q,state,quests){
 if(!state)return q.requires&&quests?.[q.requires]?.status!=='complete'?'locked':'unaccepted';
 if(state.status==='complete')return 'complete';
 return state.count>=q.goal?'ready':'active';
}
const labels={locked:'未解放',unaccepted:'未受注',active:'進行中',ready:'報告待ち',complete:'完了'};
export function questObjective(q,graph,state){
 const destination=graph.nodes.find(n=>q.kind==='boss'?n.challenge===q.target:n.id===q.target);
 const place=destination?.name||'目的地未登録';
 if(q.trail){
  if(state?.status==='complete')return '森から風見の丘への近道を開いた';
  if(!state?.count)return '旧道の下段で車輪跡、または上段で枝の赤い布をGキーで調べる';
  if(state.count===q.goal)return '近道から城門広場へ戻り、アンバーに報告する';
  return '風見の丘へ進み、見張りのヒルチャールを倒す';
 }
 if(q.cargo&&(!state||state.recovered)){
  if(state?.status==='complete')return '荷馬車を街へ戻した';
  const opening=q.goal-1;
  if(!state||state.count<opening)return `アンバーと南の街道へ出発し、スライムを${opening}体倒す（${state?.count??0}/${opening}）`;
  const remaining=q.cargo.filter(item=>!state.recovered[item.id]);
  if(remaining.length)return `Gキーで荷物を回収する（${q.cargo.length-remaining.length}/${q.cargo.length}）・残り ${remaining.map(item=>item.name).join('、')}`;
  if(state.count===q.goal)return '城門広場に戻り、アンバーに報告する';
  return '赤い布を引きずるヒルチャールを街道の奥で倒す';
 }
 return q.kind==='visit'?`${place}を訪れる`:q.kind==='kill'?`${place}で敵を${q.goal}体倒す`:`${place}の本編入口から挑戦し、ボスを討伐する`;
}
export function trackedQuestText(f,id){
 if(!f.story?.active)return '';
 const q=f.storyGraph.quests.find(q=>q.id===id);if(!q)return '';
 const st=f.story.quests[q.id],status=questStatus(q,st,f.story.quests),hub=f.storyGraph.nodes.find(n=>n.id===q.hub)?.name||q.hub;
 const next=status==='locked'?prerequisiteText(q,f.storyGraph):status==='unaccepted'?`${hub}で受注してください`:status==='ready'?`${hub}へ戻って報告してください`:status==='complete'?(q.repeatable?`${hub}で再受注できます`:'報酬受取済み'):questObjective(q,f.storyGraph,st);
 const route=status==='locked'?'':questRouteText(f,q,status);
 return `${q.name} ｜ ${labels[status]}${st?` ${st.count}/${q.goal}`:''} ｜ ${next}`+(route?' ｜ '+route:'');
}
function prerequisiteText(q,graph){
 const previous=graph.quests.find(quest=>quest.id===q.requires);
 return `先に「${previous?.name??q.requires}」を報告する`;
}
export function renderQuestJournal(f,{filter,onFilter,button,trackedId,onTrack}){
 const {story,storyGraph:graph}=f,section=document.createElement('section');section.id='questJournal';section.style.width='100%';
 const heading=document.createElement('h2');heading.textContent='依頼手帳';section.append(heading);
 const counts={locked:0,unaccepted:0,active:0,ready:0,complete:0};for(const q of graph.quests)counts[questStatus(q,story.quests[q.id],story.quests)]++;
 const summary=document.createElement('p');summary.textContent=Object.entries(labels).map(([key,label])=>`${label}${counts[key]}件`).join(' ／ ');section.append(summary);
 const label=document.createElement('label');label.textContent='表示する依頼 ';const select=document.createElement('select');select.id='questFilter';
 for(const [value,text] of Object.entries({relevant:'現在地の依頼＋受注済み',all:'すべて',...labels})){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o)}select.value=filter;select.onchange=()=>onFilter(select.value);label.append(select);section.append(label);
 let shown=0;
 for(const q of graph.quests){
  const st=story.quests[q.id],status=questStatus(q,st,story.quests);
  if(filter==='relevant'?q.hub!==story.node&&!st:filter!=='all'&&filter!==status)continue;
  shown++;const row=document.createElement('p');row.dataset.quest=q.id;row.dataset.status=status;
  const hub=graph.nodes.find(n=>n.id===q.hub)?.name||q.hub;
  row.textContent=`${q.name} ｜ ${labels[status]}${st?` ${st.count}/${q.goal}`:''}${q.repeatable?` ／ 報告${st?.cycles||0}回`:''}${q.join&&status==='complete'?(q.giver?`（${q.giver}加入済み）`:'（加入済み／初期装備は未実装）'):''} ｜ ${status==='locked'?prerequisiteText(q,graph):questObjective(q,graph,st)} ｜ 受注・報告：${hub} ｜ 仮報酬 ${q.xp}EXP / ${q.mora}モラ `;
  if(status==='unaccepted'||(status==='complete'&&q.repeatable)){const b=button('受注','story_accept:'+q.id);b.disabled=q.hub!==story.node;b.title=b.disabled?`${hub}で受注してください`:'';row.append(b)}
  if(status==='ready'){const b=button('報告','story_report:'+q.id);b.disabled=q.hub!==story.node;b.title=b.disabled?`${hub}へ戻って報告してください`:'';row.append(b)}
  if(onTrack){const b=document.createElement('button');b.textContent=trackedId===q.id?'追跡を解除':'この依頼を追跡';b.setAttribute('aria-pressed',String(trackedId===q.id));b.onclick=()=>onTrack(trackedId===q.id?null:q.id);row.append(b)}
  if(q.briefing&&(status==='unaccepted'||status==='complete')){
   const line=document.createElement('small');
   line.style.display='block';
   line.textContent=status==='complete'?q.closing:q.briefing;
   row.append(line);
  }
  if(q.note){const note=document.createElement('small');note.style.display='block';note.textContent=q.note;row.append(note)}
  section.append(row);
 }
 if(!shown){const empty=document.createElement('p');empty.textContent='この条件に当てはまる依頼はありません。';section.append(empty)}
 return section;
}
