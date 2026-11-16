export function questStatus(q,state){
 if(!state)return 'unaccepted';
 if(state.status==='complete')return 'complete';
 return state.count>=q.goal?'ready':'active';
}
const labels={unaccepted:'未受注',active:'進行中',ready:'報告待ち',complete:'完了'};
export function questObjective(q,graph){
 const destination=graph.nodes.find(n=>q.kind==='boss'?n.challenge===q.target:n.id===q.target);
 const place=destination?.name||'目的地未登録';
 return q.kind==='visit'?`${place}を訪れる`:q.kind==='kill'?`${place}で敵を${q.goal}体倒す`:`${place}の本編入口から挑戦し、ボスを討伐する`;
}
export function trackedQuestText(f,id){
 if(!f.story?.active)return '';
 const q=f.storyGraph.quests.find(q=>q.id===id);if(!q)return '';
 const st=f.story.quests[q.id],status=questStatus(q,st),hub=f.storyGraph.nodes.find(n=>n.id===q.hub)?.name||q.hub;
 const next=status==='unaccepted'?`${hub}で受注してください`:status==='ready'?`${hub}へ戻って報告してください`:status==='complete'?(q.repeatable?`${hub}で再受注できます`:'報酬受取済み'):questObjective(q,f.storyGraph);
 return `${q.name} ｜ ${labels[status]}${st?` ${st.count}/${q.goal}`:''} ｜ ${next}`;
}
export function renderQuestJournal(f,{filter,onFilter,button,trackedId,onTrack}){
 const {story,storyGraph:graph}=f,section=document.createElement('section');section.id='questJournal';section.style.width='100%';
 const heading=document.createElement('h2');heading.textContent='依頼手帳';section.append(heading);
 const counts={unaccepted:0,active:0,ready:0,complete:0};for(const q of graph.quests)counts[questStatus(q,story.quests[q.id])]++;
 const summary=document.createElement('p');summary.textContent=Object.entries(labels).map(([key,label])=>`${label}${counts[key]}件`).join(' ／ ');section.append(summary);
 const label=document.createElement('label');label.textContent='表示する依頼 ';const select=document.createElement('select');select.id='questFilter';
 for(const [value,text] of Object.entries({relevant:'現在地の依頼＋受注済み',all:'すべて',...labels})){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o)}select.value=filter;select.onchange=()=>onFilter(select.value);label.append(select);section.append(label);
 let shown=0;
 for(const q of graph.quests){
  const st=story.quests[q.id],status=questStatus(q,st);
  if(filter==='relevant'?q.hub!==story.node&&!st:filter!=='all'&&filter!==status)continue;
  shown++;const row=document.createElement('p');row.dataset.quest=q.id;row.dataset.status=status;
  const hub=graph.nodes.find(n=>n.id===q.hub)?.name||q.hub;
  row.textContent=`${q.name} ｜ ${labels[status]}${st?` ${st.count}/${q.goal}`:''}${q.repeatable?` ／ 報告${st?.cycles||0}回`:''}${q.join&&status==='complete'?'（加入済み／初期装備は未実装）':''} ｜ ${questObjective(q,graph)} ｜ 受注・報告：${hub} ｜ 仮報酬 ${q.xp}EXP / ${q.mora}モラ `;
  if(status==='unaccepted'||(status==='complete'&&q.repeatable)){const b=button('受注','story_accept:'+q.id);b.disabled=q.hub!==story.node;b.title=b.disabled?`${hub}で受注してください`:'';row.append(b)}
  if(status==='ready'){const b=button('報告','story_report:'+q.id);b.disabled=q.hub!==story.node;b.title=b.disabled?`${hub}へ戻って報告してください`:'';row.append(b)}
  if(onTrack){const b=document.createElement('button');b.textContent=trackedId===q.id?'追跡を解除':'この依頼を追跡';b.setAttribute('aria-pressed',String(trackedId===q.id));b.onclick=()=>onTrack(trackedId===q.id?null:q.id);row.append(b)}
  if(q.note){const note=document.createElement('small');note.style.display='block';note.textContent=q.note;row.append(note)}
  section.append(row);
 }
 if(!shown){const empty=document.createElement('p');empty.textContent='この条件に当てはまる依頼はありません。';section.append(empty)}
 return section;
}
