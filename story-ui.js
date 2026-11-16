import {renderQuestJournal,trackedQuestText} from './quest-journal.js';
let questFilter='relevant',trackedId=null;
const trackingKey='maple-lua-lab-tracked-quest';
try{trackedId=localStorage.getItem(trackingKey)}catch{}
function trackQuest(id){trackedId=id;try{if(id)localStorage.setItem(trackingKey,id);else localStorage.removeItem(trackingKey)}catch{}previous='';update()}
document.getElementById('clearTrackedQuest').onclick=()=>trackQuest(null);
const panel=document.getElementById('storyPanel');let previous='';
function button(label,action){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{window.lab.action(action);b.blur()};return b}
function update(){
 const f=window.lab?.frame;if(!f?.story)return;
 const signature=JSON.stringify([f.story,f.bossJourney,f.storyNotice,f.imprintTrial,f.progression?.level,Math.ceil(f.voyage?.seconds||0)]);if(signature===previous)return;previous=signature;
 const tracked=document.getElementById('trackedQuest'),text=trackedQuestText(f,trackedId);tracked.hidden=!text;document.getElementById('trackedQuestText').textContent=text;
 panel.replaceChildren();const title=document.createElement('p');title.textContent=`本編ルート試作：モンド → スネージナヤ（${f.storyGraph.nodes.length}表示地点・${f.storyGraph.quests.length}表示依頼）。配置・敵・報酬は仮設定。背景画像は共用。`;panel.append(title,button('本編ルートへ','story_start'));
 if(f.bossJourney){const notice=document.createElement('p');notice.textContent=f.bossJourney.name+'・本編挑戦'+(f.bossJourney.defeated?'／討伐済み':'');panel.append(notice,button('挑戦入口へ戻る','world_boss_return'));}
 if(!f.story.active)return;
 const graph=f.storyGraph,node=graph.nodes.find(n=>n.id===f.story.node);
 const position=document.createElement('p');position.textContent=node.name+' ｜ '+(f.storyNotice||'水色の門まで歩き、Fキーか画面下のボタンで移動。璃月はLv20から。');if(f.voyage)position.textContent+=' ／ 到着まで '+Math.ceil(f.voyage.seconds)+'秒（'+(f.voyage.stopover?'寄港中・途中下船可':'航海中')+'）';panel.append(position);
 if(node.challenge)panel.append(button('挑戦：'+node.challengeName,'world_boss:'+node.challenge));
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 780 ${Math.ceil(graph.nodes.length/6)*100}`);svg.style.width='100%';svg.style.maxWidth='780px';
 const coords=new Map(graph.nodes.map((n,i)=>[n.id,{x:65+(i%6)*130,y:30+Math.floor(i/6)*100}]));
 for(const n of graph.nodes)for(const edge of n.exits){const a=coords.get(n.id),b=coords.get(edge.to);const line=document.createElementNS(svg.namespaceURI,'line');Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#83dbe1'}).forEach(([k,v])=>line.setAttribute(k,v));svg.append(line)}
 graph.nodes.forEach(n=>{
  const p=coords.get(n.id),circle=document.createElementNS(svg.namespaceURI,'circle');Object.entries({cx:p.x,cy:p.y,r:12,fill:n.id===node.id?'#ffe296':f.story.visited[n.id]?'#83dbe1':'#66727b'}).forEach(([k,v])=>circle.setAttribute(k,v));svg.append(circle);
  const text=document.createElementNS(svg.namespaceURI,'text');text.setAttribute('x',p.x);text.setAttribute('y',p.y+35);text.setAttribute('text-anchor','middle');text.setAttribute('fill','currentColor');text.setAttribute('font-size','11');text.textContent=n.name;svg.append(text);
 });panel.append(svg);
 const barrier=document.createElement('p');barrier.textContent='障壁の検証値 '+f.imprintTrial+' / 50（刻印装備は未連動・保存しません）。仮式：0で10%、基準値で100%のダメージ。';panel.append(barrier);
 for(const value of [0,3,8,10,13,25,30,35,40,50]){const b=button('検証値 '+value,'barrier_trial:'+value);b.disabled=!node.hub;panel.append(b)}
 if(node.lightReference){const note=document.createElement('p');note.textContent='この分岐の光界値目安：'+node.lightReference+'。入場条件ではありません。敵/障壁は試作です。';panel.append(note)}

 for(const h of node.hints||[])panel.append(button('調べる：'+h.label,'story_discover:'+h.group));
 for(const e of node.exits){const n=graph.nodes.find(n=>n.id===e.to);const b=button('門：'+n.name+' Lv'+n.level,'story_portal:'+n.id);if(e.windowStart){b.disabled=!f.voyage?.stopover;b.title='出航30〜50秒の寄港中に下船できます。'}if(e.requiresArrival)b.disabled=!!f.voyage;panel.append(b)}
 for(const n of graph.nodes.filter(n=>n.hub&&f.story.visited[n.id]))panel.append(button('拠点へ：'+n.name,'story_fast:'+n.id));
 panel.append(renderQuestJournal(f,{filter:questFilter,button,trackedId,onTrack:trackQuest,onFilter:value=>{questFilter=value;previous='';update()}}));
}
setInterval(update,200);
