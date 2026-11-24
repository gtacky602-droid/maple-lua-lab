export function initWeaponUI(action,companionNames){
 const panel=document.getElementById('weaponPanel');
 const root=document.getElementById('weaponRows');
 const equipped=document.getElementById('weaponEquipped');
 const status=document.getElementById('weaponStatus');
 const number=new Intl.NumberFormat('ja-JP');
 let signature='';
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
  const next=JSON.stringify([view,frame.mora]);
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
   }else detail.textContent=`${item.name} ／ ${item.type} ／ 入手先「${item.questName}」`;
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
   }
   root.append(row);
  }
 };
}
