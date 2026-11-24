import {companionNames} from './inventory-ui.js';

function partyPresetControls(action,names){
 const panel=document.getElementById('partyPresets'),root=document.getElementById('partyPresetRows');
 const status=document.getElementById('partyPresetStatus');
 const rows=[];
 for(let slot=1;slot<=3;slot++){
  const row=document.createElement('div');row.className='controls';row.dataset.preset=slot;
  const summary=document.createElement('span');summary.className='preset-description';
  const register=document.createElement('button'),apply=document.createElement('button');
  register.type=apply.type='button';
  register.onclick=()=>action('party_preset_store:'+slot);
  apply.onclick=()=>action('party_preset_apply:'+slot);
  apply.textContent='適用';apply.setAttribute('aria-label',`枠${slot}を適用`);
  row.append(summary,register,apply);root.append(row);
  rows.push({slot,summary,register,apply});
 }
 const setText=(node,message)=>{if(node.textContent!==message)node.textContent=message};
 return f=>{
  if(!panel.open)return;
  const owned=new Set((f.inventory?.items||[]).map(item=>item.id));
  for(const {slot,summary,register,apply} of rows){
   const preset=f.partyPresets?.[slot];
   const equipment=preset?[...preset.traveler,...preset.partner].filter(Boolean):[];
   const missing=equipment.filter(id=>!owned.has(id));
   const skills=preset?.loadout.filter(row=>row.length)||[];
   let description='未登録';
   if(preset){
    const parts=[companionNames[preset.companion],`聖遺物${equipment.length}点`];
    const sword=f.weaponView?.options.find(item=>item.id===preset.weapons?.traveler);
    if(sword)parts.push(`旅人：${sword.name}`);
    if(skills.length){
     const first=skills[0].map(id=>names[id]).join(' → ');
     parts.push(skills.length>1?`${first} ほか${skills.length-1}枠`:first);
    }
    description=parts.join(' ／ ');
    if(missing.length)description+=`（装備 #${missing.join('、#')} が見つかりません）`;
   }
   setText(summary,`枠${slot}　${description}`);
   const saveLabel=preset?'上書き':'登録';
   if(register.textContent!==saveLabel){
    register.textContent=saveLabel;
    register.setAttribute('aria-label',`枠${slot}を${saveLabel}`);
   }
   register.disabled=!f.partyPresetsEditable;
   apply.disabled=!f.partyPresetsEditable||!preset||missing.length>0;
  }
  setText(status,f.partyPresetMessage||'');
 };
}

export async function initSkillUI(action,configure){
 const catalog=await(await fetch('content/skill-catalog.json')).json();
 const root=document.getElementById('skillEditor'),buttons=document.getElementById('skillSlots');
 const choices=catalog.skills.filter(s=>s.equippable),names=Object.fromEntries(catalog.skills.map(s=>[s.id,s.name]));
 const updatePresets=partyPresetControls(action,names);
 const selects=[];let signature='';
 for(let i=0;i<8;i++){
  const button=document.createElement('button');button.onclick=()=>{action('slot'+(i+1));button.blur()};buttons.append(button);
  const row=document.createElement('div');row.style.margin='8px 0';const label=document.createElement('span');label.textContent=`枠 ${i+1}　`;row.append(label);
  const fields=[];
  for(let j=0;j<3;j++){
   const select=document.createElement('select');
   select.setAttribute('aria-label',`枠${i+1}の${j+1}番目`);
   select.add(new Option('空き',''));
   for(const skill of choices){
    select.add(new Option(`${skill.name}（Lv${skill.unlock_level}）`,skill.id));
   }
   row.append(select);fields.push(select);
  }
  selects.push(fields);root.append(row);
 }
 document.getElementById('applySlots').onclick=()=>configure(selects.map(row=>row.map(e=>e.value).filter(Boolean)));
 const list=document.getElementById('skillCatalog');
 for(const s of catalog.skills){const row=document.createElement('tr');for(const value of [s.id,s.owner,s.name,s.implementation==='partial'?'部分実装':'未実装']){const cell=document.createElement('td');cell.textContent=value;cell.style.padding='5px 12px';row.append(cell)}list.append(row)}
 return {update(f){
  updatePresets(f);
  const slots=f.loadout||[],sig=JSON.stringify(slots);
  if(sig!==signature){signature=sig;selects.forEach((row,i)=>row.forEach((e,j)=>e.value=slots[i]?.[j]||''))}
  [...buttons.children].forEach((b,i)=>{b.textContent=`${i+1}: ${(slots[i]||[]).map(id=>names[id]).join(' → ')||'空き'}`;b.disabled=f.active!==1||!(slots[i]?.length)});
  document.getElementById('macroStatus').textContent=f.macro?`枠${f.macro.slot}：${f.macro.index}番目を待機中`:'1〜8キーで発動。回避・交代・地点移動で中止。';
  if(f.configuration)document.getElementById('slotStatus').textContent=f.configuration.message;
 }};
}
