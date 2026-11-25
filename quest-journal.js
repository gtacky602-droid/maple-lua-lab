import {questRoute,questTargetNode} from './quest-route.js';
import {teaNotebook} from './tea-notebook.js';
import {surveyPoint,surveyPointUrl,worksitePoint} from './survey-point.js';
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
export function questObjective(q,graph,state,growth={}){
 if(q.lesson){
  if(state?.status==='complete')return '成長依頼を報告済み';
  if(state?.count===q.goal)return '拠点で報告する';
  return q.lesson.map(step=>`${growth[step.id]?'✓ ':''}${step.text}`).join(' ／ ');
 }
 if(state?.status==='complete'&&q.completedObjective)return q.completedObjective;
 if(q.itinerary)return q.itinerary[state?.count??0]?.objective??'拠点で報告する';
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
  if(state?.status==='complete')return '荷車が帰り、山海の大市が開いた';
  if(state?.count===q.goal)return '市場への帰り道から港へ戻り、北斗に報告する';
  if(state?.count===2)return '分岐に止まった荷車をGキーで港へ送り出す';
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
 if(q.contest){
  const replay=status==='complete';
  const rematch=replay&&f.storyContest?.replay;
  const phase=replay?(rematch?f.storyContest.stage:1):st?.count;
  if((status==='active'||replay)&&phase>=1&&phase<=3){
   const params=new URLSearchParams({node:q.target,placements:'live',compare:'background',tier:'4096',contest:phase});
   if(replay)params.set('replay','1');
   const objective=rematch?questObjective(q,f.storyGraph,{status:'active',count:phase}):
    replay?'海辺の洞穴で親分に再戦を申し込めます。':questObjective(q,f.storyGraph,st);
   const route=replay?'':questRoute(f,q,status).text;
   return {node:q.target,pointUrl:'map-art.html?'+params,pointLabel:phase===2?'水面の三つの影を見比べる':'大灯籠の姿を見る',
    text:`${q.name} ｜ ${rematch?'再戦中':labels[status]} ｜ ${objective}`+(route?' ｜ '+route:'')};
  }
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
  const route=questRoute(f,q,status).text;
  return {node:q.target,pointUrl:'map-art.html?'+params,pointLabel:'競技広場の配置を見る',
   text:q.name+' ｜ '+objective+(route?' ｜ '+route:'')};
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
 const next=status==='locked'?prerequisiteText(q,f.storyGraph,f.progression?.level??0):status==='unaccepted'?`${hub}で受注してください`:status==='ready'?`${hub}へ戻って報告してください`:status==='complete'?(q.repeatable?`${hub}で再受注できます`:'報酬受取済み'):questObjective(q,f.storyGraph,st,f.story.growth);
 const route=status==='locked'?{text:''}:questRoute(f,q,status,selectedWorksite?.node);
 const room=status==='active'&&q.forest?.rooms[st.count];
 if(room&&route.node===room.node){
  const phase=st.forest.looped?'search':'entry';
  const params=new URLSearchParams({node:room.node,placements:'live',forest:phase,compare:'background',tier:'4096'});
  return {node:room.node,pointUrl:'map-art.html?'+params,pointLabel:'広場の様子を見る',
   text:`${q.name} ｜ ${next}`+(route.text?' ｜ '+route.text:'')};
 }
 const patrolStep=status==='active'&&q.itinerary?.[st.count];
 if(patrolStep?.cover&&route.node===patrolStep.node){
  const point=surveyPoint(q,st.count,route.node);
  return {node:route.node,pointUrl:surveyPointUrl(point),pointLabel:patrolStep.cover.name+'の位置を見る',
   text:q.name+' ｜ '+next+(route.text?' ｜ '+route.text:'')};
 }
 const local=f.storyHunts?.[id];
 const site=selectedWorksite??f.storyWorksites?.[id]?.find(p=>p.point===local?.point || (!local && p.node===route.node));
 const point=status==='active' && (worksitePoint(q,site?.point,route.node)??surveyPoint(q,st.count,route.node));
 return {node:route.node,pointUrl:point?surveyPointUrl(point):undefined,text:`${questName(q,st)} ｜ ${labels[status]}${st?` ${st.count}/${q.goal}`:''} ｜ ${next}`+(route.text?' ｜ '+route.text:'')};
}
export function trackedQuestText(f,id){return trackedQuest(f,id).text}
function prerequisiteText(q,graph,level){
 if(q.level!==undefined&&level<q.level)return `Lv${q.level}になる`;
 if(q.unlockHint)return q.unlockHint;
 const previous=graph.quests.find(quest=>quest.id===(q.requires??q.opensAfter));
 return `先に「${previous?.name??q.requires??q.opensAfter}」を${q.requires?'報告':'受注'}する`;
}
export function renderQuestJournal(f,{filter,onFilter,button,trackedId,onTrack}){
 const {story,storyGraph:graph}=f,section=document.createElement('section');section.id='questJournal';section.style.width='100%';
 const heading=document.createElement('h2');heading.textContent='依頼手帳';section.append(heading);
 const statusOf=q=>questStatus(q,story.quests[q.id],story.quests,f.progression?.level??0,f.growthEligibility);
 const counts={locked:0,unaccepted:0,active:0,ready:0,complete:0};for(const q of graph.quests)counts[statusOf(q)]++;
 const summary=document.createElement('p');summary.textContent=Object.entries(labels).map(([key,label])=>`${label}${counts[key]}件`).join(' ／ ');section.append(summary);
 const label=document.createElement('label');label.textContent='表示する依頼 ';const select=document.createElement('select');select.id='questFilter';
 for(const [value,text] of Object.entries({relevant:'現在地の依頼＋受注済み',all:'すべて',...labels})){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o)}select.value=filter;select.onchange=()=>onFilter(select.value);label.append(select);section.append(label);
 let shown=0;
 for(const q of graph.quests){
  const st=story.quests[q.id],status=statusOf(q);
  if(filter==='relevant'?q.hub!==story.node&&!st:filter!=='all'&&filter!==status)continue;
  shown++;const row=document.createElement('p');row.dataset.quest=q.id;row.dataset.status=status;
  const hub=graph.nodes.find(n=>n.id===q.hub)?.name||q.hub;
  const payout=status==='complete'&&!q.repeatable?'':` ｜ 仮報酬 ${rewardNumber.format(q.xp)}EXP / ${rewardNumber.format(q.mora)}モラ`;
  const firstClear=q.chapterClearXp&&(st?.count??0)<q.chapterClearCount
   ?` ｜ 章ボス初回勝利 ${rewardNumber.format(q.chapterClearXp)}EXP`:'';
  const weapon=q.weaponReward?` ｜ ${status==='complete'?'受取済み':'初回報酬'}：${q.weaponReward}`:'';
  row.textContent=`${questName(q,st)} ｜ ${labels[status]}${st?` ${st.count}/${q.goal}`:''}${q.repeatable?` ／ 報告${st?.cycles||0}回`:''}${q.join&&status==='complete'?(q.giver?`（${q.giver}加入済み）`:'（加入済み）'):''} ｜ ${status==='locked'?prerequisiteText(q,graph,f.progression?.level??0):questObjective(q,graph,st,story.growth)} ｜ 受注・報告：${hub}${payout}${firstClear}${weapon} `;
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
