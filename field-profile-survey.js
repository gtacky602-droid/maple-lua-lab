const panel=document.querySelector('#fieldSurvey');
const list=panel.querySelector('ol');
const region=panel.querySelector('select');
const status=panel.querySelector('output');
let scores;

function render(){
 const rows=scores.filter(f=>!region.value || f.region===region.value);
 list.replaceChildren();
 for(const field of rows.slice(0,10)){
  const item=document.createElement('li'),link=document.createElement('a');
  const profile=field.profiles.h32c16;
  link.href='map-art.html?'+new URLSearchParams({node:field.node,placements:'live',camera:field.camera,profile:'h32c16'});
  link.textContent=field.name;
  item.append(link,'　形の重なり '+profile.overlap.toFixed(1)+'% ／ '+profile.rectangles.toLocaleString('ja-JP')+'矩形');
  list.append(item);
 }
 status.textContent=rows.length+'地点のうち、形の重なりが小さい順に'+list.children.length+'地点を表示';
}

panel.addEventListener('toggle',async()=>{
 if(!panel.open || scores || panel.dataset.loading)return;
 panel.dataset.loading='true';
 try{
  const response=await fetch('evidence/field-group-profile-scores.json');
  if(!response.ok)throw Error(response.status);
  const fields=await response.json();
  scores=fields.filter(f=>f.profiles?.h32c16.overlap!=null).sort((a,b)=>a.profiles.h32c16.overlap-b.profiles.h32c16.overlap);
  for(const name of new Set(scores.map(f=>f.region).sort()))region.add(new Option(name,name));
  render();
 }catch{status.textContent='集計を読み込めませんでした。閉じてから開くと再試行します。'}
 finally{delete panel.dataset.loading}
});
region.addEventListener('change',()=>{if(scores)render()});
