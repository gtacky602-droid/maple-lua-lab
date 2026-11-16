// Filter the picker only; placed objects and their asset catalog stay intact.
export function setupPlacementPicker(select){
 const entries=[...select.options].map(o=>({value:o.value,label:o.textContent,kind:o.value.startsWith('boss-')?'boss':o.value.startsWith('character-')?'character':'enemy'}));
 const controls=document.createElement('div');controls.className='controls';
 const kindLabel=document.createElement('label');kindLabel.textContent='素材の種類 ';
 const kind=document.createElement('select');kind.id='assetKind';
 for(const [value,label] of [['all','すべて'],['character','主人公・味方'],['enemy','通常敵'],['boss','ボス']]){const o=document.createElement('option');o.value=value;o.textContent=label;kind.append(o)}kindLabel.append(kind);
 const searchLabel=document.createElement('label');searchLabel.textContent='素材を検索 ';
 const search=document.createElement('input');search.type='search';search.id='assetSearch';search.placeholder='名前・IDで検索';searchLabel.append(search);
 const clear=document.createElement('button');clear.type='button';clear.id='clearAssetSearch';clear.textContent='絞り込みを解除';
 const status=document.createElement('span');status.id='assetSearchStatus';status.setAttribute('role','status');
 controls.append(kindLabel,searchLabel,clear,status);select.closest('.controls').before(controls);
 const normalize=s=>s.normalize('NFKC').toLocaleLowerCase('ja');
 let preferred=select.value;
 select.addEventListener('change',()=>{if(select.value)preferred=select.value});
 function update(){
  const terms=normalize(search.value).trim().split(/\s+/).filter(Boolean);
  const matches=entries.filter(e=>(kind.value==='all'||e.kind===kind.value)&&terms.every(t=>normalize(e.label+' '+e.value).includes(t)));
  select.replaceChildren();
  for(const [key,label] of [['character','主人公・味方'],['enemy','通常敵'],['boss','ボス']]){
   const group=document.createElement('optgroup');group.label=label;
   for(const e of matches.filter(e=>e.kind===key)){const o=document.createElement('option');o.value=e.value;o.textContent=e.label;group.append(o)}
   if(group.children.length)select.append(group);
  }
  if(matches.some(e=>e.value===preferred))select.value=preferred;
  select.disabled=!matches.length;
  status.textContent=matches.length?`${matches.length} / ${entries.length}素材`:'該当する素材がありません。絞り込みを解除してください。';
  clear.disabled=kind.value==='all'&&!search.value;
 }
 search.addEventListener('input',update);kind.addEventListener('change',update);
 clear.onclick=()=>{search.value='';kind.value='all';update();search.focus()};update();
}
