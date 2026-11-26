import {hasOptionalPath,pendingQuestPaths,questDestinations,questRoute,questTargetNode} from './quest-route.js';
import {teaNotebook} from './tea-notebook.js';
import {letterPoint,puzzleStep,surveyPoint,surveyPointUrl,worksitePoint} from './survey-point.js';
export function questStatus(q,state,quests,level=Infinity,growthEligibility){
 if(!state)return q.legacyOnly||(q.requires&&quests?.[q.requires]?.status!=='complete')||
  (q.opensAfter&&(!quests?.[q.opensAfter]||(quests[q.opensAfter].count??0)<(q.opensAfterCount??0)))||
  (q.opensAfterAnyPath&&!Object.entries(q.opensAfterAnyPath).some(([path,count])=>
   (quests?.[q.opensAfter]?.pathProgress?.[path]?.count??0)>=count))||
  (q.level!==undefined&&level<q.level)||(q.growthRequirement&&!growthEligibility?.[q.growthRequirement])?'locked':'unaccepted';
 if(state.status==='complete')return 'complete';
 return state.count>=q.goal?'ready':'active';
}
const rewardNumber=new Intl.NumberFormat('ja-JP');
const questName=(q,state)=>q.sights&&state&&!state.sights?q.sights.legacyName:q.name;
const labels={locked:'未解放',unaccepted:'未受注',active:'進行中',ready:'報告待ち',complete:'完了'};
function remainingEnemyPoints(step,progress){
 const targets=step.enemies??(step.enemy?[step.enemy]:[]);
 return targets.flatMap((subject,index)=>{
  if(progress?.sweep?.[subject])return [];
  const params=new URLSearchParams({placements:'live',node:step.node,subject});
  const label=targets.length===1?'討伐対象':'討伐対象 '+(index+1)+'／'+targets.length;
  return [{subject,label,url:'map-art.html?'+params}];
 });
}

function restGuards(q,state){
 return remainingEnemyPoints({node:q.target,enemies:q.rest.guards},{sweep:state.rest?.defeated});
}

function wharfExit(q,cleared){
 const params=new URLSearchParams({placements:'live',node:q.recovery.node});
 for(const item of q.cargo)if(item.guard)params.append('absent',item.guard);
 if(cleared)params.append('absent',q.recovery.guard);
 else params.set('subject',q.recovery.guard);
 return {label:cleared?'開通した桟橋':'帰路を塞ぐ魔物',subject:cleared?undefined:q.recovery.guard,url:'map-art.html?'+params};
}

function huntPoint(q,state,node){
 if(q.kind!=='kill'||node!==q.target)return null;
 const opening=q.openingArts&&state.recovered&&state.count<q.goal-1;
 if(!q.enemy&&!opening){
  if(q.cargo&&state.recovered)return null;
  return {label:'討伐対象',url:'map-art.html?'+new URLSearchParams({placements:'live',node})};
 }
 const params=new URLSearchParams({placements:'live',node,hunt:q.id});
 if(q.enemy)params.set('subject',q.enemy);
 return {label:q.enemyName??'討伐対象のスライム',subject:q.enemy,url:'map-art.html?'+params};
}

function cargoStops(q,state,node,frame){
 if(!state.recovered||node!==(q.recovery?.node??q.target))return [];
 if(q.recovery&&state.count>=q.goal-1)return [wharfExit(q,state.count>=q.goal)];
 if(!q.recovery&&state.count!==q.goal-1)return [];
 const recovered=q.cargo.filter(item=>state.recovered[item.id]).map(item=>item.id);
 if(q.chase&&recovered.length===q.cargo.length){
  const params=new URLSearchParams({placements:'live',node,chase:q.id,subject:q.chase.enemy});
  return [{label:'赤い布を引きずるヒルチャール',subject:q.chase.enemy,url:'map-art.html?'+params}];
 }
 const here=frame.story.node===node?frame.storyCargo:null;
 const absent=new URLSearchParams();
 for(const parcel of q.cargo){
  if(parcel.guard&&here?.[parcel.id]?.guarded===false)absent.append('absent',parcel.guard);
 }
 return q.cargo.filter(item=>!state.recovered[item.id]).map(item=>{
  const url=surveyPointUrl(worksitePoint(q,item.id,node,recovered));
  return {id:item.id,label:item.name,url:absent.size?url+'&'+absent:url};
 });
}

function trailStops(q,state,node){
 const {clues,meeting,guard}=q.trail;
 const sites=state.count===0?clues.filter(c=>c.node===node):meeting&&state.count===1&&node===q.target?[meeting]:[];
 if(sites.length)return sites.map(s=>({label:s.name,url:surveyPointUrl(worksitePoint(q,s.id,node))}));
 return node===q.target&&state.count===(meeting?2:1)?remainingEnemyPoints({node,enemy:guard}):[];
}

function deliveryStops(q,state,node){
 const {cache,packages}=q.delivery,progress=state.delivery??{delivered:{}};
 if(node===q.target&&!progress.recovered){
  if(!progress.guardCleared)return remainingEnemyPoints({node,enemy:cache.guard}).map(p=>({...p,label:'荷箱の見張り'}));
  return [{label:cache.name,url:surveyPointUrl(worksitePoint(q,cache.id,node))}];
 }
 if(node!==q.hub)return [];
 const stocked=packages.filter(p=>progress.delivered[p.id]).map(p=>p.id);
 return packages.filter(p=>!stocked.includes(p.id)&&(p.id!==cache.id||progress.recovered)).map(p=>
  ({id:p.id,label:p.stall,url:surveyPointUrl(worksitePoint(q,p.id,node,stocked))}));
}

function bossFieldPoint(node,subject){
 const params=new URLSearchParams({placements:'live',node});
 if(subject)params.set('subject',subject);
 return {label:'討伐対象のボスを見比べる',url:'map-art.html?'+params};
}

function puzzleGuide(frame,quest,step,index){
 const view=frame.storyRockView;
 if(step?.shadowChoice && frame.story.node===step.node && view){
  const point={quest:quest.id,node:step.node,step:index+1,view:view.id};
  return {label:view.name+'からの岩影を見比べる',url:surveyPointUrl(point)};
 }
 const folds=frame.storyFoldRoute;
 if(step?.paperFold && folds?.quest===quest.id && folds.node===step.node){
  const point={quest:quest.id,node:step.node,step:index+1,forms:folds.forms,station:folds.station};
  return {label:'現在の折り方と足場を見る',url:surveyPointUrl(point)};
 }
 const route=frame.storyResonanceRoute;
 if(!step?.resonanceOrder || route?.quest!==quest.id || !route.nextPattern)return null;
 const point={quest:quest.id,node:step.node,step:index+1,lit:route.lit};
 return {label:route.lit?'次の共鳴石「'+route.nextPattern+'」を見る':'刻印板の順番を見る',url:surveyPointUrl(point)};
}

