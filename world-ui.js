export async function initWorldUI(action){
 const [map,coverage]=await Promise.all(['content/map-catalog.json','content/coverage.json'].map(async p=>(await fetch(p)).json()));
 const host=document.getElementById('worldPanel');
 const intro=document.createElement('p');intro.textContent=`取得済み：ワープ ${map.counts.waypoints}・七天神像 ${map.counts.statues}。座標は地図資料、各地点のゲーム場面は未制作。地域割当・別地図・期間限定地域は照合中。`;host.append(intro);
 const nav=document.createElement('div');nav.className='controls';
 for(const [label,key] of [['町（仮配置）','town'],['城外の狩場（仮配置）','field'],['依頼の討伐試験','arena'],['無相の風・2D試作','boss_anemo']]){
  const b=document.createElement('button');b.textContent=label;b.onclick=()=>{action('campaign');action(key);b.blur()};nav.append(b);
 }
 host.append(nav);
 const note=document.createElement('p');note.textContent='上の4場面は操作できる試作です。下の座標図は制作対象の確認用で、クリックしても同じ狩場の使い回しには移動しません。';host.append(note);
 const controls=document.createElement('div');controls.className='controls';
 const filter=document.createElement('select');filter.setAttribute('aria-label','地点種別');for(const [n,v] of [['全地点','all'],['ワープ','waypoint'],['七天神像','statue']])filter.add(new Option(n,v));controls.append(filter);
 const search=document.createElement('input');search.placeholder='地点IDを検索';search.setAttribute('aria-label','地点IDを検索');controls.append(search);
 const zoom=document.createElement('input');zoom.type='range';zoom.min='1';zoom.max='4';zoom.step='.25';zoom.value='1';zoom.setAttribute('aria-label','地図拡大率');controls.append(zoom);host.append(controls);
 const selected=document.createElement('p');selected.id='selectedMapNode';selected.textContent='点を選ぶと元データのIDと座標を表示します。';host.append(selected);
 const viewport=document.createElement('div');viewport.style.cssText='overflow:auto;max-height:520px;background:#123036;border:1px solid #678578';
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1000 850');svg.setAttribute('aria-label','取得したワープと神像の座標図');svg.style.display='block';svg.style.width='100%';svg.style.minWidth='600px';viewport.append(svg);host.append(viewport);
 const xs=map.nodes.map(n=>n.x),ys=map.nodes.map(n=>n.y),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
 function draw(){svg.replaceChildren();const nodes=map.nodes.filter(n=>(filter.value==='all'||n.kind===filter.value)&&(!search.value||n.id.includes(search.value)));
  for(const n of nodes){const point=document.createElementNS(ns,'circle');point.setAttribute('cx',30+(n.x-xmin)/(xmax-xmin)*940);point.setAttribute('cy',30+(n.y-ymin)/(ymax-ymin)*790);point.setAttribute('r',n.kind==='statue'?5:3);point.setAttribute('fill',n.kind==='statue'?'#f4cf74':'#8bd9cd');point.setAttribute('tabindex','0');point.setAttribute('role','button');point.setAttribute('aria-label',n.id);const title=document.createElementNS(ns,'title');title.textContent=n.id;point.append(title);const choose=()=>selected.textContent=`${n.id} ｜ ${n.kind==='statue'?'七天神像':'ワープ'} ｜ 原座標 ${n.x}, ${n.y} ｜ 地域・日本語名未割当／場面未制作`;point.onclick=choose;point.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}};svg.append(point)}
 }
 filter.onchange=search.oninput=draw;zoom.oninput=()=>svg.style.width=Number(zoom.value)*100+'%';draw();
 const plans=document.createElement('p');plans.textContent='地域別の制作対象：'+coverage.regions.map(r=>r.name).join(' ／ ');host.append(plans);
 const source=document.createElement('a');source.href=map.source;source.textContent=`座標データの出典（取得元記載 ${map.snapshot.gameVersion} / ${map.snapshot.fetchedAt.slice(0,10)}）`;source.target='_blank';source.rel='noopener';host.append(source);
}
