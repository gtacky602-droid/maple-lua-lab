// Encounter worklist and playable entry points; incomplete rows never start a fake fight.
import {encounterArtGalleries,encounterArtItems,encounterArtReferences} from './encounter-art.js';
async function initEncounters(){
 const panel=document.createElement('details');panel.id='encountersPanel';
 const title=document.createElement('summary');title.textContent='ボス挑戦・全戦闘の制作状況';panel.append(title);
 document.querySelector('#worldDetails').after(panel);
 try{
  const response=await fetch('content/encounters.json');if(!response.ok)throw Error(response.status);
  const data=await response.json(),note=document.createElement('p');note.className='note';
  const stageFor=row=>row.weeklyNode||row.fieldNode||row.stygianNode;
  const active=data.encounters.filter(row=>!row.suspendedRegion);
  const adventures=active.filter(row=>stageFor(row)).length;
  const trials=active.filter(row=>row.action).length;
  note.textContent=`冒険で遭遇 ${adventures}戦 ／ 個別の模擬戦 ${trials}件 ｜ 全候補 ${data.counts.encounter_candidates}戦・完成 ${data.counts.complete}戦。${data.warning}`;
  panel.append(note);
  if(data.roster_review){
   const review=data.roster_review,scope=document.createElement('p');scope.className='note';
   scope.textContent=`原作Ver.${review.game_version}の公開一覧で照合済み　通常${review.field_boss_families}系統・週ボス${review.weekly_challenges}戦。氷風組曲の2演目は個別に表示。`;
   if(review.unmatched_rows.length)scope.textContent+=` 未照合の登録 ${review.unmatched_rows.length}件。`;
   panel.append(scope);
  }
  const galleries=Object.entries(encounterArtGalleries);
  const catalogs={};
  const artRows=new Map();
  const galleryNotice=document.createElement('p');galleryNotice.className='note';galleryNotice.hidden=true;panel.append(galleryNotice);
  const controls=document.createElement('div');controls.className='controls';
  const search=document.createElement('input');search.placeholder='ボス名で検索';search.setAttribute('aria-label','ボス名で検索');
  const kind=document.createElement('select');kind.setAttribute('aria-label','ボスの分類');
  for(const [value,label] of [['all','全分類'],['normal','通常'],['weekly','週ボス'],['stygian','幽境専用']]){const option=document.createElement('option');option.value=value;option.textContent=label;kind.append(option)}
  const playable=document.createElement('input');playable.type='checkbox';playable.id='playableBosses';
  const label=document.createElement('label');label.htmlFor=playable.id;label.append(playable,' 挑戦可能のみ');controls.append(search,kind,label);panel.append(controls);
  const count=document.createElement('p'),list=document.createElement('div');list.style.maxHeight='440px';list.style.overflow='auto';panel.append(count,list);
  const runtimeNotice=document.createElement('p');runtimeNotice.setAttribute('role','status');runtimeNotice.textContent='シミュレーションに接続中です。';list.before(runtimeNotice);
  const runtimeReady=()=>typeof window.lab?.action==='function';
  function updateReadiness(){
   const ready=runtimeReady();runtimeNotice.hidden=ready;
   for(const button of list.querySelectorAll('[data-runtime-action]')){button.disabled=!ready;button.textContent=ready?(button.dataset.fieldAlso?'模擬戦に挑戦':'試作に挑戦'):'準備中';}
   for(const button of list.querySelectorAll('[data-boss-route]'))button.disabled=!ready;
  }
  window.addEventListener('lab-ready',updateReadiness);
  function paintArt(art,encounter){
   art.replaceChildren();
   const references=encounterArtReferences(encounter);
   const keys=new Set(references.map(ref=>ref.gallery??'bosses'));
   const waiting=[...keys].some(key=>catalogs[key]===undefined);
   const missing=[...keys].some(key=>catalogs[key]===null);
   const items=encounterArtItems(encounter,catalogs);
   const status=document.createElement('small');status.style.flexBasis='100%';
   if(items.length){
    status.textContent=`美術：待機候補 ${items.length}点`;
    if(items.some(item=>item.gallery==='characters'))status.textContent+='（同行キャラの待機絵を共用）';
    if(waiting)status.textContent+=' ｜ 続きを読み込み中';
    if(missing)status.textContent+=' ｜ 一部の一覧を取得できません';
   }else if(waiting)status.textContent='美術：比較一覧を読み込み中';
   else if(missing)status.textContent='美術：一覧を取得できません';
   else status.textContent='美術：比較素材の登録なし';
   art.append(status);
   for(const item of items){
    const link=document.createElement('a');link.textContent=item.name+'を比較';link.href=item.page+'?'+new URLSearchParams({id:item.id});link.target='_blank';link.rel='noopener';art.append(link);
   }
  }
  async function loadGallery(key,gallery){
   try{
    const response=await fetch(gallery.catalog);
    if(!response.ok)throw Error(response.status);
    const data=await response.json();
    if(!Array.isArray(data.items))throw Error('Invalid gallery');
    catalogs[key]=data.items;
   }catch{
    catalogs[key]=null;
   }
   const failed=galleries.filter(([name])=>catalogs[name]===null).map(([,item])=>item.label);
   galleryNotice.hidden=failed.length===0;
   if(failed.length)galleryNotice.textContent=`${failed.join('・')}の美術一覧を読み込めませんでした。戦闘情報と地図の案内を利用できます。`;
   for(const [encounter,art] of artRows){
    if(encounterArtReferences(encounter).some(ref=>(ref.gallery??'bosses')===key))paintArt(art,encounter);
   }
  }
  function render(){
   const query=search.value.trim().normalize('NFKC');
   const rows=data.encounters.filter(r=>(kind.value==='all'||r.kind===kind.value)&&(!playable.checked||
    !r.suspendedRegion&&(r.action||stageFor(r)))
    &&[r.name,...(r.aliases??[])].some(name=>name.normalize('NFKC').includes(query)));
   count.textContent=`表示 ${rows.length}戦`;list.replaceChildren();artRows.clear();
   for(const r of rows){
    const available=!r.suspendedRegion;
    const bossStage=stageFor(r);
    const row=document.createElement('div');row.className='controls';row.dataset.encounter=r.id;
    const text=document.createElement('span');text.textContent=`${r.name} — ${!available?'現行の冒険では休止中':r.weeklyNode?'週ボス挑戦へ接続済み':r.fieldNode?'フィールドで遭遇可能':r.stygianNode?'幽境の受付で挑戦可能':r.status==='partial'?'部分実装':'未実装'}`;
    const button=document.createElement('button');button.textContent=r.action?'試作に挑戦':'制作中';button.disabled=!r.action;if(r.action)button.dataset.runtimeAction=r.action;if(r.fieldNode)button.dataset.fieldAlso='1';
    let variant=null;
    if(r.variants){variant=document.createElement('select');variant.setAttribute('aria-label',r.name+'の'+(r.variantLabel||'元素'));for(const item of r.variants){const option=document.createElement('option');option.value=item.action;option.textContent=item.label;variant.append(option)}}
    button.onclick=()=>{if(!r.action||!runtimeReady())return;window.lab.action(variant?variant.value:r.action);button.blur()};
    const detail=document.createElement('small');detail.textContent='残り：'+r.remaining.join('／')+(r.review_note?' ｜ '+r.review_note:'');
    row.append(text);if(variant&&available)row.append(variant);
    if(bossStage&&available){
     const route=document.createElement('a');route.textContent=r.weeklyEntrance||r.fieldEntrance||r.stygianEntrance;
     route.href='map-art.html?'+new URLSearchParams({node:bossStage});
     row.append(route);
     const locate=document.createElement('button');locate.type='button';locate.dataset.bossRoute=bossStage;
     locate.textContent='ゲーム内の地図で案内';
     locate.onclick=()=>{
      if(!runtimeReady())return;
      const {frame,action}=window.lab;
      const reason=!frame.story?.active?'本編ルートへ入ると地図で案内できます。':
       frame.growthTrial?'成長試練を終えると地図で案内できます。':
       !frame.storyGraph?.nodes.some(node=>node.id===bossStage)?'現地の入口を見つけると地図で案内できます。':'';
      runtimeNotice.hidden=!reason;runtimeNotice.textContent=reason;
      if(!reason)action('world_map_boss:'+bossStage);
     };
     row.append(locate);
    }
    if(available&&(r.action||!bossStage))row.append(button);
    row.append(detail);
    const art=document.createElement('div');art.className='encounter-art';art.style.cssText='flex-basis:100%;display:flex;flex-wrap:wrap;gap:8px 16px;overflow-wrap:anywhere;line-height:1.6';
    artRows.set(r,art);paintArt(art,r);
    row.append(art);list.append(row);
   }
   updateReadiness();
  }
  search.oninput=render;kind.onchange=render;playable.onchange=render;render();
  await Promise.all(galleries.map(([key,gallery])=>loadGallery(key,gallery)));
 }catch(error){const p=document.createElement('p');p.textContent='ボス一覧を読み込めませんでした。再読み込みしてください。';panel.append(p);console.error(error)}
}
initEncounters();
