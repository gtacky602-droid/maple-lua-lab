export async function initWorldUI(action){
 const [map,coverage]=await Promise.all(['content/map-catalog.json','content/coverage.json'].map(async path=>{
  const response=await fetch(path);
  if(!response.ok)throw Error(path);
  return response.json();
 }));
 const host=document.getElementById('worldPanel');
 const intro=document.createElement('p');
 intro.textContent=`公式地図で確認したワープ ${map.counts.waypoints}・七天神像 ${map.counts.statues}。ラボで遊べる試作は ${coverage.main_route_summary.authored_stages} 地点。`;
 host.append(intro);
 const nav=document.createElement('div');
 nav.className='controls';
 for(const [label,key] of [['町（仮配置）','town'],['城外の狩場（仮配置）','field'],['依頼の討伐試験','arena'],['無相の風・2D試作','boss_anemo']]){
  const button=document.createElement('button');
  button.textContent=label;
  button.onclick=()=>{action('campaign');action(key);button.blur()};
  nav.append(button);
 }
 host.append(nav);
 const note=document.createElement('p');
 note.textContent='地図の点を選ぶと公式データのIDと座標を表示します。対応する2Dステージは地点ごとに制作予定です。';
 host.append(note);

 const controls=document.createElement('div');
 controls.className='controls';
 function select(label, items){
  const field=document.createElement('select');
  field.setAttribute('aria-label',label);
  for(const [name,value] of items)field.add(new Option(name,value));
  controls.append(field);
  return field;
 }
 const mapSelect=select('地図',map.maps.map(item=>[item.name,item.id]));
 const region=select('地域',[]);
 const filter=select('地点種別',[['全地点','all'],['ワープ','waypoint'],['七天神像','statue']]);
 const search=document.createElement('input');
 search.placeholder='地点IDを検索';
 search.setAttribute('aria-label','地点IDを検索');
 controls.append(search);
 const zoom=document.createElement('input');
 zoom.type='range';zoom.min='1';zoom.max='4';zoom.step='.25';zoom.value='1';
 zoom.setAttribute('aria-label','地図拡大率');
 controls.append(zoom);
 host.append(controls);
 const selected=document.createElement('p');
 selected.id='selectedMapNode';
 selected.setAttribute('role','status');
 host.append(selected);
 const viewport=document.createElement('div');
 viewport.style.cssText='overflow:auto;max-height:520px;background:#123036;border:1px solid #678578';
 const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 1000 850');
 svg.setAttribute('aria-label','取得したワープと神像の座標図');
 svg.style.cssText='display:block;width:100%;min-width:600px';
 viewport.append(svg);
 host.append(viewport);
 let nodes=[],bounds;
 const typeName=node=>node.kind==='statue'?'七天神像':'ワープ';
 function loadMap(){
  const id=Number(mapSelect.value);
  region.replaceChildren(new Option('全地域','all'));
  for(const area of map.areas.filter(area=>area.map_id===id))region.add(new Option(area.name,area.id));
  nodes=map.nodes.filter(node=>node.map_id===id);
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
  bounds={xmin:Math.min(...xs),xmax:Math.max(...xs),ymin:Math.min(...ys),ymax:Math.max(...ys)};
  draw();
 }
 function draw(){
  svg.replaceChildren();
  const query=search.value.trim().toLowerCase();
  const shown=nodes.filter(node=>
   (region.value==='all'||node.area_id===Number(region.value))&&
   (filter.value==='all'||node.kind===filter.value)&&node.id.includes(query));
  selected.textContent=shown.length?`${shown.length}地点。点を選択してください。`:
   nodes.length?'この条件に合う地点はありません。':'現在の公式地図データに地点はありません。';
  const {xmin,xmax,ymin,ymax}=bounds;
  for(const node of shown){
   const point=document.createElementNS(ns,'circle');
   point.setAttribute('cx',30+(node.x-xmin)/Math.max(1,xmax-xmin)*940);
   point.setAttribute('cy',30+(node.y-ymin)/Math.max(1,ymax-ymin)*790);
   point.setAttribute('r',node.kind==='statue'?5:3);
   point.setAttribute('fill',node.kind==='statue'?'#f4cf74':'#8bd9cd');
   point.setAttribute('tabindex','0');
   point.setAttribute('role','button');
   point.setAttribute('aria-label',node.id);
   const title=document.createElementNS(ns,'title');
   title.textContent=`${node.region}・${typeName(node)} (${node.id})`;
   point.append(title);
   const choose=()=>{
    const floor=node.point_group?` ｜ 公式の階層ID ${node.point_group.floor_id}`:'';
    selected.textContent=`${node.id} ｜ ${node.region} ｜ ${typeName(node)} ｜ 原座標 ${node.x}, ${node.y}${floor}`;
   };
   point.onclick=choose;
   point.onkeydown=event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();choose()}
   };
   svg.append(point);
  }
 }
 mapSelect.onchange=loadMap;
 region.onchange=filter.onchange=search.oninput=draw;
 zoom.oninput=()=>svg.style.width=Number(zoom.value)*100+'%';
 loadMap();
 const plans=document.createElement('p');
 plans.textContent='企画資料の対象地域：'+coverage.regions.map(item=>item.name).join(' ／ ');
 host.append(plans);
 const source=document.createElement('a');
 source.href=map.source;
 source.textContent=`HoYoLABテイワットマップ（取得 ${map.captured_at.slice(0,10)}）`;
 source.target='_blank';
 source.rel='noopener';
 host.append(source);
}
