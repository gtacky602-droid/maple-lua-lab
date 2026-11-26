import {measureSpriteFidelity,measureSpriteProfiles} from './sprite-fidelity.js';
import {wildlifeSites} from './underwater-wildlife.js';
import {drawSurveyPoint,surveyPoint,surveyPointUrl,worksitePoint,worksitePoints} from './survey-point.js';
import {setupPuzzlePreview} from './quest-puzzle-preview.js';
import {forestPreview} from './forest-preview.js';
import {lanternPreview} from './lantern-preview.js';
import {setupSceneryDetail} from './scenery-detail.js';
import {setupSharedLegendArt} from './legend-shared-art.js';
import {setupSceneryDownload} from './scenery-export.js';
import {arrivalCamera,setupGatePreview} from './map-gate-preview.js';
import {backgroundMeasurements} from './scenery-measurements.js';
import {placementSignature} from './placement-signature.js';
import {setupPlacementPosition} from './placement-position.js';
import {setupMapNodePicker} from './map-node-picker.js';
import {loadImageSet,drawCombatRect,omitCombatDraw,combatOpacity} from './sprite-images.js';
import {spriteBounds,paintSprite,rectangleCount,forEachRectangle,openingRects} from './sprite-layers.js';
import {setupPlacementPicker} from './placement-picker.js';
import {scenery,sceneryDefinitions,sceneryStatus,loadScenery} from './scenery.js';
import {comparePlacements,liveNodeDraft,validatePlacementDraft,MAX_DRAFT_BYTES,MAX_NODE_PLACEMENTS,MAX_TOTAL_PLACEMENTS} from './placement-drafts.js';
const DRAFT_KEY='maple-lua-lab.map-draft.v1';
const $=id=>document.getElementById(id),assets={},histories={},redos={},baselines={};
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(path);return r.json()}

// The live Lua renderer submits rectangles in stage coordinates. Keep its operation order
// so fractional edges land on the same pixels as the combat frame.

function paintMechanismMark(ctx,mark,x,y,flip){
 const px=x+(flip?-(mark.x+(mark.w??0)):mark.x),py=y+mark.y;
 if(mark.kind==='rect'){
  ctx.fillStyle=mark.color;ctx.fillRect(px,py,mark.w,mark.h);
 }else{
  ctx.save();ctx.font=`bold ${mark.size}px 'Yu Gothic UI',sans-serif`;ctx.textAlign='center';
  ctx.lineWidth=3;ctx.strokeStyle='#2a484868';ctx.strokeText(mark.text,px,py);
  ctx.fillStyle=mark.color;ctx.fillText(mark.text,px,py);ctx.restore();
 }
}
// Socket art rotates around the grip; keep the Lua run coordinates before rotating each rectangle.
function socketBounds(art,bounds,flip){
 const theta=art.rotation??0,cos=Math.cos(theta),sin=Math.sin(theta);
 const centerX=(bounds.x+bounds.width/2)*(flip?-1:1),centerY=(.5-art.anchorY)*bounds.height;
 const width=Math.abs(cos)*bounds.width+Math.abs(sin)*bounds.height;
 const height=Math.abs(sin)*bounds.width+Math.abs(cos)*bounds.height;
 return {x:cos*centerX-sin*centerY-width/2,y:sin*centerX+cos*centerY-height/2,width,height};
}
function paintSocketLayer(ctx,art,bounds,profile,x,y,flip,cost){
 const {width:w,height:h}=bounds,top=-h*art.anchorY,theta=art.rotation??0;
 const box=socketBounds(art,bounds,flip);
 const visible=x+box.x<ctx.canvas.width+1 && x+box.x+box.width>-1 &&
  y+box.y<ctx.canvas.height+1 && y+box.y+box.height>-1;
 if(profile)cost.total+=rectangleCount(art.profiles[profile]);
 if(!visible)return;
 if(!profile){
  ctx.save();ctx.translate(x,y);ctx.rotate(theta);if(flip)ctx.scale(-1,1);
  ctx.drawImage(art.image,...art.box,bounds.x,top,w,h);ctx.restore();
  return;
 }
 const grid=art.profiles[profile],cos=Math.cos(theta),sin=Math.sin(theta);
 const sx=w/grid.width,sy=h/grid.height;
 forEachRectangle(grid,(col,row,rw,rh,color)=>{
  let left=bounds.x+col*sx;
  if(flip)left=-left-rw*sx;
  const ry=top+row*sy;
  drawCombatRect(ctx,{x:x+cos*left-sin*ry,y:y+sin*left+cos*ry,w:rw*sx+.05,h:rh*sy+.05,color,rotation:theta});
 });
 cost.visible+=rectangleCount(grid);cost.standard+=rectangleCount(art.profiles.legacy);
}
function paintPlacementLayer(ctx,art,bounds,profile,x,y,flip,cost){
 if(art.anchorY!=null){
  paintSocketLayer(ctx,art,bounds,profile,x,y,flip,cost);
  return;
 }
 const left=x+(flip?-bounds.x-bounds.width:bounds.x),top=y+bounds.y;
 // paintSprite slightly overlaps adjacent rectangle edges. Keep boundary layers until fully clear.
 const visible=left<ctx.canvas.width+1&&left+bounds.width>-1&&top<ctx.canvas.height+1&&top+bounds.height>-1;
 if(profile){
  const runs=rectangleCount(art.profiles[profile]);
  cost.total+=runs;
  if(visible){
   if(art.openingPose){
    const emitted=openingRects(ctx,art.profiles[profile],bounds,x,y,flip,art.clipToViewport,true);
    cost.visible+=emitted;
    let standard=rectangleCount(art.profiles.legacy);
    if(art.clipToViewport)standard=profile==='legacy'?emitted:openingRects(ctx,art.profiles.legacy,bounds,x,y,flip,true,false);
    cost.standard+=standard;
    return;
   }
   cost.visible+=runs;
   cost.standard+=rectangleCount(art.profiles.legacy);
  }
 }
 if(!visible)return;
 ctx.save();
 ctx.globalAlpha*=art.opacity??1;
 ctx.translate(x,y);
 if(flip)ctx.scale(-1,1);
 paintSprite(ctx,art,art.image,bounds,profile);
 ctx.restore();
}

function viewportSummary(cost,profile,subject='キャラクター'){
 if(!cost.standard)return 'この画角に表示する素材はありません';
 const current='この画角の'+subject+'矩形 '+cost.visible.toLocaleString('ja-JP')+'個';
 if(profile==='legacy')return current+'（標準）';
 const change=100*(cost.visible-cost.standard)/cost.standard;
 const difference=change===0?'変化なし':Math.abs(change).toFixed(1)+(change<0?'%減':'%増');
 return current+'（標準 '+cost.standard.toLocaleString('ja-JP')+'個から'+difference+'）';
}

