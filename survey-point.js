// Physical inspection points on the authored travel-and-survey itineraries.
export function puzzleStep(step){
 return step?.kind==='inspect'&&(step.resonanceOrder||step.shadowChoice||step.paperFold);
}
const colleiHeights={root:72,stones:43,shelter:112,bench:51,barrier:43};
function choiceProp(option,kind){
 let pose,height,offsetY=0;
 if(kind==='guideChoice'){
  pose='sum-collei-guide-'+option.art;height=colleiHeights[option.art];
 }else if(option.scentArt){
  pose='fon-emilie-scent-'+option.id;height={amber:44,pink:45,mint:43}[option.id];offsetY=-8;
 }else if(option.magicChoice){
  pose='fon-furina-cues-'+(option.id==='curtain'?'curtain':'lamp');height=74;
 }else if(option.diveChoice){
  pose='fon-freminet-dive-'+(option.id==='coral'?'coral':'marker');height=55;offsetY=20;
 }else if(option.detourGift){
  pose='coastal-gifts-'+option.id;height=35;offsetY=-25;
 }
 if(height)return {file:'quest-packed/'+pose+'-sprites-v1.json',height,x:option.x,y:option.y+offsetY,
  bubbles:option.diveChoice&&option.id==='bubbles'};
}
// Fixed scenery drawn by the Lua choice and treasure handlers in both sprite modes.
const giftTable=[[-30,-25,60,10,'#674d52'],[-28,-25,56,3,'#a98260'],[-24,-15,4,15,'#594451'],[20,-15,4,15,'#594451']];
const choiceSign=[[-12,-25,24,25,'#423951'],[-8,-21,16,12,'#d3dbf5']];
const closedChest=[[-20,-19,40,19,'#855c4a'],[-21,-24,42,9,'#ba9063'],[-16,-17,4,17,'#cfa468'],[12,-17,4,17,'#cfa468'],[-3,-19,6,9,'#eed39a']];
function choiceFixtures(step){
 if(step.kind!=='choice')return [];
 const fixtures=[];
 if(step.treasure)fixtures.push({...step.treasure,rects:closedChest});
 for(const o of step.choices){
  const sprite=o.scentArt||o.magicChoice||o.diveChoice;
  fixtures.push({x:o.x,y:o.y,name:o.name,labelHeight:o.detourGift?79:sprite?82:43,
   rects:o.detourGift?giftTable:sprite?[]:choiceSign});
 }
 return fixtures;
}
export function surveyPoint(quest,index,node,room,pathId,choice){
 if(quest?.cave&&Number.isInteger(index)&&index>=0&&index<=3){
  const {depth,guide,chest,brittle,landing,ore}=quest.cave;
  const lower=index===3;
  if(node!==(lower?depth:quest.target))return null;
  const props=[{file:'quest-packed/bennett-cave-guide-sprites-v1.json',name:'ベネット',
   x:lower?landing.x+42:guide.x,y:lower?landing.y:guide.y}];
  const common={quest:quest.id,node,step:index+1,props};
  if(lower){
   const {x,y,label}=ore;
   const fixtures=[{x,y,rects:[[-26,-12,52,12,'#526266'],[-18,-28,10,18,'#6cb39d'],
    [-4,-40,13,30,'#a6e1cd'],[12,-27,13,18,'#73b5af']]}];
   return {...common,x,y,name:'強化鉱石',action:label,fixtures};
  }
  const cracks=[];
  for(let i=1;i<=4;i++)cracks.push([i*39,3,3,8,'#615e68'],[i*39+3,8,6,2,'#615e68']);
  const fixtures=[{x:chest.x,y:chest.y,rects:[[-19,-22,38,22,'#764a32'],[-19,-22,38,5,'#ce954f'],
   [-16,index===2?-37:-28,32,8,'#ae7244'],[-3,-19,6,8,'#ffcd6a']]},{x:brittle.x,y:brittle.y,rects:cracks}];
  if(index===2)return {...common,x:brittle.x+brittle.w/2,y:brittle.y,name:'ひびの入った足場',
   action:'宝箱から左へ戻り、ひびの上を歩く',fixtures};
  const site=index===0?guide:chest;
  return {...common,x:site.x,y:site.y,name:index===0?'ベネット':'上段の宝箱',action:site.label,fixtures};
 }
 if(quest?.roof&&Number.isInteger(index)&&index>=0){
  const {marks,finish,lookout}=quest.roof;
  const onRoof=node===quest.target&&index<marks.length;
  const atFinish=node===lookout&&index===marks.length;
  if(!onRoof&&!atFinish)return null;
  const mark=atFinish?finish:marks[index];
  const colors=['#ed6870','#5fa8e5','#edc35f'];
  const flags=onRoof?marks.slice(0,index+1):[finish];
  const fixtures=flags.map(({x,y},i)=>{
   const color=atFinish?colors[2]:i===index?colors[i]:'#96ae81';
   return {x,y,rects:[[-2,-28,4,28,'#745447'],[2,-28,20,9,color],[2,-19,13,5,color]]};
  });
  if(onRoof)for(const draft of quest.roof.drafts.filter(item=>item.requires<=index)){
   const rects=Array.from({length:6},(_,i)=>{
    const width=24+i*6;
    return [-width/2,-6-(i*13)%76,width,3,i%2===0?'#a4eedc':'#e5fff0'];
   });
   fixtures.push({x:draft.x,y:draft.y,rects,name:'上昇気流',labelHeight:92});
  }
  const name=atFinish?'飛ばされた目印':['赤い目印','青い目印','黄色い目印'][index];
  return {quest:quest.id,node,step:index+1,x:mark.x,y:mark.y,name,action:mark.label,fixtures};
 }
 const path=pathId&&quest?.paths?.find(p=>p.id===pathId);
 const steps=pathId?path?.steps:quest?.itinerary,step=steps?.[index];
 if((step?.kind==='choice'||step?.kind==='guideChoice')&&step.node===node){
  const option=step.choices[choice-1];
  if(!option)return null;
  return {quest:quest.id,step:index+1,node,choice,path:pathId,x:option.x,y:option.y,name:option.name,action:option.action,
   props:step.choices.map(o=>choiceProp(o,step.kind)).filter(Boolean),fixtures:choiceFixtures(step)};
 }
 if(room?.rockViews && room.rockViews.quest===quest?.id && step?.kind==='inspect' && step.node===node){
  const stations=room.rockViews.points;
  const initialStation=stations.findIndex(p=>p.x===step.x && p.y===step.y);
  if(initialStation>=0)return {quest:quest.id,step:index+1,node,...stations[initialStation],stations,initialStation,action:step.objective};
 }
 if(room?.id===node&&step?.node===node&&puzzleStep(step)){
  let stations;
  if(step.resonanceOrder&&room.resonance){
   const r=room.resonance;
   stations=[{...r.panel,name:'刻印板',hint:r.order.map(i=>r.stones[i-1].pattern).join(' → ')},
    ...r.stones.map(s=>({...s,name:'共鳴石 '+s.pattern}))];
  }else if(step.shadowChoice)stations=room.rockViews?.points;
  else if(step.paperFold)stations=room.paperBoard?.panels;
  if(stations?.length)return {quest:quest.id,step:index+1,node,...stations[0],stations,action:step.objective};
 }
 if(quest?.teaCase&&step?.node===node&&(step.teaClue||step.teaCup||step.kind==='teaEvidence')){
  return {quest:quest.id,step:index+1,node,x:step.x,y:step.y,name:step.name,tea:true};
 }
 if(step?.kind==='stealthCheck'&&step.node===node){
  return {quest:quest.id,step:index+1,node,x:step.x,y:step.y,name:step.name,cover:step.cover,guard:step.stealthGuard};
 }
 if(step?.kind!=='inspect')return null;
 const point=[step,...step.alternatives??[]].find(p=>p.node===node && Number.isFinite(p.x) && Number.isFinite(p.y));
 if(!point)return null;
 const prop=step.returnClue??(step.returnPickup?{art:'crate',height:51}:null);
 return {quest:quest.id,step:index+1,node,x:point.x,y:point.y,name:point.name??step.name??step.objective,
  action:step.action??step.objective,...(path&&{path:path.id,pathLabel:path.label}),...(prop&&{returnProp:prop})};
}

