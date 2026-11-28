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

const legends=document.querySelector('#legendProfileSurvey');
const legendOrder=legends.querySelector('select');
const legendList=legends.querySelector('ol');
const legendStatus=legends.querySelector('output');
let legendScores;

function renderLegends(){
 const byCost=legendOrder.value==='rectangles';
 const ordered=[...legendScores].sort((a,b)=>byCost?b.rectangles-a.rectangles:a.overlap-b.overlap);
 legendList.replaceChildren();
 for(const legend of ordered.slice(0,10)){
  const params=new URLSearchParams({node:legend.node,placements:'live',background:'original',profile:'h32c16'});
  const item=document.createElement('li'),link=document.createElement('a');
  link.href='map-art.html?'+params+'#compareSpriteProfiles';
  link.textContent=legend.name;
  item.append(link,'　'+legend.rectangles.toLocaleString('ja-JP')+'矩形 ／ 形の重なり '+legend.overlap.toFixed(1)+'%');
  legendList.append(item);
 }
 legendStatus.textContent=legendScores.length+'会場のうち上位'+legendList.children.length+'会場。開戦時の配置を、全員が見える画角で測定しています。';
}

legends.addEventListener('toggle',async()=>{
 if(!legends.open || legendScores || legends.dataset.loading)return;
 legends.dataset.loading='true';
 try{
  const [scoresResponse,scenesResponse]=await Promise.all([
   fetch('evidence/sprite-profile-comparison.json'),fetch('content/group-legend-openings.json')
  ]);
  if(!scoresResponse.ok || !scenesResponse.ok)throw Error('legend art');
  const [{arenas},scenes]=await Promise.all([scoresResponse.json(),scenesResponse.json()]);
  legendScores=Object.entries(arenas).map(([node,rows])=>{
   const light=rows.find(row=>row.profile==='h32c16');
   return {node,name:scenes[node].parts.map(part=>part.name).join('・'),
    rectangles:light.rectangles,overlap:parseFloat(light.overlap)};
  });
  renderLegends();
 }catch{legendStatus.textContent='集計を読み込めませんでした。閉じてから開くと再試行します。'}
 finally{delete legends.dataset.loading}
});
legendOrder.addEventListener('change',()=>{if(legendScores)renderLegends()});
