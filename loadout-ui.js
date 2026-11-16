export async function initSkillUI(action,configure){
 const catalog=await(await fetch('content/skill-catalog.json')).json();
 const root=document.getElementById('skillEditor'),buttons=document.getElementById('skillSlots');
 const choices=catalog.skills.filter(s=>s.equippable),names=Object.fromEntries(catalog.skills.map(s=>[s.id,s.name]));
 const selects=[];let signature='';
 for(let i=0;i<8;i++){
  const button=document.createElement('button');button.onclick=()=>{action('slot'+(i+1));button.blur()};buttons.append(button);
  const row=document.createElement('div');row.style.margin='8px 0';const label=document.createElement('span');label.textContent=`枠 ${i+1}　`;row.append(label);
  const fields=[];
  for(let j=0;j<3;j++){const select=document.createElement('select');select.setAttribute('aria-label',`枠${i+1}の${j+1}番目`);select.add(new Option('空き',''));for(const s of choices)select.add(new Option(s.name,s.id));row.append(select);fields.push(select)}
  selects.push(fields);root.append(row);
 }
 document.getElementById('applySlots').onclick=()=>configure(selects.map(row=>row.map(e=>e.value).filter(Boolean)));
 const list=document.getElementById('skillCatalog');
 for(const s of catalog.skills){const row=document.createElement('tr');for(const value of [s.id,s.owner,s.name,s.implementation==='partial'?'部分実装':'未実装']){const cell=document.createElement('td');cell.textContent=value;cell.style.padding='5px 12px';row.append(cell)}list.append(row)}
 return {update(f){
  const slots=f.loadout||[],sig=JSON.stringify(slots);
  if(sig!==signature){signature=sig;selects.forEach((row,i)=>row.forEach((e,j)=>e.value=slots[i]?.[j]||''))}
  [...buttons.children].forEach((b,i)=>{b.textContent=`${i+1}: ${(slots[i]||[]).map(id=>names[id]).join(' → ')||'空き'}`;b.disabled=f.active!==1||!(slots[i]?.length)});
  document.getElementById('macroStatus').textContent=f.macro?`枠${f.macro.slot}：${f.macro.index}番目を待機中（CT・硬直を尊重）`:'マクロ停止中。1〜8キーで発動、交代・移動先変更で中止。';
  if(f.configuration)document.getElementById('slotStatus').textContent=f.configuration.message;
 }};
}
