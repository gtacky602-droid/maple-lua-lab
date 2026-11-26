// Physical inspection points on the authored travel-and-survey itineraries.
export function puzzleStep(step){
 return step?.kind==='inspect'&&(step.resonanceOrder||step.shadowChoice||step.paperFold);
}
const colleiHeights={root:72,stones:43,shelter:112,bench:51,barrier:43};
function wandererGuide(x,y,left){
 return {name:'放浪者',file:'wanderer-idle-'+(left?'left':'right')+'-sprites-v3.json',height:88,x,y};
}
function wandererSurveyProps(quest,index,node){
 const heights={root:46,stone:66,ring:69,lever:62,leverOn:62,sign:91};
 const props=[];
 for(const [i,mark] of quest.itinerary.slice(0,index+1).entries()){
  if(mark.node!==node||!mark.surveyProp)continue;
  const key=mark.assistLever&&i<index?'leverOn':mark.surveyProp;
  props.push({name:mark.name,file:'quest-packed/sum-wanderer-sign-'+key+'-sprites-v1.json',
   height:heights[key],x:mark.x,y:mark.y});
 }
 if(node===quest.target){
  const assist=quest.surveyAssist,solved=index>=quest.goal-1;
  if(!solved)for(const guard of assist.guards){
   props.push({name:'キノコン',file:'field-packed/dendro-fungus-idle-sprites.json',height:47,
    x:guard.x,y:guard.y+Math.sin(guard.x)*6});
  }
  if(solved)props.push(wandererGuide(assist.endX,assist.endY,true));
  else if(quest.itinerary[index].assistLever)props.push(wandererGuide(assist.startX,assist.startY,false));
 }
 return props;
}
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
function colleiSceneProps(quest,index,node,room){
 const props=[];
 for(const [i,step] of quest.itinerary.entries()){
  if(step.node!==node||step.kind!=='guideChoice')continue;
  for(const option of step.choices){
   if(option.rainOnly&&!room?.guideScene?.rain)continue;
   const prop=choiceProp(option,'guideChoice');
   prop.name=option.name;
   if(i<=index)prop.guideLabel={text:option.name,height:Math.max(108,prop.height+21),muted:i!==index};
   props.push(prop);
  }
 }
 const guest=room?.guideScene?.guest;
 if(guest)props.push({name:'初めて来た旅人',file:'quest-packed/sum-collei-guest-sprites-v1.json',
  height:85,x:guest.x,y:guest.y,guideLabel:{text:'初めて来た旅人',height:117,offsetX:26}});
 return props;
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
function restStopPoint(quest,count,node){
 const rest=quest.rest;
 const site=[null,rest.planks,rest.leaves,rest.bench,rest.chair,rest.tea][count];
 if(!site||node!==quest.target)return null;
 const fixtures=[{x:rest.bench.x,y:rest.bench.y,rects:count>=3?
  [[-76,-39,105,14,'#875a45'],[-76,-39,105,4,'#d4a76b'],[-77,-21,108,9,'#b78454'],[-70,-12,8,12,'#654536'],[16,-12,8,12,'#654536']]:
  [[-69,-12,88,7,'#715344'],[-52,-35,16,23,'#7f6851'],[13,-16,15,16,'#765444']]}];
 if(count===1)fixtures.push({...rest.planks,rects:Array.from({length:3},(_,i)=>[-17+i*3,-7-i*5,37,5,'#b9905d'])});
 if(count<=2)fixtures.push({...rest.leaves,rects:Array.from({length:7},(_,i)=>
  [(i-3)*8,-5-(i%3)*3,7,4,i%2?'#c28c42':'#a36b3b'])});
 if(count>=4)fixtures.push({...rest.tea,rects:[[-24,-31,48,6,'#ce9d64'],[-17,-25,6,25,'#714c39'],
  [13,-25,6,25,'#714c39'],[-15,-41,13,10,'#e8e3c6'],[5,-38,8,7,'#eacfb8'],[14,-37,3,4,'#eacfb8']]});
 const seated=count===quest.goal;
 if(seated)fixtures.push({...rest.chair,rects:[[28,-42,7,42,'#805440'],[19,-41,16,11,'#a77754'],
  [20,-41,15,3,'#d2a16c'],[-4,-24,39,6,'#bd8b5b'],[-3,-18,6,18,'#714c3b']]});
 const props=[{name:'ノエル',file:'quest-packed/noelle-rest-'+(seated?'seated':'standing')+'-sprites-v1.json',
  x:seated?rest.chair.x:rest.bench.x+50,y:rest.bench.y}];
 return {quest:quest.id,node,step:count+1,name:['','修理用の板','落ち葉','直ったベンチ','椅子の設置場所','休憩所のお茶'][count],
  action:site.label,x:site.x,y:site.y,fixtures,props,absent:rest.guards};
}

export function surveyPoint(quest,index,node,room,pathId,choice){
 if(quest?.rest)return restStopPoint(quest,index,node);
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
   props:step.kind==='guideChoice'&&room?colleiSceneProps(quest,index,node,room):
    step.choices.map(o=>choiceProp(o,step.kind)).filter(Boolean),fixtures:choiceFixtures(step)};
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
 const fixtures=[];
 if(step.outcrop){
  const ink={faint:'#8199af',partial:'#536e91',clear:'#24456c'}[step.outcrop];
  const rects=[[-23,-30,46,30,'#68869b'],[-17,-39,34,27,'#b9d8e3']];
  for(let stripe=-1;stripe<=1;stripe++)for(let i=0;i<4;i++)rects.push([stripe*9+i,-30-i*2,4,2,ink]);
  fixtures.push({x:point.x,y:point.y,rects,name:point.name,labelHeight:48});
 }
 const props=quest.surveyAssist?wandererSurveyProps(quest,index,node):
  room?.colleiGuideQuest===quest.id?colleiSceneProps(quest,index,node,room):[];
 const ingredientHeights={flower:45,dry:43,wood:35};
 if(ingredientHeights[step.scentProp]){
  props.push({name:point.name,file:'quest-packed/fon-emilie-scent-'+step.scentProp+'-sprites-v1.json',
   height:ingredientHeights[step.scentProp],x:point.x,y:point.y});
 }
 if(step.surveyGuide){
  const guide=step.surveyGuide;
  props.push(wandererGuide(guide.x,guide.y,guide.left));
 }
 const prop=step.returnClue??(step.returnPickup?{art:'crate',height:51}:null);
 return {quest:quest.id,step:index+1,node,x:point.x,y:point.y,name:point.name??step.name??step.objective,
  action:step.action??step.objective,...(path&&{path:path.id,pathLabel:path.label}),...(prop&&{returnProp:prop}),...(props.length&&{props}),...(fixtures.length&&{fixtures})};
}

