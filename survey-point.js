// Physical inspection points on the authored travel-and-survey itineraries.
export function surveyPoint(quest,index,node){
 const steps=quest?.itinerary,step=steps?.[index];
 if(step?.kind!=='inspect'||!steps.some(s=>s.kind==='arrive')||
    !steps.every(s=>s.kind==='arrive'||s.kind==='inspect'))return null;
 const point=[step,...step.alternatives??[]].find(p=>p.node===node && Number.isFinite(p.x));
 if(!point)return null;
 return {quest:quest.id,step:index+1,node,x:point.x,y:point.y??480,name:point.name??step.name??step.objective};
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
 }else params.set('step',String(point.step));
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
