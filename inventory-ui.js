export function initInventoryUI(action){
 const names=['','花：HP','羽：ATK','時計：ATK%','杯：元素ダメージ%','冠：会心ダメージ%'];let signature='';
 const companionNames={amber:'アンバー',columbina:'コロンビーナ',wanderer:'放浪者',beidou:'北斗',ayaka:'綾華',emilie:'エミリエ',kachina:'カチーナ',mitya:'ミティア'};
 const desk=document.getElementById('expeditionDesk');
 const gearRows=document.getElementById('expeditionGear');
 let gearSignature='';
 const equippedLabel=item=>item?`Lv${item.itemLv} ★${item.rarity} +${item.enhance} ／ 刻印${item.imprintStars??0}星`:'空き';
 const blocked=document.getElementById('artifactAttackBlock');
 const blockedText=document.getElementById('artifactAttackBlockText');
 const manage=document.getElementById('manageBlockedDrops');
 const root=document.getElementById('inventoryRows');
 const details=root.closest('details');
 const sets={gladiator:'剣闘士のフィナーレ',troupe:'黄金の劇団'};
 const number=new Intl.NumberFormat('ja-JP');
 const displaySet=id=>sets[id]??'セットなし';
 const previewControls=document.createElement('div');
 previewControls.className='controls';
 const previewStatus=document.createElement('div');
 previewStatus.id='artifactPreview';
 previewStatus.setAttribute('aria-live','polite');
 root.before(previewControls,previewStatus);
 const control=(label,command)=>{
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.onclick=()=>{action(command);button.blur()};
  return button;
 };
 for(const [type,label] of [['compare','教材で装備を比較'],['upgrade','教材で強化を試算'],['inherit','教材で継承を試算']]){
  previewControls.append(control(label,`artifact_example:${type}`));
 }
 function gearSelect(id,text){
  const label=document.createElement('label');
  const select=document.createElement('select');
  select.id=id;label.append(text+' ',select);previewControls.append(label);
  return select;
 }
 const source=gearSelect('artifactInheritSource','継承元（消費する品）');
 const target=gearSelect('artifactInheritTarget','継承先（残る品）');
 const inspect=document.createElement('button');
 inspect.type='button';inspect.textContent='選んだ品で継承を試算';
 inspect.onclick=()=>{if(source.value&&target.value)action(`artifact_inherit_preview:${source.value}:${target.value}`);inspect.blur()};
 previewControls.append(inspect);
 let previewSignature='';
 const pairOptions=(select,items)=>{
  const previous=select.value;
  select.replaceChildren(new Option('品を選ぶ',''),...items.map(item=>
   new Option(`#${item.id} ${names[item.slot]} ★${item.rarity} Lv${item.itemLv} +${item.enhance}`,item.id)));
  if(items.some(item=>String(item.id)===previous))select.value=previous;
 };
 const describe=item=>item?
  `${item.id?'#'+item.id+' ':''}${names[item.slot]} ${number.format(item.stat)} ／ ${displaySet(item.setId)} ／ Lv${item.itemLv} ★${item.rarity} +${item.enhance}・刻印${item.stars}星${item.subpair?' ／ '+(item.subpair==='atk_crit'?'ATK':'HP')+'8%・会心4%':''}`:'空き';
 function renderPreview(f){
  const inTown=f.campaign?.zone==='town';
  previewControls.hidden=!inTown;
  const view=inTown?f.artifactPreview:null;
  const affordable=view?.kind==='inherit'&&f.mora>=view.cost;
  const next=JSON.stringify([view,affordable,f.paused]);
  if(next===previewSignature)return;
  previewSignature=next;
  previewStatus.replaceChildren();
  if(!view)return;
  const message=text=>{const out=document.createElement('p');out.textContent=text;previewStatus.append(out)};
  if(view.error){message(view.error);return}
  if(view.kind==='compare'){
   message(`${view.example?'教材の比較':'装備の比較'} ｜ 対象ドロップ ${displaySet(view.targetSet)}`);
   message(`装備中 ${view.starter?`${view.starter.name} HP +${view.starter.hp}`:describe(view.before)}`);
   message(`比較する品 ${describe(view.after)}`);
   return;
  }
  message(`${view.example?'教材の':''}${view.kind==='upgrade'?'強化':'継承'}の試算 ｜ ${view.capped?'通常強化は上限です':number.format(view.cost)+'モラ'}`);
  if(view.source)message(`消費する品 ${describe(view.source)}`);
  message(`現在 ${describe(view.before)}`);
  message(`変更後 ${describe(view.after)}`);
  if(view.kind==='inherit'&&!view.example){
   const confirm=control('継承を確定して元の品を消費',`artifact_inherit_confirm:${view.source.id}:${view.before.id}`);
   confirm.disabled=!affordable||f.paused;
   if(!affordable)message('継承に必要なモラが足りません。');
   previewStatus.append(confirm);
  }
 }
 let returnAction;
 manage.onclick=()=>{
  if(returnAction)action(returnAction);
  details.open=true;
  details.querySelector('summary').focus();
 };
 return {update(f){const bag=f.inventory;if(!bag)return;
  renderPreview(f);
  blocked.hidden=!f.artifactAttackBlocked;
  if(f.artifactAttackBlocked){
   const inTown=f.campaign?.zone==='town';
   const node=f.story?.active&&f.storyGraph.nodes.find(node=>node.id===f.story.node);
   const checkpoint=node&&f.story.visited[node.checkpoint]?node.checkpoint:'mond-town';
   returnAction=inTown?null:node?`story_fast:${checkpoint}`:'town';
   const warning=`未回収の聖遺物が${bag.ground.length}個あるため、新しい攻撃が止まっています。バッグに空きを作って未回収品を取り寄せてください。`;
   if(blockedText.textContent!==warning)blockedText.textContent=warning;
   manage.textContent=inTown?'聖遺物バッグを開く':'拠点へ戻って整理';
  }
  const ore=bag.upgradeOre??0;
  const companionName=f.companion?.name?.replace('（仮表示）','')??'アンバー';
  const growth=f.imprintGrowth;
  desk.hidden=!f.storyExpeditionDesk;
  if(f.storyExpeditionDesk){
   const {barrier,practice}=f.storyExpeditionDesk;
   const status=`光界 ${growth.total} / 50（旅人 ${growth.byActor[0]}・${companionName} ${growth.byActor[1]}）　装備変更は拠点でできます。`;
   const practiceText=practice===undefined?'':`威力100の試打は障壁${barrier}で${practice}。現在の装備値で比較しています。`;
   if(document.getElementById('expeditionLight').textContent!==status)document.getElementById('expeditionLight').textContent=status;
   if(document.getElementById('expeditionTrial').textContent!==practiceText)document.getElementById('expeditionTrial').textContent=practiceText;
   const equipped=bag.items.filter(item=>item.owner===1||item.owner===2&&item.companionId===f.companion?.id);
   const next=JSON.stringify([companionName,equipped,f.starterEquipment]);
   if(next!==gearSignature){
    gearSignature=next;
    document.getElementById('expeditionCompanion').textContent=companionName;
    gearRows.replaceChildren();
    for(let slot=1;slot<=5;slot++){
     const row=document.createElement('tr');
     const part=document.createElement('th');part.scope='row';part.textContent=names[slot];row.append(part);
     for(const role of [1,2]){
      const gear=equipped.find(item=>item.owner===role&&item.slot===slot);
      const cell=document.createElement('td');
      cell.textContent=!gear&&role===2&&slot===1&&f.starterEquipment?.useFlower?
       `${f.starterEquipment.flower.name} ／ 刻印0星`:equippedLabel(gear);
      row.append(cell);
     }
     gearRows.append(row);
    }
   }
  }
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
  pairOptions(source,bag.items.filter(item=>item.owner===0&&!item.locked&&item.enhance>0));
  pairOptions(target,bag.items.filter(item=>!item.locked));
  inspect.disabled=!source.options[1]||!target.options[1];
  root.replaceChildren();
  for(const item of bag.items){const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:9px 0';
   const label=document.createElement('span');label.textContent=`#${item.id} ${names[item.slot]} ★${item.rarity} itemLv${item.itemLv} +${item.enhance} ${item.setId==='troupe'?'黄金の劇団':item.setId==='gladiator'?'剣闘士':'セットなし'} ${item.subpair==='atk_crit'?'ATK8%・会心4%':item.subpair==='hp_crit'?'HP8%・会心4%':'サブなし'} ／ 刻印${item.imprintStars??0}星 ｜ ${['未装備','旅人',companionNames[item.companionId]??companionName][item.owner]}`;row.append(label);
   const enhanceOptions=[['+4強化','upgrade']];
   if(ore)enhanceOptions.push([`鉱石で+4強化（${f.upgradeOreDiscount}モラ減）`,'useore']);
   const stars=item.imprintStars??0;
   if(item.enhance===item.rarity*4&&stars<growth.caps[item.rarity])enhanceOptions.push([`刻印 ${stars+1}星（${((stars+1)*growth.costPerStar).toLocaleString()}モラ）`,'imprint']);
   for(const [label,cmd] of [['操作中キャラに装備','equip'],['外す','remove'],['装備と比較','compare'],['強化を試算','preview'],...enhanceOptions,[item.locked?'ロック解除':'ロック','lock'],[`売却 ${item.itemLv*item.rarity*10}モラ（仮）`,'sell']]){const b=control(label,`artifact_${cmd}:${item.id}`);b.disabled=cmd==='sell'&&(item.owner!==0||item.locked);row.append(b)}root.append(row);
  }
 }};
}