function railGuide(frame,q,count){
 if(frame.storyRailTransit)return null;
 if(count===1){
  const params=new URLSearchParams({placements:'live',node:q.target,subject:q.rail.guard});
  return {label:'石切り場の番人',subject:q.rail.guard,url:'map-art.html?'+params};
 }
 const station=count===0?q.rail.release:count===2?q.rail.dispatch:null;
 if(station)return {label:count===0?'上段の留め具':'港へ送るレバー',url:surveyPointUrl(worksitePoint(q,station.id,q.target))};
}

function postQuestLetter(q,state){
 if(!q.guideLetter||state?.status!=='complete')return null;
 const stage=state.colleiLetter==='delivered'?'reply':state.colleiLetter==='held'?'delivery':'pickup';
 return letterPoint(q,stage);
}

function arrivalGatePoints(graph,step){
 const source=graph.nodes.find(n=>n.id===step.from);
 return (source?.exits??[]).filter(e=>e.to===step.node&&Number.isFinite(e.x)).map(e=>{
  const params=new URLSearchParams({placements:'live',node:step.from,to:step.node,gateX:e.x,gateY:e.y??480});
  return {label:e.rideLabel??source.name+'の出発口',url:'map-art.html?'+params};
 });
}

export function atlasQuestObjectives(frame,q,node){
 const state=frame.story.quests?.[q.id];
 if(!state)return [];
 const status=questStatus(q,state,frame.story.quests);
 const letter=postQuestLetter(q,state);
 if(letter)return letter.node===node?[{text:letter.action,points:[{label:letter.name,url:surveyPointUrl(letter)}]}]:[];
 if(q.roof&&frame.storyRoof?.retry){
  const stage=frame.storyRoof.stage,point=surveyPoint(q,stage,node);
  return point?[{text:questObjective(q,frame.storyGraph,{count:stage}),points:[{label:point.name,url:surveyPointUrl(point)}]}]:[];
 }
 if(q.rest&&node===q.target){
  if(status==='active'&&state.count===0)return [{text:questObjective(q,frame.storyGraph,state),points:restGuards(q,state)}];
  if(status==='complete'||status==='ready'){
   const point=surveyPoint(q,q.goal,node);
   return [{text:point.action,points:[{label:point.name,url:surveyPointUrl(point)}]}];
  }
 }
 const hunt=status==='active'&&huntPoint(q,state,node);
 if(hunt)return [{text:questObjective(q,frame.storyGraph,state),points:[hunt]}];
 if(q.cargo&&(status==='active'||q.recovery)){
  const points=cargoStops(q,state,node,frame);
  if(points.length)return [{text:questObjective(q,frame.storyGraph,state),points}];
 }
 if(q.trail&&status==='active'){
  const points=trailStops(q,state,node);
  return points.length?[{text:questObjective(q,frame.storyGraph,state),points}]:[];
 }
 if(q.delivery&&status==='active'){
  const points=deliveryStops(q,state,node);
  return points.length?[{text:questObjective(q,frame.storyGraph,state),points}]:[];
 }
 const join=q.paths?q.itinerary.findIndex(step=>step.kind==='paths'):-1;
 const onBranch=join>=0 && state.count===join && status==='active';
 const optional=q.anyPath && join>=0 && state.count>join;
 const objectives=[];
 if(q.paths&&node===q.target&&state.pathProgress&&state.count>0){
  const bank=frame.storyGraph.nodes.find(n=>n.id===node&&n.pathsQuest===q.id&&n.spiritReturns);
  const seal=bank?.exits.find(e=>e.rockSeal);
  if(seal){
   const returned=bank.spiritReturns.filter(p=>state.pathProgress[p.path]?.count===q.paths.find(path=>path.id===p.path)?.steps.length);
   const count=returned.length,total=bank.spiritReturns.length;
   const params=new URLSearchParams({placements:'live',node,to:seal.to,gateX:seal.x,gateY:seal.y??480,
    fixture:count===total?'open':'closed',echoes:returned.map(p=>p.path).join(',')});
   objectives.push({text:'大岩に戻った光 '+count+' / '+total,points:[{label:count===total?'開いた試練の柱':'封じられた大岩',url:'map-art.html?'+params}]});
  }
 }
 function addObjective(text,index,path){
  const step=(path?.steps??q.itinerary)?.[index];
  const room=frame.storyGraph.nodes.find(n=>n.id===node);
  if(q.rail && node===q.target && status==='active'){
   const guide=railGuide(frame,q,index);
   objectives.push({text,points:guide?[guide]:[]});
   return;
  }
  const choices=step?.kind==='choice'||step?.kind==='guideChoice'?step.choices.length:0;
  if(q.kind==='boss' && status==='active' && node===questTargetNode(q,frame.storyGraph)){
   objectives.push({text,points:[bossFieldPoint(frame.storyGraph.bossNodes?.[q.target]??node)]});return;
  }
  if(step?.kind==='boss' && step.node===node){
   objectives.push({text,points:[bossFieldPoint(step.node,step.boss)]});return;
  }
  if(step?.kind==='kill' && step.node===node){
   const progress=path?state.pathProgress?.[path.id]:state;
   objectives.push({text,points:remainingEnemyPoints(step,progress)});
   return;
  }
  if(step?.kind==='arrive'&&step.from===node){
   objectives.push({text,points:arrivalGatePoints(frame.storyGraph,step)});return;
  }
  const puzzle=step?.node===node && puzzleGuide(frame,q,step,index);
  if(puzzle){objectives.push({text,points:[puzzle]});return}
  const points=[];
  for(let i=0;i<Math.max(1,choices);i++){
   const point=surveyPoint(q,index,node,room,path?.id,choices?i+1:undefined);
   if(point)points.push({label:point.name??'調査位置',url:surveyPointUrl(point)});
  }
  if(index!==undefined && !path && !points.length){
   for(const site of Object.values(frame.storyWorksites?.[q.id]??{})){
    if(site.node!==node || !site.point)continue;
    const point=worksitePoint(q,site.point,node);
    if(point)points.push({label:point.name,url:surveyPointUrl(point)});
   }
  }
  objectives.push({text,points});
 }
 if(onBranch || optional){
  for(const {path,step,count} of pendingQuestPaths(q,state)){
   const atNode=step.kind==='arrive' && step.from?step.from===node:
    step.node===node || step.alternatives?.some(p=>p.node===node);
   if(atNode)addObjective((optional?'任意・':'')+path.label+'　'+step.objective,count,path);
  }
 }
 if(onBranch || status==='complete')return objectives;
 if(questDestinations(frame,q,status).candidates.includes(node)){
  addObjective(status==='ready'?(q.giver?q.giver+'に報告する':'拠点で報告する'):
   questObjective(q,frame.storyGraph,state,frame.story.growth,frame.storyRailTransit),status==='active'?state.count:undefined);
 }
 return objectives;
}

