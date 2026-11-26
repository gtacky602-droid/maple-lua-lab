import {json,sheet,paint} from './sprite-comparison.js';
const el=id=>document.getElementById(id);
const species=el('species'), region=el('region'), place=el('place');
const mapUrl=(node,art)=>'map-art.html?'+new URLSearchParams({node,placements:'live',...(art&&{species:art})});
try{
 const index=await json('content/field-sprite-index.json');
 const params=new URLSearchParams(location.search),node=params.get('node');
 const local=index.species.filter(s=>s.places.some(([id])=>id===node));
 const focused=local.length>0;
 const entryCounts=new Map();
 for(const value of params.getAll('entry')){
  const match=/^([\w-]+):(\d+)$/.exec(value);
  if(match)entryCounts.set(match[1],Number(match[2]));
 }
 const hasSnapshot=focused&&local.every(s=>{
  const count=entryCounts.get(s.id);
  return Number.isSafeInteger(count)&&count<=s.places.find(([id])=>id===node)[1];
 });
 const entries=new Map((focused?local:index.species).map(s=>[s.id,s]));
 if(focused){
  el('scope').hidden=false;
  el('scope').querySelector('strong').textContent=index.places[node][0]+'の通常敵（'+local.length+'種）';
 }
 const libraries=new Map();
 let revision=0;
 const visibleSpecies=[...entries.values()];
 if(hasSnapshot)visibleSpecies.sort((a,b)=>Number(entryCounts.get(b.id)>0)-Number(entryCounts.get(a.id)>0));
 for(const s of visibleSpecies){
  const count=entryCounts.get(s.id);
  const label=hasSnapshot?s.name+(count?'（入場時 '+count+'体）':'（現在は出現しない）'):s.name;
  species.add(new Option(label,s.id));
 }
 function selectPlaces(){
  const current=entries.get(species.value);
  const places=current.places.filter(([id])=>focused?id===node:index.places[id][1]===region.value);
  place.replaceChildren(...places.map(([node,count])=>new Option(index.places[node][0]+'（'+count+'体）',node)));
  updateFieldLink();
 }
 function updateFieldLink(){
  const url=new URL(mapUrl(place.value,species.value),location.href);
  if(hasSnapshot){
   el('fieldMap').textContent='入場時の配置を見る';
   for(const id of params.getAll('absent'))url.searchParams.append('absent',id);
  }
  el('fieldMap').href=url.href;
 }
 async function selectSpecies(){
  const current=entries.get(species.value),token=++revision;
  el('name').textContent=current.name;
  el('count').textContent=focused?'この地点に'+current.places.find(([id])=>id===node)[1]+'体配置':current.places.length+'地点に計'+current.count.toLocaleString('ja-JP')+'体配置';
  if(hasSnapshot)el('count').textContent+='。地図を開いたときの進行状況では、入場時に'+entryCounts.get(current.id)+'体出現。';
  if(hasSnapshot&&params.get('quest'))el('count').textContent+=' 関連する依頼「'+params.get('quest')+'」。';
  const url=new URL(location.href);url.searchParams.set('species',current.id);history.replaceState(null,'',url);
  const regions=focused?[index.places[node][1]]:new Set(current.places.map(([id])=>index.places[id][1]));
  region.replaceChildren(...Array.from(regions,r=>new Option(r)));selectPlaces();
  const links=Object.entries(current.legends).map(([node,name])=>{
   const a=document.createElement('a');a.href=mapUrl(node)+'#sharedLegendArt';a.textContent=name;return a;
  });
  for(const [node,name] of Object.entries(current.legendCandidates??{})){
   const url=new URL(mapUrl(node),location.href);
   url.searchParams.set('idle','candidate');url.searchParams.set('sharedProfiles','all');url.hash='sharedLegendArt';
   const link=document.createElement('a');link.href=url.href;link.textContent=name+'（待機絵の候補）';links.push(link);
  }
  el('shared').querySelector('nav').replaceChildren(...links);el('shared').hidden=!links.length;
  const ids=['source','h48c32','h32c16'];
  for(const id of ids){
   const c=el(id);c.getContext('2d').clearRect(0,0,c.width,c.height);
   const size=c.closest('figure').querySelector('small');if(size)size.textContent='';
  }
  delete el('source').dataset.art;el('error').textContent='';el('drawCost').textContent='';
  const file=current.daily?'daily-guide-sprites.json':'field-guide-extra-sprites.json';
  try{
   if(!libraries.has(file))libraries.set(file,json('assets/'+file).catch(e=>{libraries.delete(file);throw e}));
   const art=(await libraries.get(file))[current.id];
   if(token!==revision)return;
   const [standard,light]=ids.slice(1).map(profile=>paint(el(profile),art,profile));
   const saved=standard-light;
   const change=saved===0?'同数':Math.abs(saved)+'個'+(saved>0?'減':'増')+'（'+Math.abs(100*saved/standard).toFixed(1)+'%）';
   el('drawCost').textContent='1体を1回描く矩形数は32色版で'+standard+'個、16色版で'+light+'個。差は'+change+'。';
   const img=await sheet(art.source);
   if(token===revision){paint(el('source'),art,null,img);el('source').dataset.art=current.id}
  }catch{if(token===revision)el('error').textContent='ドット絵を読み込めませんでした。'}
 }
 region.onchange=selectPlaces;place.onchange=updateFieldLink;
 const first=new URLSearchParams(location.search).get('species');
 if(entries.has(first))species.value=first;
 species.onchange=selectSpecies;await selectSpecies();
}catch{el('error').textContent='配置図鑑を読み込めませんでした。'}
