// Encounter worklist and playable entry points; incomplete rows never start a fake fight.
import {encounterArtItems} from './encounter-art.js';
async function initEncounters(){
 const panel=document.createElement('details');panel.id='encountersPanel';
 const title=document.createElement('summary');title.textContent='ボス挑戦・全戦闘の制作状況';panel.append(title);
 document.querySelector('#worldDetails').after(panel);
 try{
  const response=await fetch('content/encounters.json');if(!response.ok)throw Error(response.status);
  const data=await response.json(),note=document.createElement('p');note.className='note';
  note.textContent=`候補 ${data.counts.encounter_candidates}戦／部分実装 ${data.counts.partial}戦／完成 ${data.counts.complete}戦。${data.warning}`;panel.append(note);
  let artCatalog=null;
  try{
   const response=await fetch('content/boss-art-gallery.json');if(!response.ok)throw Error(response.status);
   const gallery=await response.json();if(!Array.isArray(gallery.items))throw Error('Invalid gallery');artCatalog=gallery.items;
  }catch{const warning=document.createElement('p');warning.className='note';warning.textContent='美術一覧を読み込めませんでした。戦闘の制作状況と挑戦操作は利用できます。';panel.append(warning)}
  const controls=document.createElement('div');controls.className='controls';
  const search=document.createElement('input');search.placeholder='ボス名で検索';search.setAttribute('aria-label','ボス名で検索');
  const kind=document.createElement('select');kind.setAttribute('aria-label','ボスの分類');
  for(const [value,label] of [['all','全分類'],['normal','通常'],['weekly','週ボス'],['stygian','幽境専用']]){const option=document.createElement('option');option.value=value;option.textContent=label;kind.append(option)}
  const playable=document.createElement('input');playable.type='checkbox';playable.id='playableBosses';
  const label=document.createElement('label');label.htmlFor=playable.id;label.append(playable,' 挑戦可能のみ');controls.append(search,kind,label);panel.append(controls);
  const count=document.createElement('p'),list=document.createElement('div');list.style.maxHeight='440px';list.style.overflow='auto';panel.append(count,list);
  const runtimeNotice=document.createElement('p');runtimeNotice.setAttribute('role','status');runtimeNotice.textContent='シミュレーションの準備中です。美術の比較は先に開けます。';list.before(runtimeNotice);
  const runtimeReady=()=>typeof window.lab?.action==='function';
  function updateReadiness(){
   const ready=runtimeReady();runtimeNotice.hidden=ready;
   for(const button of list.querySelectorAll('[data-runtime-action]')){button.disabled=!ready;button.textContent=ready?'試作に挑戦':'準備中';}
  }
  window.addEventListener('lab-ready',updateReadiness);
  function render(){
   const rows=data.encounters.filter(r=>(kind.value==='all'||r.kind===kind.value)&&(!playable.checked||r.action)&&r.name.includes(search.value.trim()));
   count.textContent=`表示 ${rows.length}戦`;list.replaceChildren();
   for(const r of rows){
    const row=document.createElement('div');row.className='controls';row.dataset.encounter=r.id;
    const text=document.createElement('span');text.textContent=`${r.name} — ${r.status==='partial'?'部分実装':'未実装'}`;
    const button=document.createElement('button');button.textContent=r.action?'試作に挑戦':'制作中';button.disabled=!r.action;if(r.action)button.dataset.runtimeAction=r.action;
    let variant=null;
    if(r.variants){variant=document.createElement('select');variant.setAttribute('aria-label',r.name+'の'+(r.variantLabel||'元素'));for(const item of r.variants){const option=document.createElement('option');option.value=item.action;option.textContent=item.label;variant.append(option)}}
    button.onclick=()=>{if(!r.action||!runtimeReady())return;window.lab.action(variant?variant.value:r.action);button.blur()};
    const detail=document.createElement('small');detail.textContent='残り：'+r.remaining.join('／')+(r.review_note?' ｜ '+r.review_note:'');
    row.append(text);if(variant)row.append(variant);row.append(button,detail);
    const art=document.createElement('div');art.className='encounter-art';art.style.cssText='flex-basis:100%;display:flex;flex-wrap:wrap;gap:8px 16px;overflow-wrap:anywhere;line-height:1.6';
    const items=artCatalog?encounterArtItems(r,artCatalog):[];
    const status=document.createElement('small');status.style.flexBasis='100%';status.textContent=artCatalog===null?'美術：一覧を取得できません':items.length?`美術：待機候補 ${items.length}点（動作・戦闘の完成とは別）`:'美術：比較素材の登録なし';art.append(status);
    for(const item of items){
     const link=document.createElement('a');link.textContent=item.name+'を比較';link.href='bosses-art.html?'+new URLSearchParams({q:item.id});link.target='_blank';link.rel='noopener';art.append(link);
    }
    row.append(art);list.append(row);
   }
   updateReadiness();
  }
  search.oninput=render;kind.onchange=render;playable.onchange=render;render();
 }catch(error){const p=document.createElement('p');p.textContent='ボス一覧を読み込めませんでした。再読み込みしてください。';panel.append(p);console.error(error)}
}
initEncounters();