try{
 const [graph,initial,slimePreviews,weeklyData,fieldData]=await Promise.all([json('content/story-graph.json'),json('content/enemy-placement-drafts.json'),json('assets/slime-preview-packed.json'),json('content/weekly-boss-spawns.json'),json('content/field-boss-spawns.json')]);
 const weeklyArenaNodes=new Set(weeklyData.weeklyBosses.flatMap(b=>[b.node,b.innerNode].filter(Boolean)));
 const arenaPreviews=new Map([...weeklyData.weeklyBosses,...fieldData.fieldBosses].filter(b=>b.mapIdleArt).map(b=>[b.node,b]));
 const layouts=await json('content/enemy-art-layout.json'),wildlife=wildlifeSites(layouts);
 let drafts=structuredClone(initial),serial=0,importTicket=0,selected=null;const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 const query=new URLSearchParams(location.search);
 const openingNode=nodes.get(query.get('node'))??nodes.get('mond-road');
 const liveView=query.get('placements')==='live';
 const departure=liveView&&nodes.get(query.get('from'))?.exits.find(edge=>
  edge.to===openingNode.id&&String(edge.x)===query.get('departureX'));
 // On a return trip the quest bridge under the recorded landing is already built.
 let landingQuest,landingDeck;
 if(Number.isFinite(departure?.arrivalX)&&Number.isFinite(departure.arrivalY)){
  for(const quest of graph.quests){
   const step=quest.itinerary?.find(({node,bridge})=>node===openingNode.id&&bridge&&
    bridge.y===departure.arrivalY&&departure.arrivalX>=bridge.x&&departure.arrivalX<=bridge.x+bridge.w);
   if(step){landingQuest=quest;landingDeck=step.bridge;break}
  }
 }
 const absent=new Set(query.getAll('absent'));
 const liveSource=liveView?await json('content/enemy-spawns.json'):null;
 let liveItems=[],liveError='';
 const subject=$('liveSubject');
 $('draftControls').hidden=$('draftInspection').hidden=liveView;
 const viewLink=$('placementViewLink');
 viewLink.textContent=liveView?'配置案を編集する':'本編の敵配置で見比べる';
 const requestedTier=query.get('tier');
 if(Array.from($('backgroundTier').options).some(option=>option.value===requestedTier)){
  $('backgroundTier').value=requestedTier;
 }
 if(query.get('compare')==='background')$('matchSpritePng').checked=true;
 if(query.get('background')==='original')$('decodedBackground').checked=false;
 if(Array.from($('profile').options).some(o=>o.value===query.get('profile')))$('profile').value=query.get('profile');
 const wildlifeNote=document.createElement('p');
 wildlifeNote.id='wildlifeNote';wildlifeNote.hidden=true;
 $('placementViewLink').after(wildlifeNote);
 const openingBackground=loadScenery(sceneFrame(openingNode,0));
 const pendingBackgrounds=new Set();
 for(const [id,art] of Object.entries(slimePreviews))assets[id]={...art,h:40};
 for(const [id,{height,hover,file,name}] of Object.entries(layouts)){
  const data=await json('assets/field-packed/'+(file??`${id}-idle-sprites.json`)),art={...data,h:height,hover};
  if(assets[id]){
   Object.assign(assets[id],{h:height,hover});
   assets[id+'-reference']=art;
  }else assets[id]=art;
  if(name&&![...$('species').options].some(option=>option.value===id)){
   const option=document.createElement('option');option.value=id;option.textContent=name;$('species').append(option);
  }
 }
 const galleryFiles=await json('assets/placement-pose-index.json');
 const idleCandidates=new Map();
 for(const [kind,label,file] of [['boss','ボス待機候補（比較用の大きさ）','boss-art-gallery.json'],['character','主人公・同行者・NPC','character-art-gallery.json']]){
  const gallery=await json('content/'+file);
  const group=document.createElement('optgroup');group.label=label;
  const loaded=gallery.items.map(item=>{
   const data=galleryFiles[item.file],left=galleryFiles[item.leftFile],rear=item.rear&&galleryFiles[item.rear.file];
   const size={ordinaryVariant:item.ordinaryVariant,h:item.height,hover:item.mapHover??0,rear:rear&&{...rear,height:item.rear.height,bottom:item.rear.bottom}};
   return {item,art:{...data,...size,left:left&&{...left,...size}}};
  });
  for(const {item,art} of loaded){const id=kind+'-'+item.id;assets[id]=art;if(kind==='boss' && item.candidateFor){for(const target of [item.candidateFor].flat())idleCandidates.set(target,id)}const option=document.createElement('option');option.value=id;option.textContent=item.name;group.append(option)}
  $('species').append(group);
 }
 for(const boss of weeklyData.weeklyBosses){
  const pose=boss.openingPose;
  if(pose){
   const data=galleryFiles['weekly/'+pose.file];
   assets[boss.mapIdleArt]={...data,h:boss.artHeight,hover:pose.hover,openingPose:true,heldArt:pose.heldArt,clipToViewport:pose.clipToViewport};
   $('species').append(new Option(boss.name+'（開戦時）',boss.mapIdleArt));
  }
  const shadow=boss.rift?.shadowArt;
  if(!shadow)continue;
  arenaPreviews.set(boss.innerNode,boss);
  assets[shadow.species]={...assets[boss.mapIdleArt],h:shadow.height,hover:0,opacity:shadow.opacity};
  $('species').append(new Option(shadow.name,shadow.species));
 }
 const [mechanismScenes,legendScenes,fieldScenes,stygianScenes,questPreviews,worksiteArt]=await Promise.all([json('content/weekly-opening-parts.json'),json('content/group-legend-openings.json'),json('content/field-boss-openings.json'),json('content/stygian-openings.json'),json('content/toyac-quest-previews.json'),json('content/worksite-props.json')]);
 const festival=worksiteArt.festival;
 questPreviews[festival.node]={stages:festival.stages.map(stage=>({...stage,visible:[],focusX:480}))};
 const courseArt=new Map(),teaArt=new Map();
 const forest=forestPreview($('forestPreview'),worksiteArt.forest,render);
 const contest=lanternPreview($('contestPreview'),worksiteArt.contest,render);
 questPreviews[worksiteArt.contest.node]={stages:worksiteArt.contest.stages.map(stage=>({...stage,visible:[]}))};
 for(const [node,route] of Object.entries(worksiteArt.haul.routes)){
  questPreviews[node]={stages:route.stops.map(stop=>({label:stop.label,focusX:stop.x,cart:stop,visible:[]})),
   fixed:route.fixed,load:[...route.deck,...worksiteArt.haul.cart]};
 }
 const trialScenes={...fieldScenes,...stygianScenes};
 const openings={...legendScenes,...trialScenes};
 const stepsByNode=new Map();
 let selectedSurveyPoint=null,visibleLandmarks=[];
 const patrolPanel=document.createElement('div');
 patrolPanel.hidden=true;
 patrolPanel.innerHTML='<label><input type="checkbox"> 見張りの巡回と視線を表示</label> <label>巡回の時刻 <input type="range" min="0" max="15" value="0"></label> <output></output>';
 $('surveyPointNote').after(patrolPanel);
 const [showPatrol,patrolTime]=patrolPanel.querySelectorAll('input');
 showPatrol.checked=query.get('patrol')==='1';
 showPatrol.onchange=patrolTime.oninput=()=>render();
 const puzzlePreview=setupPuzzlePreview($('surveyPointNote'),point=>{
  selectedSurveyPoint=point;
  $('camera').value=point.x-480;
 },()=>render());
 function focusSurveyPoint(point){
  selectedSurveyPoint=point;
  puzzlePreview.reset(point);
  patrolPanel.hidden=!point?.guard;
  patrolTime.value=0;
  visibleLandmarks=[];
  if(point?.worksite){
   const quest=graph.quests.find(q=>q.id===point.quest);
   const sites=quest?.sights?worksitePoints(quest).filter(site=>site.node===point.node):
    [{id:point.worksite,x:point.x,y:point.y}];
   for(const site of sites){
    for(const [dx,dy,w,h,color] of worksiteArt.worksites[point.quest]?.[site.id]??[]){
     visibleLandmarks.push({x:site.x+dx,y:site.y+dy,w,h,color});
    }
   }
  }
  const marker=$('surveyPointNote');
  marker.hidden=!point;
  if(point){
   $('camera').value=point.x-480;
   marker.dataset.quest=point.quest;marker.dataset.step=point.step??'';marker.dataset.worksite=point.worksite??'';

  }
 }
 for(const quest of graph.quests){
  for(const site of worksitePoints(quest)){
   if(!stepsByNode.has(site.node))stepsByNode.set(site.node,new Map());
   const quests=stepsByNode.get(site.node);
   if(!quests.has(quest))quests.set(quest,[]);
   quests.get(quest).push({objective:site.name,point:worksitePoint(quest,site.id,site.node)});
  }
  for(const route of [{steps:quest.itinerary??[]},...quest.paths??[]]){
   for(const [index,step] of route.steps.entries()){
    for(const nodeId of new Set([step.node,...(step.alternatives??[]).map(p=>p.node)])){
     if(!nodeId)continue;
     if(!stepsByNode.has(nodeId))stepsByNode.set(nodeId,new Map());
     const quests=stepsByNode.get(nodeId);
     if(!quests.has(quest))quests.set(quest,[]);
     const objective=route.label?route.label+'：'+step.objective:step.objective;
     const choices=['choice','guideChoice'].includes(step.kind)?step.choices.map((option,i)=>
      surveyPoint(quest,index,nodeId,nodes.get(nodeId),route.id,i+1)):null;
     quests.get(quest).push({number:index+1,objective,point:surveyPoint(quest,index,nodeId,nodes.get(nodeId),route.id),choices});
    }
   }
  }
 }
 const questGates=new Map(),questsById=new Map(graph.quests.map(q=>[q.id,q]));
 for(const from of graph.nodes){
  for(const gate of from.exits){
   const quest=questsById.get(gate.requires?.quest);
   if(!quest)continue;
   if(!questGates.has(gate.to))questGates.set(gate.to,[]);
   questGates.get(gate.to).push({from,quest,rule:gate.requires});
  }
 }
 const questNotes=new Map();
 for(const boss of fieldData.fieldBosses){
  const window=boss.storyWindow,scene=fieldScenes[boss.node];
  if(!window || !scene?.quest)continue;
  const quest=graph.quests.find(q=>q.id===window.quest);
  const step=quest.itinerary[window.first];
  const replay=window.repeatAfterReport?'報告後も再戦できます。':'この依頼中に挑戦できます。';
  questNotes.set(boss.node,'依頼「'+quest.name+'」の目標 '+(window.first+1)+'「'+step.objective+'」。'+replay);
 }
 for(const [node,scene] of Object.entries(openings)){
  arenaPreviews.set(node,{node,openingParts:scene.parts,openingPose:true});
 }
 for(const [node,scene] of Object.entries(mechanismScenes)){
  arenaPreviews.set(node,{node,openingParts:scene.parts,openingPose:true});
  for(const part of scene.parts){
   const data=part.file?galleryFiles['weekly/'+part.file]:{box:part.box};
   assets[part.species]={...data,h:part.h,hover:0,anchorX:part.anchorX??.5,openingPose:true,
    marks:part.marks,displayName:part.name};
   $('species').append(new Option(part.name,part.species));
  }
 }
 // Poses unique to a field encounter are fetched only when someone places or views them.
 const fieldPoseLoads=new Map();
 const patrolArt=new Map(),surveyPropArt=new Map();
 for(const scene of Object.values(trialScenes)){
  for(const part of scene.parts){
   if(!part.file || assets[part.species])continue;
   const cached=galleryFiles[part.file];
   assets[part.species]={...(cached??{poseFile:part.file}),box:part.box,h:part.h,hover:part.hover,displayName:part.name};
   $('species').append(new Option(part.name,part.species));
  }
 }
 setupPlacementPicker($('species'));
 const imageArt=Object.values(assets).flatMap(data=>[data,data.left,data.rear].filter(Boolean));
 const images=await loadImageSet(imageArt.map(data=>data.source).filter(Boolean),{onProgress:(done,total)=>{$('status').textContent=`画像を読み込み中 ${done} / ${total}`}});
 for(const data of imageArt)data.image=images[data.source];
 function loadFieldPose(art){
  if(!fieldPoseLoads.has(art.poseFile)){
   const promise=json('assets/'+art.poseFile).then(async data=>{
    if(data.geometrySpecies){
     const base=assets[data.geometrySpecies+'-reference']??assets[data.geometrySpecies];
     data.profiles=Object.fromEntries(Object.entries(data.palettes).map(([key,palette])=>
      [key,{...base.profiles[key],geometry:base.profiles[key],palette}]));
    }
    const image=images[data.source]??(await loadImageSet([data.source]))[data.source];
    images[data.source]=image;
    return {...data,image};
   }).catch(error=>{fieldPoseLoads.delete(art.poseFile);throw error});
   fieldPoseLoads.set(art.poseFile,promise);
  }
  return fieldPoseLoads.get(art.poseFile).then(data=>{
   // A placed copy may override the shared pose's anchor, crop or height.
   Object.assign(art,{...data,...art,image:data.image});
  });
 }
 const sharedLegendArt=liveView?setupSharedLegendArt(layouts,assets):null;
 const legendNames=new Map(fieldData.fieldBosses.filter(b=>b.id.startsWith('legend-')).map(b=>[b.node,b.name]));
 drafts=validatePlacementDraft(drafts,graph,Object.keys(assets));
 let storedRaw=null;
 try{
  storedRaw=localStorage.getItem(DRAFT_KEY);
  if(storedRaw!==null){
   if(new Blob([storedRaw]).size>MAX_DRAFT_BYTES)throw Error('保存データが512KBを超えています。');
   drafts=validatePlacementDraft(JSON.parse(storedRaw),graph,Object.keys(assets));
   $('browserStatus').textContent='ブラウザ保存から全地点の配置案を復元しました。取り消し履歴は復元されません。';
  }
 }catch(e){$('browserStatus').textContent='ブラウザ保存を復元できませんでした。初期案を表示します。保存データは変更していません。詳細：'+e.message}
 let savedSignature=placementSignature(drafts),cleanMessage=$('browserStatus').textContent;
 $('saveBrowser').onclick=()=>{
  try{
   const current=localStorage.getItem(DRAFT_KEY);
   if(current!==storedRaw)throw Error('別の画面で保存が更新されました。この案をJSON保存してから再読み込みしてください。');
   const text=JSON.stringify(validatePlacementDraft(drafts,graph,Object.keys(assets)));
   if(new Blob([text]).size>MAX_DRAFT_BYTES)throw Error('保存データが512KBを超えています。');
   localStorage.setItem(DRAFT_KEY,text);storedRaw=text;savedSignature=placementSignature(drafts);cleanMessage='この画面で最後に保存した配置案と同じです。';render();
   $('browserStatus').textContent='全地点の配置案をブラウザに保存しました。次回はこの案から再開します。';
  }catch(e){$('browserStatus').textContent='ブラウザ保存に失敗しました。編集中の案は残っています。JSON保存も利用できます。詳細：'+e.message}
 };
 let lastRenderedDraft=placementSignature(drafts);
 await openingBackground;
 for(const n of graph.nodes){const option=document.createElement('option');option.value=n.id;option.textContent=`${n.region}｜${n.name}`;$('node').append(option)}
 $('node').value=openingNode.id;
 const positionEditor=setupPlacementPosition({getNode:node,getSelected:()=>placements().find(e=>e.id===selected),commit:(e,x,y)=>{remember(node().id);e.x=x;e.y=y;render()},report:text=>{$('fileStatus').textContent=text}});
 const nodePicker=setupMapNodePicker({graph,liveView,fieldBosses:fieldData.fieldBosses,weeklyBosses:weeklyData.weeklyBosses,stygianBosses:Object.entries(stygianScenes).map(([node,s])=>({node,name:s.name})),select:$('node'),getDraft:()=>drafts,onChoose:select});
 function node(){return nodes.get($('node').value)}
 function afterReport(n){return $('sceneryPhase').value==='after'?n.locationAfterReport:null}
 function darkRoom(n){return Boolean(n.localLight && $('lampMode').value==='dark')}
 function sceneMeasures(n){return backgroundMeasurements[darkRoom(n)?n.id+'#dark':sceneryDefinitions[afterReport(n)?.scenery]?.measurementNode??n.id]}
 $('sceneryPhase').onchange=()=>{colorResult.textContent='';render()};
 function sceneFrame(n,camera,gate){
  const dark=darkRoom(n);
  const platforms=[...n.platforms];
  if(dark)platforms.push(n.localLight.bridge);
  if(landingDeck&&n===openingNode)platforms.push(landingDeck);
  const rule=gate?.requires;
  const steps=rule?.count&&questsById.get(rule.quest)?.itinerary;
  for(const step of steps?steps.slice(0,rule.count):[]){
   if(step.node!==n.id)continue;
   for(const deck of [...(step.bridges??[]),...(step.bridge?[step.bridge]:[])]){
    const previous=platforms.findIndex(p=>p===deck||(deck.track&&p.track===deck.track));
    if(previous>=0)platforms[previous]=deck;
    else platforms.push(deck);
   }
  }
  return {camera,platforms,storySwim:Boolean(n.swim),storyLocalLight:n.localLight?{mode:dark?'dark':'bright'}:undefined,storyScenery:afterReport(n)?.scenery,campaign:{zone:n.hub?'town':`story:${n.id}`},story:{active:true,node:n.id},storyGraph:graph};
 }
 function placements(){return drafts.nodes[node().id]??[]}
 function previewCandidate(e){return liveView && $('candidateIdle').checked && idleCandidates.has(e.id)}
 $('candidateIdle').onchange=render;
 function openingPart(e){return openings[node().id]?.parts.find(p=>p.id===e.id&&p.species===e.species)}
 function placementSource(e,part){
  const original=assets[e.species];
  if(part)return previewCandidate(e)?assets[idleCandidates.get(e.id)]:original;
  return e.flip&&original.left?original.left:original;
 }
 function placementArt(e){
  const part=openingPart(e),art=placementSource(e,part);
  const boss=arenaPreviews.get(node().id);
  if(part && previewCandidate(e))return {...art,h:part.h,hover:part.hover,openingPose:true,mirrorSource:true};
  if(part)return {...art,h:part.h,hover:part.hover,anchorX:part.anchorX,marks:part.marks,weaponMarks:part.weaponMarks,behind:part.behind,rotation:part.rotation,anchorY:part.anchorY,openingPose:true,mirrorSource:true,rear:null};
  if(boss?.artHeight && e.id===boss.id && e.species===boss.mapIdleArt){
   if(boss.controller==='branchLegend' && boss.openingPose){
    const h=boss.artScale?art.box[3]*boss.artScale:Math.round(boss.artHeight*(boss.poseHeights?.idle??1));
    return {...art,h,hover:0,openingPose:true};
   }
   return {...art,h:boss.artHeight};
  }
  if(boss?.partner?.mapIdleArt===e.species && e.id==='boss-'+boss.partner.entity)return {...art,h:boss.partner.artHeight??boss.artHeight};
  return art;
 }
 function loadComparisonImage(frame,status,previewFile){
  if(status.state!=='loading'||pendingBackgrounds.has(status.file))return;
  pendingBackgrounds.add(status.file);
  void loadScenery(frame,previewFile).then(()=>{
   pendingBackgrounds.delete(status.file);
   if(window.mapArt?.backgroundFile===status.file||window.mapArt?.requestedDecodedBackground===status.file)render();
  });
 }
 $('decodedBackground').onchange=render;
 const colorResult=$('colorResult');
 if(location.hash==='#sceneryBudget')$('sceneryBudget').querySelector('details').open=true;
 function fitBackground(){
  const error=sceneMeasures(node())?.error;
  if(!error || !$('decodedBackground').checked)return;
  const limit=$('colorLimit').valueAsNumber;
  const tiers=Array.from($('backgroundTier').options,option=>Number(option.value));
  const matching=tiers.find(tier=>error[tier]<=limit);
  const chosen=matching??tiers.reduce((best,tier)=>error[tier]<error[best]?tier:best);
  $('backgroundTier').value=String(chosen);
  render();
  const explanation=matching?'上限内で最少':'上限内の段階がないため、色差が最小';
  colorResult.textContent=chosen.toLocaleString('ja-JP')+'矩形（'+explanation+'、平均色差 '+error[chosen].toFixed(3)+'）';
 }
 $('fitBackground').onsubmit=event=>{event.preventDefault();fitBackground()};
 $('colorLimit').oninput=()=>{colorResult.textContent=''};
 $('backgroundTier').onchange=()=>{colorResult.textContent='';render()};
 $('matchSpritePng').onchange=render;
 const gatePreview=setupGatePreview($('gatePreview'),$('camera'),liveView,query,render,()=>{$('lampMode').value='dark'});
 const updateDetail=setupSceneryDetail(liveView,query);
 const updateDownload=setupSceneryDownload($('sceneryDownload'),$('sceneryExportStatus'));
 let fidelityKey,profileTableKey,renderRevision=0;
 function render(){
  const revision=++renderRevision;
  const renderedDraft=placementSignature(drafts),dirty=renderedDraft!==savedSignature;if(renderedDraft!==lastRenderedDraft){lastRenderedDraft=renderedDraft;$('browserStatus').textContent=dirty?'未保存の編集があります。再読み込み前にブラウザ保存またはJSON保存してください。':cleanMessage}
  const n=node(),camera=Number($('camera').value),profile=$('profile').value,items=liveView?liveItems:placements(),frame=sceneFrame(n,camera,gatePreview.selectedGate());
  if(n.localLight)$('lampNote').textContent=darkRoom(n)?'消灯中。影の足場を渡ると上段の門へ進めます。':'点灯中。操作盤のそばでGを押すと、影の足場と門が現れます。';
  const layers=new Set();
  for(const item of items){
   const part=openingPart(item),body=placementSource(item,part);
   layers.add(body);
   if(body.rear&&(!part||previewCandidate(item)))layers.add(body.rear);
  }
  const missing=[...layers].filter(art=>art?.poseFile&&!art.image);
  const watchSteps=liveView&&n.stealthRoute?questsById.get(n.stealthRoute.quest).itinerary.filter(s=>s.cover):[];
  const guard=selectedSurveyPoint?.guard;
  const previewGuard=guard&&showPatrol.checked?assets[guard.art]:null;
  if(previewGuard?.poseFile&&!previewGuard.image&&!missing.includes(previewGuard))missing.push(previewGuard);
  for(const {cover} of watchSteps){
   if(!patrolArt.has(cover.art))patrolArt.set(cover.art,{poseFile:'ina-sayu-route-'+cover.art+'-sprites-v1.json',openingPose:true});
   const art=patrolArt.get(cover.art);
   if(!art.image)missing.push(art);
  }
  const course=liveView&&n.id===festival.node?festival.stages[Number($('questPropStage').value)]?.course:[];
  for(const key of new Set((course??[]).filter(m=>m.kind==='prop').map(m=>m.key))){
   if(!courseArt.has(key))courseArt.set(key,{poseFile:'ina-itto-games-'+key+'-sprites-v1.json',openingPose:true});
   const art=courseArt.get(key);
   if(!art.image)missing.push(art);
  }
  const teaProps=liveView&&selectedSurveyPoint?.tea&&selectedSurveyPoint.node===n.id?
   worksiteArt.teahouse.stages[selectedSurveyPoint.step]:[];
  const returnProp=liveView&&selectedSurveyPoint?.returnProp;
  const surveyProps=selectedSurveyPoint?.props??(returnProp?[{file:'quest-packed/mond-return-box-'+returnProp.art+'-sprites-v1.json',
   height:returnProp.height,x:selectedSurveyPoint.x,y:selectedSurveyPoint.y}]:[]);
  for(const surveyProp of surveyProps){
   if(!surveyPropArt.has(surveyProp.file))surveyPropArt.set(surveyProp.file,{poseFile:surveyProp.file,openingPose:true});
   const art=surveyPropArt.get(surveyProp.file);
   if(!art.image)missing.push(art);
  }
  for(const key of new Set(teaProps.map(prop=>prop.key))){
   if(!teaArt.has(key))teaArt.set(key,{poseFile:worksiteArt.teahouse.files[key],openingPose:true});
   const art=teaArt.get(key);
   if(!art.image)missing.push(art);
  }
  if(missing.length){
   $('fidelityControls').hidden=true;
   window.mapArt={ready:false,node:n.id,backgroundState:'loading'};
   $('status').textContent='会場の登場ポーズを読み込み中';
   for(const canvas of [$('png'),$('rect')])canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
   Promise.all(missing.map(loadFieldPose)).then(()=>{
    if(revision===renderRevision)render();
   }).catch(error=>{
    if(revision!==renderRevision)return;
    const retry=document.createElement('button');
    retry.textContent='もう一度読み込む';retry.onclick=render;
    $('status').replaceChildren('登場ポーズを読み込めません：'+error.message+' ',retry);
   });
   return;
  }
  const otherView=new URLSearchParams({node:n.id,tier:$('backgroundTier').value,profile});
  if(!$('decodedBackground').checked)otherView.set('background','original');
  if(!liveView)otherView.set('placements','live');
  if($('matchSpritePng').checked)otherView.set('compare','background');
  if(afterReport(n))otherView.set('phase','after');
  if(darkRoom(n))otherView.set('light','dark');
  viewLink.href='map-art.html?'+otherView;
  gatePreview.updateLink(otherView);
  const passage=$('nightTrialPassage'),gate=n.exits.find(e=>e.nightTotem);
  passage.hidden=!(liveView&&gate);
  if(!passage.hidden){
   const link=passage.querySelector('a'),destination=nodes.get(gate.to);
   const params=new URLSearchParams(otherView);
   params.set('node',gate.to);params.set('placements','live');params.delete('phase');params.delete('light');
   params.set('camera',arrivalCamera(n.id,gate,destination));
   if(gate.nightTotem==='enter')params.set('arena','nightTrial');
   link.textContent=(gate.nightTotem==='enter'?'柱の先の試練場を見る：':'入口の黒曜石の柱を見る：')+destination.name;
   link.href='map-art.html?'+params;
  }
  const forestRects=forest.rectangles(camera,960);
  const questPreview=liveView&&questPreviews[n.id];
  const stage=questPreview?.stages?.[Number($('questPropStage').value)];
  const contestRects=contest.rectangles(stage,camera);
  if(stage){
   if(n.breakTargets)$('crystalPreview').querySelector('output').textContent='残り '+stage.visible.length+' / '+n.breakTargets.length;
   const gate=n.exits.find(e=>e.requires&&legendNames.has(e.to));
   const link=$('questArenaLink');
   link.hidden=!gate;
   if(gate){
    const params=new URLSearchParams(otherView);
    params.set('placements','live');params.set('node',gate.to);
    link.href='map-art.html?'+params;
    link.textContent=nodes.get(gate.to).name+'を見る';
   }
  }
  for(const link of $('legendAccess').querySelectorAll('a[data-node]')){
   const params=new URLSearchParams(otherView);
   params.set('placements','live');params.set('node',link.dataset.node);
   link.href='map-art.html?'+params;
  }
  if(!items.some(e=>e.id===selected))selected=null;
  const background=sceneryStatus(frame);
  loadComparisonImage(frame,background);
  const definition=sceneryDefinitions[background.key];
  const tier=definition.decodedTiers?Number($('backgroundTier').value):6144;
  const tierTile=tier===6144?undefined:(tier-4096)/512;
  const previewFile=tierTile===undefined?definition.decodedPreview:definition.decodedTiers;
  $('backgroundTierControl').hidden=!definition.decodedTiers;
  $('backgroundTier').disabled=!$('decodedBackground').checked;
  $('decodedBackgroundControl').hidden=!previewFile;
  const preview=previewFile&&$('decodedBackground').checked?sceneryStatus(frame,previewFile):null;
  if(preview)loadComparisonImage(frame,preview,previewFile);
  const decoded=preview?.state==='ready'?previewFile:undefined;
  const matchedSprites=Boolean(previewFile && $('matchSpritePng').checked);
  $('comparisonViewLabel').textContent=decoded?'復号した背景':matchedSprites?'元PNG':'矩形版';
  $('decodedBackgroundStatus').textContent=decoded?tier.toLocaleString('ja-JP')+'矩形を復号':preview?.state==='loading'?'読み込み中':
   preview?.state==='error'?'読み込みに失敗しました':'';
  const metrics=sceneMeasures(n);
  $('sceneryBudget').hidden=!(definition.decodedTiers && metrics?.error && $('decodedBackground').checked);
  $('backgroundMetrics').textContent=decoded&&metrics?
   `元画像との平均色差 ${metrics.error[tier].toFixed(2)} / 255 ｜ Lua格納量（全5段階） ${metrics.bytes.toLocaleString('ja-JP')} B`:'';
  const costSample=decoded && metrics?.decode?.[tier];
  $('decodeCost').textContent=costSample?`Lua 5.3事前計測　復号 ${costSample.ms.toFixed(2)} ms ／ 保持メモリ +${costSample.kib.toLocaleString('ja-JP')} KiB`:'';
  $('sceneryCodec').hidden=!(decoded&&metrics?.bundle);
  void updateDownload(decoded&&metrics?.bundle,background.file,tier);
  const mapped=background.key!=='mondstadt'||n.region==='モンド'||n.scenery==='mondstadt',valid=items.every(e=>n.platforms.some(p=>p.y===e.y&&e.x>=p.x&&e.x<=p.x+p.w));
  const backgroundLabel=background.state==='loading'?'背景画像を読み込み中':
   background.state==='error'?'背景画像を読み込めません：単色で表示（'+background.file+'）':
   mapped?(sceneryDefinitions[background.key].note||'地域用の仮背景'):'専用背景未制作：モンド画像で代用';
  $('cameraValue').value=camera;$('context').textContent=`${afterReport(n)?.name??n.name} ／ 幅${n.width}px ／ ${legendNames.has(n.id)?'地方伝説の任意戦':n.hub?'拠点':n.peaceful?'非戦闘地点':'戦闘地点の仮構成'} ／ ${backgroundLabel}。配置${items.length}体（見た目確認用）。`;
  if(metrics?.locations && !afterReport(n)) $('context').append(` この仮背景は${metrics.locations}地点で共用しています。`);
  if(landingDeck&&n===openingNode&&frame.platforms.includes(landingDeck))$('context').append(' 「'+landingQuest.name+'」で開いた足場に到着します。');
  $('questOpeningNote').hidden=!(liveView && questNotes.has(n.id));
  $('questOpeningNote').textContent=liveView?(questNotes.get(n.id)??''):'';
  const cost={total:0,visible:0,standard:0};
  let patrol=null;
  if(guard){
   patrolTime.disabled=!showPatrol.checked;
   const seconds=Number(patrolTime.value)*guard.period/16;
   const angle=(seconds+guard.offset)/guard.period*2*Math.PI;
   patrol={x:guard.x+Math.sin(angle)*guard.roam,dir:Math.cos(angle)>=0?1:-1};
   patrolPanel.querySelector('output').textContent=previewGuard?
    seconds.toFixed(2)+'秒・'+(patrol.dir>0?'右':'左')+'向き ／ 黄：視線 '+guard.range+' px ／ 緑枠：足元が隠れる範囲「'+selectedSurveyPoint.cover.name+'」':'';
  }
  const landmarksInView=visibleLandmarks.filter(r=>r.x+r.w>camera&&r.x<camera+960&&r.y+r.h>0&&r.y<540);
  if(selectedSurveyPoint){
   const point=selectedSurveyPoint,marker=$('surveyPointNote');
   const count=visibleLandmarks.length?` ／ この画角の小物 ${landmarksInView.length}矩形`:'';
   marker.textContent=`調査位置「${point.name}」 （${point.x}, ${point.y}）`+count+(point.action?' ／ '+point.action:'');
  }
  const sceneItems=previewGuard?items.filter(e=>!watchSteps.some(step=>step.stealthGuard.id===e.id)):items;
  const visibleItems=liveView && subject.value ? sceneItems.filter(e=>e.id===subject.value) : sceneItems;
  const fidelity=$('spriteFidelity');
  const propKey=surveyProps.map(p=>[p.file,p.x,p.y,p.height].join(':')).join(',');
  const poseKey=[n.id,camera,subject.value,matchedSprites,$('candidateIdle').checked,propKey].join('/');
  const currentKey=poseKey+'/'+profile;
  if(fidelityKey!==currentKey){
   fidelity.textContent='';delete fidelity.dataset.result;fidelityKey=currentKey;
  }
  $('fidelityControls').hidden=!(liveView && (surveyProps.length || openings[n.id] && visibleItems.length) && !matchedSprites);
  const measuredSubject=surveyProps.length?'依頼の小物':'ボス';
  $('measureSprite').textContent=surveyProps.length?'小物の形と色を測る':'ドット絵の形と色を測る';
  function paintSurveyProp(ctx,prop,quality,cost){
   const art=surveyPropArt.get(prop.file);
   paintPlacementLayer(ctx,art,spriteBounds(art,prop.height),quality,prop.x-camera,prop.y,false,cost);
  }
  function paintMeasuredSprites(ctx,quality){
    const cost={total:0,visible:0,standard:0};
    if(surveyProps.length){
     for(const prop of surveyProps)paintSurveyProp(ctx,prop,quality,cost);
     return cost.visible;
    }
    for(const e of visibleItems){
     const art=placementArt(e);
     const x=e.x-camera,y=e.y-art.hover;
     paintPlacementLayer(ctx,art,spriteBounds(art,art.h),quality,x,y,e.flip,cost);
     if(art.weaponMarks)for(const mark of art.marks)paintMechanismMark(ctx,mark,x,y,e.flip);
    }
    return cost.visible;
  }
  $('measureSprite').onclick=()=>{
   const result=measureSpriteFidelity(paintMeasuredSprites,profile,960,540);
   fidelity.dataset.result=JSON.stringify(result);
   fidelity.textContent=result.union?'形の重なり '+result.overlapPercent.toFixed(1)+'% ／ 平均色差 '+
    (result.meanRgbError===null?'対象画素なし':result.meanRgbError.toFixed(2)+' / 255'):'この画角には'+measuredSubject+'が映っていません。';
  };
  const table=$('spriteProfileTable');
  table.caption.textContent='この画角に映る'+measuredSubject+'のドット絵';
  if(profileTableKey!==poseKey){table.hidden=true;table.tBodies[0].replaceChildren();profileTableKey=poseKey}
  for(const button of table.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.value===profile));
  $('compareSpriteProfiles').onclick=()=>{
   const options=Array.from($('profile').options);
   const rows=measureSpriteProfiles(paintMeasuredSprites,options.map(o=>o.value),960,540);
   const body=table.tBodies[0];body.replaceChildren();
   for(const [i,result] of rows.entries()){
    const tr=body.insertRow(),button=document.createElement('button');
    button.type='button';button.value=result.profile;button.textContent=options[i].textContent;
    button.setAttribute('aria-pressed',String(result.profile===profile));
    button.onclick=()=>{$('profile').value=result.profile;render()};
    tr.insertCell().append(button);
    tr.insertCell().textContent=result.rectangles.toLocaleString('ja-JP');
    const {overlapPercent,meanRgbError}=result.fidelity;
    tr.insertCell().textContent=overlapPercent==null?'—':overlapPercent.toFixed(1)+'%';
    tr.insertCell().textContent=meanRgbError==null?'—':meanRgbError.toFixed(2)+' / 255';
   }
   table.hidden=false;
  };
  if(sharedLegendArt)sharedLegendArt(legendNames.has(n.id)?visibleItems:[],profile,placementArt,
   e=>openings[n.id]?.parts.find(p=>p.id===e.id)?.name??legendNames.get(n.id));
  for(const mode of ['png','rect']){const ctx=$(mode).getContext('2d');ctx.clearRect(0,0,960,540);scenery(ctx,frame,mode==='rect'?decoded:undefined,mode==='rect'&&decoded?tierTile:undefined);ctx.imageSmoothingEnabled=false;
   for(const animal of liveView?wildlife[n.id]??[]:[]){
    const art=assets[animal.art];
    paintPlacementLayer(ctx,art,spriteBounds(art,art.h),mode==='png'||matchedSprites?null:profile,animal.x-camera,animal.y,animal.flip,cost);
   }
   if(previewGuard&&patrol){
    const x=patrol.x-camera,y=selectedSurveyPoint.y;
    const edge=x+patrol.dir*guard.range;
    ctx.fillStyle='#ffd36a40';ctx.fillRect(Math.min(x,edge),y-42,guard.range,84);
    ctx.fillStyle='#ffe19e';ctx.fillRect(edge-1,y-42,2,84);
    const cover=selectedSurveyPoint.cover;
    ctx.strokeStyle='#9ef3c6';ctx.strokeRect(cover.x-camera,cover.y-30,cover.w,60);
    paintPlacementLayer(ctx,previewGuard,spriteBounds(previewGuard,layouts[guard.art].height),mode==='png'||matchedSprites?null:profile,x,y,patrol.dir>0,cost);
   }
   for(const {cover} of watchSteps){
    const art=patrolArt.get(cover.art),x=cover.x+cover.w/2-camera;
    paintPlacementLayer(ctx,art,spriteBounds(art,cover.height),mode==='png'||matchedSprites?null:profile,x,cover.y,false,cost);
    if(selectedSurveyPoint?.cover===cover){
     ctx.fillStyle='#68aa9bab';
     ctx.fillRect(cover.x-camera,cover.y-3,cover.w,3);
    }
   }
   for(const fixture of selectedSurveyPoint?.fixtures??[]){
    const x=fixture.x-camera;
    for(const [dx,dy,w,h,color] of fixture.rects){
     ctx.fillStyle=color;ctx.fillRect(x+dx,fixture.y+dy,w,h);
    }
    if(fixture.name&&x>=-25&&x<=985){
     paintMechanismMark(ctx,{kind:'text',x:0,y:-fixture.labelHeight,size:14,color:'#fff0b9',text:fixture.name},x,fixture.y,false);
    }
   }
   for(const prop of surveyProps){
    paintSurveyProp(ctx,prop,mode==='png'||matchedSprites?null:profile,cost);
    if(prop.bubbles){
     const x=prop.x-camera;
     // Still frame of the seven Lua bubbles at t=0, measured from the sprite base.
     for(let i=1;i<=7;i++){
      const rise=i*17%76,bx=x+Math.sin(i+rise*.04)*13,by=prop.y-58-rise;
      ctx.fillStyle='#c2f3e285';ctx.fillRect(bx,by,3+i%3,3+i%3);
      ctx.fillStyle='#edfbcfc0';ctx.fillRect(bx+1,by,2,1);
     }
    }
   }
   for(const {key,x,y,height} of teaProps){
    const art=teaArt.get(key);
    paintPlacementLayer(ctx,art,spriteBounds(art,height),mode==='png'||matchedSprites?null:profile,x-camera,y,false,cost);
   }
   for(const mark of course??[]){
    if(mark.kind==='prop'){
     const art=courseArt.get(mark.key);
     paintPlacementLayer(ctx,art,spriteBounds(art,mark.height),mode==='png'||matchedSprites?null:profile,mark.x-camera,mark.y,false,cost);
    }else paintMechanismMark(ctx,mark,-camera,0,false);
   }
   if(stage){
    if(stage.cart){
     for(const [x,y,w,h,color] of questPreview.fixed){
      ctx.fillStyle=color;ctx.fillRect(x-camera,y,w,h);
     }
     for(const [dx,dy,w,h,color] of questPreview.load){
      ctx.fillStyle=color;ctx.fillRect(stage.cart.x+dx-camera,stage.cart.y+dy,w,h);
     }
    }
    for(const id of stage.visible){
     for(const mark of questPreview.props[id])paintMechanismMark(ctx,mark,-camera,0,false);
    }
   }
   if(liveView && !subject.value){
    for(const mark of stygianScenes[n.id]?.stageMarks??[]){
     if(omitCombatDraw(mark))continue;
     ctx.save();ctx.globalAlpha=combatOpacity(mark);paintMechanismMark(ctx,mark,-camera,0,false);ctx.restore();
    }
   }
   for(const e of visibleItems){
    const a=placementArt(e),flip=e.flip&&(a.mirrorSource||!assets[e.species].left),x=e.x-camera,y=e.y-a.hover;
    const body=spriteBounds(a,a.h),rear=a.rear&&spriteBounds(a.rear,a.rear.height,a.rear.bottom);
    const quality=mode==='png'||matchedSprites?null:profile;
    const paintMarks=marks=>{
     for(const mark of marks??[]){
      paintMechanismMark(ctx,mark,x,y,flip);
      if(quality && mark.kind==='rect'){
       cost.total++;
       const left=x+(flip?-mark.x-mark.w:mark.x);
       if(left+mark.w>0 && left<ctx.canvas.width && y+mark.y+mark.h>0 && y+mark.y<ctx.canvas.height){
        cost.visible++;cost.standard++;
       }
      }
     }
    };
    paintMarks(a.behind);
    if(rear)paintPlacementLayer(ctx,a.rear,rear,quality,x,y,false,cost);
    if(a.image)paintPlacementLayer(ctx,a,body,quality,x,y,flip,cost);
    paintMarks(a.marks);
    if(a.heldArt){
     const {gripX,gripY,rects}=a.heldArt,dir=flip?-1:1;
     const handX=x+dir*a.h*gripX,handY=y-a.h*gripY;
     for(const [dx,dy,w,h,color] of rects){
      const rx=handX-w/2+dir*dx,ry=handY+dy;
      if(quality)cost.total++;
      if(rx+w<=0 || ry+h<=0 || rx>=ctx.canvas.width || ry>=ctx.canvas.height)continue;
      ctx.fillStyle=color;ctx.fillRect(rx,ry,w,h);
      if(quality){cost.visible++;cost.standard++}
     }
    }
    if(e.id===selected){
     const left=flip?-body.x-body.width:body.x;
     const minX=rear?Math.min(left,rear.x):left;
     const maxX=rear?Math.max(left+body.width,rear.x+rear.width):left+body.width;
     const top=Math.min(body.y,rear?.y??0);
     ctx.strokeStyle='#ffe08a';ctx.lineWidth=2;
     if(a.anchorY!=null){
      const box=socketBounds(a,body,flip);ctx.strokeRect(x+box.x-3,y+box.y-3,box.width+6,box.height+6);
     }else ctx.strokeRect(x+minX-3,y+top-3,maxX-minX+6,-top+6);
    }
    if(!liveView || !arenaPreviews.get(n.id)?.openingPose){
     ctx.fillStyle='#ffffff';ctx.fillRect(x-3,e.y-1,6,2);
    }
   }
   if(liveView && !subject.value){
    for(const mark of mechanismScenes[n.id]?.captions??[])paintMechanismMark(ctx,mark,-camera,0,false);
   }
   if(n.localLight){
    if(!darkRoom(n)){
     const bridge=n.localLight.bridge;
     ctx.fillStyle='#13243266';
     for(let i=0;i<9;i++)ctx.fillRect(bridge.x-camera+i*41,bridge.y+9+i*3,42,58-i*3);
    }
    for(const c of n.localLight.controls){
     if(c.darkOnly&&!darkRoom(n))continue;
     const x=c.x-camera;
     ctx.fillStyle='#425061';ctx.fillRect(x-12,c.y-30,24,30);
     ctx.fillStyle=darkRoom(n)?'#7fc4d7':'#fff2b4';ctx.fillRect(x-6,c.y-29,12,12);
     ctx.fillStyle='#e2e8c6';ctx.fillRect(x-3,c.y-13,6,6);
    }
   }
   for(const [x,y,w,h,color] of contestRects){
    ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
   }
   for(const [x,y,w,h,color] of forestRects){
    ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
   }
   gatePreview.draw(ctx,camera,darkRoom(n));
   if(selectedSurveyPoint){
    const point=selectedSurveyPoint;
    for(const r of landmarksInView){
     ctx.fillStyle=r.color;ctx.fillRect(r.x-camera,r.y,r.w,r.h);
    }
    puzzlePreview.draw(ctx,camera);
    drawSurveyPoint(ctx,point,camera);
   }
  }
  updateDetail();
  $('placements').replaceChildren();
  for(const e of items){
   const label=document.createElement('button'),hover=placementArt(e).hover;
   label.type='button';label.dataset.id=e.id;label.setAttribute('aria-pressed',String(e.id===selected));
   label.onclick=()=>{selected=e.id;$('editMode').value='move';render()};
   label.textContent=`${e.species}：(${e.x}, ${e.y})${hover?` ／ 浮き ${Number(hover.toFixed(2))}px`:''}`;
   $('placements').append(label);
  }
  const chosen=items.find(e=>e.id===selected);$('selectionStatus').textContent=chosen?`選択：${chosen.species} (${chosen.x}, ${chosen.y})`:'選択なし';for(const id of ['focusSelected','replaceSelected','copySelected','flipSelected','deleteSelected','clearSelection'])$(id).disabled=!chosen;
  const subjects=teaProps.length?'事件帖の絵札・茶屋の道具':course?.length?'競技の道具と走者':watchSteps.length?'隠れ場所とキャラクター':liveView&&wildlife[n.id]?'水中生物':'キャラクター';
  const matchedLabel=teaProps.length?'事件帖の道具は左右とも元PNG':course?.length?'道具と走者は左右とも元PNG':watchSteps.length?'隠れ場所とキャラは左右とも元PNG':liveView&&wildlife[n.id]?'水中生物は左右とも元PNG':'キャラは左右とも元PNG';
  const costSubject=surveyProps.length?'小物・キャラクターの':subjects;
  $('viewportCost').textContent=matchedSprites?(surveyProps.length?'小物は左右とも元PNG':matchedLabel):decoded&&!cost.standard?'':viewportSummary(cost,profile,costSubject);
  const placementCost=matchedSprites?'キャラは元PNGで表示':'矩形'+cost.total.toLocaleString('ja-JP')+'個（配置全体の合計）';
  $('status').textContent=`配置${items.length}体 ／ ${placementCost} ／ ${valid?'全個体の配置基準点が足場上':'足場外の配置あり'}`;$('undo').disabled=!(histories[n.id]?.length);$('redo').disabled=!(redos[n.id]?.length);
  if(liveView){
   const boss=arenaPreviews.get(n.id);
   const label=visibleItems.some(previewCandidate)?'通常敵と輪郭を共用する待機絵の候補':stygianScenes[n.id]?'幽境・4難度に共通する開始時の配置':fieldScenes[n.id]?(fieldScenes[n.id].quest?'依頼戦が開いた時の姿':n.id.startsWith('icewind-')?'演目開始時の主役と相方':'本編で最初に見えるボスの配置'):legendScenes[n.id]?'地方伝説が最初に見えたときの配置':boss?.openingParts?'戦闘開始時の本体・機構':boss?.innerNode===n.id?'異界の影の出現位置':boss?.storyWindow?'依頼戦・再戦が開いた時のボス位置':boss?'開戦時のボス位置・待機絵で比較':weeklyArenaNodes.has(n.id)&&!items.length?'週ボス会場の背景比較（ボス配置のプレビューは準備中）':'本編の敵配置 '+items.length+'体';
   const snapshot=n.id===query.get('node')&&absent.size?'地図を開いた時点の入場配置 ｜ ':'';
   $('status').textContent=liveError||(snapshot+label+' ｜ '+placementCost);
  }
  const diff=baselines[n.id]?comparePlacements(baselines[n.id],items):null;
  $('diffSummary').textContent=diff?`取得した本編配置との差分：追加${diff.added.length}・削除${diff.removed.length}・変更${diff.changed.length}・同じ${diff.unchanged}体`:'この地点の本編配置は未取得です。比較しても編集案は変わりません。';
  $('diffDetails').replaceChildren();
  const describe=e=>`${e.species} (${e.x}, ${e.y}) ${e.flip?'反転':'元の向き'}`;
  const line=text=>{const li=document.createElement('li');li.textContent=text;$('diffDetails').append(li)};
  if(diff){for(const e of diff.added)line(`追加 ${e.id}：${describe(e)}`);for(const e of diff.removed)line(`削除 ${e.id}：${describe(e)}`);for(const e of diff.changed){const names={species:'敵種',x:'横位置',y:'足場の高さ',flip:'向き'};line(`変更 ${e.id}［${e.fields.map(k=>names[k]).join('・')}］：${describe(e.before)} → ${describe(e.after)}`)}}
  nodePicker.update(renderedDraft);positionEditor.update();
  const visuals=items.map(e=>{
   const a=placementArt(e),y=e.y-a.hover;
   const rear=a.rear&&{source:a.rear.source,top:y+a.rear.bottom-a.rear.height,bottom:y+a.rear.bottom};
   return {id:e.id,source:a.source,y,hover:a.hover,height:a.h,...(a.opacity!==undefined && {opacity:a.opacity}),...(rear&&{rear})};
  });
  window.mapArt={diff,dirty,liveView,ready:true,node:n.id,nodeCount:nodes.size,camera,profile,count:items.length,shownCount:visibleItems.length,selected,editMode:$('editMode').value,placements:structuredClone(items),visuals,grounded:valid,background:background.key,backgroundFallback:!mapped,backgroundState:background.state,backgroundFile:background.file,requestedDecodedBackground:preview?.file,decodedBackgroundFile:decoded,decodedBackgroundRectangles:decoded?tier:undefined};
 }
 function remember(id){const history=histories[id]??=[];history.push(structuredClone(drafts.nodes[id]??[]));if(history.length>100)history.shift();delete redos[id]}
 function restoreHistory(from,to){
  const id=node().id,previous=from[id]?.at(-1);if(!previous)return;
  try{
   const next=structuredClone(drafts);next.nodes[id]=structuredClone(previous);
   validatePlacementDraft(next,graph,Object.keys(assets));
   const target=to[id]??=[];target.push(structuredClone(drafts.nodes[id]??[]));if(target.length>100)target.shift();
   from[id].pop();drafts=next;render();
  }catch(e){$('fileStatus').textContent='履歴を復元できません：'+e.message+' 編集案と履歴は保持しています。'}
 }
 function select(){
  colorResult.textContent='';
  selected=null;
  const n=node(),camera=$('camera');
  const residents=liveView?wildlife[n.id]:null;
  wildlifeNote.hidden=!residents;
  wildlifeNote.replaceChildren();
  if(residents){
   wildlifeNote.append('水中で観察できる生物（試作配置）　');
   for(const animal of residents){
    const layout=layouts[animal.art],link=document.createElement('a');
    link.textContent=layout.observationName??layout.name.split('（')[0];
    link.href='enemies-art.html?'+new URLSearchParams({q:animal.art});wildlifeNote.append(link);
   }
  }
  $('lampPreview').hidden=!n.localLight;
  $('lampMode').value=n.localLight && n.id===openingNode.id && query.get('light')==='dark'?'dark':'bright';
  $('sceneryPhaseControl').hidden=!n.locationAfterReport;
  $('sceneryPhase').value=n.id===openingNode.id && n.locationAfterReport && query.get('phase')==='after'?'after':'before';
  const candidateAvailable=liveView && openings[n.id]?.parts.some(part=>idleCandidates.has(part.id));
  $('candidateIdleControl').hidden=!candidateAvailable;
  $('candidateIdle').checked=Boolean(candidateAvailable && n.id===openingNode.id && query.get('idle')==='candidate');
  const access=$('legendAccess'),accessList=access.querySelector('ul');
  accessList.replaceChildren();
  if(liveView && (legendNames.has(n.id)||n.exits.some(e=>e.nightTotem==='enter'))){
   for(const {from,quest,rule} of questGates.get(n.id)??[]){
    const item=document.createElement('li'),link=document.createElement('a');
    link.dataset.node=from.id;
    link.textContent=from.name;
    const condition=rule.count!=null
     ? 'から入るには、依頼「'+quest.name+'」を進めます。'+(rule.unavailableNotice??'目標を'+rule.count+'件達成してください。')
     : 'から入るには、依頼「'+quest.name+'」を報告（受注Lv'+quest.level+'）。';
    item.append(link,condition);
    accessList.append(item);
   }
  }
  access.hidden=!accessList.children.length;
  const questPanel=$('localQuestSteps'),steps=stepsByNode.get(n.id);
  questPanel.hidden=!(liveView && steps);
  const questList=questPanel.querySelector('div');
  questList.replaceChildren();
  if(liveView && steps){
   for(const [quest,entries] of steps){
    const title=document.createElement('strong'),list=document.createElement(entries[0].number?'ol':'ul');
    title.textContent=quest.name;
    for(const {number,objective,point,choices} of entries){
     const item=document.createElement('li');
     if(number)item.value=number;
     item.textContent=objective;list.append(item);
     for(const destination of choices??(point?[point]:[])){
      const link=document.createElement('a');link.href=surveyPointUrl(destination);
      link.textContent=destination.choice?destination.name:'調査位置を見る';
      link.onclick=e=>{
       if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
       e.preventDefault();focusSurveyPoint(destination);render();
      };
      item.append(' ',link);
     }
    }
    questList.append(title,list);
   }
  }
  const rules=$('stygianRules'),duel=stygianScenes[n.id];
  rules.hidden=!(liveView && duel);
  const table=rules.querySelector('tbody');table.replaceChildren();
  if(liveView && duel){
   for(const mode of duel.modes){
    const row=table.insertRow();
    for(const value of [mode.name,mode.level,mode.hp.toLocaleString('ja-JP')])row.insertCell().textContent=value;
   }
  }
  $('defenseCompareLink').hidden=n.id!=='apep-oasis-heart-arena';
  camera.max=Math.max(0,n.width-960);
  camera.value=0;
  forest.reset(liveView?n.id:null,n===openingNode?query:null);
  contest.reset(liveView?n.id:null,n===openingNode?query:null);
  if(liveView&&worksiteArt.forest.rooms[n.id])camera.value=Math.round(Number(camera.max)/2);
  const preview=liveView&&questPreviews[n.id],stageSelect=$('questPropStage');
  $('questPropPreview').hidden=!preview;
  stageSelect.replaceChildren();
  const crystals=$('crystalPreview'),targets=preview&&n.breakTargets;
  crystals.hidden=!targets;
  $('questStageControl').hidden=Boolean(targets);
  const switches=crystals.querySelector('span');
  switches.replaceChildren();
  if(targets){
   const points=[...targets].sort((a,b)=>a.x-b.x);
   for(const [index,point] of points.entries()){
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.value=String(point.entity);
    label.append(input,points.length===3?['左','中央','右'][index]:String(index+1));switches.append(label);
    input.onchange=()=>{
     const remaining=[...switches.querySelectorAll('input:not(:checked)')].map(i=>i.value);
     const index=preview.stages.findIndex(s=>s.visible.length===remaining.length&&remaining.every(id=>s.visible.includes(id)));
     stageSelect.value=String(index);
     camera.value=point.x-480;
     render();
    };
   }
  }
  if(preview){
   for(const [index,stage] of preview.stages.entries())stageSelect.add(new Option(stage.label,String(index)));
   const requested=n.id===festival.node?'round':n.id===worksiteArt.contest.node?'contest':null;
   const phase=n===openingNode&&requested?Number(query.get(requested)):0;
   const index=Number.isInteger(phase)&&phase>=1&&phase<=3?phase-1:0;
   stageSelect.value=String(index);
   camera.value=preview.stages[index].focusX-480;
  }
  if(liveView){
   liveItems=[];liveError='';
   try{
    liveItems=liveNodeDraft(liveSource,graph,n.id,Object.keys(assets),arenaPreviews.get(n.id));
    if(n.id===query.get('node')&&absent.size)liveItems=liveItems.filter(e=>!absent.has(e.id));
    const openingBoss=liveItems.length>0 && (openings[n.id] || liveItems[0].id===arenaPreviews.get(n.id)?.id);
    if(liveItems.length && (openingBoss || !liveItems.some(e=>e.x>=0 && e.x<960))){
     const focusX=openingBoss?(liveItems[0].x+liveItems.at(-1).x)/2:liveItems[0].x;
     camera.value=Math.min(Number(camera.max),Math.max(0,focusX-480));
    }
   }catch(error){liveError='本編配置を表示できません：'+error.message}
   subject.replaceChildren(new Option('全員を表示',''));
   const names=new Map((liveSource.nodes[n.id]??[]).map(e=>[e.id,e.name]));
   for(const p of openings[n.id]?.parts??[])names.set(p.id,p.name);
   for(const e of liveItems){
    const name=names.get(e.id)||assets[e.species]?.displayName||layouts[e.species]?.name||e.species;
    subject.add(new Option(name+'（'+e.x+', '+e.y+'）',e.id));
   }
   $('liveSubjectControl').hidden=liveItems.length<2;
  }
  gatePreview.reset(n,nodes,n.id===openingNode.id);
  if(gatePreview.darkGate() && query.get('light')!=='bright')$('lampMode').value='dark';
  let point=null;
  if(liveView && n===openingNode){
   const quest=questsById.get(query.get('quest'));
   point=query.has('worksite')?worksitePoint(quest,query.get('worksite'),n.id):
    surveyPoint(quest,Number(query.get('step'))-1,n.id,n,query.get('path'),Number(query.get('choice')));
  }
  focusSurveyPoint(point);
  render();
 }
 $('lampMode').onchange=()=>{colorResult.textContent='';render()};
 $('lampConsole').onclick=()=>{
  const control=node().localLight.controls.find(c=>!c.darkOnly);
  $('camera').value=control.x-480;render();
 };
 $('questPropStage').onchange=()=>{
  const stage=questPreviews[node().id].stages[Number($('questPropStage').value)];
  $('camera').value=stage.focusX-480;
  render();
 };
 function focusSubject(){
  const e=liveItems.find(e=>e.id===subject.value);
  if(e){
   const art=placementArt(e),body=spriteBounds(art,art.h);
   const bounds=art.anchorY==null?body:socketBounds(art,body,e.flip);
   const centerX=e.x+bounds.x+bounds.width/2;
   $('camera').value=Math.round(centerX-480);
   $('detailX').value=Math.round(centerX-Number($('camera').value)-40);
   $('detailY').value=Math.round(e.y-art.hover+bounds.y+bounds.height/2-22);
  }
  render();
 }
 subject.onchange=focusSubject;
 $('node').onchange=select;$('editMode').onchange=render;
 $('clearSelection').onclick=()=>{selected=null;$('editMode').value='add';render()};
 $('focusSelected').onclick=()=>{
  const e=placements().find(e=>e.id===selected);if(!e)return;
  const a=placementArt(e),width=a.h*a.box[2]/a.box[3],flip=e.flip&&!assets[e.species].left;
  const center=e.x+width*(.5-(a.anchorX??.5))*(flip?-1:1);
  $('camera').value=Math.round(Math.max(0,Math.min(Math.max(0,node().width-960),center-480)));
  render();$('png').scrollIntoView({block:'center',behavior:'instant'});
 };
 $('replaceSelected').onclick=()=>{
  const e=placements().find(e=>e.id===selected),species=$('species').value;if(!e)return;
  if(!assets[species]){$('fileStatus').textContent='差し替える素材がありません。素材の絞り込みを解除してください。';return}
  if(e.species===species){$('fileStatus').textContent='同じ素材です。配置案は変わりません。';return}
  remember(node().id);e.species=species;render();
  $('fileStatus').textContent='選択個体の絵を差し替えました。座標・向き・IDは保持しています。取り消しで元に戻せます。';
 };
 $('copySelected').onclick=()=>{if(!placements().some(e=>e.id===selected))return;$('editMode').value='copy';render();$('fileStatus').textContent='画像上の複製先をクリックしてください。同じ素材・向きで追加します。';};
 $('flipSelected').onclick=()=>{const e=placements().find(e=>e.id===selected);if(!e)return;remember(node().id);e.flip=!e.flip;render()};
 $('deleteSelected').onclick=()=>{if(!selected)return;remember(node().id);drafts.nodes[node().id]=placements().filter(e=>e.id!==selected);selected=null;render()};