export function exhibitPoint(q,exhibit){
 const spec=q?.stone??q?.book;
 if(!spec||!['harbor','market'].includes(exhibit))return null;
 const place=exhibit==='market'?spec.marketStand:spec.stand;
 return {quest:q.id,node:q.hub,x:place.x,y:place.y,exhibit,
  landmark:q.stone?q.stone.model.id:'read-stand',name:q.stone?place.name:'行秋の読書台',
  action:q.stone?'港に飾った模型を調べる':'「'+spec.title+'」を読む'};
}

export function cookingStallPoint(q,stall,flavorId){
 if(!q?.cooking||!['harbor','market'].includes(stall))return null;
 const place=stall==='market'?q.cooking.marketStall:q.cooking.stall;
 const flavor=q.cooking.flavors.find(item=>item.id===flavorId);
 return {quest:q.id,node:q.hub,x:place.x,y:place.y,stall,flavor:flavor?.id,
  name:'香菱の屋台',action:flavor?flavor.name:'食材を渡して味を選ぶ'};
}

export function constructionWorksite(plan,supplies){
 return {...plan.site,id:supplies?'work-supplies':'work-clearing',
  name:plan.name+'・'+(supplies?'資材の受け渡し':'作業場所の片付け')};
}

export function worksitePoints(quest){
 if(quest?.cargo)return quest.cargo.map(p=>({...p,node:quest.recovery?.node??quest.target}));
 if(quest?.trail?.clues)return [...quest.trail.clues,...(quest.trail.meeting?[{...quest.trail.meeting,node:quest.target}]:[])];
 if(quest?.delivery)return [...quest.delivery.packages.map(p=>({...p,node:quest.hub,name:p.stall})),
  {...quest.delivery.cache,node:quest.target}];
 if(quest?.rail)return [quest.rail.release,quest.rail.dispatch].map(p=>({...p,node:quest.target,name:p.label}));
 if(quest?.sights)return [...quest.sights.places,quest.sights.bridge].map(p=>({...p,node:quest.target}));
 if(quest?.stone)return [...quest.stone.marks,...[quest.stone.mural,quest.stone.model].map(site=>({...site,node:quest.target}))];
 if(quest?.construction){
  const {surveys,desk,plans}=quest.construction;
  return [...surveys,desk,...plans.flatMap(plan=>[constructionWorksite(plan,false),constructionWorksite(plan,true)])];
 }
 return quest?.cooking?.ingredients??[];
}
export function worksitePoint(quest,id,node,stocked=[]){
 const item=worksitePoints(quest).find(s=>s.id===id && s.node===node);
 if(!item)return null;
 const point={quest:quest.id,worksite:item.id,node,x:item.x,y:item.y,name:item.name};
 if(quest.cargo){
  point.recovered=quest.cargo.filter(p=>stocked.includes(p.id)).map(p=>p.id);
  point.parcels=quest.cargo.filter(p=>!point.recovered.includes(p.id));
  point.absent=quest.cargo.filter(p=>p.guard&&point.recovered.includes(p.id)).map(p=>p.guard);
  if(quest.recovery)point.absent.push(quest.recovery.guard);
 }
 if(quest.trail&&item.rects)point.fixtures=[{x:item.x,y:item.y,rects:item.rects}];
 if(quest.delivery){
  if(node===quest.target){
   point.absent=[quest.delivery.cache.guard];
   point.fixtures=[{x:item.x,y:item.y,rects:[[-15,-24,30,24,'#5b3f2c'],[-12,-21,24,18,'#c48a56'],[-2,-21,4,18,'#f1d58e']]}];
  }else{
   point.stocked=quest.delivery.packages.filter(p=>stocked.includes(p.id)).map(p=>p.id);
   point.fixtures=quest.delivery.packages.map(({id,x,y,color,stockRects})=>{
    const rects=[[-27,-32,54,32,'#62432e'],[-24,-27,48,21,'#916749'],[-28,-32,56,4,color]];
    if(point.stocked.includes(id))rects.push(...stockRects);
    return {x,y,rects};
   });
  }
 }
 return point;
}

