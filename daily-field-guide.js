import {json,sheet,paint} from './sprite-comparison.js';
const el=id=>document.getElementById(id);
const region=el('region'),menu=el('quest');
try{
 const [{quests},sprites,routes]=await Promise.all([json('content/daily-field-guide.json'),json('assets/daily-guide-sprites.json'),json('content/daily-guide-routes.json')]);
 const byId=new Map(quests.map(q=>[q.id,q]));
 const params=new URLSearchParams(location.search);
 const first=byId.get(params.get('quest'))||quests[0];
 for(const label of new Set(quests.map(q=>q.region)))region.add(new Option(label));
 let revision=0;
 function render(){
  const q=byId.get(menu.value),art=sprites[q.art],token=++revision;
  const url=new URL(location.href);url.searchParams.set('quest',q.id);history.replaceState(null,'',url);
  el('name').textContent=q.name;el('conditions').textContent=[q.kind==='main'?'主依頼':'追加依頼','Lv'+q.level,q.hubName,q.giver,q.unlock].filter(Boolean).join(' ｜ ');
  el('objective').textContent=q.target+'　目標 '+q.goal;el('reward').textContent='報酬　'+q.xp.toLocaleString('ja-JP')+' EXP・'+q.mora.toLocaleString('ja-JP')+' モラ';
  el('place').textContent=q.place+(q.enemy?'　'+q.enemy:'');
  for(const [link,node] of [['hubMap',q.hub],['fieldMap',q.node]])el(link).href='map-art.html?'+new URLSearchParams({node,placements:'live'});
  el('routeStart').textContent=q.hubName+'を出発（Lv'+q.level+'・地域の物語依頼を受ける前の経路）';
  const route=routes[[q.hub,q.level,q.node].join('/')];
  for(const [id,steps] of [['routeStops',route.outbound],['routeHome',route.home]]){
   el(id).replaceChildren(...steps.map(step=>{
    const item=document.createElement('li'),link=document.createElement('a');
    link.textContent=step.name;link.href='map-art.html?'+new URLSearchParams({node:step.node,placements:'live'});
    const gate=document.createElement('a');
    gate.textContent='出発側の門';gate.setAttribute('aria-label',step.name+'へ向かう出発側の門');
    gate.href='map-art.html?'+new URLSearchParams({node:step.from,to:step.node,gateX:step.x,gateY:step.y,placements:'live',compare:'background'});
    item.append(link,'（',gate,'）');
    if(step.requires)item.append('　'+step.requires);
    return item;
   }));
  }
  for(const profile of ['h48c32','h32c16'])paint(el(profile),art,profile);
  const source=el('source');source.getContext('2d').clearRect(0,0,source.width,source.height);
  delete source.dataset.art;el('error').textContent='';
  sheet(art.source).then(img=>{if(revision===token){paint(source,art,null,img);source.dataset.art=q.art}})
   .catch(()=>{if(revision===token)el('error').textContent='元絵を読み込めませんでした。'});
 }
 function fill(id){
  menu.replaceChildren(...quests.filter(q=>q.region===region.value).map(q=>new Option(q.name,q.id)));
  if(id)menu.value=id;
  render();
 }
 region.onchange=()=>fill();menu.onchange=render;region.value=first.region;fill(first.id);
}catch{el('error').textContent='依頼図鑑を読み込めませんでした。'}
