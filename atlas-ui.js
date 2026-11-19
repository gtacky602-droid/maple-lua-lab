const groupNames = {
 main: '通常地域', high_level_branch: '高難度地域', hidden_world: '隠し世界', official_layer: '別地図',
};
const entries = value => Array.isArray(value) ? value : [];

export function initAtlas(action, clearKeys) {
 const open = document.getElementById('atlasOpen');
 const dialog = document.getElementById('worldAtlas');
 const close = document.getElementById('atlasClose');
 const current = document.getElementById('atlasCurrent');
 const back = document.getElementById('atlasWorld');
 const region = document.getElementById('atlasRegion');
 const layer = document.getElementById('atlasLayer');
 const canvas = document.getElementById('atlasCanvas');
 const search = document.getElementById('atlasSearch');
 const field = document.getElementById('atlasField');
 const title = document.getElementById('atlasPlaceName');
 const level = document.getElementById('atlasPlaceLevel');
 const routes = document.getElementById('atlasRoutes');
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
 field.onchange = () => choose(field.value);
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
  const matches = entries(view.points).filter(({name,level}) =>
   !query || (name + (level ? ' Lv' + level : '')).normalize('NFKC').toLowerCase().includes(query));
  field.replaceChildren(new Option(matches.length ? '地点を選ぶ' : '該当する地点なし', ''),
   ...matches.map(item => new Option(item.name + (item.level ? ' ｜ Lv' + item.level : ''), item.id)));
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

 function renderSelection() {
  const selected = view.selected;
  const area = view.options.find(item => item.id === view.region);
  title.textContent = selected?.name ?? area?.name ?? 'テイワット全域';
  level.textContent = selected?.mode === 'draft' ? [
   selected.level ? `設計推奨Lv${selected.level}` : '推奨Lv未設定',
   selected.review === 'needs_entrance_review' ? '入口・階層の照合待ち' : '接続案を検証中',
  ].join(' ｜ ')
   : selected ? [
    selected.current ? '現在地' : selected.visited ? '訪問済み' : '未訪問',
    '通行Lv' + selected.level,
    selected.provisional ? '試作区画' : '',
    selected.recommended && selected.recommended !== selected.level ? '設計推奨Lv' + selected.recommended : '',
   ].filter(Boolean).join(' ｜ ') : area ? `設計推奨Lv${area.low}〜${area.high}` : '地域を選ぶと周辺のフィールドを確認できます';
  const links = entries(view.routes).map(route => {
   const li = document.createElement('li');
   const button = document.createElement('button');
   button.textContent = `${route.name} ｜ ${route.label}・Lv${route.level}${route.restricted ? '・依頼条件あり' : ''}`;
   button.onclick = () => {
    if (route.region && route.region !== view.region) send('world_map_region:' + route.region);
    else if (route.draft) send('world_map_layer:all');
    send('world_map_select:' + route.id);
   };
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
  layer.disabled = view.region === 'world';
  layer.value = view.layer;
  renderRegions();
  renderFields();
  renderSelection();
  draw();
 };
}