export function worksitePoints(quest){
 if(quest?.rail)return [quest.rail.release,quest.rail.dispatch].map(p=>({...p,node:quest.target,name:p.label}));
 if(quest?.sights)return [...quest.sights.places,quest.sights.bridge].map(p=>({...p,node:quest.target}));
 return quest?.cooking?.ingredients??quest?.construction?.surveys??quest?.stone?.marks??[];
}
export function worksitePoint(quest,id,node){
 const item=worksitePoints(quest).find(s=>s.id===id && s.node===node);
 return item?{quest:quest.id,worksite:item.id,node,x:item.x,y:item.y,name:item.name}:null;
}

export function surveyPointUrl(point){
 const params=new URLSearchParams({placements:'live',node:point.node,quest:point.quest});
 if(point.worksite){
  params.set('worksite',point.worksite);
  params.set('compare','background');
  params.set('tier','4096');
 }else{
  params.set('step',String(point.step));
  if(point.view)params.set('view',point.view);
  if(point.forms){
   params.set('folds',point.forms.join(','));
   if(point.station)params.set('panel',String(point.station));
  }
  if(point.lit!=null)params.set('lit',String(point.lit));
  if(point.choice)params.set('choice',String(point.choice));
  if(point.path)params.set('path',point.path);
  if(point.cover||point.tea)params.set('tier','4096');
 }
 return 'map-art.html?'+params;
}

export function drawSurveyPoint(ctx,point,camera){
 const x=Math.round(point.x-camera),y=Math.round(point.y);
 ctx.save();ctx.translate(x,y);
 ctx.strokeStyle='#143a42';ctx.lineWidth=5;
 ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(9,0);ctx.moveTo(0,-9);ctx.lineTo(0,9);ctx.stroke();
 ctx.strokeStyle='#85ffdf';ctx.lineWidth=2;ctx.stroke();
 ctx.restore();
}
