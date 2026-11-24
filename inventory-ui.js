import {initWeaponUI} from './weapon-ui.js';

export const companionNames={amber:'アンバー',columbina:'コロンビーナ',wanderer:'放浪者',beidou:'北斗',ayaka:'綾華',emilie:'エミリエ',kachina:'カチーナ',mitya:'ミティア'};

export function initInventoryUI(action){
 const updateWeapons=initWeaponUI(action,companionNames);
 const names=['','花：HP','羽：ATK','時計：ATK%','杯：元素ダメージ%','冠：会心ダメージ%'];let signature='';
 const desk=document.getElementById('expeditionDesk');
 const gearRows=document.getElementById('expeditionGear');
 let gearSignature='';
 const equippedLabel=item=>item?`Lv${item.itemLv} ★${item.rarity} +${item.enhance} ／ 刻印${item.imprintStars??0}星`:'空き';
 const blocked=document.getElementById('artifactAttackBlock');
 const blockedText=document.getElementById('artifactAttackBlockText');
 const manage=document.getElementById('manageBlockedDrops');
 const natlanGuide=document.getElementById('natlanGearGuide');
 const natlanStatus=document.getElementById('natlanGearStatus');
 const natlanEquip=document.getElementById('natlanGearEquip');
 const natlanRoute=document.getElementById('natlanGearRoute');
 natlanRoute.onclick=()=>{
  action('story_fast:mond-town');
  action('world_map_focus:ridge-watch-domain');
 };
 const root=document.getElementById('inventoryRows');
 const details=root.closest('details');
 const rewardPanel=document.getElementById('storyArtifactChoices');
 const rewardRows=document.getElementById('storyArtifactChoiceRows');
 const rewardHint=document.getElementById('storyArtifactChoiceHint');
 let rewardSignature='';
 let sets={};
 const number=new Intl.NumberFormat('ja-JP');
 const displaySet=id=>sets[id]?.name??'セットなし';
 const previewControls=document.createElement('div');
 previewControls.className='controls';
 const previewStatus=document.createElement('div');
 previewStatus.id='artifactPreview';
 previewStatus.setAttribute('aria-live','polite');
 const imprintStatus=document.createElement('p');
 imprintStatus.id='inventoryImprintStatus';
 root.before(imprintStatus,previewControls,previewStatus);
 const control=(label,command)=>{
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.onclick=()=>{action(command);button.blur()};
  return button;
 };
 for(const [type,label] of [['compare','教材で装備を比較'],['upgrade','教材で強化を試算'],['inherit','教材で継承を試算'],['imprint','教材で刻印の一星を試算']]){
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
 const lineup=gearSelect('artifactPairCompanion','比較する同行候補');
 const compareLineup=document.createElement('button');
 compareLineup.type='button';compareLineup.textContent='編成の光界値を比較';
 compareLineup.onclick=()=>{if(lineup.value)action('artifact_pair_preview:'+lineup.value);compareLineup.blur()};
 previewControls.append(compareLineup);
 let previewSignature='';
 const pairOptions=(select,items)=>{
  const previous=select.value;
  select.replaceChildren(new Option('品を選ぶ',''),...items.map(item=>
   new Option(`#${item.id} ${names[item.slot]} ★${item.rarity} Lv${item.itemLv} +${item.enhance}`,item.id)));
  if(items.some(item=>String(item.id)===previous))select.value=previous;
 };
 const describe=item=>item?
  `${item.id?'#'+item.id+' ':''}${names[item.slot]} ${number.format(item.stat)} ／ ${displaySet(item.setId)} ／ Lv${item.itemLv} ★${item.rarity} +${item.enhance}・刻印${item.stars}星${item.subpair?' ／ '+(item.subpair==='atk_crit'?'ATK':'HP')+'8%・会心4%':''}`:'空き';
 function renderLineups(view){
  const table=document.createElement('table');
  const caption=table.createCaption();caption.textContent=`現在 ${view.before.total} / 50 → 比較先 ${view.after.total} / 50`;
  const headers=table.createTHead().insertRow();
  for(const label of ['聖遺物','旅人',`現在の${companionNames[view.before.companion]}`,`比較先の${companionNames[view.after.companion]}`]){
   const cell=document.createElement('th');cell.scope='col';cell.textContent=label;headers.append(cell);
  }
  const slots=table.createTBody();
  for(let i=0;i<5;i++){
   const row=slots.insertRow();
   const part=document.createElement('th');part.scope='row';part.textContent=names[i+1];row.append(part);
   for(const stars of [view.before.traveler[i],view.before.partner[i],view.after.partner[i]])row.insertCell().textContent=stars+'星';
  }
  const label=document.createElement('label'),select=document.createElement('select'),result=document.createElement('p');
  select.id='artifactBarrierTarget';
  label.append('出発先の目安を比べる ',select);
  select.replaceChildren(new Option('探索先を選ぶ',''),...view.barriers.map(target=>
   new Option(`${target.name} ｜ 光界値${target.barrier}`,target.id)));
  select.onchange=()=>{
   const target=view.barriers.find(target=>target.id===select.value);
   result.textContent=target?`障壁に威力100を当てた試算　現在 ${target.before} → 比較先 ${target.after}`:'';
  };
  previewStatus.append(table,label,result);
 }
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
  if(view.kind==='party'){
   message('旅人と選んだ同行仲間それぞれの装備5部位を集計します。');
   renderLineups(view);return;
  }
  if(view.kind==='imprint'){
   message(view.earned?'最初の一星で上がった能力':`${view.example?'教材の':''}刻印の一星 ｜ ${number.format(view.cost)}モラ`);
   message(`刻印前 ${describe(view.before)}`);
   message(`刻印後 ${describe(view.after)}`);
   message('刻印による主能力の伸びは固定です。追加効果の厳選は別の工程です。装備すると星の数が光界値に加わります。');
   return;
  }
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
 function renderRewardChoices(view){
  rewardPanel.hidden=!view;
  const next=JSON.stringify(view??null);
  if(next===rewardSignature)return;
  rewardSignature=next;
  if(!view)return;
  rewardRows.replaceChildren(...view.options.map(({name,offered,equipped})=>{
   const row=document.createElement('li');
   const stat=offered.slot===1?'HP':'ATK';
   const current=equipped?number.format(equipped.stat):'空き';
   row.textContent=`${name}（★${offered.rarity} Lv${offered.itemLv}）　主能力 ${stat}　装備中 ${current} → 報酬 ${number.format(offered.stat)}`;
   return row;
  }));
  rewardHint.textContent=view.full?'バッグが満杯です。町で空きを作ると受け取れます。':
   '受け取りたい札の前で G。セット効果とサブ能力は装備画面で確認できます。';
 }
 return {update(f){updateWeapons(f);const bag=f.inventory;if(!bag)return;
  sets=f.artifactSets??{};
  renderPreview(f);
  renderRewardChoices(f.storyArtifactChoices);
  if(f.story?.active&&f.story.node==='natlan-hub'&&!f.growthTrial){
   const missing=[1,2].filter(slot=>!bag.items.some(item=>item.owner===1&&item.slot===slot));
   const available=missing.filter(slot=>bag.items.some(item=>item.owner===0&&item.slot===slot));
   const needsDomain=missing.length>available.length;
   natlanGuide.hidden=missing.length===0;
   if(missing.length){
    const parts=missing.map(slot=>slot===1?'花':'羽').join('と');
    const text=needsDomain?`旅人の${parts}が空いています。モンドの「山脊の見守り」では、クリア報酬の部位が花・羽から順に巡ります。`:
     `旅人の${parts}が空いています。バッグにある聖遺物を装備できます。`;
    if(natlanStatus.textContent!==text)natlanStatus.textContent=text;
    natlanEquip.hidden=available.length===0;
    natlanRoute.hidden=!needsDomain||!f.story.visited['mond-town'];
   }
  }else natlanGuide.hidden=true;
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
  const imprintLine=`装備の光界値 ${growth.total} / 50（旅人 ${growth.byActor[0]} ＋ ${companionName} ${growth.byActor[1]}） ｜ 共通戦闘ゲージ ${Math.floor(f.gauge??0)} / 100`;
  if(imprintStatus.textContent!==imprintLine)imprintStatus.textContent=imprintLine;
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
  const companionId=f.companion?.id??'amber';
  const sig=JSON.stringify([companionId,bag.items,ore]);if(sig===signature)return;signature=sig;
  const previous=lineup.value;
  lineup.replaceChildren(new Option('同行候補を選ぶ',''),...Object.entries(companionNames)
   .filter(([id])=>id!==companionId).map(([id,name])=>new Option(name,id)));
  if([...lineup.options].some(option=>option.value===previous)&&previous)lineup.value=previous;
  compareLineup.disabled=!lineup.value;
  lineup.onchange=()=>{compareLineup.disabled=!lineup.value};
  pairOptions(source,bag.items.filter(item=>item.owner===0&&!item.locked&&item.enhance>0));
  pairOptions(target,bag.items.filter(item=>!item.locked));
  inspect.disabled=!source.options[1]||!target.options[1];
  root.replaceChildren();
  for(const item of bag.items){const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:9px 0';
   const label=document.createElement('span');label.textContent=`#${item.id} ${names[item.slot]} ★${item.rarity} itemLv${item.itemLv} +${item.enhance} ${displaySet(item.setId)} ${item.subpair==='atk_crit'?'ATK8%・会心4%':item.subpair==='hp_crit'?'HP8%・会心4%':'サブなし'} ／ 刻印${item.imprintStars??0}星 ｜ ${['未装備','旅人',companionNames[item.companionId]??companionName][item.owner]}`;row.append(label);
   const enhanceOptions=[['+4強化','upgrade']];
   if(ore)enhanceOptions.push([`鉱石で+4強化（${f.upgradeOreDiscount}モラ減）`,'useore']);
   const stars=item.imprintStars??0;
   if(item.enhance===item.rarity*4)enhanceOptions.push(['刻印の一星を見る','stampview']);
   if(item.enhance===item.rarity*4&&stars<growth.caps[item.rarity])enhanceOptions.push([`刻印 ${stars+1}星（${((stars+1)*growth.costPerStar).toLocaleString()}モラ）`,'imprint']);
   for(const [label,cmd] of [['操作中キャラに装備','equip'],['外す','remove'],['装備と比較','compare'],['強化を試算','preview'],...enhanceOptions,[item.locked?'ロック解除':'ロック','lock'],[`売却 ${item.itemLv*item.rarity*10}モラ（仮）`,'sell']]){const b=control(label,`artifact_${cmd}:${item.id}`);b.disabled=cmd==='sell'&&(item.owner!==0||item.locked);row.append(b)}root.append(row);
  }
 }};
}
