export function initInventoryUI(action){
 const names=['','花：HP','羽：ATK','時計：ATK%','杯：元素ダメージ%','冠：会心ダメージ%'];let signature='';
 return {update(f){const bag=f.inventory;if(!bag)return;
  const ore=bag.upgradeOre??0;
  const companionName=f.companion?.name?.replace('（仮表示）','')??'アンバー';
  document.getElementById('inventoryStatus').textContent=`対象 ${bag.targetSet==='troupe'?'黄金の劇団':'剣闘士のフィナーレ'} ｜ 所持 ${bag.items.length}/80・未回収 ${bag.ground.length}・強化鉱石 ${ore} ｜ ${bag.message} ｜ 旅人ATK ${f.actors[0].atk}・${companionName}ATK ${f.actors[1].atk} ｜ 会心率 ${Math.round((f.actors[0].critRate||0)*100)}% / ${Math.round((f.actors[1].critRate||0)*100)}%`;
  const starter=f.starterEquipment;
  const starterText=document.getElementById('starterEquipmentStatus');
  starterText.hidden=!starter;
  if(starter){
   const flower=starter.useFlower?`HP +${starter.flower.hp}`:'バッグの花を装備中';
   const line=`${starter.weapon.name}（ATK +${starter.weapon.atk}）・${starter.flower.name}（${flower}）`;
   if(starterText.textContent!==line)starterText.textContent=line;
  }
  const sig=JSON.stringify([companionName,bag.items,ore]);if(sig===signature)return;signature=sig;
  const root=document.getElementById('inventoryRows');root.replaceChildren();
  for(const item of bag.items){const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:9px 0';
   const label=document.createElement('span');label.textContent=`#${item.id} ${names[item.slot]} ★${item.rarity} itemLv${item.itemLv} +${item.enhance} ${item.setId==='troupe'?'黄金の劇団':item.setId==='gladiator'?'剣闘士':'セットなし'} ${item.subpair==='atk_crit'?'ATK8%・会心4%':item.subpair==='hp_crit'?'HP8%・会心4%':'サブなし'} ｜ ${['未装備','旅人',companionName][item.owner]}`;row.append(label);
   const enhanceOptions=[['+4強化','upgrade']];
   if(ore)enhanceOptions.push([`鉱石で+4強化（${f.upgradeOreDiscount}モラ減）`,'useore']);
   for(const [label,cmd] of [['操作中キャラに装備','equip'],['外す','remove'],...enhanceOptions,[item.locked?'ロック解除':'ロック','lock'],[`売却 ${item.itemLv*item.rarity*10}モラ（仮）`,'sell']]){const b=document.createElement('button');b.textContent=label;b.disabled=cmd==='sell'&&(item.owner!==0||item.locked);b.onclick=()=>{action(`artifact_${cmd}:${item.id}`);b.blur()};row.append(b)}root.append(row);
  }
 }};
}