export function questObjective(q,graph,state,growth={},railTransit){
 if(q.lesson){
  if(state?.status==='complete')return '成長依頼を報告済み';
  if(state?.count===q.goal)return '拠点で報告する';
  return q.lesson.map(step=>`${growth[step.id]?'✓ ':''}${step.text}`).join(' ／ ');
 }
 if(state?.status==='complete'&&q.completedObjective)return q.completedObjective;
 if(q.itinerary){
  if(state?.status==='complete')return '報告済み';
  return q.itinerary[state?.count??0]?.objective??'拠点で報告する';
 }
 const destination=graph.nodes.find(n=>n.id===questTargetNode(q,graph));
 const place=destination?.name||'目的地未登録';
 if(q.roof){
  const ticks=state?.roof?.bestTicks;
  if(ticks){
   const record=`記録 ${(ticks/60).toFixed(1)}秒${ticks<=q.roof.titleSeconds*60?' ｜ 称号「'+q.roof.title+'」':''}`;
   return (state.status==='complete'?'広場から展望台へ行ける ｜ ':'城門広場でアンバーに報告する ｜ ')+record;
  }
  return ['低い屋根で赤い目印を調べる','上の屋根で青い目印を調べる','気流に乗り、風車で黄色い目印を調べる',
   'ふたつ目の気流で上がり、展望台で目印を拾う'][state?.count??0];
 }
 if(q.cave){
  if(state?.status==='complete')return '洞窟の鉱脈を探索し、旧道への近道を使える';
  return ['風見の丘から小洞窟へ入り、ベネットに話を聞く','落石を避けて上段の宝箱を開ける',
   '空の宝箱から引き返す','崩れた床の下で光る鉱石を拾う','旧道から城門広場に戻って報告する'][state?.count??0];
 }
 if(q.rest){
  if(state?.status==='complete')return '街道脇の休憩所でお茶を飲んで回復できる';
  return ['南の街道から休憩所に入り、魔物を退ける','低い足場の板を拾う','ベンチのそばの落ち葉を掃く',
   '直ったベンチのそばでノエルに声をかける','ノエルの分の椅子を置く','城門広場でノエルに報告する'][state?.count??0];
 }
 if(q.sights){
  if(state&&!state.sights){
   const road=graph.nodes.find(node=>node.id===q.sights.legacyTarget)?.name;
   if(state.status==='complete')return '海辺の巡回を終え、綾華が同行を申し出た';
   return state.count===q.goal?'離島に戻り、綾華に報告する':`旧依頼：${road}で敵を${q.goal}体倒す`;
  }
  const places=[...q.sights.places,q.sights.bridge];
  const favorite=places.find(place=>place.id===state?.sights?.favorite);
  if(favorite)return state.status==='complete'?`みちくさ帳に「${favorite.name}」を記録した`:'離島の綾華に案内絵図を見せる';
  if(state?.count===q.goal-1)return '城下の橋から港を眺め、絵図に好きな景色を記す';
  return '城下で景色を調べる（残り：'+q.sights.places.filter(place=>!state?.sights?.seen[place.id]).map(place=>place.name).join('、')+'）';
 }
 if(q.contest){
  if(state?.status==='complete')return '潮見の岬を見つけ、化け狸の親分と再戦できる';
  return ['洞穴で化け狸の親分に勝負を申し込む','千化け大灯籠の化け術の外殻を削る',
   '水面にしっぽが映る灯籠を調べる','本物の大灯籠の化け力を使い切らせる',
   '洞穴を出て潮見の岬から海を眺める','離島の綾華に勝負と岬のことを報告する'][state?.count??0];
 }
 if(q.forest){
  if(state?.status==='complete')return '大灯籠と勝負の絵をみちくさ帳に収めた';
  const count=state?.count??0;
  if(!count)return state?.forest?.looped?'木の実のそばの足跡を見比べる':'三つ灯籠の広場の奥で鳥居をくぐる';
  return ['','上下に動く石像を探す','水面に映る姿を見比べる',
   '森の奥に入り込んだ魔物を退ける','化け狸に話しかけ、絵を受け取る',
   '海岸の近道から戻り、離島の綾華に絵を見せる'][count];
 }
 if(q.lantern){
  if(state?.status==='complete')return '狸の招待状を稲妻みちくさ帳に収めた';
  const count=state?.count??0;
  if(count===0)return '離島の波止場で綾華に話しかける';
  if(count===4)return '広場の三つの灯籠から、葉っぱが落ちる灯籠を探す';
  if(count===5)return '現れた化け狸から絵を受け取る';
  if(count===6)return '離島の綾華に招待状を見せる';
  const left=q.lantern.clues.filter(item=>!state.lantern.inspected[item.id]);
  return '灯隠れの小径で手がかりを調べる（残り：'+left.map(item=>item.name).join('、')+'）';
 }
 if(q.construction){
  const plan=q.construction.plans.find(p=>p.id===state?.construction?.plan);
  if(state?.status==='complete')return `${plan?.name??''}案で港の近道が開いた`;
  if(state?.count===6)return '港の刻晴に工事完了を報告する';
  if(state?.count===5)return '同じ作業場所で職人に資材を渡す';
  if(state?.count===4)return `${graph.nodes.find(n=>n.id===plan?.site.node)?.name??place}で作業場所を片付ける`;
  if(state?.count===3)return '港の施工案を調べ、地上路か昇降台を選ぶ';
  const left=q.construction.surveys.filter(item=>!state?.construction?.surveyed[item.id]);
  return 'Gキーで荷運びの経路を調べる（残り：'+left.map(item=>item.name).join('、')+'）';
 }
 if(q.stone){
  if(state?.status==='complete')return '港に職人の模型を飾った';
  if(state?.count===q.goal)return '港で鍾離に模型を見せる';
  if(state?.count===4)return '展望所の上段で建物模型を回収する';
  if(state?.count===3)return '展望所の壁画を調べ、石板を作業の順に押す';
  const left=q.stone.marks.filter(item=>!state?.stone?.marked[item.id]);
  return '同じ職人の印を調べる（残り：'+left.map(item=>item.name).join('、')+'）';
 }
 if(q.book){
  if(state?.status==='complete')return '新刊と版木を返し、港に読書台ができた';
  return ['岩間の狩場で落ちた試し刷りを探す','試し刷りの絵と同じ道しるべを調べる',
   '石門の奥で宝盗団を退ける','火鉢のそばの箱から新刊と版木を回収する',
   '港の行秋に新刊と版木を返す'][state?.count??0];
 }
 if(q.cooking){
  if(state?.status==='complete')return '港の屋台で山海包みを購入できる';
  if(state?.count===q.goal)return '香菱に試作を報告する';
  const remaining=q.cooking.ingredients.filter(item=>!state?.cooking?.gathered[item.id]);
  if(!remaining.length)return '港の香菱の屋台で、山海包みの味を選ぶ';
  return 'Gキーで食材を集める（残り：'+remaining.map(item=>item.name).join('、')+'）';
 }
 if(q.recovery){
  if(state?.status==='complete')return '北斗が同行を申し出た';
  if(state&&!state.recovered)return state.count===q.goal?'港で北斗に報告する':`旧依頼：${place}で敵を${q.goal}体倒す`;
  const remaining=q.cargo.filter(item=>!state?.recovered?.[item.id]);
  if(remaining.length)return `南十字の荷受け場で魔物を退け、荷物をGキーで回収する（残り：${remaining.map(item=>item.name).join('、')}）`;
  if(state.count===q.goal)return '港へ戻り、北斗に報告する';
  return '北斗が荷運び人を避難させている間に、帰りの桟橋の魔物を退ける';
 }
 if(q.rail){
  if(railTransit && state?.status==='active')return railTransit.release?'荷車が分岐へ移動中。到着すると奥の足場が下りる':'荷車が港へ移動中。到着すると市場への帰り道が開く';
  if(state?.status==='complete')return '荷車が帰り、山海の大市が開いた';
  if(state?.count===q.goal)return '市場への帰り道から港へ戻り、北斗に報告する';
  if(state?.count===2)return '分岐に止まった荷車の横で、黄色いレバーをGキーで切り替えて港へ送り出す';
  if(state?.count===1)return '保管区画で石切り場の番人を倒す';
  return '保管区画の上段に上がり、Gキーで荷車の留め具を外す';
 }
 if(q.delivery){
  if(state?.status==='complete')return '三店舗への配達を終えた';
  if(state?.count===q.goal)return '港の広場で刻晴に報告する';
  const cache=q.delivery.cache;
  const labels=q.delivery.packages.filter(parcel=>!state?.delivery?.delivered[parcel.id]&&
   (parcel.id!==cache.id||state?.delivery?.recovered)).map(parcel=>parcel.label);
  const parts=[];
  if(labels.length)parts.push(`店先で荷札を選ぶ（手元にある荷物：${labels.join('、')}）`);
  if(!state?.delivery?.recovered)parts.push(state?.delivery?.guardCleared?'足場にある車輪の荷箱を回収する':'港外の見張りを倒し、車輪の荷箱を回収する');
  return parts.join('。');
 }
 if(q.enemyName)return `${place}で${q.enemyName}を倒す`;
 if(q.trail?.meeting){
  if(state?.status==='complete')return '商隊は帰還し、昇降台が復旧した';
  if(!state?.count)return '川沿いの荷車跡か、桟道の荷札をGキーで調べる';
  if(state.count===1)return '石切り場の詰所で商隊の話を聞く';
  if(state.count===q.goal)return '復旧した昇降台で港へ戻り、北斗に報告する';
  return '詰所の見張りを退け、商隊を退避させる';
 }
 if(q.trail){
  if(state?.status==='complete')return '森から風見の丘への近道を開いた';
  if(!state?.count)return '旧道の下段で車輪跡、または上段で枝の赤い布をGキーで調べる';
  if(state.count===q.goal)return '近道から城門広場へ戻り、アンバーに報告する';
  return '風見の丘へ進み、見張りのヒルチャールを倒す';
 }
 if(q.cargo&&(!state||state.recovered)){
  if(state?.status==='complete')return '荷馬車を街へ戻した';
  const opening=q.goal-1;
  if(!state||state.count<opening)return `アンバーと南の街道へ出発し、スライムを${opening}体倒す（${state?.count??0}/${opening}）`;
  const remaining=q.cargo.filter(item=>!state.recovered[item.id]);
  if(remaining.length)return `Gキーで荷物を回収する（${q.cargo.length-remaining.length}/${q.cargo.length}）・残り ${remaining.map(item=>item.name).join('、')}`;
  if(state.count===q.goal)return '城門広場に戻り、アンバーに報告する';
  return '赤い布を引きずるヒルチャールを街道の奥で倒す';
 }
 return q.kind==='visit'?`${place}を訪れる`:q.kind==='kill'?`${place}で敵を${q.goal}体倒す`:`${place}の本編入口から挑戦し、ボスを討伐する`;
}
function recordedFirework(q,state){
 const design=state.fireworkDesign;
 if(!design)return null;
 const color=q.fireworks.colors.find(row=>row.id===design.color);
 const shape=q.fireworks.shapes.find(row=>row.id===design.shape);
 if(!color||!shape)return null;
 return {label:color.label+'・'+shape.label,url:'firework-preview.html?'+new URLSearchParams({color:color.id,shape:shape.id})};
}
export function trackedQuest(f,id,selectedWorksite){
 if(!f.story?.active)return {text:''};
 const q=f.storyGraph.quests.find(q=>q.id===id);if(!q)return {text:''};
 const st=f.story.quests[q.id],status=questStatus(q,st,f.story.quests,f.progression?.level??0,f.growthEligibility),hub=f.storyGraph.nodes.find(n=>n.id===q.hub)?.name||q.hub;
 const letter=postQuestLetter(q,st);
 if(letter){
  const route=questRoute(f,{kind:'visit',target:letter.node},'active');
  return {...route,node:letter.node,pointUrl:surveyPointUrl(letter),pointLabel:letter.name+'の位置を見る',
   text:q.name+' ｜ 報告済み ｜ '+letter.action+' ｜ '+route.text};
 }
 if(q.roof&&(status==='active'||f.storyRoof?.retry)){
  const retry=f.storyRoof?.retry,stage=retry?f.storyRoof.stage:st.count;
  const route=questRoute(f,q,'active');
  const point=surveyPoint(q,stage,route.node);
  if(point)return {...route,pointUrl:surveyPointUrl(point),pointLabel:'次の目印の位置を見る',
   text:q.name+(retry?'（記録に再挑戦中）':'')+' ｜ '+questObjective(q,f.storyGraph,{count:stage})+(route.text?' ｜ '+route.text:'')};
 }
 if(status==='complete'){
  const changed=f.storyGraph.nodes.find(n=>n.locationAfterReport?.quest===id);
  if(changed){
   const route=questRoute(f,{kind:'visit',target:changed.id},'active');
   const place=changed.locationAfterReport.name;
   const params=new URLSearchParams({node:changed.id,placements:'live',phase:'after'});
   return {...route,node:changed.id,pointUrl:'map-art.html?'+params,pointLabel:place+'の配置を見る',
    text:q.name+' ｜ 報告済み ｜ '+q.closing+' '+route.text};
  }
 }
 if(q.contest){
  const replay=status==='complete';
  const rematch=replay&&f.storyContest?.replay;
  const phase=replay?(rematch?f.storyContest.stage:1):st?.count;
  if((status==='active'||replay)&&phase>=1&&phase<=3){
   const params=new URLSearchParams({node:q.target,placements:'live',compare:'background',tier:'4096',contest:phase});
   if(replay)params.set('replay','1');
   const objective=rematch?questObjective(q,f.storyGraph,{status:'active',count:phase}):
    replay?'海辺の洞穴で親分に再戦を申し込めます。':questObjective(q,f.storyGraph,st);
   const route=replay?{}:questRoute(f,q,status);
   return {...route,node:q.target,pointUrl:'map-art.html?'+params,pointLabel:phase===2?'水面の三つの影を見比べる':'大灯籠の姿を見る',
    text:`${q.name} ｜ ${rematch?'再戦中':labels[status]} ｜ ${objective}`+(route.text?' ｜ '+route.text:'')};
  }
 }
 if(q.recovery&&st?.recovered&&status==='complete'){
  const route=questRoute(f,{kind:'visit',target:q.recovery.node},'active');
  const point=wharfExit(q,true);
  return {...route,node:q.recovery.node,pointUrl:point.url,pointLabel:point.label+'を見る',text:q.name+' ｜ '+q.clearedNotice+' '+route.text};
 }
 if(q.rest&&status==='complete'){
  const point=surveyPoint(q,q.goal,q.target);
  const route=questRoute(f,{kind:'visit',target:q.target},'active');
  return {...route,node:q.target,pointUrl:surveyPointUrl(point),pointLabel:'お茶の位置を見る',
   text:q.name+' ｜ 報告済み。休憩所のお茶で操作中のキャラのHPが最大'+q.rest.tea.heal+'回復します。 '+route.text};
 }
 if(q.delivery&&status==='complete'){
  const packages=q.delivery.packages,point=worksitePoint(q,packages[0].id,q.hub,packages.map(p=>p.id));
  const route=questRoute(f,{kind:'visit',target:q.hub},'active');
  return {...route,node:q.hub,pointUrl:surveyPointUrl(point),pointLabel:'配達後の三軒を見る',
   text:q.name+' ｜ 報告済み。港の三軒に荷物が並びました。 '+route.text};
 }
 if(q.teaCase&&status==='complete'){
  const point=surveyPoint(q,q.goal-1,q.target);
  return {node:q.target,pointUrl:surveyPointUrl(point),pointLabel:'茶屋の位置を見る',
   text:q.name+' ｜ 船着き場の湯飲みでGを押すと、操作中の仲間のHPが最大'+q.teaCase.heal+'回復します。'};
 }
 const festivalRound=q.itinerary?.[st?.count]?.kind==='festivalGame'?st.count:null;
 if(festivalRound||(status==='complete'&&st?.ittoContest?.series>0)){
  const round=f.story.node===q.target&&(f.storyIttoGames?.round??f.storyIttoGames?.next)||festivalRound||1;
  const params=new URLSearchParams({node:q.target,placements:'live',round,tier:'4096'});
  const objective=st.ittoContest?.series>0?'景品台で三競技の成績を確認できます。':questObjective(q,f.storyGraph,st);
  const route=questRoute(f,q,status);
  return {...route,node:q.target,pointUrl:'map-art.html?'+params,pointLabel:'競技広場の配置を見る',
   text:q.name+' ｜ '+objective+(route.text?' ｜ '+route.text:'')};
 }
 if(status==='complete'&&q.fireworks){
  const design=recordedFirework(q,st);
  if(design)return {node:q.itinerary.at(-1).node,pointUrl:design.url,pointLabel:design.label+'を見比べる',
   text:q.name+' ｜ '+design.label+'を記録。海辺の打ち上げ台でGを押すと、家族の窓辺からもう一度見られます。'};
 }
 if(status==='complete'&&st.sights?.favorite){
  const point=worksitePoint(q,st.sights.favorite,q.target);
  if(point)return {node:q.target,pointUrl:surveyPointUrl(point),pointLabel:'絵図に残した景色を見る',
   text:`${q.name} ｜ みちくさ帳に「${point.name}」を記録しました。`};
 }
 if(status==='complete'&&q.forest){
  const exit=f.storyGraph.nodes.find(n=>n.id===q.target)?.exits.find(e=>e.requires?.quest===q.id&&e.requires.count===q.goal);
  if(exit){
   const params=new URLSearchParams({node:q.target,placements:'live',to:exit.to,gateX:exit.x,gateY:exit.y??480,compare:'background',tier:'4096'});
   return {node:q.target,pointUrl:'map-art.html?'+params,pointLabel:'海岸への出口を見る',
    text:`${q.name} ｜ 森の奥の鳥居から海岸へ抜けられます。`};
  }
 }
 if(status==='complete'&&q.construction){
  const plan=q.construction.plans.find(p=>p.id===st.construction?.plan);
  const opened=f.storyGraph.nodes.find(n=>n.id===plan?.route);
  if(opened){
   const params=new URLSearchParams({node:opened.id,placements:'live',compare:'background',tier:'4096'});
   return {node:opened.id,pointUrl:'map-art.html?'+params,pointLabel:'開通した道の荷車を見る',
    text:`${q.name} ｜ 報告済み ｜ ${hub}から「${opened.name}」を通って狩場へ行けます。`};
  }
 }
 const next=status==='locked'?prerequisiteText(q,f.storyGraph,f.progression?.level??0):status==='unaccepted'?`${hub}で受注してください`:status==='ready'?`${hub}へ戻って報告してください`:status==='complete'?(q.repeatable?`${hub}で再受注できます`:'報酬受取済み'):questObjective(q,f.storyGraph,st,f.story.growth,f.storyRailTransit);
 const route=status==='locked'?{text:''}:questRoute(f,q,status,selectedWorksite?.node);
 const hunt=status==='active'&&huntPoint(q,st,route.node);
 if(hunt)return {...route,pointUrl:hunt.url,pointLabel:hunt.label+'の位置を見る',text:q.name+' ｜ '+next+' ｜ '+route.text};
 if(q.cargo&&status==='active'){
  const points=cargoStops(q,st,route.node,f),local=f.storyHunts?.[id];
  const nearby=local?.point??q.cargo.find(p=>p.guard&&p.guard===local?.spawn)?.id;
  const point=points.find(p=>p.id===nearby)??points[0];
  if(point)return {...route,pointUrl:point.url,pointLabel:point.label+'の位置を見る',text:q.name+' ｜ '+next+' ｜ '+route.text};
 }
 if(q.trail&&status==='active'){
  const [point]=trailStops(q,st,route.node);
  if(point)return {...route,pointUrl:point.url,pointLabel:point.label+'の位置を見る',text:q.name+' ｜ '+next+' ｜ '+route.text};
 }
 if(q.delivery&&status==='active'){
  const points=deliveryStops(q,st,route.node),local=f.storyHunts?.[id];
  const point=points.find(p=>p.id&&(p.id===(selectedWorksite?.point??local?.point)))??points[0];
  if(point)return {...route,pointUrl:point.url,pointLabel:point.label+'の位置を見る',text:q.name+' ｜ '+next+' ｜ '+route.text};
 }
 if(q.rest&&status==='active'&&st.count===0){
  const guard=restGuards(q,st)[0];
  if(guard)return {...route,pointUrl:guard.url,pointLabel:'残っている魔物の位置を見る',text:q.name+' ｜ '+next+' ｜ '+route.text};
 }
 if(status==='active' && q.kind==='boss' && route.node){
  const point=bossFieldPoint(f.storyGraph.bossNodes?.[q.target]??route.node);
  return {...route,pointUrl:point.url,pointLabel:point.label,text:q.name+' ｜ '+next+(route.text?' ｜ '+route.text:'')};
 }
 if(status==='active' && q.rail){
  const guide=railGuide(f,q,st.count);
  return {...route,text:q.name+' ｜ '+next+' ｜ '+route.text,pointUrl:guide?.url,pointLabel:guide && guide.label+'の位置を見る'};
 }
 const room=status==='active'&&q.forest?.rooms[st.count];
 if(room&&route.node===room.node){
  const phase=st.forest.looped?'search':'entry';
  const params=new URLSearchParams({node:room.node,placements:'live',forest:phase,compare:'background',tier:'4096'});
  return {...route,node:room.node,pointUrl:'map-art.html?'+params,pointLabel:'広場の様子を見る',
   text:`${q.name} ｜ ${next}`+(route.text?' ｜ '+route.text:'')};
 }
 const patrolStep=status==='active'&&q.itinerary?.[st.count];
 if(patrolStep?.kind==='boss'&&route.node===patrolStep.node){
  const point=bossFieldPoint(patrolStep.node,patrolStep.boss);
  return {...route,pointUrl:point.url,pointLabel:point.label,text:q.name+' ｜ '+next+(route.text?' ｜ '+route.text:'')};
 }
 if(patrolStep?.cover&&route.node===patrolStep.node){
  const point=surveyPoint(q,st.count,route.node);
  return {...route,pointUrl:surveyPointUrl(point),pointLabel:patrolStep.cover.name+'の位置を見る',
   text:q.name+' ｜ '+next+(route.text?' ｜ '+route.text:'')};
 }
 if(puzzleStep(patrolStep)&&route.node===patrolStep.node){
  const puzzle=puzzleGuide(f,q,patrolStep,st.count);
  if(puzzle)return {...route,pointUrl:puzzle.url,pointLabel:puzzle.label,text:q.name+' ｜ '+next+(route.text?' ｜ '+route.text:'')};
  const url=surveyPointUrl({node:route.node,quest:q.id,step:st.count+1});
  return {...route,pointUrl:url,pointLabel:'装置の操作場所を見る',text:q.name+' ｜ '+next+(route.text?' ｜ '+route.text:'')};
 }
 const optional=hasOptionalPath(q,st);
 if(patrolStep?.kind==='paths'||optional){
  const title=q.name+(optional?'（報告済み・任意の寄り道）':'');
  for(const path of q.paths){
   const index=st.pathProgress?.[path.id]?.count??0,step=path.steps[index];
   if(step?.kind==='arrive'&&step.from&&(route.node===step.from||f.story.node===step.from&&route.node===step.node)){
    const points=arrivalGatePoints(f.storyGraph,step);
    if(points.length===1)return {...route,pointUrl:points[0].url,pointLabel:points[0].label+'の位置を見る',
     text:title+' ｜ '+path.label+'：'+step.objective+' ｜ '+route.text};
   }
   if(!step||step.node!==route.node)continue;
   if(step.kind==='kill'){
    const remaining=remainingEnemyPoints(step,st.pathProgress?.[path.id]);
    if(remaining.length){
     return {...route,node:step.node,pointUrl:remaining[0].url,pointLabel:path.label+'の残りの敵を見る',
      text:title+' ｜ '+path.label+'：'+step.objective+'（残り'+remaining.length+'体） ｜ '+route.text};
    }
   }
   const point=surveyPoint(q,index,route.node,null,path.id);
   if(point)return {...route,pointUrl:surveyPointUrl(point),pointLabel:path.label+'の調査位置を見る',
    text:title+' ｜ '+path.label+'：'+step.objective+(route.text?' ｜ '+route.text:'')};
  }
 }
 const local=f.storyHunts?.[id];
 const site=selectedWorksite??f.storyWorksites?.[id]?.find(p=>p.point===local?.point || (!local && p.node===route.node));
 const point=status==='active' && (worksitePoint(q,site?.point,route.node)??surveyPoint(q,st.count,route.node,null,null,site?.choice));
 return {...route,pointUrl:point?surveyPointUrl(point):route.gateUrl,pointLabel:!point?route.gateLabel:undefined,text:`${questName(q,st)} ｜ ${labels[status]}${st?` ${st.count}/${q.goal}`:''} ｜ ${next}`+(route.text?' ｜ '+route.text:'')};
}
export function trackedQuestText(f,id){return trackedQuest(f,id).text}
function prerequisiteText(q,graph,level){
 if(q.level!==undefined&&level<q.level)return `Lv${q.level}になる`;
 if(q.unlockHint)return q.unlockHint;
 const previous=graph.quests.find(quest=>quest.id===(q.requires??q.opensAfter));
 return `先に「${previous?.name??q.requires??q.opensAfter}」を${q.requires?'報告':'受注'}する`;
}
function expeditionStops(quest,state,graph,button){
 const marks=(quest.itinerary||[]).slice(0,state?.count||0);
 if(!marks.length)return null;
 const section=document.createElement('details');
 section.className='expeditionStops';
 const caption=document.createElement('summary');
 caption.textContent='遠征の足跡（記録'+marks.length+'件）';
 section.append(caption);
 let lastNode,list,node;
 for(const [index,mark] of marks.entries()){
  if(mark.node!==lastNode){
   node=graph.nodes.find(n=>n.id===mark.node);
   const group=document.createElement('div'),place=document.createElement('strong');
   place.textContent=node?.name??mark.node;
   group.append(place);
   if(node){
    group.append(button('地図で見る','world_map_focus:'+node.id));
    const view=document.createElement('a');
    view.href='map-art.html?'+new URLSearchParams({node:node.id,placements:'live',compare:'background',tier:'4096'});
    view.textContent='風景を見比べる';view.target='_blank';view.rel='noopener';
    group.append(view);
   }
   list=document.createElement('ul');group.append(list);section.append(group);lastNode=mark.node;
  }
  const item=document.createElement('li');
  item.textContent=mark.completedLabel||mark.action||mark.objective||mark.name;
  if(node){
   const point=surveyPoint(quest,index,node.id,node);
   const links=point?[{label:'調査位置を見る',url:surveyPointUrl(point)}]:
    mark.kind==='boss'?[bossFieldPoint(mark.node,mark.boss)]:mark.kind==='kill'?remainingEnemyPoints(mark):[];
   if(mark.kind==='arrive'&&graph.nodes.some(n=>n.id===mark.from&&n.voyage?.destination===node.id)){
    links.push({label:'到着位置を見る',url:'map-art.html?'+new URLSearchParams({placements:'live',node:node.id,voyage:mark.from})});
   }
   for(const {label,url} of links){
    const link=document.createElement('a');
    link.href=url;link.textContent=label;link.target='_blank';link.rel='noopener';item.append(' ',link);
   }
  }
  list.append(item);
 }
 return section;
}
export function renderQuestJournal(f,{filter,onFilter,button,trackedId,onTrack}){
 const {story,storyGraph:graph}=f,section=document.createElement('section');section.id='questJournal';section.style.width='100%';
 const heading=document.createElement('h2');heading.textContent='依頼手帳';section.append(heading);
 const statusOf=q=>questStatus(q,story.quests[q.id],story.quests,f.progression?.level??0,f.growthEligibility);
 const counts={locked:0,unaccepted:0,active:0,ready:0,complete:0};for(const q of graph.quests)counts[statusOf(q)]++;
 const current=graph.quests.filter(q=>!q.legacyOnly);
 const reported=current.filter(q=>statusOf(q)==='complete').length;
 const progress=document.createElement('p');progress.id='questStoryProgress';
 progress.textContent='現行のストーリー依頼　報告済み '+reported+' ／ '+(graph.currentQuestTotal??current.length)+'件';
 const legacy=graph.legacyQuestTotal??(graph.quests.length-current.length);
 if(legacy)progress.textContent+='　旧セーブ専用 '+legacy+'件';
 section.append(progress);
 const summary=document.createElement('p');summary.textContent=Object.entries(labels).map(([key,label])=>`${label}${counts[key]}件`).join(' ／ ');section.append(summary);
 const label=document.createElement('label');label.textContent='表示する依頼 ';const select=document.createElement('select');select.id='questFilter';
 for(const [value,text] of Object.entries({relevant:'現在地の依頼＋受注済み',all:'すべて',...labels}))select.add(new Option(text,value));
 const regionNames={MON:'モンド',LIY:'璃月',INA:'稲妻',SUM:'スメール',FON:'フォンテーヌ',NAT:'ナタ',NOD:'ナド・クライ',SNE:'スネージナヤ'};
 const chapters=new Map(),branches=new Map(),hiddenWorlds=new Map(),growth=new Map();
 const hubRegions=new Map(graph.nodes.map(n=>[n.id,n.region]));
 const outstanding=new Map();
 for(const q of graph.quests){
  if(statusOf(q)==='complete'||(q.legacyOnly&&!story.quests[q.id]))continue;
  const region=hubRegions.get(q.hub);
  if(region)outstanding.set(region,(outstanding.get(region)||0)+1);
 }
 if(filter.startsWith('area:')&&!outstanding.has(filter.slice(5)))outstanding.set(filter.slice(5),0);
 const surveyGroup=document.createElement('optgroup');surveyGroup.label='受注地域別の未報告依頼';
 for(const [region,total] of outstanding)surveyGroup.append(new Option(region+'（'+total+'件）','area:'+region));
 if(outstanding.size)select.append(surveyGroup);
 for(const q of graph.quests){
  const chapter=q.designId?.match(/^Q-([A-Z]+)-[MS]\d{2}$/)?.[1];
  const branch=q.designId?.match(/^Q-(B\d{2})-\d{2}$/)?.[1];
  const hidden=q.designId?.match(/^Q-(H\d{2})-\d{2}$/);
  const done=story.quests[q.id]?.status==='complete';
  if(/^Q-G\d{2}$/.test(q.designId||''))growth.set(q.id,{code:'all',done});
  if(regionNames[chapter])chapters.set(q.id,{code:chapter,name:regionNames[chapter],done});
  if(hidden){
   const region=q.itinerary.map(mark=>hubRegions.get(mark.node)).findLast(Boolean);
   hiddenWorlds.set(q.id,{code:hidden[1],name:region,done});
  }
  if(branch)branches.set(q.id,{code:branch,name:hubRegions.get(q.hub)||q.hub,done});
 }
 function addRegions(rows,prefix,label,allLabel){
  const group=document.createElement('optgroup');group.label=label;
  const counts=new Map();
  let reported=0;
  for(const row of rows.values()){
   const count=counts.get(row.code)??{name:row.name,done:0,total:0};
   count.total++;
   if(row.done){count.done++;reported++}
   counts.set(row.code,count);
  }
  group.append(new Option(allLabel+'の未報告（'+(rows.size-reported)+'件）',prefix+':pending'));
  const codes=prefix==='chapter'?Object.keys(regionNames):Array.from(counts.keys()).sort();
  for(const code of codes){
   const c=counts.get(code);
   if(c)group.append(new Option(c.name+'　'+c.done+' / '+c.total+'件報告',prefix+':'+code));
  }
  select.append(group);
  return reported;
 }
 const chapterReports=addRegions(chapters,'chapter','地域章の本編・寄り道','全地域章');
 const branchReports=addRegions(branches,'branch','分岐地域の連続依頼','分岐地域');
 const hiddenReports=hiddenWorlds.size?addRegions(hiddenWorlds,'hidden','隠し世界の探索依頼','発見済みの隠し世界'):0;
 const trained=[...growth.values()].filter(q=>q.done).length;
 const lessons=document.createElement('optgroup');lessons.label='成長依頼';
 lessons.append(new Option('全成長依頼　'+trained+' / '+growth.size+'件報告','growth:all'),
  new Option('成長依頼の未報告（'+(growth.size-trained)+'件）','growth:pending'));
 select.append(lessons);
 select.value=filter;select.onchange=()=>onFilter(select.value);label.append(select);section.append(label);
 const [kind,selection]=filter.split(':');
 const selected=kind==='chapter'?chapters:kind==='branch'?branches:kind==='hidden'?hiddenWorlds:kind==='growth'?growth:null;
 if(selected){
  const progress=document.createElement('p');progress.id='chapterProgress';
  const progressLabel={chapter:'地域章の報告　'+chapterReports,branch:'分岐地域の報告　'+branchReports,hidden:'表示中の探索依頼の報告　'+hiddenReports,growth:'成長依頼の報告　'+trained};
  progress.textContent=progressLabel[kind]+' / '+selected.size+'件';
  section.append(progress);
 }
 let shown=0;
 for(const q of graph.quests){
  const st=story.quests[q.id],status=statusOf(q);
  if(selected){
   const record=selected.get(q.id);
   if(!record||(selection==='pending'?record.done:record.code!==selection))continue;
  }else if(kind==='area'){
   if(hubRegions.get(q.hub)!==selection||status==='complete'||(q.legacyOnly&&!st))continue;
  }else if(filter==='relevant'?q.hub!==story.node&&!st:filter!=='all'&&filter!==status)continue;
  shown++;const row=document.createElement((kind==='branch'||kind==='hidden')&&selection!=='pending'?'div':'p');row.dataset.quest=q.id;row.dataset.status=status;
  const hub=graph.nodes.find(n=>n.id===q.hub)?.name||q.hub;
  const payout=status==='complete'&&!q.repeatable?'':` ｜ 仮報酬 ${rewardNumber.format(q.xp)}EXP / ${rewardNumber.format(q.mora)}モラ`;
  const firstClear=q.chapterClearXp&&(st?.count??0)<q.chapterClearCount
   ?` ｜ 章ボス初回勝利 ${rewardNumber.format(q.chapterClearXp)}EXP`:'';
  const weapon=q.weaponReward?` ｜ ${status==='complete'?'受取済み':'初回報酬'}：${q.weaponReward}`:'';
  row.textContent=`${questName(q,st)} ｜ ${labels[status]}${st?` ${st.count}/${q.goal}`:''}${q.repeatable?` ／ 報告${st?.cycles||0}回`:''}${q.join&&status==='complete'?(q.giver?`（${q.giver}加入済み）`:'（加入済み）'):''} ｜ ${status==='locked'?prerequisiteText(q,graph,f.progression?.level??0):questObjective(q,graph,st,story.growth,f.storyRailTransit)} ｜ 受注・報告：${hub}${payout}${firstClear}${weapon} `;
  if(selected&&status!=='complete'){
   row.append(button('受注・報告場所を地図で見る','world_map_focus:'+q.hub));
  }
  if((kind==='branch'||kind==='hidden')&&selection!=='pending'){
   const stops=expeditionStops(q,st,graph,button);
   if(stops)row.append(stops);
  }
  if(q.fireworks&&status==='complete'){
   const design=recordedFirework(q,st);
   if(design){
    const link=document.createElement('a');
    link.href=design.url;link.target='_blank';link.rel='noopener';
    link.textContent='記録した花火を見る（'+design.label+'）';
    row.append(link);
   }
  }
  if(q.bonusLesson&&status!=='locked'){
   const exercises=q.bonusLesson.filter(lesson=>f.progression?.level>=lesson.level);
   if(exercises.length){
    const note=document.createElement('small');
    note.style.display='block';
    note.textContent='任意の実戦練習　'+exercises.map(lesson=>
     `${story.growth?.[lesson.id]?'✓ ':''}Lv${lesson.level} ${lesson.text}`).join(' ／ ');
    row.append(note);
   }
  }
  if(status==='unaccepted'||(status==='complete'&&q.repeatable)){const b=button('受注','story_accept:'+q.id);b.disabled=q.hub!==story.node;b.title=b.disabled?`${hub}で受注してください`:'';row.append(b)}
  if(status==='ready'){const b=button('報告','story_report:'+q.id);b.disabled=q.hub!==story.node;b.title=b.disabled?`${hub}へ戻って報告してください`:'';row.append(b)}
  if(q.practice&&st&&q.hub===story.node&&!f.growthTrial){
   const practice=button('練習場に入る','growth_practice_start:'+q.id);
   practice.addEventListener('click',()=>document.getElementById('game')?.scrollIntoView({block:'center'}));
   row.append(practice);
  }
  if(status==='complete'&&q.join&&(q.recovery||q.sights||q.starter||q.legacyOnly)){
   const b=button(f.companion?.id===q.join?`${q.giver}が同行中`:`${q.giver}を同行に選ぶ`,'story_select_joined:'+q.id);
   b.disabled=!graph.nodes.find(n=>n.id===story.node)?.hub||f.companion?.id===q.join;
   row.append(b);
  }
  const letter=postQuestLetter(q,st);
  if(letter){
   const link=document.createElement('a');
   link.href=surveyPointUrl(letter);link.target='_blank';link.rel='noopener';
   link.textContent='任意の寄り道：'+letter.action;
   row.append(link);
  }
  if(onTrack){const b=document.createElement('button');b.textContent=trackedId===q.id?'追跡を解除':'この依頼を追跡';b.setAttribute('aria-pressed',String(trackedId===q.id));b.onclick=()=>onTrack(trackedId===q.id?null:q.id);row.append(b)}
  const huntDialogue=q.kinichHunt?.reports?.[st?.huntNotes?.outcome];
  const dialogue=status==='unaccepted'?q.briefing:status==='complete'&&(!q.sights||st.sights)?
   (huntDialogue?`${huntDialogue} ${q.closing}`:q.closing):null;
  if(dialogue){
   const line=document.createElement('small');
   line.style.display='block';
   line.textContent=dialogue;
   row.append(line);
  }
  if(q.note){const note=document.createElement('small');note.style.display='block';note.textContent=q.note;row.append(note)}
  section.append(row);
  if(q.teaCase&&st){
   section.append(teaNotebook(q,st,id=>graph.nodes.find(n=>n.id===id)?.name??id,button));
  }
 }
 if(!shown){const empty=document.createElement('p');empty.textContent='この条件に当てはまる依頼はありません。';section.append(empty)}
 return section;
}
