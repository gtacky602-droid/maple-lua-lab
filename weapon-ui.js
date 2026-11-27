import {questDestinations} from './quest-route.js';
import {questStatus,questStatusLabels} from './quest-journal.js';

export function initWeaponUI(action,companionNames){
 const panel=document.getElementById('weaponPanel');
 const root=document.getElementById('weaponRows');
 const equipped=document.getElementById('weaponEquipped');
 const status=document.getElementById('weaponStatus');
 const number=new Intl.NumberFormat('ja-JP');
 let signature='',graph;
 let questsById,nodesById;
 const label=owner=>owner==='traveler'?'旅人':companionNames[owner];

 function button(row,text,command,disabled){
  const control=document.createElement('button');
  control.type='button';
  control.textContent=text;
  control.disabled=disabled;
  control.onclick=()=>{action(command);control.blur()};
  row.append(control);
 }

 return frame=>{
  const view=frame.weaponView;
  panel.hidden=!view;
  if(!view||!panel.open)return;
  if(graph!==frame.storyGraph){
   graph=frame.storyGraph;
   questsById=new Map((graph?.quests??[]).map(q=>[q.id,q]));
   nodesById=new Map((graph?.nodes??[]).map(n=>[n.id,n]));
  }
  const progress=frame.story?.quests;
  const sources=new Map();
  for(const item of view.options){
   if(item.owned)continue;
   const quest=questsById?.get(item.quest);
   if(!quest)continue;
   const state=questStatus(quest,progress?.[quest.id],progress,frame.progression?.level??0,frame.growthEligibility);
   const {candidates}=questDestinations(frame,quest,state);
   const targets=[...new Set(candidates)].filter(id=>nodesById.has(id));
   sources.set(item.id,{state,targets,level:quest.level});
  }
  const next=JSON.stringify([view,frame.mora,[...sources]]);
  if(signature===next)return;
  signature=next;
  const byId=new Map(view.options.map(item=>[item.id,item]));
  const current=id=>{
   const item=byId.get(id);
   return item?`${item.name} +${item.level}`:'基本装備';
  };
  equipped.textContent=`旅人　${current(view.traveler)} ／ ${label(view.companion)}　${current(view.partner)} ／ ${number.format(frame.mora)} モラ`;
  status.textContent=view.notice??(view.editable?'武器の攻撃力・強化費は試作値です。':'装備変更と強化は町で行います。');
  root.replaceChildren();
  for(const item of view.options){
   const row=document.createElement('div');
   row.className='controls';row.dataset.weapon=item.id;
   const detail=document.createElement('span');
   detail.className='weapon-description';
   if(item.owned){
    const holder=item.equippedTo?` ／ ${label(item.equippedTo)}が装備中`:'';
    const nextAttack=item.nextAtk===item.atk?'同じ':number.format(item.nextAtk);
    const growth=item.cost!=null?` ／ +${item.level+1}で武器ATK ${nextAttack}`:' ／ 強化上限';
    detail.textContent=`${item.name} +${item.level} ／ ${item.type} ／ 武器ATK ${number.format(item.atk)}${holder}${growth}`;
   }else{
    const source=sources.get(item.id);
    const state=source?' ／ '+questStatusLabels[source.state]:'';
    const level=source?.level?'・受注Lv'+source.level:'';
    detail.textContent=`${item.name} ／ ${item.type} ／ 入手先「${item.questName}」${state}${level}`;
   }
   row.append(detail);
   if(item.owned){
    if(item.traveler&&item.equippedTo!=='traveler'){
     button(row,'旅人に装備',`weapon_equip:traveler:${item.id}`,!view.editable);
    }
    if(item.partner&&item.equippedTo!==view.companion){
     button(row,`${label(view.companion)}に装備`,`weapon_equip:partner:${item.id}`,!view.editable);
    }
    if(item.cost!=null){
     button(row,`強化 ${number.format(item.cost)}モラ`,`weapon_upgrade:${item.id}`,!view.editable||frame.mora<item.cost);
    }
   }else{
    const source=sources.get(item.id);
    const destination=source?.state==='active'?'次の目的地・':'受注・報告先・';
    for(const id of source?.targets??[]){
     button(row,destination+nodesById.get(id).name,'world_map_focus:'+id,false);
    }
   }
   root.append(row);
  }
 };
}
