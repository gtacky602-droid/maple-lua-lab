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
 }
 if(height)return {file:'quest-packed/'+pose+'-sprites-v1.json',height,x:option.x,y:option.y+offsetY,
  bubbles:option.diveChoice&&option.id==='bubbles'};
}
export function surveyPoint(quest,index,node,room,pathId,choice){
 const path=pathId&&quest?.paths?.find(p=>p.id===pathId);
 const steps=pathId?path?.steps:quest?.itinerary,step=steps?.[index];
 if((step?.kind==='choice'||step?.kind==='guideChoice')&&step.node===node){
  const option=step.choices[choice-1];
  if(!option)return null;
  return {quest:quest.id,step:index+1,node,choice,path:pathId,x:option.x,y:option.y,name:option.name,action:option.action,
   props:step.choices.map(o=>choiceProp(o,step.kind)).filter(Boolean)};
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
