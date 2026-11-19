import {renderQuestJournal,trackedQuestText} from './quest-journal.js';
import {initEndgameUI} from './endgame-ui.js';
const updateEndgame=initEndgameUI(action=>window.lab.action(action));
let questFilter='relevant',trackedId=null;
let waypointSelection='';
const trackingKey='maple-lua-lab-tracked-quest';
try{trackedId=localStorage.getItem(trackingKey)}catch{}
function trackQuest(id){trackedId=id;try{if(id)localStorage.setItem(trackingKey,id);else localStorage.removeItem(trackingKey)}catch{}previous='';update()}
document.getElementById('clearTrackedQuest').onclick=()=>trackQuest(null);
const panel=document.getElementById('storyPanel');let previous='';
function button(label,action){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{window.lab.action(action);b.blur()};return b}
const practiceGuides={
 SK58:'攻撃で共通ゲージを60までため、Qで光界解放。近い標的にJで強化通常攻撃を当てます。',
 SK59:'ゲージ60でQ、1で雷撃、2で光界反響。光界解放が切れる前に反響を当てます。',
 SK60:'攻撃で共通ゲージを100までため、3で七律開天。Qの光界解放でも同じゲージを使います。',
};
function renderGrowthPractice(frame){
 const trial=frame.growthTrial,hud=document.getElementById('growthTrialHud');
 hud.hidden=!trial;
 document.getElementById('growthBranchObserve').hidden=!frame.growthBranchObserve;
 if(!trial)return;
 document.getElementById('growthTrialEcho').hidden=trial.skill!=='SK59';
 document.getElementById('growthTrialSeven').hidden=trial.skill!=='SK60';
 const quest=frame.storyGraph.quests.find(q=>q.id===trial.quest);
 const done=quest.lesson.every(lesson=>trial.marks?.[lesson.id]);
 document.getElementById('growthTrialHelp').textContent=done?
  '練習目標を達成しました。練習を終えると依頼手帳から報告できます。':
  practiceGuides[trial.skill]+' 冒険のHP・技の待ち時間・ゲージ・装備は入場前のままです。';
}
function update(){
 const f=window.lab?.frame;if(!f?.story)return;
 updateEndgame(f);
 const signature=JSON.stringify([f.story,f.bossJourney,f.storyNotice,f.storyLift?.destination,f.storyLocalLight?.mode,f.imprintTrial,f.imprintOverride,f.imprintGrowth?.total,f.growthEligibility,f.growthTrial,f.growthBranchObserve,f.azhdahaLobby,f.progression?.level,f.companion?.id,Math.ceil(f.voyage?.seconds||0),f.voyage?.stopover]);if(signature===previous)return;previous=signature;
 renderGrowthPractice(f);
 const tracked=document.getElementById('trackedQuest'),text=trackedQuestText(f,trackedId);tracked.hidden=!text;document.getElementById('trackedQuestText').textContent=text;
 panel.replaceChildren();const title=document.createElement('p');title.textContent=`本編ルート試作：モンド → スネージナヤ（${f.storyGraph.nodes.length}表示地点・${f.storyGraph.quests.length}表示依頼）。配置・敵・報酬は仮設定。背景画像は共用。`;panel.append(title,button('本編ルートへ','story_start'));
 if(f.bossJourney){const notice=document.createElement('p');notice.textContent=f.bossJourney.name+'・本編挑戦'+(f.bossJourney.defeated?'／討伐済み':'');panel.append(notice,button('挑戦入口へ戻る','world_boss_return'));}
 if(!f.story.active)return;
 const graph=f.storyGraph,node=graph.nodes.find(n=>n.id===f.story.node);
 const position=document.createElement('p');position.textContent=node.name+' ｜ '+(f.storyNotice||'水色の門まで歩き、Fキーか画面下のボタンで移動。璃月はLv20から。');
 const trolley=f.voyage?.kind==='trolley';
 if(f.voyage){
  const phase=trolley?(f.voyage.stopover?'停車中・途中下車可':'トロッコで移動中'):(f.voyage.stopover?'寄港中・途中下船可':'航海中');
  position.textContent+=' ／ 到着まで '+Math.ceil(f.voyage.seconds)+'秒（'+phase+'）';
 }
 panel.append(position);
 if(f.azhdahaLobby){
  const field=document.createElement('fieldset');field.id='azhdahaElements';
  const legend=document.createElement('legend');legend.textContent='若陀龍王が吸収する元素';field.append(legend);
  const element={pyro:'炎',hydro:'水',electro:'雷',cryo:'氷'};
  for(const pair of f.azhdahaLobby.choices){
   const choice=button(pair.map(key=>element[key]).join('＋'),'azhdaha_pair:'+pair.join(':'));
   choice.setAttribute('aria-pressed',String(pair.every((key,i)=>f.azhdahaLobby.selected[i]===key)));
   if(choice.getAttribute('aria-pressed')==='true')choice.className='selected';
   field.append(choice);
  }
  panel.append(field);
 }
 if(!f.bossJourney){
  const comparison=document.createElement('a');
  comparison.href='map-art.html?'+new URLSearchParams({node:node.id});
  comparison.textContent='この地点の配置比較を開く';comparison.target='_blank';comparison.rel='noopener';
  panel.append(comparison);
 }
 if(node.challenge)panel.append(button('挑戦：'+node.challengeName,'world_boss:'+node.challenge));
 const restPoints=new Set(graph.nodes.filter(n=>n.restWaypoint&&f.story.visited[n.id]&&
  f.story.quests[n.restWaypoint.quest]?.status==='complete').map(n=>n.id));
 for(const n of graph.nodes.filter(n=>restPoints.has(n.id))){
  const rest=button('休憩へ：'+n.restWaypoint.label,'story_fast:'+n.id);
  rest.dataset.restWaypoint=n.id;
  rest.disabled=f.voyage?.kind==='ferry';
  panel.append(rest);
 }
 const waypoints=graph.nodes.filter(n=>n.waypoint);
 if(waypoints.length){
  const list=document.createElement('div');list.className='controls';list.id='storyWaypoints';
  const label=document.createElement('label');label.htmlFor='storyWaypointDestination';
  const visited=waypoints.filter(n=>f.story.visited[n.id]);
  label.textContent=`地図のワープ地点・神像 ${visited.length} / ${waypoints.length}`;
  const choice=document.createElement('select');choice.id='storyWaypointDestination';
  choice.style.maxWidth='100%';
  const placeholder=new Option('移動先を選ぶ','');choice.add(placeholder);
  const regions=new Map();
  for(const n of visited){
   const area=n.waypoint.area??n.region;
   if(!regions.has(area)){
    const group=document.createElement('optgroup');group.label=area;
    choice.append(group);regions.set(area,group);
   }
   const option=new Option(n.name,n.id);
   option.disabled=n.id===node.id||n.level>(f.progression?.level??0);
   regions.get(area).append(option);
  }
  const travel=document.createElement('button');travel.type='button';travel.textContent='ワープする';
  choice.value=visited.some(n=>n.id===waypointSelection&&n.id!==node.id&&n.level<=(f.progression?.level??0))
   ?waypointSelection:'';
  travel.disabled=!choice.value||!!f.storyLift||!!f.voyage;
  choice.onchange=()=>{waypointSelection=choice.value;travel.disabled=!choice.value||!!f.storyLift||!!f.voyage};
  travel.onclick=()=>{if(choice.value&&!travel.disabled){window.lab.action('story_fast:'+choice.value);travel.blur()}};
  list.append(label,choice,travel);panel.append(list);
 }
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 780 ${Math.ceil(graph.nodes.length/6)*100}`);svg.style.width='100%';svg.style.maxWidth='780px';
 const coords=new Map(graph.nodes.map((n,i)=>[n.id,{x:65+(i%6)*130,y:30+Math.floor(i/6)*100}]));
 for(const n of graph.nodes)for(const edge of n.exits){const a=coords.get(n.id),b=coords.get(edge.to);const line=document.createElementNS(svg.namespaceURI,'line');Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#83dbe1'}).forEach(([k,v])=>line.setAttribute(k,v));svg.append(line)}
 graph.nodes.forEach(n=>{
  const p=coords.get(n.id),circle=document.createElementNS(svg.namespaceURI,'circle');Object.entries({cx:p.x,cy:p.y,r:12,fill:n.id===node.id?'#ffe296':restPoints.has(n.id)?'#ffc58a':f.story.visited[n.id]?'#83dbe1':'#66727b'}).forEach(([k,v])=>circle.setAttribute(k,v));svg.append(circle);
  if(restPoints.has(n.id)){
   circle.setAttribute('role','button');
   circle.setAttribute('tabindex','0');
   circle.setAttribute('aria-label',n.restWaypoint.label+'へ移動する');
   circle.style.cursor='pointer';
   const travel=()=>window.lab.action('story_fast:'+n.id);
   circle.onclick=travel;
   circle.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();travel()}};
  }
  const text=document.createElementNS(svg.namespaceURI,'text');text.setAttribute('x',p.x);text.setAttribute('y',p.y+35);text.setAttribute('text-anchor','middle');text.setAttribute('fill','currentColor');text.setAttribute('font-size','11');text.textContent=n.name;svg.append(text);
 });panel.append(svg);
 const barrier=document.createElement('p');barrier.textContent=`装備の光界値 ${f.imprintGrowth?.total??0} / 50${f.imprintOverride?` ｜ 障壁に使う検証値 ${f.imprintTrial}（保存対象外）`:''}。試作の障壁は0で10%、基準値以上で100%のダメージ。`;panel.append(barrier);
 if(f.imprintOverride){const b=button('装備の光界値を使う','barrier_from_equipment');b.disabled=!node.hub;panel.append(b)}
 for(const value of [0,3,8,10,13,25,30,35,40,50]){const b=button('検証値 '+value,'barrier_trial:'+value);b.disabled=!node.hub;panel.append(b)}
 if(node.lightReference){const note=document.createElement('p');note.textContent='この分岐の光界値目安：'+node.lightReference+'。入場条件ではありません。敵/障壁は試作です。';panel.append(note)}

 for(const h of node.hints||[])panel.append(button('調べる：'+h.label,'story_discover:'+h.group));
 for(const e of node.exits){const n=graph.nodes.find(n=>n.id===e.to);const b=button('門：'+(e.rideLabel||n.name)+' Lv'+n.level,'story_portal:'+n.id);if(e.windowStart){b.disabled=!f.voyage?.stopover;b.title=trolley?'停車中に途中下車できます。':'寄港中に途中下船できます。'}if(e.requiresArrival)b.disabled=!!f.voyage;if(e.darkOnly&&f.storyLocalLight?.mode!=='dark'){b.disabled=true;b.title='室内で消灯すると現れます。'}panel.append(b)}
 for(const n of graph.nodes.filter(n=>n.hub&&f.story.visited[n.id])){
  const travel=button('拠点へ：'+n.name,'story_fast:'+n.id);
  travel.disabled=f.voyage?.kind==='ferry';
  panel.append(travel);
 }
 panel.append(renderQuestJournal(f,{filter:questFilter,button,trackedId,onTrack:trackQuest,onFilter:value=>{questFilter=value;previous='';update()}}));
}
setInterval(update,200);
