import {setupSceneryDownload} from './scenery-export.js';
import {backgroundMeasurements} from './scenery-measurements.js';
import {placementSignature} from './placement-signature.js';
import {setupPlacementPosition} from './placement-position.js';
import {setupMapNodePicker} from './map-node-picker.js';
import {loadImageSet} from './sprite-images.js';
import {spriteBounds,paintSprite} from './sprite-layers.js';
import {setupPlacementPicker} from './placement-picker.js';
import {scenery,sceneryDefinitions,sceneryStatus,loadScenery} from './scenery.js';
import {comparePlacements,liveNodeDraft,validatePlacementDraft,MAX_DRAFT_BYTES,MAX_NODE_PLACEMENTS,MAX_TOTAL_PLACEMENTS} from './placement-drafts.js';
const DRAFT_KEY='maple-lua-lab.map-draft.v1';
const $=id=>document.getElementById(id),assets={},histories={},redos={},baselines={};
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(path);return r.json()}

function paintPlacementLayer(ctx,art,bounds,profile,x,y,flip,cost){
 const left=x+(flip?-bounds.x-bounds.width:bounds.x),top=y+bounds.y;
 // paintSprite slightly overlaps adjacent rectangle edges. Keep boundary layers until fully clear.
 const visible=left<ctx.canvas.width+1&&left+bounds.width>-1&&top<ctx.canvas.height+1&&top+bounds.height>-1;
 if(profile){
  const runs=art.profiles[profile].runs.length;
  cost.total+=runs;
  if(visible){
   cost.visible+=runs;
   cost.standard+=art.profiles.legacy.runs.length;
  }
 }
 if(!visible)return;
 ctx.save();
 ctx.translate(x,y);
 if(flip)ctx.scale(-1,1);
 paintSprite(ctx,art,art.image,bounds,profile);
 ctx.restore();
}

function viewportSummary(cost,profile){
 if(!cost.standard)return 'この画角に表示する素材はありません';
 const current='この画角のキャラクター矩形 '+cost.visible.toLocaleString('ja-JP')+'個';
 if(profile==='legacy')return current+'（標準）';
 const change=100*(cost.visible-cost.standard)/cost.standard;
 const difference=change===0?'変化なし':Math.abs(change).toFixed(1)+(change<0?'%減':'%増');
 return current+'（標準 '+cost.standard.toLocaleString('ja-JP')+'個から'+difference+'）';
}

