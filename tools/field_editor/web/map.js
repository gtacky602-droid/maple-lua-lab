// Official projection: pixel = (catalogue coordinate + detail_v2.origin) * 2^zoom.
// Graph layouts use their own coordinates and never modify map_nodes.
export class FieldMap {
 constructor(viewport,{getScene,onSelect,onEdge,onConnect,onLayout}){
  this.host=viewport;this.canvas=viewport.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.layer=viewport.querySelector('#nodeLayer');
  Object.assign(this,{getScene,onSelect,onEdge,onConnect,onLayout});this.scale=.4;this.cx=0;this.cy=0;this.tiles=new Map();this.buttons=new Map();this.positions=new Map();this.pending=false;this.mode='geo';this.drag=null;this.lastMap=null;
  this.resize();
  new ResizeObserver(()=>{this.resize();if(!this.fitted)this.fit();}).observe(viewport);
  viewport.addEventListener('pointerdown',e=>this.down(e));viewport.addEventListener('pointermove',e=>this.move(e));viewport.addEventListener('pointerup',e=>this.up(e));viewport.addEventListener('pointercancel',()=>{this.drag=null;this.draw()});
  viewport.addEventListener('wheel',e=>{e.preventDefault();const r=viewport.getBoundingClientRect();this.zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top)}, {passive:false});
 }
 resize(){this.width=this.host.clientWidth;this.height=this.host.clientHeight;const d=Math.min(devicePixelRatio||1,2);this.canvas.width=this.width*d;this.canvas.height=this.height*d;this.ctx.setTransform(d,0,0,d,0,0);this.draw()}
 point(x,y){return {x:(x-this.cx)*this.scale+this.width/2,y:(y-this.cy)*this.scale+this.height/2}}
 world(x,y){return {x:(x-this.width/2)/this.scale+this.cx,y:(y-this.height/2)/this.scale+this.cy}}
 positionsFor(scene){
  const pos=new Map(),nodes=scene.nodes;const groups={};
  nodes.forEach((n,i)=>{
   if(this.mode==='geo')pos.set(n.id,{x:n.x,y:n.y});
   else if(this.mode==='graph'){
    const saved=Object.values(scene.data.graph_layouts).find(p=>p.field_id===n.id&&p.view_id===scene.map.map_id);
    const cols=Math.max(3,Math.ceil(Math.sqrt(nodes.length)));
    pos.set(n.id,saved?{x:saved.x,y:saved.y}:{x:(i%cols)*210,y:Math.floor(i/cols)*105});
   }else{
    const lv=scene.data.field_definitions[n.id]?.recommended_level??0;groups[lv]=(groups[lv]||0)+1;pos.set(n.id,{x:lv*35,y:(groups[lv]-1)*80});
   }
  });return pos;
 }
 fit(){
  if(!this.width||!this.height)this.resize();
  const s=this.getScene();this.positions=this.positionsFor(s);const ps=[...this.positions.values()];
  if(!ps.length){this.cx=0;this.cy=0;this.scale=1;this.draw();return}
  const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
  this.cx=(minx+maxx)/2;this.cy=(miny+maxy)/2;const pad=this.mode==='geo'?95:140;
  this.scale=Math.max(.03,Math.min(this.mode==='geo'?1:1.2,(this.width-pad*2)/Math.max(100,maxx-minx),(this.height-pad*2)/Math.max(100,maxy-miny)));
  this.fitted=true;this.draw();
 }
 zoom(factor,x=this.width/2,y=this.height/2){const p=this.world(x,y);this.scale=Math.max(.025,Math.min(5,this.scale*factor));this.cx=p.x-(x-this.width/2)/this.scale;this.cy=p.y-(y-this.height/2)/this.scale;this.draw()}
 setMode(mode){this.mode=mode;this.fit()}
 focus(id){const s=this.getScene();const p=this.positionsFor(s).get(id);if(p){this.cx=p.x;this.cy=p.y;this.scale=Math.max(this.scale,this.mode==='geo'?.6:1);this.draw()}}
 draw(){if(this.pending)return;this.pending=true;requestAnimationFrame(()=>{this.pending=false;this.render()})}
 render(){
  if(!this.width)return;const s=this.getScene(),ctx=this.ctx;this.positions=this.positionsFor(s);if(this.drag?.kind==='node'&&this.drag.world)this.positions.set(this.drag.id,this.drag.world);
  ctx.clearRect(0,0,this.width,this.height);ctx.fillStyle=this.mode==='geo'?'#314436':'#15251f';ctx.fillRect(0,0,this.width,this.height);
  if(this.mode==='geo')this.drawTerrain(s);else this.drawGrid();
  this.edgeSegments=[];
  for(const [id,e] of Object.entries(s.data.field_edges)){
   const a=this.positions.get(e.from_field),b=this.positions.get(e.to_field);if(!a||!b)continue;
   const p=this.point(a.x,a.y),q=this.point(b.x,b.y),preview=s.changed.has('field_edges:'+id);
   ctx.strokeStyle=preview?'#edc27c':s.selectedEdge===id?'#e7e3bc':'#a9cdb2';ctx.lineWidth=preview||s.selectedEdge===id?2.5:1.6;ctx.setLineDash(preview?[7,5]:[]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);
   if(e.direction==='one_way')this.arrow(p,q,ctx.strokeStyle);if(e.kind!=='portal'){const mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};ctx.font='10px system-ui';ctx.fillStyle='#e7e4be';ctx.fillText(({level:'Lv'+e.conditions.min_level,quest:'依頼',hidden:'隠し',boat:'船',temporary:'条件'})[e.kind]||'',mid.x+4,mid.y-5)}
   this.edgeSegments.push({id,p,q});
  }
  // Deletions are still visible as red dashes during review.
  for(const e of s.deletedEdges||[]){const a=this.positions.get(e.from_field),b=this.positions.get(e.to_field);if(!a||!b)continue;const p=this.point(a.x,a.y),q=this.point(b.x,b.y);ctx.strokeStyle='#ed837c';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([])}
  if(this.drag?.kind==='connect'){const p=this.positions.get(this.drag.id);if(p&&this.drag.pointer){const a=this.point(p.x,p.y);ctx.strokeStyle='#f0ce8c';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(this.drag.pointer.x,this.drag.pointer.y);ctx.stroke();ctx.setLineDash([])}}
  const active=new Set(),labels=[];
  for(const n of s.nodes){
   const f=s.data.field_definitions[n.id],p=this.positions.get(n.id);if(!p)continue;const at=this.point(p.x,p.y);if(at.x < -170||at.x>this.width+170||at.y< -60||at.y>this.height+60)continue;
   active.add(n.id);let btn=this.buttons.get(n.id);
   if(!btn){btn=document.createElement('button');btn.type='button';btn.dataset.fieldId=n.id;btn.innerHTML='<span class="node-symbol"></span><span class="node-label"></span><span class="connection-handle" title="ここから別の地点へドラッグ"></span>';this.buttons.set(n.id,btn);this.layer.append(btn)}
   const high=f.region_id.startsWith('branch-'),elite=f.elite||f.local_legend||Object.values(s.data.field_spawns).some(sp=>sp.field_id===n.id&&['elite','local_legend'].includes(s.data.monster_variants[sp.monster_id]?.classification));
   btn.className=['map-node',n.kind,this.mode!=='geo'?'graph':'',n.id===s.selected?'selected':'',high?'high':'',elite?'elite':'',s.changed.has('field_definitions:'+n.id)||s.changedFields.has(n.id)?'preview':''].filter(Boolean).join(' ');
   btn.style.left=at.x+'px';btn.style.top=at.y+'px';btn.setAttribute('aria-label',n.id+' '+(f.name||'フィールド名未設定')+' Lv'+(f.recommended_level??'未設定'));btn.setAttribute('aria-pressed',String(n.id===s.selected));btn.title=`${n.id} / 名称未確認\nX=${n.x} Y=${n.y}\n${f.name||'フィールド名未設定'}`;
   const label=btn.querySelector('.node-label'),lv=f.recommended_level;const spawned=Object.values(s.data.field_spawns).filter(sp=>sp.field_id===n.id);let lvText=lv!=null?'Lv'+lv:'Lv未設定';
   if(spawned.length){const levels=spawned.map(sp=>sp.level_override??s.data.monster_variants[sp.monster_id]?.base_level).filter(x=>x!=null);if(levels.length)lvText='敵Lv'+Math.min(...levels)+(Math.max(...levels)!==Math.min(...levels)?'–'+Math.max(...levels):'')}
   label.replaceChildren();label.append(document.createTextNode((f.name||n.id)+(n.point_group?' ⧉':'')));const small=document.createElement('small');small.textContent=' '+lvText+(spawned.length?' / '+spawned.map(sp=>(s.data.monster_variants[sp.monster_id]?.name||'?')+'×'+sp.count).join('・'):'');label.append(document.createElement('br'),small);
   const labelAt={x:at.x,y:at.y+32};const collide=labels.some(q=>Math.abs(q.x-labelAt.x)<92&&Math.abs(q.y-labelAt.y)<32);const show=this.mode!=='geo'||n.id===s.selected||!collide;label.hidden=!show;if(show)labels.push(labelAt);
   btn.querySelector('.connection-handle').hidden=!s.connectMode;
  }
  for(const [id,btn] of this.buttons){if(!active.has(id)){btn.remove();this.buttons.delete(id)}}
 }
 drawGrid(){const ctx=this.ctx;ctx.fillStyle='#45604a';for(let x=0;x<this.width;x+=24)for(let y=0;y<this.height;y+=24){ctx.globalAlpha=.35;ctx.fillRect(x,y,1,1)}ctx.globalAlpha=1;if(this.mode==='route'){ctx.fillStyle='#b4c4ad';ctx.font='10px system-ui';for(let lv=0;lv<=200;lv+=10){const p=this.point(lv*35,0);if(p.x<0||p.x>this.width)continue;ctx.fillText(lv===0?'Lv未設定':'Lv'+lv,p.x,25)}}}
 drawTerrain(s){
  const meta=s.source,ctx=this.ctx;
  if(this.manual&&this.manual.mapId===s.map.map_id){const im=this.manual,p=this.point(im.x,im.y);ctx.drawImage(im.image,p.x,p.y,im.w*this.scale,im.h*this.scale);document.querySelector('#mapLoading').textContent='手動画像 / 座標範囲はユーザー指定';return}
  if(!meta?.map_version){this.tileStatus=null;document.querySelector('#mapLoading').textContent='公式地形・地点未取得 / 画像読込から背景を指定できます';return}
  const z=Math.max(meta.min_zoom,Math.min(meta.max_zoom,Math.round(Math.log2(this.scale)))),size=256/2**z,top=this.world(0,0),bottom=this.world(this.width,this.height),ox=meta.origin[0],oy=meta.origin[1];
  const x0=Math.max(0,Math.floor((top.x+ox)/size)),y0=Math.max(0,Math.floor((top.y+oy)/size)),x1=Math.min(Math.ceil(meta.total_size[0]/size)-1,Math.floor((bottom.x+ox)/size)),y1=Math.min(Math.ceil(meta.total_size[1]/size)-1,Math.floor((bottom.y+oy)/size));let loaded=0,total=0,failed=0;
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
   total++;const key=`${meta.official_map_id}/${z}/${x}/${y}`;let t=this.tiles.get(key);
   if(!t){const im=new Image();t={image:im,loaded:false,error:false};this.tiles.set(key,t);im.onload=()=>{t.loaded=true;this.draw()};im.onerror=()=>{t.error=true;this.draw()};im.src='/tiles/'+key;}
   const p=this.point(x*size-ox,y*size-oy);if(t.loaded){loaded++;ctx.drawImage(t.image,p.x,p.y,size*this.scale+.6,size*this.scale+.6)}if(t.error)failed++;
  }
  this.tileStatus={loaded,total,failed};document.querySelector('#mapLoading').textContent=`© HoYoverse · 公式地形 ${loaded}/${total}タイル${failed?' / '+failed+'件読込失敗':''} · 版 ${meta.map_version.slice(0,8)} · ${meta.retrieved_at.slice(0,10)}`;
 }
 arrow(p,q,color){const ctx=this.ctx,a=Math.atan2(q.y-p.y,q.x-p.x),x=p.x+(q.x-p.x)*.6,y=p.y+(q.y-p.y)*.6;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x+7*Math.cos(a),y+7*Math.sin(a));ctx.lineTo(x-6*Math.cos(a-.6),y-6*Math.sin(a-.6));ctx.lineTo(x-6*Math.cos(a+.6),y-6*Math.sin(a+.6));ctx.closePath();ctx.fill()}
 pointer(e){const r=this.host.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
 down(e){if(e.button!==0||e.target.closest('.map-controls'))return;const b=e.target.closest('[data-field-id]'),p=this.pointer(e),s=this.getScene();
  if(b){e.preventDefault();this.onSelect(b.dataset.fieldId,false);const handle=e.target.closest('.connection-handle');this.drag={kind:handle&&s.connectMode?'connect':this.mode==='graph'&&!s.connectMode?'node':'select',id:b.dataset.fieldId,start:p,pointer:p,origin:{...this.positions.get(b.dataset.fieldId)}}}
  else this.drag={kind:'pan',start:p,cx:this.cx,cy:this.cy,pointer:p};
  this.host.setPointerCapture(e.pointerId);
 }
 move(e){if(!this.drag)return;const p=this.pointer(e),d=this.drag;d.pointer=p;d.moved=Math.hypot(p.x-d.start.x,p.y-d.start.y)>4;
  if(d.kind==='pan'){this.cx=d.cx-(p.x-d.start.x)/this.scale;this.cy=d.cy-(p.y-d.start.y)/this.scale}
  if(d.kind==='node')d.world={x:d.origin.x+(p.x-d.start.x)/this.scale,y:d.origin.y+(p.y-d.start.y)/this.scale};this.draw();
 }
 up(e){const d=this.drag;if(!d)return;this.drag=null;const p=this.pointer(e);if(d.kind==='connect'&&d.moved){let closest=null,dist=45;for(const [id,w] of this.positions){if(id===d.id)continue;const q=this.point(w.x,w.y),v=Math.hypot(q.x-p.x,q.y-p.y);if(v<dist){dist=v;closest=id}}if(closest)this.onConnect(d.id,closest)}
  else if(d.kind==='node'&&d.moved)this.onLayout(d.id,d.world);
  else if(d.kind==='pan'&&!d.moved){for(const e of this.edgeSegments||[]){const vx=e.q.x-e.p.x,vy=e.q.y-e.p.y,len=vx*vx+vy*vy,t=len?Math.max(0,Math.min(1,((p.x-e.p.x)*vx+(p.y-e.p.y)*vy)/len)):0;if(Math.hypot(p.x-e.p.x-t*vx,p.y-e.p.y-t*vy)<9){this.onEdge(e.id);break}}}
  if(this.host.hasPointerCapture(e.pointerId))this.host.releasePointerCapture(e.pointerId);this.draw();
 }
 async exportPNG(){
  this.render();const current=this.getScene(),manualActive=this.manual?.mapId===current.map.map_id;if(this.mode==='geo'&&!manualActive&&(!current.source?.map_version||!this.tileStatus||!this.tileStatus.total||this.tileStatus.failed||this.tileStatus.loaded!==this.tileStatus.total))throw Error('公式地形が未取得、または読込が未完了です。読込完了後に再実行するか、公式画像を手動で読み込んでください。');
  const out=document.createElement('canvas'),d=2;out.width=this.width*d;out.height=this.height*d;const c=out.getContext('2d');c.scale(d,d);c.drawImage(this.canvas,0,0,this.width,this.height);const s=this.getScene();c.font='10px sans-serif';
  for(const n of s.nodes){const p=this.positions.get(n.id);if(!p)continue;const q=this.point(p.x,p.y);if(q.x<0||q.x>this.width||q.y<0||q.y>this.height)continue;const f=s.data.field_definitions[n.id];c.fillStyle=n.kind==='statue'?'#63cea3':f.region_id.startsWith('branch-')?'#b496df':'#74c8f1';c.beginPath();c.arc(q.x,q.y,5,0,Math.PI*2);c.fill();c.strokeStyle='#fff';c.stroke();let text=n.id+' Lv'+(f.recommended_level??'未設定');const sp=Object.values(s.data.field_spawns).filter(x=>x.field_id===n.id);if(sp.length)text+=' '+sp.map(x=>(s.data.monster_variants[x.monster_id]?.name||'?')+'×'+x.count).join(',');if(f.elite||f.local_legend)text+=' ◆'+(f.elite||f.local_legend);const w=c.measureText(text).width;c.fillStyle='#17251edc';c.fillRect(q.x+8,q.y-11,w+6,16);c.fillStyle='#fff1c8';c.fillText(text,q.x+11,q.y+1)}
  c.fillStyle='#11291fe8';c.fillRect(0,this.height-25,this.width,25);c.fillStyle='#d9e4cc';c.fillText(`© HoYoverse / ${s.map.name} / ${s.preview?'提案プレビュー / ':''}revision ${s.revision} / 公式名称・階層の未確認あり`,10,this.height-9);
  return await new Promise((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(Error('PNG出力に失敗しました')),'image/png'));
 }
}
