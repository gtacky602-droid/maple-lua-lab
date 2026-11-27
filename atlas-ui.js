import {questDestinations,stopTiming,windTiming} from './quest-route.js';
import {entranceKey} from './arena-entrances.js';
import {atlasQuestObjectives,questStatus,questStatusLabels} from './quest-journal.js';
import {backgroundMeasurements} from './scenery-measurements.js';
import {atlasCamera,atlasZoomMax} from './atlas-camera.js';

const groupNames = {
 main: '通常地域', high_level_branch: '高難度地域', hidden_world: '隠し世界', official_layer: '別地図',
};
const bossKinds = {normal:'通常ボス', weekly:'週ボス', stygian:'幽境', legend:'地方伝説'};
function fieldLabel(place) {
 if (place.pocketRole === 'rare_pocket') return '任意戦・希少遭遇';
 if (place.pocketRole === 'optional_elite') return '任意戦・精鋭';
 return place.huntKind === 'elite' ? '任意戦' : place.huntKind ? '狩場' : place.questField ? '依頼の進行地点' : '';
}
const entries = value => Array.isArray(value) ? value : [];

export function initAtlas(action, clearKeys) {
 const open = document.getElementById('atlasOpen');
 const dialog = document.getElementById('worldAtlas');
 const close = document.getElementById('atlasClose');
 const current = document.getElementById('atlasCurrent');
 const back = document.getElementById('atlasWorld');
 const region = document.getElementById('atlasRegion');
 const progress = document.getElementById('atlasRegionProgress');
 const layer = document.getElementById('atlasLayer');
 const huntLayer = layer.querySelector('option[value="hunt"]');
 const huntLegend = document.getElementById('atlasHuntLegend');
 const rareLegend = document.getElementById('atlasRareLegend');
 const bossLayer = layer.querySelector('option[value="boss"]');
 const bossLegend = document.getElementById('atlasBossLegend');
 const localLayers = layer.querySelectorAll('option[value="surface"],option[value="below"],option[value="water"],option[value="review"]');
 const canvas = document.getElementById('atlasCanvas');
 const search = document.getElementById('atlasSearch');
 const field = document.getElementById('atlasField');
 const visits = document.getElementById('atlasVisits');
 const visitsLabel = document.getElementById('atlasVisitsLabel');
 const visitsCount = document.getElementById('atlasVisitsCount');
 const title = document.getElementById('atlasPlaceName');
 const level = document.getElementById('atlasPlaceLevel');
 const compare = document.getElementById('atlasBackgroundCompare');
 const bossCompare = document.getElementById('atlasBossCompare');
 const fieldGuide = document.getElementById('atlasFieldEnemyGuide');
 const routes = document.getElementById('atlasRoutes');
 const itinerary = document.getElementById('atlasItinerary');
 const itineraryTitle = document.getElementById('atlasItineraryTitle');
 const itineraryNote = document.getElementById('atlasItineraryNote');
 const itineraryStops = document.getElementById('atlasItineraryStops');
 const ctx = canvas.getContext('2d');
 const viewTools = document.getElementById('atlasViewTools');
 const zoomIn = document.getElementById('atlasZoomIn');
 const zoomOut = document.getElementById('atlasZoomOut');
 const zoomReset = document.getElementById('atlasZoomReset');
 const fitRoute = document.getElementById('atlasFitRoute');
 let view, signature, regionSignature, localRoute = [], pendingDraw;
 let reportedRooms=new Set();
 const camera = atlasCamera(canvas, () => {
  renderZoom();
  requestDraw();
 });
 const resize = new ResizeObserver(requestDraw);
 resize.observe(canvas);

 function requestDraw() {
  if (pendingDraw || !view || !dialog.open) return;
  pendingDraw = requestAnimationFrame(() => {
   pendingDraw = undefined;
   if (view && dialog.open) draw();
  });
 }

 function renderZoom() {
  zoomOut.disabled = zoomReset.disabled = camera.scale === 1;
  zoomIn.disabled = camera.scale >= atlasZoomMax;
  const percent = Math.round(camera.scale * 100);
  if (zoomReset.textContent !== percent + '%') {
   zoomReset.textContent = percent + '%';
   zoomReset.setAttribute('aria-label',`現在の倍率 ${percent}パーセント。100パーセントに戻す`);
  }
  canvas.classList.toggle('zoomed',camera.scale > 1);
 }

 function updateViewTools() {
  viewTools.hidden = view.region === 'world';
  const routeIds = new Set(entries(view.guide?.stops).flatMap(stop => [stop.from,stop.id]));
  localRoute = entries(view.points).filter(point => routeIds.has(point.id));
  fitRoute.disabled = !view.selected;
  fitRoute.textContent = localRoute.length > 1 ? '道順を拡大' : '地点を拡大';
  renderZoom();
 }

 zoomIn.onclick = () => camera.zoom(camera.scale * 1.45);
 zoomOut.onclick = () => camera.zoom(camera.scale / 1.45);
 zoomReset.onclick = () => camera.reset();
 fitRoute.onclick = () => {
  if (view?.selected) camera.focus(localRoute.length > 1 ? localRoute : [view.selected]);
 };
 canvas.addEventListener('wheel', event => {
  if (!view || viewTools.hidden || !event.deltaY) return;
  const factor = event.deltaY < 0 ? 1.18 : 1/1.18;
  if (camera.zoom(camera.scale * factor,camera.localPoint(event))) event.preventDefault();
 }, {passive:false});

 function send(key) {
  clearKeys();
  action(key);
 }
 open.onclick = () => send('world_map_toggle');
 close.onclick = () => send('world_map_close');
 dialog.addEventListener('cancel', event => {
  event.preventDefault();
  send('world_map_close');
 });
 window.addEventListener('keydown', event => {
  if (event.code === 'Escape' && dialog.open && event.target === search) {
   event.preventDefault();
   event.stopImmediatePropagation();
   if (!event.repeat) send('world_map_close');
   return;
  }
  if (event.code !== 'KeyM' || event.repeat || open.disabled ||
      event.target instanceof Element && event.target.matches('input,textarea,[contenteditable]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  send('world_map_toggle');
 }, {capture:true});
 back.onclick = () => send('world_map_region:world');
 region.onchange = () => send('world_map_region:' + region.value);
 layer.onchange = () => send('world_map_layer:' + layer.value);
 current.onclick = () => {
  const point = entries(view?.points).find(item => item.current);
  if (point && camera.scale>1) camera.panTo(point);
  send('world_map_here');
 };
 field.onchange = () => {
  if (view.region === 'world' && view.layer === 'boss' && field.value) send('world_map_boss:' + field.value);
  else choose(field.value);
 };
 search.oninput = renderFields;
 visits.onchange = renderFields;

 function choose(id) {
  if (id) send((view.region === 'world' ? 'world_map_region:' : 'world_map_select:') + id);
 }
 canvas.addEventListener('click', event => {
  if (!view || camera.dragged) return;
  const {x,y} = camera.localPoint(event);
  let closest, distance = view.region === 'world' ? 56 : Math.max(17, 12 * canvas.width / canvas.clientWidth);
  for (const point of entries(view.points)) {
   const pin = camera.project(point);
   const d = Math.hypot(x - pin.x, y - pin.y);
   if (d < distance) {
    closest = point;
    distance = d;
   }
  }
  if (closest) choose(closest.id);
 });

 function renderFields() {
  const query = search.value.normalize('NFKC').trim().toLowerCase();
  const byBoss = view.layer === 'boss';
  const globalBosses = byBoss && view.region === 'world';
  const local = view.region !== 'world' && view.layer !== 'review';
  visitsLabel.hidden = visitsCount.hidden = !local;
  const points = entries(globalBosses ? view.bosses : view.points);
  const visited = points.filter(item => item.visited).length;
  visitsCount.textContent = local ? '表示中の層　訪問済み '+visited+' ／ '+points.length : '';
  const matches = points.filter(item => !local || visits.value === 'all' || Boolean(item.visited) === (visits.value === 'visited')).filter(({name,level,boss,area}) =>
   !query || [name + (level ? ' Lv' + level : ''),boss?.name,...entries(boss?.aliases),area]
    .filter(Boolean).some(value => value.normalize('NFKC').toLowerCase().includes(query)));
  const prompt = matches.length ? (byBoss ? 'ボスを選ぶ' : '地点を選ぶ') : '該当する地点なし';
  field.replaceChildren(new Option(prompt, ''), ...matches.map(item => {
   const name = item.boss?.name ?? item.name;
   const detail = globalBosses ? item.area : name !== item.name ? item.name : '';
   return new Option([name,detail,item.level && 'Lv' + item.level].filter(Boolean).join(' ｜ '), item.id);
  }));
  field.value = matches.some(item => item.id === view.selected?.id) ? view.selected.id : '';
 }

 function renderRegions() {
  const next = view.options.map(item => [item.id,item.visited,item.total].join(':')).join(',');
  if (next !== regionSignature) {
   regionSignature = next;
   const groups = new Map();
   for (const item of view.options) {
    if (!groups.has(item.kind)) {
     const group = document.createElement('optgroup');
     group.label = groupNames[item.kind] ?? '地域';
     groups.set(item.kind, group);
    }
    groups.get(item.kind).append(new Option(`${item.name}（${item.visited}／${item.total}）`, item.id));
   }
   region.replaceChildren(new Option('テイワット全域', 'world'), ...groups.values());
  }
  region.value = view.region;
 }

 function showPlace(place) {
  if (place.region && place.region !== view.region) send('world_map_region:' + place.region);
  else if (view.layer !== 'all' && !entries(view.points).some(point => point.id === place.id))
   send('world_map_layer:all');
  send('world_map_select:' + place.id);
 }

 function renderItinerary() {
  const guide = view.guide;
  const stops = entries(guide?.stops);
  itinerary.hidden = !guide || guide.status === 'here';
  itinerary.open = !itinerary.hidden;
  const arriving = guide?.status === 'arriving';
  itineraryTitle.textContent = (arriving ? 'この地点へ移動中' : guide?.afterTransfer ? '移動完了後の道順' : '現在地からの道順') +
    (stops.length ? ` ｜ ${stops.length}区間` : '');
  itineraryNote.textContent = guide?.requiredLevel ? `この道順はLv${guide.requiredLevel}から通れます。`
   : guide?.reason ?? (guide?.status === 'unknown' ? '現在地からの経路を確認できません。'
   : arriving && guide.paused ? '地図を閉じると移動を再開します。'
   : stops[0]?.secondsRemaining != null || stops[0]?.stopWindow ? '地図を閉じると移動を再開します。'
   : stops[0]?.wind ? '地図を閉じると風の時間が進みます。'
   : guide?.battle ? '地図を閉じて戦闘を進めてください。' : '');
  itineraryNote.hidden = !itineraryNote.textContent;
  const barrier=document.getElementById('atlasFirstBlocked');
  const blockedAt=guide?.status==='blocked'?stops.findIndex(stop=>stop.reason):-1;
  barrier.hidden=blockedAt<0;
  barrier.replaceChildren();
  if(blockedAt>=0){
   const stop=stops[blockedAt],lastReachable=stops[blockedAt-1];
   const from=lastReachable?.name??(guide.afterTransfer?'移動先':view.location);
   const description=document.createElement('p');
   description.textContent=`最初に通れない入口　${from} → ${stop.name}（${stop.reason}）`;
   barrier.append(description);
   if(lastReachable){
    const detour=document.createElement('button');
    detour.type='button';detour.textContent=lastReachable.name+'までの道順を見る';
    detour.onclick=()=>showPlace(lastReachable);
    barrier.append(detour);
   }
   appendGateLink(barrier,stop.from,stop);
  }
  itineraryStops.replaceChildren(...stops.map(stop => {
   const li = document.createElement('li');
   const button = document.createElement('button');
   const timing = stop.secondsRemaining != null ? `到着まで ${Math.ceil(stop.secondsRemaining)}秒` : stop.hint;
   const details = [stop.approach, stop.label, stop.level && `必要Lv${stop.level}`, stop.reason!==`必要Lv${stop.level}` && stop.reason, timing, stop.stopWindow && stopTiming(stop.stopWindow), stop.wind && windTiming(stop.wind), stop.automaticArrival && '到着後に自動で移動'].filter(Boolean);
   button.textContent = `${stop.name} ｜ ${details.join('・')}`;
   button.onclick = () => showPlace(stop);
   li.append(button);appendGateLink(li,stop.from,stop);
   return li;
  }));
 }

 function fixtureState(route){
  return route.sealState || (route.routeFixture ? (route.reason?'closed':'open') : null);
 }

 function appendGateLink(item,from,route){
  if(route.mode==='battle'){
   const link=document.createElement('a');
   link.href='map-art.html?'+new URLSearchParams({node:route.id,placements:'live'});
   link.target='_blank';link.rel='noopener';
   link.textContent=route.name+'の配置を見る';
   item.append(' ',link);
   return;
  }
  if(route.automaticArrival){
   const link=document.createElement('a');
   const params=new URLSearchParams({node:route.id,voyage:from,placements:'live'});
   if(reportedRooms.has(route.id))params.set('phase','after');
   link.href='map-art.html?'+params;link.target='_blank';link.rel='noopener';
   link.textContent=route.name+'の到着位置を見る';
   item.append(' ',link);
   return;
  }
  if(route.previewX==null)return;
  const link=document.createElement('a');
  const params=new URLSearchParams({node:from,to:route.id,gateX:route.previewX,gateY:route.previewY??480,placements:'live',compare:'background'});
  if(reportedRooms.has(from))params.set('phase','after');
  if(reportedRooms.has(route.id))params.set('afterArrival',route.id);
  const fixture=fixtureState(route);
  if(fixture)params.set('fixture',fixture);
  link.href='map-art.html?'+params;
  link.target='_blank';link.rel='noopener';
  link.textContent='入口を見る';link.setAttribute('aria-label',(route.sourceName?route.sourceName+'から':'')+route.name+'へ向かう入口を見る（別タブ）');
  item.append(' ',link);
 }

 function renderSelection(frame) {
  const selected = view.selected;
  const approach=document.getElementById('atlasApproachGate');
  const gate=selected?.approachGate;
  approach.replaceChildren();
  approach.hidden=!gate;
  if(gate){
   const focus=document.createElement('button');
   focus.type='button';focus.textContent=gate.sourceName+'までの道順';
   focus.onclick=()=>send('world_map_focus:'+gate.from);
   const label=gate.label??gate.sourceName+'から'+gate.name+'へ';
   approach.append(label+(gate.reason?'（'+gate.reason+'）':''),' ',focus);
   appendGateLink(approach,gate.from,gate);
  }
  const objectives=[],commissions=[];
  if(selected && frame.storyGraph){
   const challenge=selected.boss?.challenge;
   const quests=frame.story.quests;
   for(const q of frame.storyGraph.quests){
    const battle=challenge&&q.itinerary?.find(step=>step.kind==='boss'&&step.boss===challenge&&step.node===selected.id);
    const commission=challenge&&q.kind==='boss'&&q.target===challenge;
    const access=selected.boss?.accessQuests?.includes(q.id);
    if((battle||commission||access)&&(!q.legacyOnly||quests?.[q.id])){
     const progress=quests?.[q.id];
     const status=questStatus(q,progress,quests,frame.progression?.level??0,frame.growthEligibility);
     const hub=frame.storyGraph.nodes.find(n=>n.id===q.hub);
     const item=document.createElement('li');
     item.textContent=q.name+' ｜ '+questStatusLabels[status]+(q.level?' ｜ 受注Lv'+q.level:'')+(access?' ｜ 入口に関わる依頼':'');
     const route=document.createElement('button');
     route.type='button';route.textContent=(hub?.name??q.hub)+'までの道順';
     route.onclick=()=>send('world_map_focus:'+q.hub);
     const objective=(status==='active'?q.itinerary?.[progress.count]?.objective:null)??battle?.objective;
     if(objective){
      const goal=document.createElement('p');
      goal.textContent=objective;
      item.append(goal);
     }
     if(status==='active'){
      const {candidates}=questDestinations(frame,q,status,selected.id);
      for(const id of new Set(candidates)){
       const destination=frame.storyGraph.nodes.find(n=>n.id===id);
       if(!destination||id===q.hub)continue;
       const next=document.createElement('button');
       next.type='button';next.textContent='次の目的地・'+destination.name;
       next.onclick=()=>send('world_map_focus:'+id);
       item.append(' ',next);
      }
     }
     item.append(' ',route);commissions.push(item);
    }
    for(const objective of atlasQuestObjectives(frame,q,selected.id)){
     const item=document.createElement('li');
     item.textContent=q.name+'　'+objective.text;
     for(const point of objective.points){
      if(point.subject && selected.absentSpawns?.includes(point.subject))continue;
      const link=document.createElement('a');
      const url=new URL(point.url,location.href);
      for(const id of selected.absentSpawns??[])url.searchParams.append('absent',id);
      link.href=url.href;link.target='_blank';link.rel='noopener';
      link.textContent=point.label+'の位置を見る';
      item.append(' ',link);
      if(point.approachHint)item.append('（'+point.approachHint+'）');
     }
     objectives.push(item);
    }
   }
  }
  const commissionPanel=document.getElementById('atlasBossCommissions');
  commissionPanel.hidden=!commissions.length;
  commissionPanel.querySelector('ul').replaceChildren(...commissions);
  document.getElementById('atlasQuestObjectives').replaceChildren(...objectives);
  document.getElementById('atlasStoryQuests').hidden=!objectives.length;
  const dailies=entries(selected?.dailyQuests);
  const daily=document.getElementById('atlasDaily');
  daily.hidden=!dailies.length;
  document.getElementById('atlasDailyLinks').replaceChildren(...dailies.map(q=>{
   const item=document.createElement('li'),link=document.createElement('a');
   link.href='daily-field-guide.html?'+new URLSearchParams({quest:q.id});
   link.target='_blank';link.rel='noopener';link.textContent=q.name;
   item.append(q.role==='hub'?'受付・報告（'+q.giver+'）　':'対象の敵が出現　',link);
   if(q.untilQuestClear){
    const availability=document.createElement('p');
    availability.textContent='「'+q.untilQuestClear+'」を進めると、この地点での討伐機会が終了します。';
    item.append(availability);
   }
   function placementLink(ids,name,label){
    const params=new URLSearchParams({node:selected.id,placements:'live',dailyName:name});
    for(const id of ids)params.append('target',id);
    for(const id of selected.absentSpawns??[])params.append('absent',id);
    if(selected.afterReport)params.set('phase','after');
    const preview=document.createElement('a');
    preview.href='map-art.html?'+params;preview.target='_blank';preview.rel='noopener';
    preview.textContent=label;preview.setAttribute('aria-label',name+'　'+label);
    return preview;
   }
   if(q.targets?.length)item.append('　',placementLink(q.targets,q.name,'対象'+q.targets.length+'体の配置を比較'));
   if(q.observations?.length){
    const list=document.createElement('ul');
    for(const group of q.observations){
     const row=document.createElement('li');
     const status=group.recorded==null?'':group.recorded?'（記録済み）':'（未記録）';
     row.append(group.name+status);
     if(group.targets?.length)row.append('　',placementLink(group.targets,q.name+'・'+group.name+status,'出現位置を見る'));
     list.append(row);
    }
    item.append(list);
   }
   return item;
  }));
  fieldGuide.hidden = !selected?.fieldEnemyCount;
  if (fieldGuide.hidden) fieldGuide.removeAttribute('href');
  else {
   const query=new URLSearchParams({node:selected.id});
   for(const [id,count] of Object.entries(selected.entrySpecies??{}))query.append('entry',id+':'+count);
   for(const id of selected.absentSpawns??[])query.append('absent',id);
   if(selected.entryQuest)query.set('quest',selected.entryQuest);
   fieldGuide.href = 'field-enemy-guide.html?' + query;
   fieldGuide.textContent = selected.entryEnemyCount===selected.fieldEnemyCount || selected.entryEnemyCount==null
    ? '通常敵の配置とドット絵を見る（'+selected.fieldEnemyCount+'体）'
    : '通常敵の配置とドット絵を見る（今入ると'+selected.entryEnemyCount+'体／全配置'+selected.fieldEnemyCount+'体）';
  }
  const measured = Object.hasOwn(backgroundMeasurements, selected?.id);
  compare.hidden = !measured && !selected?.boss?.placementPreview;
  compare.textContent = measured ? 'この地点の背景を比較（別タブ）' : 'この地点のドット絵を比較（別タブ）';
  if (compare.hidden) compare.removeAttribute('href');
  else {
   const params=new URLSearchParams({node:selected.id,placements:'live'});
   if(measured)params.set('compare','background');
   if(selected.afterReport)params.set('phase','after');
   for(const id of selected.absentSpawns??[])params.append('absent',id);
   compare.href='map-art.html?'+params;
  }
  bossCompare.hidden = !measured || !selected?.boss?.placementPreview;
  if (bossCompare.hidden) bossCompare.removeAttribute('href');
  if (selected?.boss?.placementPreview) {
   const artLink = measured ? bossCompare : compare;
   const params=new URLSearchParams({node:selected.id,placements:'live',background:'original',profile:'h32c16'});
   if(selected.afterReport)params.set('phase','after');
   artLink.href='map-art.html?'+params;
   artLink.textContent = selected.boss.name + 'の開幕配置を比較（別タブ）';
  }
  const area = view.options.find(item => item.id === view.region);
  title.textContent = selected?.boss?.name ?? selected?.name ?? area?.name ?? 'テイワット全域';
  level.textContent = selected?.mode === 'draft' ? [
   selected.level ? `設計推奨Lv${selected.level}` : '推奨Lv未設定',
   selected.review === 'needs_entrance_review' ? '入口・階層の照合待ち' : '接続案を検証中',
  ].join(' ｜ ')
   : selected ? [
    selected.current ? '現在地' : selected.visited ? (selected.waypoint ? 'ワープ登録済み' : '訪問済み') : '未訪問',
    '通行Lv' + selected.level,
    selected.layer === 'below' && '地下・別階層',
    selected.layer === 'water' && '水中',
    selected.battleScene && '戦闘中に入る区画',
    selected.boss && bossKinds[selected.boss.kind],
    selected.boss && selected.boss.name !== selected.name && selected.name,
    selected.boss?.kind === 'stygian' && '受付で難度を選ぶ',
    selected.entrancePending ? '試作の見晴らし場・原作入口は照合中' :
      fieldLabel(selected),
    selected.provisional && !selected.entrancePending && '試作区画',
    selected.huntLevels?.length ? '脇道の狩場は' + selected.huntLevels.map(level => 'Lv' + level).join('・') :
      selected.recommended && selected.recommended !== selected.level ? '設計推奨Lv' + selected.recommended : '',
   ].filter(Boolean).join(' ｜ ') : area ? `設計推奨Lv${area.low}〜${area.high}` : '地域を選ぶと周辺のフィールドを確認できます';
  const entrancePanel = document.getElementById('atlasBossEntrances');
  const entrances = entries(selected?.entrances);
  const poseLink=document.getElementById('atlasBossPoses');
  poseLink.hidden=!selected?.boss?.placementPreview;
  if(poseLink.hidden)poseLink.removeAttribute('href');
  else if(selected.boss.kind==='stygian'){
   poseLink.textContent='開幕の元絵・32色・16色を並べる（別タブ）';
   poseLink.href='map-art.html?'+new URLSearchParams({node:selected.id,placements:'live',background:'original'})+'#stygianPoses';
  }else{
   poseLink.textContent='この会場の姿と入口を見る（別タブ）';
   const query=new URLSearchParams({group:selected.boss.kind==='weekly'?'weekly':'field',node:selected.id,
    visit:selected.id,pixels:'1'});
   if(selected.afterReport)query.set('phase','after');
   for(const gate of entrances){
    const key=entranceKey(gate.from,gate.previewX,gate.previewY);
    query.append('gate',key);
    const fixture=fixtureState(gate);
    if(fixture)query.append(fixture,key);
    if(reportedRooms.has(gate.from))query.append('afterGate',key);
   }
   poseLink.href='weekly-poses.html?'+query;
  }
  entrancePanel.hidden = !entrances.length;
  entrancePanel.querySelector('ul').replaceChildren(...entrances.map(gate => {
   const li = document.createElement('li');
   const button = document.createElement('button');
   button.textContent = gate.sourceName + 'までの道順';
   button.onclick = () => send('world_map_focus:' + gate.from);
   li.append(button, ' ' + [gate.requiredLevel && '必要Lv'+gate.requiredLevel,gate.hint,gate.reason].filter(Boolean).join('・'));
   appendGateLink(li,gate.from,gate);
   return li;
  }));
  const links = entries(view.routes).map(route => {
   const li = document.createElement('li');
   const button = document.createElement('button');
   const kind = fieldLabel(route);
   const gate = route.entryHeight != null && (route.entryHeight < 480 ? '上の足場の門' : '地上の門');
   const level = route.level != null && route.reason !== `必要Lv${route.level}` && `Lv${route.level}`;
   const visit = route.visited === undefined ? '' : route.visited ? '訪問済み' : '未訪問';
   const details = [visit, kind, route.label, level, gate, route.automaticArrival && '到着後に自動で移動', route.hint, route.boarding, route.stopWindow && stopTiming(route.stopWindow), route.wind && windTiming(route.wind), route.reason].filter(Boolean);
   button.textContent = `${route.name} ｜ ${details.join('・')}`;
   button.onclick = () => showPlace(route);
   li.append(button);appendGateLink(li,selected.id,route);
   return li;
  });
  routes.replaceChildren(...links);
 }

 function diamond(x,y,radius,color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x,y-radius);ctx.lineTo(x+radius,y);ctx.lineTo(x,y+radius);ctx.lineTo(x-radius,y);
  ctx.closePath();
  ctx.fill();
 }

 function draw() {
  const zoomed = camera.scale > 1;
  const traceRoute = zoomed && localRoute.length > 1;
  const ratio = canvas.width / canvas.clientWidth;
  const currentPoint = entries(view.points).find(point => point.current);
  const ink = Math.min(camera.scale,1.35) / camera.scale;
  ctx.setTransform(camera.scale,0,0,camera.scale,camera.left,camera.top);
  for (const command of view.draws) {
   ctx.fillStyle = command.color;
   if (command.kind === 'rect') ctx.fillRect(command.x, command.y, command.w, command.h);
   else if (command.kind === 'pin') {
    const {x,y,size,color,dot,onRoute,highlight} = command;
    const routeStop = traceRoute && onRoute && !highlight;
    const radius = (routeStop ? Math.max(6,size) : size) * ink;
    ctx.globalAlpha = traceRoute && !onRoute ? .46 : 1;
    diamond(x,y,radius+2*ink,'#273f4b');
    diamond(x,y,radius,routeStop ? '#ffe196' : color);
    if (dot) {
     ctx.fillStyle = '#f7e8ae';
     ctx.fillRect(x-ink,y-ink,3*ink,3*ink);
    }
    ctx.globalAlpha = 1;
   } else if (command.kind === 'poly') {
    ctx.beginPath();
    for (const [i, [x,y]] of command.points.entries()) {
     if (i) ctx.lineTo(x,y);
     else ctx.moveTo(x,y);
    }
    ctx.closePath();
    ctx.fill();
   } else if (command.kind === 'line') {
    ctx.beginPath();
    ctx.strokeStyle = command.color;
    ctx.lineWidth = command.width * ink;
    ctx.globalAlpha = traceRoute && command.context ? .24 : 1;
    ctx.setLineDash((command.dash ?? []).map(length => length * ink));
    ctx.moveTo(command.x,command.y);
    ctx.lineTo(command.toX,command.toY);
    ctx.stroke();
    ctx.globalAlpha = 1;
   } else if (command.kind === 'label') {
    ctx.save();
    let {x,y,size,text} = command;
    if (zoomed) {
     ctx.resetTransform();
     const pin = command.pinX == null ? camera.project(command) : camera.project({x:command.pinX,y:command.pinY});
     if (pin.x<0 || pin.y<0 || pin.x>canvas.width || pin.y>canvas.height) {
      ctx.restore();
      continue;
     }
     size = Math.max(size,13 * ratio);
     x = pin.x;
     let belowPin = command.y > command.pinY;
     if (command.currentPin) text = '現在地';
     if (currentPoint && view.selected && currentPoint.id !== view.selected.id &&
         Math.abs(currentPoint.y - view.selected.y) * camera.scale < size * 3.5) {
      belowPin = command.currentPin ? currentPoint.y > view.selected.y : view.selected.y >= currentPoint.y;
     }
     y = command.pinY == null ? pin.y : pin.y + (belowPin ? size*1.3 : -size*.55);
     y = Math.max(size,Math.min(canvas.height - 6,y));
    }
    ctx.font = `700 ${size}px "Yu Gothic UI", sans-serif`;
    const maxWidth = canvas.width - 24;
    if (zoomed) {
     const half = Math.min(maxWidth,ctx.measureText(text).width) / 2 + 10;
     x = Math.max(half,Math.min(canvas.width-half,x));
    }
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#f3e0b3';
    ctx.lineWidth = Math.max(4,size / 4);
    ctx.setLineDash([]);
    ctx.strokeText(text,x,y,maxWidth);
    ctx.fillText(text,x,y,maxWidth);
    ctx.restore();
   }
  }
  ctx.resetTransform();
 }

 return function update(frame) {
  open.hidden = !frame.story?.active;
  open.disabled = open.hidden || Boolean(frame.growthTrial);
  if (!frame.worldMap) {
   if (dialog.open) dialog.close();
   signature = undefined;
   view = undefined;
   return;
  }
  const lastRegion = view?.region, lastSelection = view?.selected?.id;
  view = frame.worldMap;
  if (!dialog.open) {
   dialog.showModal();
   search.value = '';
   visits.value = 'all';
  }
  const next = `${view.region}/${view.revision}`;
  if (next === signature) return;
  signature = next;
  if (canvas.width !== view.width) canvas.width = view.width;
  if (canvas.height !== view.height) canvas.height = view.height;
  if (lastRegion !== view.region) camera.reset();
  else if (view.selected && lastSelection !== view.selected.id) camera.reveal(view.selected);
  updateViewTools();
  current.textContent = '現在地へ';
  current.title = view.location;
  back.disabled = view.region === 'world';
  const overview = view.region === 'world';
  for (const option of localLayers) option.hidden = option.disabled = overview;
  huntLayer.hidden = !view.hasHunts;
  huntLayer.disabled = !view.hasHunts;
  huntLegend.hidden = !view.hasHunts || view.layer === 'boss';
  rareLegend.hidden = overview || !entries(view.points).some(point => point.pocketRole === 'rare_pocket');
  bossLayer.hidden = bossLayer.disabled = !view.hasBosses;
  bossLegend.hidden = overview || !entries(view.points).some(point => point.boss);
  layer.value = view.layer;
  const counts = view.progress;
  progress.textContent = counts ? [
   `訪問 ${counts.visited}／${counts.total}`,
   `依頼報告 ${counts.reported}／${counts.quests}`,
   `ボス討伐 ${counts.cleared}／${counts.bosses}`,
  ].join('　·　') : '';
  renderRegions();
  renderFields();
  reportedRooms=new Set(entries(frame.storyGraph?.nodes)
   .filter(n=>n.locationAfterReport && frame.story?.quests?.[n.locationAfterReport.quest]?.status==='complete')
   .map(n=>n.id));
  renderSelection(frame);
  renderItinerary();
  draw();
 };
}