for(const id of ['camera','profile'])$(id).oninput=render;
 for(const mode of ['png','rect'])$(mode).onclick=event=>{if(liveView)return;const box=$(mode).getBoundingClientRect(),n=node(),x=Math.round((event.clientX-box.left)*960/box.width+Number($('camera').value)),y=(event.clientY-box.top)*540/box.height;const supports=n.platforms.filter(p=>x>=p.x&&x<=p.x+p.w&&x<=n.width).sort((a,b)=>Math.abs(a.y-y)-Math.abs(b.y-y));if(!supports.length)return;
  if($('editMode').value==='move'){const e=placements().find(e=>e.id===selected);if(!e){$('fileStatus').textContent='下の個体一覧から移動する個体を選んでください。';return}if(e.x!==x||e.y!==supports[0].y){remember(n.id);e.x=x;e.y=supports[0].y}render();return}
  if(placements().length>=MAX_NODE_PLACEMENTS||Object.values(drafts.nodes).reduce((s,x)=>s+x.length,0)>=MAX_TOTAL_PLACEMENTS){$('fileStatus').textContent='配置数の上限です。別の案として保存してから編集してください。';return}
  const copying=$('editMode').value==='copy',source=copying?placements().find(e=>e.id===selected):null;
  if(copying&&!source){$('fileStatus').textContent='下の個体一覧から複製する個体を選んでください。';return}
  const species=copying?source.species:$('species').value;
  if(!assets[species]){$('fileStatus').textContent='追加する素材がありません。素材の絞り込みを解除してください。';return}
  let id;do{id=`added-${++serial}`}while(placements().some(e=>e.id===id));const item={id,species,x,y:supports[0].y,flip:copying?source.flip:false};remember(n.id);(drafts.nodes[n.id]??=[]).push(item);if(copying)selected=id;render();if(copying)$('fileStatus').textContent='同じ素材・向きの個体を複製しました。続けてクリックすると追加できます。';};
 $('undo').onclick=()=>restoreHistory(histories,redos);
 $('redo').onclick=()=>restoreHistory(redos,histories);
 $('reset').onclick=()=>{
  const id=node().id;
  try{
   const next=structuredClone(drafts);next.nodes[id]=structuredClone(initial.nodes[id]||[]);
   const valid=validatePlacementDraft(next,graph,Object.keys(assets));
   remember(id);drafts=valid;render();
   $('fileStatus').textContent='この地点を初期案へ戻しました。取り消しで直前の案へ戻せます。';
  }catch(e){$('fileStatus').textContent='初期案へ戻せません：'+e.message+' 編集案と履歴は保持しています。'}
 };
 $('loadLive').onclick=async()=>{const id=node().id;$('loadLive').disabled=true;try{const source=await json('content/enemy-spawns.json');if(node().id!==id)throw Error('地点が切り替わったため読み込みを中止しました。');const items=liveNodeDraft(source,graph,id,Object.keys(assets),arenaPreviews.get(id));if(Object.entries(drafts.nodes).reduce((sum,[key,list])=>sum+(key===id?0:list.length),items.length)>MAX_TOTAL_PLACEMENTS)throw Error('全地点の配置数の上限を超えます。');baselines[id]=structuredClone(items);remember(id);drafts.nodes[id]=items;render();$('fileStatus').textContent='この地点の本編配置を編集案にコピーしました。取り消すと直前の案に戻ります。';}catch(e){$('fileStatus').textContent='読み込み中止：'+e.message+' 編集中の案は保持しています。';}finally{$('loadLive').disabled=false}};
 $('compareLive').onclick=async()=>{const id=node().id;$('compareLive').disabled=true;try{const source=await json('content/enemy-spawns.json');const baseline=liveNodeDraft(source,graph,id,Object.keys(assets),arenaPreviews.get(id));baselines[id]=baseline;render();$('fileStatus').textContent='本編配置を取得しました。同じ個体IDで比較しています。編集案は変更していません。';}catch(e){$('fileStatus').textContent='比較の取得失敗：'+e.message+' 編集案と前回の比較基準を保持しています。';}finally{$('compareLive').disabled=false}};
 $('export').onclick=()=>{const blob=new Blob([JSON.stringify(drafts,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='enemy-placement-drafts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $('import').onchange=async()=>{
  const file=$('import').files[0],ticket=++importTicket;if(!file)return;
  try{
   if(file.size>MAX_DRAFT_BYTES)throw Error('512KB以下の配置案を選んでください。');
   const text=await file.text();if(ticket!==importTicket)return;
   let parsed;try{parsed=JSON.parse(text)}catch{throw Error('JSONを読み取れませんでした。')}
   const next=validatePlacementDraft(parsed,graph,Object.keys(assets));drafts=next;selected=null;for(const store of [histories,redos])for(const id of Object.keys(store))delete store[id];
   render();$('fileStatus').textContent=`${file.name}を読み込みました。全地点の編集案を置き換えました。`;
  }catch(e){if(ticket===importTicket)$('fileStatus').textContent=`読み込み中止：${e.message} 編集中の案は保持しています。`}
  finally{if(ticket===importTicket)$('import').value=''}
 };
 select();
 const requestedLimit=query.get('colorLimit');
 if(requestedLimit && requestedLimit.trim()){
  const value=Number(requestedLimit);
  if(Number.isFinite(value) && value>=0 && value<=255){
   $('colorLimit').value=String(value);
   fitBackground();
  }
 }
 const requestedSpecies=query.get('species');
 const matchingEnemy=requestedSpecies&&liveItems.find(e=>e.species===requestedSpecies||e.species===requestedSpecies+'-reference');
 const requestedSubject=query.get('subject')??matchingEnemy?.id;
 if(liveView && liveItems.some(e=>e.id===requestedSubject)){
  subject.value=requestedSubject;
  if(!query.has('camera') && !query.has('sampleX') && !query.has('sampleY'))focusSubject();
  else render();
 }
 if(liveView && /^\d+$/.test(query.get('camera')??'')){
  $('camera').value=query.get('camera');
  render();
 }
}catch(e){$('status').textContent='読み込みに失敗しました: '+e.message;throw e}
