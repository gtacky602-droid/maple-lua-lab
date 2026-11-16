// Encounter worklist and playable entry points; incomplete rows never start a fake fight.
async function initEncounters(){
 const panel=document.createElement('details');panel.id='encountersPanel';
 const title=document.createElement('summary');title.textContent='ボス挑戦・全戦闘の制作状況';panel.append(title);
 document.querySelector('#worldDetails').after(panel);
 try{
  const response=await fetch('content/encounters.json');if(!response.ok)throw Error(response.status);
  const data=await response.json(),note=document.createElement('p');note.className='note';
  note.textContent=`候補 ${data.counts.encounter_candidates}戦／部分実装 ${data.counts.partial}戦／完成 ${data.counts.complete}戦。${data.warning}`;panel.append(note);
  const controls=document.createElement('div');controls.className='controls';
  const search=document.createElement('input');search.placeholder='ボス名で検索';search.setAttribute('aria-label','ボス名で検索');
  const kind=document.createElement('select');kind.setAttribute('aria-label','ボスの分類');
  for(const [value,label] of [['all','全分類'],['normal','通常'],['weekly','週ボス'],['stygian','幽境専用']]){const option=document.createElement('option');option.value=value;option.textContent=label;kind.append(option)}
  const playable=document.createElement('input');playable.type='checkbox';playable.id='playableBosses';
  const label=document.createElement('label');label.htmlFor=playable.id;label.append(playable,' 挑戦可能のみ');controls.append(search,kind,label);panel.append(controls);
  const count=document.createElement('p'),list=document.createElement('div');list.style.maxHeight='440px';list.style.overflow='auto';panel.append(count,list);
  function render(){
   const rows=data.encounters.filter(r=>(kind.value==='all'||r.kind===kind.value)&&(!playable.checked||r.action)&&r.name.includes(search.value.trim()));
   count.textContent=`表示 ${rows.length}戦`;list.replaceChildren();
   for(const r of rows){
    const row=document.createElement('div');row.className='controls';row.dataset.encounter=r.id;
    const text=document.createElement('span');text.textContent=`${r.name} — ${r.status==='partial'?'部分実装':'未実装'}`;
    const button=document.createElement('button');button.textContent=r.action?'試作に挑戦':'制作中';button.disabled=!r.action;
    let variant=null;
    if(r.variants){variant=document.createElement('select');variant.setAttribute('aria-label',r.name+'の'+(r.variantLabel||'元素'));for(const item of r.variants){const option=document.createElement('option');option.value=item.action;option.textContent=item.label;variant.append(option)}}
    button.onclick=()=>{window.lab.action(variant?variant.value:r.action);button.blur()};
    const detail=document.createElement('small');detail.textContent='残り：'+r.remaining.join('／')+(r.review_note?' ｜ '+r.review_note:'');
    row.append(text);if(variant)row.append(variant);row.append(button,detail);list.append(row);
   }
  }
  search.oninput=render;kind.onchange=render;playable.onchange=render;render();
 }catch(error){const p=document.createElement('p');p.textContent='ボス一覧を読み込めませんでした。再読み込みしてください。';panel.append(p);console.error(error)}
}
initEncounters();