try{
 const [graph,initial,variants]=await Promise.all([json('content/story-graph.json'),json('content/enemy-placement-drafts.json'),json('assets/variants.json')]);
 const layouts=await json('content/enemy-art-layout.json');
 let drafts=structuredClone(initial),serial=0,importTicket=0,selected=null;const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 const query=new URLSearchParams(location.search);
 const openingNode=nodes.get(query.get('node'))??nodes.get('mond-road');
 const liveView=query.get('placements')==='live';
 const liveSource=liveView?await json('content/enemy-spawns.json'):null;
 let liveItems=[],liveError='';
 $('draftControls').hidden=$('draftInspection').hidden=liveView;
 const viewLink=$('placementViewLink');
 viewLink.textContent=liveView?'配置案を編集する':'本編の敵配置で見比べる';
 const requestedTier=query.get('tier');
 if(Array.from($('backgroundTier').options).some(option=>option.value===requestedTier)){
  $('backgroundTier').value=requestedTier;
 }
 if(query.get('compare')==='background')$('matchSpritePng').checked=true;
 const openingBackground=loadScenery(sceneFrame(openingNode,0));
 const pendingBackgrounds=new Set();
 for(const [id,index] of [['hydro-slime',4],['pyro-slime',6]]){const profiles=Object.fromEntries(Object.entries(variants.variants).map(([k,v])=>[k,v.sprites[index]]));assets[id]={source:'atlas-transparent.png',box:profiles.legacy.box,profiles,h:40}}
 for(const [id,{height,hover,file,name}] of Object.entries(layouts)){
  const data=await json('assets/'+(file??`${id}-idle-sprites.json`)),art={...data,h:height,hover};
  if(assets[id]){
   Object.assign(assets[id],{h:height,hover});
   assets[id+'-reference']=art;
  }else assets[id]=art;
  if(name&&![...$('species').options].some(option=>option.value===id)){
   const option=document.createElement('option');option.value=id;option.textContent=name;$('species').append(option);
  }
 }
 for(const [kind,label,file] of [['boss','ボス待機候補（比較用の大きさ）','boss-art-gallery.json'],['character','主人公・同行者・NPC','character-art-gallery.json']]){
  const gallery=await json('content/'+file),group=document.createElement('optgroup');group.label=label;
  const loaded=await Promise.all(gallery.items.map(async item=>{
   const [data,left,rear]=await Promise.all([
    json('assets/'+item.file),item.leftFile&&json('assets/'+item.leftFile),item.rear&&json('assets/'+item.rear.file)
   ]);
   const size={h:item.height,hover:item.mapHover??0,rear:rear&&{...rear,height:item.rear.height,bottom:item.rear.bottom}};
   return {item,art:{...data,...size,left:left&&{...left,...size}}};
  }));
  for(const {item,art} of loaded){const id=kind+'-'+item.id;assets[id]=art;const option=document.createElement('option');option.value=id;option.textContent=item.name;group.append(option)}
  $('species').append(group);
 }
 setupPlacementPicker($('species'));
 const imageArt=Object.values(assets).flatMap(data=>[data,data.left,data.rear].filter(Boolean));
 const images=await loadImageSet(imageArt.map(data=>data.source),{onProgress:(done,total)=>{$('status').textContent=`画像を読み込み中 ${done} / ${total}`}});
 for(const data of imageArt)data.image=images[data.source];
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
 const nodePicker=setupMapNodePicker({graph,select:$('node'),getDraft:()=>drafts,onChoose:select});
 $('mapNodePicker').hidden=liveView;
 function node(){return nodes.get($('node').value)}
 function sceneFrame(n,camera){
  return {camera,platforms:n.platforms,campaign:{zone:n.hub?'town':`story:${n.id}`},story:{active:true,node:n.id},storyGraph:graph};
 }
 function placements(){return drafts.nodes[node().id]??[]}
 function placementArt(e){const art=assets[e.species];return e.flip&&art.left?art.left:art}
 function loadComparisonImage(frame,status,previewFile){
  if(status.state!=='loading'||pendingBackgrounds.has(status.file))return;
  pendingBackgrounds.add(status.file);
  void loadScenery(frame,previewFile).then(()=>{
   pendingBackgrounds.delete(status.file);
   if(window.mapArt?.backgroundFile===status.file||window.mapArt?.requestedDecodedBackground===status.file)render();
  });
 }
 $('decodedBackground').onchange=render;
 $('backgroundTier').onchange=render;
 $('matchSpritePng').onchange=render;
 const updateDownload=setupSceneryDownload($('sceneryDownload'),$('sceneryExportStatus'));
 function render(){
  const renderedDraft=placementSignature(drafts),dirty=renderedDraft!==savedSignature;if(renderedDraft!==lastRenderedDraft){lastRenderedDraft=renderedDraft;$('browserStatus').textContent=dirty?'未保存の編集があります。再読み込み前にブラウザ保存またはJSON保存してください。':cleanMessage}
  const n=node(),camera=Number($('camera').value),profile=$('profile').value,items=liveView?liveItems:placements(),frame=sceneFrame(n,camera);
  const otherView=new URLSearchParams({node:n.id,tier:$('backgroundTier').value});
  if(!liveView)otherView.set('placements','live');
  if($('matchSpritePng').checked)otherView.set('compare','background');
  viewLink.href='map-art.html?'+otherView;
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
  const metrics=backgroundMeasurements[n.id];
  $('backgroundMetrics').textContent=decoded&&metrics?
   `元画像との平均色差 ${metrics.error[tier].toFixed(2)} / 255 ｜ Lua格納量（全5段階） ${metrics.bytes.toLocaleString('ja-JP')} B`:'';
  const costSample=decoded && metrics?.decode?.[tier];
  $('decodeCost').textContent=costSample?`Lua 5.3事前計測　復号 ${costSample.ms.toFixed(2)} ms ／ 保持メモリ +${costSample.kib.toLocaleString('ja-JP')} KiB`:'';
  $('sceneryCodec').hidden=!(decoded&&metrics?.bundle);
  void updateDownload(decoded&&metrics?.bundle,background.file,tier);
  const mapped=Object.values(sceneryDefinitions).some(d=>d.region===n.region),valid=items.every(e=>n.platforms.some(p=>p.y===e.y&&e.x>=p.x&&e.x<=p.x+p.w));
  const backgroundLabel=background.state==='loading'?'背景画像を読み込み中':
   background.state==='error'?'背景画像を読み込めません：単色で表示（'+background.file+'）':
   mapped?(sceneryDefinitions[background.key].note||'地域用の仮背景'):'専用背景未制作：モンド画像で代用';
  $('cameraValue').value=camera;$('context').textContent=`${n.name} ／ 幅${n.width}px ／ ${n.hub?'拠点':n.peaceful?'非戦闘地点':'戦闘地点の仮構成'} ／ ${backgroundLabel}。配置${items.length}体（見た目確認用）。`;
  const cost={total:0,visible:0,standard:0};
  for(const mode of ['png','rect']){const ctx=$(mode).getContext('2d');ctx.clearRect(0,0,960,540);scenery(ctx,frame,mode==='rect'?decoded:undefined,mode==='rect'&&decoded?tierTile:undefined);ctx.imageSmoothingEnabled=false;
   for(const e of items){
    const a=placementArt(e),flip=e.flip&&a===assets[e.species],x=e.x-camera,y=e.y-a.hover;
    const body=spriteBounds(a,a.h),rear=a.rear&&spriteBounds(a.rear,a.rear.height,a.rear.bottom);
    const quality=mode==='png'||matchedSprites?null:profile;
    if(rear)paintPlacementLayer(ctx,a.rear,rear,quality,x,y,false,cost);
    paintPlacementLayer(ctx,a,body,quality,x,y,flip,cost);
    if(e.id===selected){
     const left=flip?-body.x-body.width:body.x;
     const minX=rear?Math.min(left,rear.x):left;
     const maxX=rear?Math.max(left+body.width,rear.x+rear.width):left+body.width;
     const top=Math.min(body.y,rear?.y??0);
     ctx.strokeStyle='#ffe08a';ctx.lineWidth=2;
     ctx.strokeRect(x+minX-3,y+top-3,maxX-minX+6,-top+6);
    }
    ctx.fillStyle='#ffffff';ctx.fillRect(x-3,e.y-1,6,2);
   }
  }
  $('placements').replaceChildren();for(const e of items){const label=document.createElement('button');label.type='button';label.dataset.id=e.id;label.setAttribute('aria-pressed',String(e.id===selected));label.onclick=()=>{selected=e.id;$('editMode').value='move';render()};label.textContent=`${e.species}：(${e.x}, ${e.y})${assets[e.species].hover?` ／ 浮き ${assets[e.species].hover}px`:``}`;$('placements').append(label)}
  const chosen=items.find(e=>e.id===selected);$('selectionStatus').textContent=chosen?`選択：${chosen.species} (${chosen.x}, ${chosen.y})`:'選択なし';for(const id of ['focusSelected','replaceSelected','copySelected','flipSelected','deleteSelected','clearSelection'])$(id).disabled=!chosen;
  $('viewportCost').textContent=matchedSprites?'キャラは左右とも元PNG':decoded&&!cost.standard?'':viewportSummary(cost,profile);
  const placementCost=matchedSprites?'キャラは元PNGで表示':'矩形'+cost.total.toLocaleString('ja-JP')+'個（配置全体の合計）';
  $('status').textContent=`配置${items.length}体 ／ ${placementCost} ／ ${valid?'全個体の配置基準点が足場上':'足場外の配置あり'}`;$('undo').disabled=!(histories[n.id]?.length);$('redo').disabled=!(redos[n.id]?.length);
  if(liveView)$('status').textContent=liveError||('本編の敵配置 '+items.length+'体 ｜ '+placementCost);
  const diff=baselines[n.id]?comparePlacements(baselines[n.id],items):null;
  $('diffSummary').textContent=diff?`取得した本編配置との差分：追加${diff.added.length}・削除${diff.removed.length}・変更${diff.changed.length}・同じ${diff.unchanged}体`:'この地点の本編配置は未取得です。比較しても編集案は変わりません。';
  $('diffDetails').replaceChildren();
  const describe=e=>`${e.species} (${e.x}, ${e.y}) ${e.flip?'反転':'元の向き'}`;
  const line=text=>{const li=document.createElement('li');li.textContent=text;$('diffDetails').append(li)};
  if(diff){for(const e of diff.added)line(`追加 ${e.id}：${describe(e)}`);for(const e of diff.removed)line(`削除 ${e.id}：${describe(e)}`);for(const e of diff.changed){const names={species:'敵種',x:'横位置',y:'足場の高さ',flip:'向き'};line(`変更 ${e.id}［${e.fields.map(k=>names[k]).join('・')}］：${describe(e.before)} → ${describe(e.after)}`)}}
  nodePicker.update();positionEditor.update();
  const visuals=items.map(e=>{
   const a=placementArt(e),y=e.y-a.hover;
   const rear=a.rear&&{source:a.rear.source,top:y+a.rear.bottom-a.rear.height,bottom:y+a.rear.bottom};
   return {id:e.id,source:a.source,y,hover:a.hover,height:a.h,...(rear&&{rear})};
  });
  window.mapArt={diff,dirty,liveView,ready:true,node:n.id,nodeCount:nodes.size,camera,profile,count:items.length,selected,editMode:$('editMode').value,placements:structuredClone(items),visuals,grounded:valid,background:background.key,backgroundFallback:!mapped,backgroundState:background.state,backgroundFile:background.file,requestedDecodedBackground:preview?.file,decodedBackgroundFile:decoded,decodedBackgroundRectangles:decoded?tier:undefined};
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
  selected=null;
  const n=node(),camera=$('camera');
  camera.max=Math.max(0,n.width-960);
  camera.value=0;
  if(liveView){
   liveItems=[];liveError='';
   try{
    liveItems=liveNodeDraft(liveSource,graph,n.id,Object.keys(assets));
    if(liveItems.length && !liveItems.some(e=>e.x>=0 && e.x<960)){
     camera.value=Math.min(Number(camera.max),Math.max(0,liveItems[0].x-480));
    }
   }catch(error){liveError='本編配置を表示できません：'+error.message}
  }
  render();
 }
 $('node').onchange=select;$('editMode').onchange=render;
 $('clearSelection').onclick=()=>{selected=null;$('editMode').value='add';render()};
 $('focusSelected').onclick=()=>{
  const e=placements().find(e=>e.id===selected);if(!e)return;
  const a=placementArt(e),width=a.h*a.box[2]/a.box[3],flip=e.flip&&a===assets[e.species];
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
 $('loadLive').onclick=async()=>{const id=node().id;$('loadLive').disabled=true;try{const source=await json('content/enemy-spawns.json');if(node().id!==id)throw Error('地点が切り替わったため読み込みを中止しました。');const items=liveNodeDraft(source,graph,id,Object.keys(assets));if(Object.entries(drafts.nodes).reduce((sum,[key,list])=>sum+(key===id?0:list.length),items.length)>MAX_TOTAL_PLACEMENTS)throw Error('全地点の配置数の上限を超えます。');baselines[id]=structuredClone(items);remember(id);drafts.nodes[id]=items;render();$('fileStatus').textContent='この地点の本編配置を編集案にコピーしました。取り消すと直前の案に戻ります。';}catch(e){$('fileStatus').textContent='読み込み中止：'+e.message+' 編集中の案は保持しています。';}finally{$('loadLive').disabled=false}};
 $('compareLive').onclick=async()=>{const id=node().id;$('compareLive').disabled=true;try{const source=await json('content/enemy-spawns.json');const baseline=liveNodeDraft(source,graph,id,Object.keys(assets));baselines[id]=baseline;render();$('fileStatus').textContent='本編配置を取得しました。同じ個体IDで比較しています。編集案は変更していません。';}catch(e){$('fileStatus').textContent='比較の取得失敗：'+e.message+' 編集案と前回の比較基準を保持しています。';}finally{$('compareLive').disabled=false}};
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
}catch(e){$('status').textContent='読み込みに失敗しました: '+e.message;throw e}
