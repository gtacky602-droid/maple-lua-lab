const storageKey='maple-lua-lab.daily-profile';
const calendar=new Intl.DateTimeFormat('ja-JP',{timeZone:'UTC',month:'long',day:'numeric'});
const number=new Intl.NumberFormat('ja-JP');

export function initDailyBoard(dispatch){
 const board=document.getElementById('dailyBoard');
 const title=document.getElementById('dailyBoardTitle');
 const details=document.getElementById('dailyBoardPeriod');
 const status=document.getElementById('dailyBoardNotice');
 const accepted=document.getElementById('dailyActive');
 const previous=document.getElementById('dailyCarry');
 const choices=document.getElementById('dailyChoices');
 let profile,signature='';
 try{
  const value=localStorage.getItem(storageKey);
  if(/^[0-9a-f]{32}$/.test(value??''))profile=value;
 }catch{}

 const element=(tag,text)=>{
  const node=document.createElement(tag);
  if(text)node.textContent=text;
  return node;
 };

 function card(entry,mode){
  const node=element('article');
  node.dataset.dailyId=entry.id;
  node.dataset.dailyMode=mode;
  const kind=entry.kind==='main'?'主依頼':'追加依頼';
  node.append(element('h3',entry.name));
  node.append(element('p',`${kind} ｜ ${entry.giver} ｜ ${entry.region}`));
  node.append(element('p',entry.target));
  if(mode==='offer'){
   node.append(element('p',`目標 ${entry.goal} ｜ ${number.format(entry.xp)} EXP・${number.format(entry.mora)} モラ`));
  }else{
   const progress=element('progress');
   progress.max=entry.goal;
   progress.value=entry.count;
   progress.setAttribute('aria-label',entry.name+'の進み具合');
   node.append(progress,element('p',`${entry.count} / ${entry.goal}${entry.claimed?' ｜ 受取済み':''}`));
  }
  const isOffer=mode==='offer';
  if(isOffer||(!entry.claimed&&entry.count===entry.goal)){
   const key=isOffer?'accept':mode==='carry'?'carry':'claim';
   const label=isOffer?(entry.companion?'同行中の'+entry.giver+'から受注':'受注'):'報酬を受け取る';
   const button=element('button',label);
   button.type='button';
   button.disabled=isOffer?!entry.accept:!entry.canClaim;
   button.onclick=()=>dispatch('daily_'+key+':'+entry.id);
   node.append(button);
   if(button.disabled){
    node.append(element('small',isOffer?(entry.reason??'一時停止中'):`受取先は${entry.hub}`));
   }
  }
  return node;
 }

 return {
  request:()=>profile?{dailyProfile:profile}:{},
  update(view){
   if(view?.profile&&view.profile!==profile){
    profile=view.profile;
    try{localStorage.setItem(storageKey,profile)}catch{}
   }
   board.hidden=!view?.period;
   if(board.hidden)return;
   const key=JSON.stringify(view);
   if(key===signature)return;
   signature=key;
   const used=view.usedSlots, limits=view.limits;
   title.textContent=`日次依頼　主 ${used.main}/${limits.main} ｜ 追加 ${used.extra}/${limits.extra}`;
   const day=calendar.format(new Date(view.period*86400000));
   const reset=String(view.resetHour).padStart(2,'0')+':00';
   details.textContent=`${day}分 ｜ 毎日 ${reset}（日本時間）に更新。進行中の依頼は更新まで、達成済みの未受取分は翌日まで有効です。`;
   status.textContent=view.notice??'';
   const groups=[
    [accepted,view.activeSlots,'active'],
    [previous,view.carrySlots,'carry'],
    [choices,view.dailyChoices,'offer'],
   ];
   for(const [section,items,mode] of groups){
    section.hidden=!items.length;
    section.querySelector('.dailyCards').replaceChildren(...items.map(item=>card(item,mode)));
   }
  },
 };
}
