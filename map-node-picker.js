import {backgroundMeasurements} from './scenery-measurements.js';

// Navigation only: filters never change the active map or placement draft.
export function setupMapNodePicker({graph,select,getDraft,onChoose}){
 const panel=document.createElement('details');panel.id='mapNodePicker';
 const summary=document.createElement('summary');summary.textContent='地域・配置状況から地点を探す';
 const controls=document.createElement('div');controls.className='controls';
 const field=(text,input)=>{const label=document.createElement('label');label.append(text,input);controls.append(label)};
 const region=document.createElement('select');region.id='nodeRegion';
 for(const value of ['',...new Set(graph.nodes.map(n=>n.region))]){const o=document.createElement('option');o.value=value;o.textContent=value||'すべての地域';region.append(o)}
 const search=document.createElement('input');search.id='nodeSearch';search.type='search';search.placeholder='地点名・地域で検索';
 const populated=document.createElement('select');populated.id='nodePlacementFilter';
 for(const [value,label] of [['all','すべて'],['placed','配置あり'],['empty','配置なし']]){const o=document.createElement('option');o.value=value;o.textContent=label;populated.append(o)}
 field('地域 ',region);field('検索 ',search);field('編集中の案 ',populated);
 const measured=document.createElement('input');measured.type='checkbox';measured.id='nodeMeasuredFilter';
 field('背景を5段階で比較できる地点 ',measured);
 const clear=document.createElement('button');clear.type='button';clear.textContent='地点の絞り込みを解除';clear.id='clearNodeSearch';controls.append(clear);
 const status=document.createElement('p');status.id='nodeSearchStatus';status.setAttribute('role','status');
 const list=document.createElement('div');list.id='nodeSearchResults';list.className='controls';
 const note=document.createElement('p');note.className='note';note.textContent='数はこの画面の配置案です。本編の配置数やマップの完成度ではありません。絞り込みだけでは表示地点は変わりません。';
 panel.append(summary,controls,status,list,note);select.closest('.controls').before(panel);
 const normalize=s=>s.normalize('NFKC').toLocaleLowerCase('ja');
 function update(){
  const drafts=getDraft(),terms=normalize(search.value).trim().split(/\s+/).filter(Boolean);
  const count=n=>drafts.nodes[n.id]?.length??0;
  const matches=graph.nodes.filter(n=>(!measured.checked||Object.hasOwn(backgroundMeasurements,n.id))&&(!region.value||n.region===region.value)&&terms.every(t=>normalize(n.name+' '+n.region+' '+n.id).includes(t))&&(populated.value==='all'||(populated.value==='placed'?count(n)>0:count(n)===0)));
  const active=graph.nodes.find(n=>n.id===select.value),placed=graph.nodes.filter(n=>count(n)>0).length;
  status.textContent=`${matches.length} / ${graph.nodes.length}地点 ／ 配置あり ${placed}地点 ／ 表示中：${active?.name??''}${matches.some(n=>n.id===select.value)?'':'（絞り込み対象外）'}`;
  list.replaceChildren();
  for(const n of matches){const button=document.createElement('button');button.type='button';button.dataset.node=n.id;button.textContent=`${n.region}｜${n.name}：${count(n)}体`;button.setAttribute('aria-pressed',String(n.id===select.value));button.onclick=()=>{select.value=n.id;onChoose()};list.append(button)}
  if(!matches.length){const empty=document.createElement('p');empty.textContent='該当する地点がありません。絞り込みを解除してください。';list.append(empty)}
  clear.disabled=!measured.checked&&!region.value&&!search.value&&populated.value==='all';
 }
 measured.onchange=update;region.onchange=update;search.oninput=update;populated.onchange=update;
 clear.onclick=()=>{measured.checked=false;region.value='';search.value='';populated.value='all';update()};
 return {update};
}
