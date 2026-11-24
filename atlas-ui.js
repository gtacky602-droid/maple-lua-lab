const groupNames = {
 main: '通常地域', high_level_branch: '高難度地域', hidden_world: '隠し世界', official_layer: '別地図',
};
const bossKinds = {normal:'通常ボス', weekly:'週ボス', stygian:'幽境'};
const entries = value => Array.isArray(value) ? value : [];

export function initAtlas(action, clearKeys) {
 const open = document.getElementById('atlasOpen');
 const dialog = document.getElementById('worldAtlas');
 const close = document.getElementById('atlasClose');
 const current = document.getElementById('atlasCurrent');
 const back = document.getElementById('atlasWorld');
 const region = document.getElementById('atlasRegion');
 const layer = document.getElementById('atlasLayer');
 const huntLayer = layer.querySelector('option[value="hunt"]');
 const huntLegend = document.getElementById('atlasHuntLegend');
 const bossLayer = layer.querySelector('option[value="boss"]');
 const bossLegend = document.getElementById('atlasBossLegend');
 const localLayers = layer.querySelectorAll('option[value="surface"],option[value="below"],option[value="water"],option[value="review"]');
 const canvas = document.getElementById('atlasCanvas');
 const search = document.getElementById('atlasSearch');
 const field = document.getElementById('atlasField');
 const title = document.getElementById('atlasPlaceName');
 const level = document.getElementById('atlasPlaceLevel');
 const routes = document.getElementById('atlasRoutes');
 const itinerary = document.getElementById('atlasItinerary');
 const itineraryTitle = document.getElementById('atlasItineraryTitle');
 const itineraryNote = document.getElementById('atlasItineraryNote');
 const itineraryStops = document.getElementById('atlasItineraryStops');
 const ctx = canvas.getContext('2d');
 let view, signature, regionSignature;

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
 current.onclick = () => send('world_map_here');
 field.onchange = () => {
  if (view.region === 'world' && view.layer === 'boss' && field.value) send('world_map_boss:' + field.value);
  else choose(field.value);
 };
 search.oninput = renderFields;

 function choose(id) {
  if (id) send((view.region === 'world' ? 'world_map_region:' : 'world_map_select:') + id);
 }
 canvas.addEventListener('click', event => {
  if (!view) return;
  const box = canvas.getBoundingClientRect();
  const x = (event.clientX - box.left) * canvas.width / box.width;
  const y = (event.clientY - box.top) * canvas.height / box.height;
  let closest, distance = view.region === 'world' ? 56 : 17;
  for (const point of entries(view.points)) {
   const d = Math.hypot(x - point.x, y - point.y);
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
  const matches = entries(globalBosses ? view.bosses : view.points).filter(({name,level,boss,area}) =>
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
  const next = view.options.map(item => item.id).join(',');
  if (next !== regionSignature) {
   regionSignature = next;
   const groups = new Map();
   for (const item of view.options) {
    if (!groups.has(item.kind)) {
     const group = document.createElement('optgroup');
     group.label = groupNames[item.kind] ?? '地域';
     groups.set(item.kind, group);
    }
    groups.get(item.kind).append(new Option(item.name, item.id));
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
  itineraryNote.textContent = guide?.reason ?? (guide?.status === 'unknown' ? '現在地からの経路を確認できません。'
   : arriving && guide.paused ? '地図を閉じると移動を再開します。'
   : guide?.battle ? '地図を閉じて戦闘を進めてください。' : '');
  itineraryNote.hidden = !itineraryNote.textContent;
  itineraryStops.replaceChildren(...stops.map(stop => {
   const li = document.createElement('li');
   const button = document.createElement('button');
   const details = [stop.label, stop.reason, stop.hint].filter(Boolean);
   button.textContent = `${stop.name} ｜ ${details.join('・')}`;
   button.onclick = () => showPlace(stop);
   li.append(button);
   return li;
  }));
 }

 function renderSelection() {
  const selected = view.selected;
  const area = view.options.find(item => item.id === view.region);
  title.textContent = selected?.boss?.name ?? selected?.name ?? area?.name ?? 'テイワット全域';
  level.textContent = selected?.mode === 'draft' ? [
   selected.level ? `設計推奨Lv${selected.level}` : '推奨Lv未設定',
   selected.review === 'needs_entrance_review' ? '入口・階層の照合待ち' : '接続案を検証中',
  ].join(' ｜ ')
   : selected ? [
    selected.current ? '現在地' : selected.visited ? (selected.waypoint ? 'ワープ登録済み' : '訪問済み') : '未訪問',
    '通行Lv' + selected.level,
    selected.battleScene && '戦闘中に入る区画',
    selected.boss && bossKinds[selected.boss.kind],
    selected.boss && selected.boss.name !== selected.name && selected.name,
    selected.boss?.kind === 'stygian' && '受付で難度を選ぶ',
    selected.entrancePending ? '試作の見晴らし場・原作入口は照合中' :
      selected.huntKind === 'elite' ? '任意戦' : selected.huntKind ? '狩場' : '',
    selected.provisional && !selected.entrancePending && '試作区画',
    selected.huntLevels?.length ? '脇道の狩場は' + selected.huntLevels.map(level => 'Lv' + level).join('・') :
      selected.recommended && selected.recommended !== selected.level ? '設計推奨Lv' + selected.recommended : '',
   ].filter(Boolean).join(' ｜ ') : area ? `設計推奨Lv${area.low}〜${area.high}` : '地域を選ぶと周辺のフィールドを確認できます';
  const links = entries(view.routes).map(route => {
   const li = document.createElement('li');
   const button = document.createElement('button');
   const kind = route.huntKind === 'elite' ? '任意戦・' : route.huntKind ? '狩場・' : '';
   const level = route.level != null && route.reason !== `必要Lv${route.level}` && `Lv${route.level}`;
   const details = [kind + route.label, level, route.reason].filter(Boolean);
   button.textContent = `${route.name} ｜ ${details.join('・')}`;
   button.onclick = () => showPlace(route);
   li.append(button);
   return li;
  });
  routes.replaceChildren(...links);
 }

 function draw() {
  for (const command of view.draws) {
   ctx.fillStyle = command.color;
   if (command.kind === 'rect') ctx.fillRect(command.x, command.y, command.w, command.h);
   else if (command.kind === 'poly') {
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
    ctx.lineWidth = command.width;
    ctx.setLineDash(command.dash ?? []);
    ctx.moveTo(command.x,command.y);
    ctx.lineTo(command.toX,command.toY);
    ctx.stroke();
   } else if (command.kind === 'label') {
    ctx.font = `700 ${command.size}px "Yu Gothic UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#f3e0b3';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.strokeText(command.text,command.x,command.y);
    ctx.fillText(command.text,command.x,command.y);
   }
  }
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
  view = frame.worldMap;
  if (!dialog.open) {
   dialog.showModal();
   search.value = '';
  }
  const next = `${view.region}/${view.revision}`;
  if (next === signature) return;
  signature = next;
  if (canvas.width !== view.width) canvas.width = view.width;
  if (canvas.height !== view.height) canvas.height = view.height;
  current.textContent = '現在地へ';
  current.title = view.location;
  back.disabled = view.region === 'world';
  const overview = view.region === 'world';
  for (const option of localLayers) option.hidden = option.disabled = overview;
  huntLayer.hidden = !view.hasHunts;
  huntLayer.disabled = !view.hasHunts;
  huntLegend.hidden = !view.hasHunts || view.layer === 'boss';
  bossLayer.hidden = bossLayer.disabled = !view.hasBosses;
  bossLegend.hidden = overview || !entries(view.points).some(point => point.boss);
  layer.value = view.layer;
  renderRegions();
  renderFields();
  renderSelection();
  renderItinerary();
  draw();
 };
}