export function letterPoint(q,stage){
 if(!q?.guideLetter||!['pickup','delivery','reply'].includes(stage))return null;
 const place=stage==='pickup'?q.guideLetter.sender:q.guideLetter.recipient;
 const name=stage==='pickup'?'コレイからの手紙':'アンバーへの手紙';
 const action={pickup:'コレイからアンバーへの手紙を預かる',delivery:'アンバーに手紙を渡す',reply:'アンバーの返事を聞き返す'}[stage];
 const props=stage==='reply'?[]:[{name,file:'quest-packed/sum-collei-guide-letter-sprites-v1.json',height:36,x:place.x,y:place.y-12}];
 return {...place,quest:q.id,letter:stage,name:stage==='reply'?'アンバーの返事':name,action,props};
}

export function surveyPointUrl(point){
 const params=new URLSearchParams({placements:'live',node:point.node,quest:point.quest});
 if(point.stall||point.exhibit){
  if(point.exhibit)params.set('exhibit',point.exhibit);
  else params.set('stall',point.stall);
  if(point.flavor)params.set('flavor',point.flavor);
  params.set('compare','background');params.set('tier','4096');
 }else if(point.letter){
  params.set('letter',point.letter);
 }else if(point.worksite){
  params.set('worksite',point.worksite);
  for(const id of point.recovered??[])params.append('recovered',id);
  for(const id of point.stocked??[])params.append('stocked',id);
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
