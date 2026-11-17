import {FieldMap} from './map.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>structuredClone(v),id=p=>p+'-'+crypto.randomUUID().replaceAll('-','').slice(0,16);
const pointKinds={statue:'七天神像',waypoint:'ワープポイント',domain:'秘境'};
const statusLabels={unassigned:'未設定',proposed:'検討案',approved:'採用済み',implemented:'実装済み',verified:'検証済み'};
const names={waypoint_position:'ワープポイントの地図座標',name:'フィールド名',location_alias:'設計上の地点別名',region_id:'設計地域',recommended_level:'推奨Lv',enemy_level_min:'通常敵Lv下限',enemy_level_max:'通常敵Lv上限',respawn_seconds:'復活秒数',elite:'精鋭',local_legend:'地方伝説',terrain:'地形',quests:'クエスト',notes:'設計メモ',production_state:'制作状態',required_route:'必須経路',from_field:'出発地点',to_field:'到着地点',direction:'方向',kind:'移動方法',conditions:'接続条件',exit_position:'出口位置',entrance_position:'入口位置',base_level:'基準Lv',count:'出現数',level_override:'特殊Lv',special:'特殊個体',monster_id:'敵Variant',field_id:'フィールド',family_id:'敵系統'};
let boot,project,maps,nodes,mapSources,token,currentMap,selected=null,selectedEdge=null,preview=null,dock='chat',view='geo',dirty=false,report=null,chatResult=null,chatText='',redoOps=null,graph;
let apiBusy=false, placingWaypoint=false, floorId='';
const mapDrafts=new Map();
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5200)}
async function api(path,body){const res=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Editor-UI':token||''},...(body?{body:JSON.stringify(body)}:{})});const content=res.headers.get('content-type')||'';const value=content.includes('json')?await res.json():await res.text();if(!res.ok)throw Error(value.error||String(value));return value}
async function refresh(){project=await api('/api/project');renderHeader();renderRegions();graph.draw();renderInspector();renderDock()}
function badge(state){return `<span class="badge ${esc(state)}">${esc(statusLabels[state]||state)}</span>`}
function activeMap(){return maps.find(m=>m.map_id===currentMap)||maps[0]}
function previewData(){
 const d={...project};
 for(const c of ['field_definitions','field_edges','monster_families','monster_variants','field_spawns','graph_layouts','graph_exceptions'])d[c]={...project[c]};
 const changes=new Set();
 if(preview?.status==='proposed')for(const op of preview.operations){
  changes.add(op.collection+':'+op.id);
  if(op.action==='delete'){
   delete d[op.collection][op.id];
   continue;
  }
  const record=d[op.collection][op.id]={...d[op.collection][op.id],...op.changes};
  if(op.collection==='field_edges')record.edge_id=op.id;
 }
 if(preview?.status==='proposed')for(const x of preview.diff){
  const record=d[x.collection][x.id];
  if(record&&x.collection==='field_definitions'&&!project.field_definitions[x.id]&&x.item!=='*'){
   record[x.item]=x.after;
   record._meta={...record._meta,[x.item]:x.after_decision};
  }
 }
 for(const {op} of mapDrafts.values()){
  d[op.collection][op.id]={...op.changes,[op.collection==='field_edges'?'edge_id':'field_id']:op.id};
  changes.add(op.collection+':'+op.id);
 }
 return {data:d,changed:changes};
}
function mapFieldIds(m,d){
 return [...m.node_ids,...Object.values(d.field_definitions).filter(f=>f.waypoint_position?.map_id===m.map_id).map(f=>f.field_id)];
}
function pointNode(i,d){
 if(nodes[i])return nodes[i];
 const p=d.field_definitions[i]?.waypoint_position;
 return p?{id:i,kind:'waypoint',custom:true,x:p.x,y:p.y}:null;
}
function floorOptions(){
 const m=activeMap(),overlays=Object.values(boot.map_floors?.[m.official_map_id]||{});
 const groups=new Set(m.node_ids.map(i=>nodes[i]?.point_group?.group_id).filter(Boolean));
 const local=new Set(m.node_ids);
 for(const f of overlays)if(f.entrances.some(i=>local.has(i)))groups.add(f.group_id);
 return overlays.filter(f=>groups.has(f.group_id));
}
function renderFloorPicker(){
 const select=$('#floorSelect'),options=view==='geo'?floorOptions():[];
 select.parentElement.hidden=!options.length;
 select.replaceChildren(new Option('通常地図',''),...options.map(f=>new Option(f.name,f.id)));
 select.value=floorId;
}
function setFloor(value){
 floorId=String(value);placingWaypoint=false;renderFloorPicker();renderHeader();renderInspector();updateMapHint();graph.fit();
}
function activeFloor(){return view==='geo'?(boot.map_floors?.[activeMap().official_map_id]?.[floorId]||null):null}
function filteredNodes(d){const m=activeMap(),kind=$('#kindFilter').value,scope=$('#scopeFilter').value,layer=$('#layerFilter').value,state=$('#stateFilter').value,elite=$('#eliteFilter').value,production=$('#productionFilter').value,low=$('#minLevel').value,high=$('#maxLevel').value;const floor=activeFloor(),ids=mapFieldIds(m,d),local=new Set(ids),shown=new Set(ids);if(view!=='geo')for(const e of Object.values(d.field_edges)){if(local.has(e.from_field)||local.has(e.to_field)){shown.add(e.from_field);shown.add(e.to_field)}}
 return [...shown].map(i=>pointNode(i,d)).filter(n=>n&&d.field_definitions[n.id]).filter(n=>{const f=d.field_definitions[n.id];if(floor&&!(n.point_group?.group_id===floor.group_id&&n.point_group.floor_id===floor.id)&&!floor.entrances.includes(n.id))return false;if(kind!=='all'&&n.kind!==kind)return false;if(scope==='normal'&&m.exclude_from_normal?.includes(n.id))return false;const underground=!!n.point_group||n.icon_sign===1,knownSurface=n.layer==='surface';if(layer==='underground'&&!underground||layer==='surface'&&!knownSurface||layer==='unknown'&&(underground||knownSurface))return false;const lv=f.recommended_level;if(low&&(lv==null||lv<Number(low))||high&&(lv==null||lv>Number(high)))return false;const has=!!(f.elite||f.local_legend)||Object.values(d.field_spawns).some(sp=>sp.field_id===n.id&&['elite','local_legend'].includes(d.monster_variants[sp.monster_id]?.classification));if(elite==='yes'&&!has||elite==='no'&&has)return false;if(production!=='all'&&f.production_state!==production)return false;if(state==='proposed'&&!mapDrafts.has(n.id)&&!preview?.impact.affected_fields.includes(n.id))return false;if(state!=='all'&&state!=='proposed'&&!Object.values(f._meta||{}).some(x=>x.state===state))return false;return true});
}
function scene(){const p=previewData(),m=activeMap();return {...p,map:m,floor:activeFloor(),source:mapSources[String(m.official_map_id)],nodes:filteredNodes(p.data),selected,selectedEdge,placingWaypoint,connectMode:$('#connectMode').checked,changedFields:new Set(preview?.status==='proposed'?preview.impact.affected_fields:[]),preview,revision:project.revision,deletedEdges:(preview?.operations||[]).filter(o=>o.collection==='field_edges'&&o.action==='delete').map(o=>project.field_edges[o.id]).filter(Boolean)}}
function persistView(){localStorage.setItem('field-editor-view',JSON.stringify({map:currentMap,selected,view,proposal:preview?.proposal_id}))}
function renderHeader(){const m=activeMap(),guide=m.level_guide,approvedIds=new Set(mapFieldIds(m,project));$('#revision').textContent='保存済み · rev '+project.revision;$('#mapTitle').replaceChildren(document.createTextNode(m.name));const span=document.createElement('span');span.textContent=m.kind==='main'?'通常地域':m.kind==='high_level_branch'?'高難度分岐':m.temporary?'期間限定・隠し世界':'独立マップ';$('#mapTitle').append(span);$('#mapKicker').textContent=m.region_id.toUpperCase()+' / MAP '+(m.official_map_id??'未確認');$('#mapGuide').textContent=guide.recommended!=null?`探索推奨 Lv${guide.recommended} · 通常敵 Lv${guide.enemy_min}–${guide.enemy_max}${guide.deepest?' · 最深部 Lv'+guide.deepest:''} / ${statusLabels[guide.state]} / 個別地点は未設定から設計${m.membership_state==='proposed'?' / 地点の地域割当は照合案':''}`: '地域のLv設計は未設定 / 公式地点・地形が未取得の地域は追加のマップ定義で拡張';$('#pointCount').textContent=filteredNodes(previewData().data).length;$('#edgeCount').textContent=Object.values(project.field_edges).filter(e=>approvedIds.has(e.from_field)||approvedIds.has(e.to_field)).length;$('#proposalCount').textContent=Object.values(project.proposals).filter(p=>p.status==='proposed').length;$('#emptyMap').hidden=placingWaypoint||!!mapFieldIds(m,previewData().data).length;$('#emptyMap').textContent='この地域の公式地点データは未取得です。';$('#undo').disabled=!project.design_history.length&&!preview;$('#redo').disabled=!redoOps;$('#addWaypoint').hidden=view!=='geo'||!!floorId;$('#addWaypoint').textContent=placingWaypoint?'地点の指定をやめる':'ワープポイントを追加';$('#addWaypoint').setAttribute('aria-pressed',String(placingWaypoint));$('#addWaypoint').title=boot.custom_waypoints?'':'ワープポイントを追加するには設計室を再起動してください';$('#mapViewport').classList.toggle('placing-waypoint',placingWaypoint);$('#reviewMapDrafts').hidden=!mapDrafts.size;$('#reviewMapDrafts').textContent='編集中の追加（'+mapDrafts.size+'件）';}
function renderRegions(){const query=$('#regionSearch').value;const groups={main:'通常地域',high_level_branch:'高難度地域',hidden_world:'隠し世界',official_layer:'その他の公式マップ'};$('#regionList').innerHTML=Object.entries(groups).map(([kind,label])=>`<div class="region-group">${label}</div>`+maps.filter(m=>m.kind===kind&&m.name.includes(query)).map(m=>`<button class="region-item ${m.map_id===currentMap?'active':''}" data-map="${esc(m.map_id)}"><span>${esc(m.name)}</span><span class="region-count">${mapFieldIds(m,project).length||'未取得'}</span></button>`).join('')).join('');$$('[data-map]').forEach(b=>b.onclick=()=>switchMap(b.dataset.map))}
function switchMap(mid){if(dirty&&!confirm('未保存の入力があります。地域を切り替えますか？'))return;placingWaypoint=false;floorId='';currentMap=mid;selected=null;selectedEdge=null;dirty=false;persistView();renderFloorPicker();renderHeader();renderRegions();renderInspector();renderDock();updateMapHint();graph.fit()}
function choose(i,focus=true){if(dirty&&i===selected)return;if(dirty&&i!==selected&&!confirm('未保存の入力があります。地点を切り替えますか？'))return;selected=i;selectedEdge=null;dirty=false;renderInspector();if(focus)graph.focus(i);graph.draw();persistView()}
function fieldName(i,d=project){return d.field_definitions[i]?.name||nodes[i]?.name_ja||i}
function valueInput(key,label,f,type='text'){return `<label>${label}<span class="state-mini" title="${esc(f._meta[key]?.source)}">${esc(statusLabels[f._meta[key]?.state]||'検討案')}</span>${type==='textarea'?`<textarea name="${key}">${esc(f[key])}</textarea>`:`<input name="${key}" type="${type}" ${type==='number'?'min="1" max="200"':''} value="${esc(f[key])}">`}</label>`}
function renderInspector(){
 if(selectedEdge){renderEdgeInspector(selectedEdge);return}
 const body=$('#inspectorBody'),d=previewData().data,f=d.field_definitions[selected],n=pointNode(selected,d);if(!n||!f){body.innerHTML='<div class="empty-state"><span>◇</span><h3>地図から地点を選択</h3><p>敵・Lv・接続を編集して、<br>冒険のフィールドを設計しましょう。</p></div>';renderPointPicker();return}
 const isPreview=preview?.impact.affected_fields.includes(selected);
 const floor=boot.map_floors?.[n.map_id]?.[n.point_group?.floor_id];
 const exactFloor=floor?.group_id===n.point_group?.group_id?floor:null;
 if(n.custom&&!project.field_definitions[selected]){
  body.innerHTML=`<div class="field-source"><b>${esc(f.name)}</b><br>追加するワープポイント<br>X ${n.x.toFixed(2)} / Y ${n.y.toFixed(2)}</div><p class="help">接続を続けて追加できます。推奨Lvや敵の配置は採用後に編集できます。</p>`;
  if(mapDrafts.has(selected)){
   const button=document.createElement('button');button.textContent='接続を作成';button.onclick=()=>edgeEditor(null,selected);body.append(button);
  }
  renderPointPicker();return;
 }
 body.innerHTML=`<div class="field-tag"><span>${esc(selected)}</span>${badge(isPreview?'proposed':f._meta.recommended_level.state)}</div><div class="field-source"><b>${n.custom?'追加したワープポイント':esc(n.name_ja||'公式地点名未確認')}</b>${n.custom?'':'<br>'+pointKinds[n.kind]+' · 公式Map '+n.map_id+' / 地点 '+n.source_id}<br>X ${n.x.toFixed(2)} / Y ${n.y.toFixed(2)}<br>階層：${n.point_group?'グループ '+n.point_group.group_id+' / floor '+n.point_group.floor_id:'未確認（地上と断定しない）'}${exactFloor?'<br><button type="button" id="showFieldFloor">'+esc(exactFloor.name)+'の階層を表示</button>':n.point_group?'<br>公式の階層画像は未取得':''}</div><form id="fieldForm" class="field-form">${valueInput('name','フィールド名',f)}${valueInput('location_alias','設計上の地点別名（公式名とは別）',f)}<label>設計地域<select name="region_id">${maps.map(m=>`<option value="${esc(m.region_id)}" ${f.region_id===m.region_id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>${valueInput('recommended_level','推奨Lv',f,'number')}<div class="row">${valueInput('enemy_level_min','通常敵Lv 下限',f,'number')}${valueInput('enemy_level_max','通常敵Lv 上限',f,'number')}</div><label>標準リスポーン（秒）<input name="respawn_seconds" type="number" min="0" step="0.1" value="${esc(f.respawn_seconds)}"></label><div class="inspector-section"><h3>出現するモンスター <span class="badge">${Object.values(d.field_spawns).filter(s=>s.field_id===selected).length}</span></h3><div id="spawnList"></div><button type="button" id="addMonster">＋ 図鑑から敵を追加</button></div><div class="inspector-section">${valueInput('elite','精鋭の配置メモ',f)}${valueInput('local_legend','地方伝説の配置メモ（未確認は空欄）',f)}${valueInput('terrain','地形の特徴',f,'textarea')}<label>関連クエストID（カンマ区切り）<input name="quests" value="${esc(f.quests.join(', '))}"></label><label>必須経路のフィールドID（カンマ区切り）<input name="required_route" value="${esc(f.required_route.join(', '))}"></label>${valueInput('notes','設計メモ',f,'textarea')}<label>制作状態<select name="production_state">${['未着手','設計中','制作中','完成'].map(x=>`<option ${f.production_state===x?'selected':''}>${x}</option>`).join('')}</select></label></div><div class="inspector-section"><h3>移動経路</h3><div id="edgeList"></div><button type="button" id="connectStart">＋ 接続を作成</button></div><label>変更理由<input name="reason" required placeholder="この設定にする理由"></label><div class="form-actions"><button type="submit" class="primary">変更案を保存・差分確認</button></div><p class="help">保存した案は地図にプレビューされます。採用操作で正本へ反映します。</p></form>`;
 if($('#showFieldFloor'))$('#showFieldFloor').onclick=()=>{
  if(!discardMapDraft())return;
  if(!activeMap().node_ids.includes(selected)){
   const m=maps.find(m=>m.node_ids.includes(selected));
   if(!m)return;
   const point=selected;switchMap(m.map_id);selected=point;
  }
  if(view!=='geo')setView('geo');
  setFloor(exactFloor.id);
 };
 const form=$('#fieldForm');form.oninput=()=>{dirty=true};form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),changes={};for(const key of ['name','location_alias','region_id','elite','local_legend','terrain','notes','production_state'])changes[key]=fd.get(key);for(const key of ['recommended_level','enemy_level_min','enemy_level_max','respawn_seconds'])changes[key]=fd.get(key)===''?null:Number(fd.get(key));for(const key of ['quests','required_route'])changes[key]=String(fd.get(key)).split(',').map(x=>x.trim()).filter(Boolean);for(const k of Object.keys(changes))if(JSON.stringify(changes[k])===JSON.stringify(project.field_definitions[selected][k]))delete changes[k];try{await propose([{collection:'field_definitions',id:selected,changes}],fd.get('reason'));dirty=false}catch(e){toast(e.message)}};
 const spawns=Object.values(d.field_spawns).filter(s=>s.field_id===selected);$('#spawnList').innerHTML=spawns.map(s=>{const v=resolveVariant(d,s.monster_id),lv=s.level_override??v.base_level;return `<div class="spawn-card"><b>${esc(v.name)}</b><div class="spawn-stats">Lv${lv??'未設定'} × ${s.count}体 · ${s.level_override!=null?'特殊個体の上書き':'Variant基準Lvを参照'}<br>HP ${v.hp??'未設定'} / ATK ${v.attack??'未設定'} / DEF ${v.defense??'未設定'}<br>${esc(s.spawn_id)}</div><button type="button" data-spawn="${esc(s.spawn_id)}">配置を編集</button></div>`}).join('')||'<p class="help">敵は未設定です。</p>';
 $$('[data-spawn]').forEach(b=>b.onclick=()=>spawnEditor(b.dataset.spawn));$('#addMonster').onclick=()=>monsterLibrary(true);$('#connectStart').onclick=()=>{if(discardMapDraft())edgeEditor(null,selected)};
 const edges=Object.values(d.field_edges).filter(e=>[e.from_field,e.to_field].includes(selected));$('#edgeList').innerHTML=edges.map(e=>`<div class="edge-card">${esc(fieldName(e.from_field,d))} ${e.direction==='both'?'↔':'→'} ${esc(fieldName(e.to_field,d))}<br><button type="button" data-edge="${esc(e.edge_id)}">設定を編集</button></div>`).join('')||'<p class="help">承認済みの接続はまだありません。距離から自動接続しません。</p>';$$('[data-edge]').forEach(b=>b.onclick=()=>edgeEditor(b.dataset.edge));renderPointPicker();
}
function renderPointPicker(){const query=$('#pointSearch').value,d=previewData().data;$('#pointResults').innerHTML=mapFieldIds(activeMap(),d).filter(i=>d.field_definitions[i]&&(!query||(i+' '+fieldName(i,d)+' '+(d.field_definitions[i].location_alias||'')).includes(query))).map(i=>`<button data-point="${esc(i)}">${esc(i)} · ${esc(fieldName(i,d))}</button>`).join('');$$('[data-point]').forEach(b=>b.onclick=()=>choose(b.dataset.point))}
function openModal(title,html){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=html;if(!$('#modal').open)$('#modal').showModal()}
function closeModal(){$('#modal').close()}
function resolveVariant(d,i){const v=d.monster_variants[i],f=d.monster_families[v.family_id];return {...f.defaults,element:f.element,behavior:f.behavior,sprite:f.sprite,animation:f.animation,...Object.fromEntries(Object.entries(v).filter(([,v])=>v!=null))}}
async function propose(operations,reason,actor='user',source=reason){const p=await api('/api/proposals',{base_revision:project.revision,reason,source,actor,operations});preview=p;await refresh();persistView();graph.draw();showDiff(p);return p}
function showDiff(p){preview=p;persistView();renderHeader();if(!dirty)renderInspector();graph.draw();const protectedChanges=p.diff.filter(x=>['approved','implemented','verified'].includes(x.before_decision?.state)||x.item==='*'&&Object.values(x.before?._meta||{}).some(m=>['approved','implemented','verified'].includes(m.state)));const show=v=>esc(v==null?'未設定':typeof v==='object'?JSON.stringify(v):v);
 openModal('変更案を確認',`<p>${esc(p.reason)}</p><p class="help">提案者: ${esc(p.actor)} / 正本 rev ${p.base_revision} / 影響 ${p.impact.affected_count}フィールド${p.impact.preserved_override_fields.length?' / 個別Lvを維持 '+p.impact.preserved_override_fields.length+'フィールド':''}</p>${p.base_revision!==project.revision?'<p class="warning">正本が更新されています。最新値との差分を再作成してください。</p>':''}<table class="diff-table"><thead><tr><th>対象 / 項目</th><th>現在の決定</th><th>変更案</th></tr></thead><tbody>${p.diff.map(x=>`<tr><td><span class="monospace">${esc(x.id)}</span><br>${esc(names[x.item]||x.item)}<br><small>${esc(x.before_decision?.source||'未設定')}</small></td><td class="diff-before">${show(x.before)}<br>${badge(x.before_decision?.state||'unassigned')}</td><td class="diff-after">${show(x.after)}<br>${badge('proposed')}</td></tr>`).join('')}</tbody></table>${p.impact.spawn_changes?.length?'<h3>参照先の敵配置への影響</h3><table class="diff-table"><tr><th>フィールド / 配置</th><th>変更前</th><th>変更後</th></tr>'+p.impact.spawn_changes.map(x=>'<tr><td>'+esc((x.after||x.before).field_id)+'<br>'+esc(x.spawn_id)+'</td><td class="diff-before">'+esc(x.before?x.before.name+' Lv'+x.before.level+' ×'+x.before.count+' / HP '+(x.before.hp??'未設定'):'未配置')+'</td><td class="diff-after">'+esc(x.after?x.after.name+' Lv'+x.after.level+' ×'+x.after.count+' / HP '+(x.after.hp??'未設定'):'削除')+'</td></tr>').join('')+'</table>':''}${protectedChanges.length?'<label class="check warning"><input type="checkbox" id="overwriteApproved"> 確定済みの値・接続を変更することを確認しました</label>':''}<label class="check"><input type="checkbox" id="reviewConsent"> 地図上のプレビューと差分を確認し、この変更を採用します</label><div class="modal-actions"><button id="previewOnly">地図でプレビュー</button>${p.base_revision!==project.revision?'<button id="rebaseProposal">最新値で差分を再作成</button>':'<button id="approveProposal" class="primary" disabled>採用して正本へ保存</button>'}</div><p class="help">採用後も変更前後・理由・変更者・日時を履歴に残します。ゲーム本体へは自動反映しません。</p>`);
 $('#previewOnly').onclick=()=>{closeModal();dock='proposals';showProposalMap(p)};if($('#rebaseProposal'))$('#rebaseProposal').onclick=()=>propose(p.operations,p.reason,p.actor,p.source).catch(e=>toast(e.message));if($('#approveProposal')){$('#reviewConsent').onchange=()=>$('#approveProposal').disabled=!$('#reviewConsent').checked;$('#approveProposal').onclick=async()=>{if(apiBusy)return;apiBusy=true;$('#approveProposal').disabled=true;try{await api('/api/approve',{proposal_id:p.proposal_id,revision:project.revision,overwrite_approved:!!$('#overwriteApproved')?.checked});redoOps=null;preview=null;dirty=false;await refresh();closeModal();persistView();toast('採用した設計をリポジトリに保存しました。')}catch(e){toast(e.message);$('#approveProposal').disabled=false}finally{apiBusy=false}}}
}
function showProposalMap(p){
 if(!discardMapDraft())return;
 preview=p;
 const d=previewData().data,affected=new Set(p.impact.affected_fields);
 const matches=m=>mapFieldIds(m,d).some(i=>affected.has(i));
 const target=matches(activeMap())?activeMap():maps.find(matches);
 if(target&&target.map_id!==currentMap){switchMap(target.map_id);return}
 if(floorId)setFloor('');
 persistView();renderHeader();renderInspector();renderDock();graph.draw();
}
function renderEdgeInspector(i){const d=previewData().data,e=d.field_edges[i];if(!e){selectedEdge=null;renderInspector();return}$('#inspectorBody').innerHTML=`<div class="field-tag">${esc(i)}</div><h3 style="margin-top:16px">${esc(fieldName(e.from_field,d))} ${e.direction==='both'?'↔':'→'} ${esc(fieldName(e.to_field,d))}</h3><p class="help">${esc(e.kind)} / ${esc(JSON.stringify(e.conditions))}</p><button id="editSelectedEdge">接続を編集</button><p class="help">${project.field_edges[i]?'線の削除も差分を確認して採用します。':'未採用の線は変更案から外せます。'}</p>`;$('#editSelectedEdge').onclick=()=>edgeEditor(i)}
function edgeEditor(edgeId,from,to){const d=previewData().data,queued=mapDrafts.has(edgeId),creating=!edgeId||queued;const e=edgeId?d.field_edges[edgeId]:{edge_id:id('edge'),from_field:from||selected||mapFieldIds(activeMap(),d)[0],to_field:to||'',direction:'both',kind:'portal',conditions:{requires_discovery:true},exit_position:{x:0,y:0},entrance_position:{x:0,y:0},notes:''};
 const pending=edgeId&&!queued&&!project.field_edges[edgeId]?preview:null;
 const eligible=new Set(Object.keys(d.field_definitions).filter(i=>project.field_definitions[i]||mapDrafts.has(i)));
 const byMap=new Map(maps.map(m=>[m.map_id,mapFieldIds(m,d).filter(i=>eligible.has(i))]));
 const mapFor=i=>{
  if(!i||byMap.get(currentMap).includes(i))return currentMap;
  const preferred=maps.find(m=>m.region_id===d.field_definitions[i]?.region_id&&byMap.get(m.map_id).includes(i));
  return preferred?.map_id||maps.find(m=>byMap.get(m.map_id).includes(i))?.map_id||'';
 };
 const fieldOpts=(mapId,selected)=>'<option value="">地点を選択</option>'+Array.from(byMap.get(mapId)||eligible,i=>`<option value="${esc(i)}" ${i===selected?'selected':''}>${esc(fieldName(i,d)===i?i:fieldName(i,d)+' / '+i)}</option>`).join('');
 const endpoint=(key,label,fieldId)=>{
  const mapId=mapFor(fieldId);
  return `<div><label>${label}地域<select name="${key}_map"><option value="">すべての地点</option>${maps.map(m=>`<option value="${esc(m.map_id)}" ${m.map_id===mapId?'selected':''} ${byMap.get(m.map_id).length?'':'disabled'}>${esc(m.name)}</option>`).join('')}</select></label><label>${label}地点<select name="${key}_field" required>${fieldOpts(mapId,fieldId)}</select></label></div>`;
 };
 openModal(creating?'フィールドを接続':'接続を編集',`<form id="edgeForm"><div class="row">${endpoint('from','出発',e.from_field)}${endpoint('to','到着',e.to_field)}</div><div class="row"><label>方向<select name="direction"><option value="both" ${e.direction==='both'?'selected':''}>双方向 ↔</option><option value="one_way" ${e.direction==='one_way'?'selected':''}>一方通行 →</option></select></label><label>移動方法<select name="kind">${Object.entries({portal:'通常ポータル',level:'Lv条件付き',quest:'クエスト解放',hidden:'隠し通路',boat:'船・特殊移動',temporary:'一時的な接続'}).map(([k,v])=>`<option value="${k}" ${e.kind===k?'selected':''}>${v}</option>`).join('')}</select></label></div><div class="row"><label>必要Lv<input name="min_level" type="number" min="1" max="200" value="${e.conditions.min_level??''}"></label><label>必要クエストID<input name="quest_id" value="${esc(e.conditions.quest_id||'')}"></label></div><label>一時的な利用条件・条件式<input name="expression" value="${esc(e.conditions.expression||'')}"></label><p class="help">ファストトラベルは目的地の発見を必須にします。</p><div class="row"><label>出口 X<input type="number" step="any" name="exit_x" value="${e.exit_position.x}"></label><label>出口 Y<input type="number" step="any" name="exit_y" value="${e.exit_position.y}"></label><label>入口 X<input type="number" step="any" name="entry_x" value="${e.entrance_position.x}"></label><label>入口 Y<input type="number" step="any" name="entry_y" value="${e.entrance_position.y}"></label></div><label>接続メモ<textarea name="notes">${esc(e.notes)}</textarea></label><label>変更理由<input name="reason" required value="${esc(mapDrafts.get(edgeId)?.reason||(creating?'地図で指定したフィールド間の接続':'接続設定の変更'))}"></label><div class="modal-actions">${creating?'<button type="submit" id="queueEdge">追加して地図に戻る</button>':'<button type="button" id="deleteEdge" class="danger">'+(pending?'変更案からこの接続を外す':'接続を削除')+'</button>'}<button type="submit" class="primary">変更案の差分を見る</button></div></form>`);
 const form=$('#edgeForm');
 for(const key of ['from','to']){
  const mapSelect=form.elements[key+'_map'],fieldSelect=form.elements[key+'_field'];
  mapSelect.onchange=()=>{fieldSelect.innerHTML=fieldOpts(mapSelect.value,fieldSelect.value)};
 }
 form.onsubmit=async ev=>{ev.preventDefault();if(apiBusy)return;const f=new FormData(ev.target),conditions={requires_discovery:true};if(f.get('min_level'))conditions.min_level=Number(f.get('min_level'));for(const k of ['quest_id','expression'])if(f.get(k))conditions[k]=f.get(k);const changes={from_field:f.get('from_field'),to_field:f.get('to_field'),direction:f.get('direction'),kind:f.get('kind'),conditions,exit_position:{x:Number(f.get('exit_x')),y:Number(f.get('exit_y'))},entrance_position:{x:Number(f.get('entry_x')),y:Number(f.get('entry_y'))},notes:f.get('notes')};const op={collection:'field_edges',id:e.edge_id,changes},reason=f.get('reason');
  if(changes.from_field===changes.to_field){toast('出発地点と到着地点を別の地点にしてください');return}
  if(changes.kind==='level'&&!conditions.min_level||changes.kind==='quest'&&!conditions.quest_id||changes.kind==='temporary'&&!conditions.expression){
   toast('移動方法に必要な条件を入力してください');return;
  }
  const editingPending=creating&&[from,to,changes.from_field,changes.to_field].some(i=>mapDrafts.has(i));
  if(ev.submitter?.id==='queueEdge'||queued||editingPending||(creating&&mapDrafts.size)){
   mapDrafts.set(op.id,{op,reason});renderMapDrafts();
   if(ev.submitter?.id==='queueEdge'){closeModal();return}
   await submitMapDrafts();
  }else try{await propose([op],reason)}catch(e){toast(e.message)}
 };
 if($('#deleteEdge'))$('#deleteEdge').onclick=()=>removeConnection(edgeId,pending);
}
async function removeConnection(edgeId,pending){
 if(apiBusy)return;
 if(pending&&!boot.remove_pending_connection){
  toast('変更案から接続を外すには、設計室を再起動してください');return;
 }
 const button=$('#deleteEdge');
 apiBusy=true;button.disabled=true;
 try{
  if(pending){
   const result=await api('/api/proposals/remove-connection',{proposal_id:pending.proposal_id,edge_id:edgeId});
   preview=result.proposal;selectedEdge=null;redoOps=null;dock='proposals';
   persistView();closeModal();await refresh();toast('この接続を変更案から外しました');
  }else{
   await propose([{collection:'field_edges',id:edgeId,action:'delete'}],'接続の解除: '+edgeId);
  }
 }catch(e){toast(e.message)}finally{apiBusy=false;button.disabled=false}
}
function spawnEditor(spawnId,monsterId){const d=previewData().data,s=spawnId?d.field_spawns[spawnId]:{spawn_id:id('spawn'),field_id:selected,monster_id:monsterId,count:1,level_override:null,special:false,respawn_seconds:null,area:{},conditions:{}};if(!s.monster_id)return;const v=resolveVariant(d,s.monster_id);
 openModal('フィールドの敵配置',`<form id="spawnForm"><h3>${esc(v.name)} <span class="badge">${esc(v.classification)}</span></h3><p class="help">${esc(s.monster_id)} / 基準Lv ${v.base_level??'未設定'}<br>HP ${v.hp??'未設定'} / 攻撃 ${v.attack??'未設定'} / 防御 ${v.defense??'未設定'} / EXP ${v.exp??'未設定'}</p><p>${esc(fieldName(s.field_id,d))}</p><div class="row"><label>出現数<input name="count" type="number" min="1" max="10000" required value="${s.count}"></label><label>リスポーン秒数<input name="respawn_seconds" type="number" min="0" step="0.1" value="${s.respawn_seconds??''}"></label></div><label class="check"><input name="special" type="checkbox" ${s.special?'checked':''}> 特殊個体（個別Lv上書きを許可）</label><label>特殊個体のLv（空欄はVariant参照）<input name="level_override" type="number" min="1" max="200" value="${s.level_override??''}"></label><label>出現エリア・位置 JSON<textarea name="area">${esc(JSON.stringify(s.area))}</textarea></label><label>出現条件 JSON<textarea name="conditions">${esc(JSON.stringify(s.conditions))}</textarea></label><label>変更理由<input name="reason" required value="${spawnId?'敵配置の調整':'敵Variantをフィールドへ追加'}"></label><div class="modal-actions">${spawnId?'<button type="button" id="removeSpawn" class="danger">配置を削除</button>':''}<button type="submit" class="primary">差分を確認</button></div></form>`);
 $('#spawnForm').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target),changes={field_id:s.field_id,monster_id:s.monster_id,count:Number(f.get('count')),respawn_seconds:f.get('respawn_seconds')===''?null:Number(f.get('respawn_seconds')),special:f.has('special'),level_override:f.get('level_override')===''?null:Number(f.get('level_override')),area:JSON.parse(f.get('area')),conditions:JSON.parse(f.get('conditions'))};await propose([{collection:'field_spawns',id:s.spawn_id,changes}],f.get('reason'))}catch(e){toast(e.message)}};if($('#removeSpawn'))$('#removeSpawn').onclick=()=>propose([{collection:'field_spawns',id:s.spawn_id,action:'delete'}],'敵配置の解除').catch(e=>toast(e.message));
}
function monsterLibrary(pick=false){const d=previewData().data;openModal(pick?'図鑑から敵を選択':'モンスター図鑑・地域別Variant',`<p class="help">既存の敵素材を系統として参照します。戦闘数値を推測して確定せず、地域別Variantを登録してください。空欄のステータスは系統の値を継承します。</p><div class="row"><input id="monsterSearch" placeholder="名前・IDで検索"><select id="familyFilter"><option value="">すべての系統</option>${Object.values(d.monster_families).map(f=>`<option value="${esc(f.family_id)}">${esc(f.name)}</option>`).join('')}</select><select id="monsterRegion"><option value="">すべての地域</option>${maps.map(m=>`<option value="${esc(m.region_id)}">${esc(m.name)}</option>`).join('')}</select></div><div class="row"><input id="monsterMin" type="number" placeholder="Lv下限"><input id="monsterMax" type="number" placeholder="Lv上限"><input id="monsterElement" placeholder="元素"><select id="monsterClass"><option value="">すべての分類</option>${['normal','elite','local_legend','boss','weekly_boss'].map(c=>`<option>${c}</option>`).join('')}</select></div><div class="monster-list" id="monsterResults"></div><div class="modal-actions"><button id="newFamily">＋ 敵系統を作成</button><button id="newVariant" class="primary">＋ 地域別Variantを作成</button></div>`);
 function results(){const search=$('#monsterSearch').value,region=$('#monsterRegion').value,family=$('#familyFilter').value,cl=$('#monsterClass').value,element=$('#monsterElement').value,min=$('#monsterMin').value,max=$('#monsterMax').value;const vs=Object.values(d.monster_variants).filter(v=>{const r=resolveVariant(d,v.monster_id);return (!search||(v.name+v.monster_id).includes(search))&&(!region||v.region_id===region)&&(!family||v.family_id===family)&&(!cl||v.classification===cl)&&(!element||r.element===element)&&(!min||r.base_level>=Number(min))&&(!max||r.base_level!=null&&r.base_level<=Number(max))});$('#monsterResults').innerHTML=vs.map(v=>{const r=resolveVariant(d,v.monster_id);return `<div class="monster-entry"><b>${esc(v.name)}</b> <span class="badge">Lv${r.base_level??'未設定'}</span><small>${esc(maps.find(m=>m.region_id===v.region_id)?.name)} / ${esc(v.classification)} / ${esc(r.element||'元素未設定')}<br>${esc(v.monster_id)}</small>${pick?`<button data-pick-monster="${esc(v.monster_id)}" class="primary">この敵を追加</button>`:''}<button data-edit-monster="${esc(v.monster_id)}">基準Lv・数値を編集</button></div>`}).join('')||'<p class="help">該当するVariantはありません。「地域別Variantを作成」で登録できます。</p>';$$('[data-pick-monster]').forEach(b=>b.onclick=()=>spawnEditor(null,b.dataset.pickMonster));$$('[data-edit-monster]').forEach(b=>b.onclick=()=>variantEditor(b.dataset.editMonster))}
 for(const s of ['#monsterSearch','#monsterRegion','#familyFilter','#monsterMin','#monsterMax','#monsterClass','#monsterElement'])$(s).oninput=results;$('#newFamily').onclick=familyEditor;$('#newVariant').onclick=()=>variantEditor();results();}
function familyEditor(){openModal('敵系統を作成',`<form id="familyForm"><label>固定family_id<input name="family_id" required value="${id('family')}"></label><label>系統名<input name="name" required></label><label>元素<input name="element"></label><label>行動パターン参照<input name="behavior"></label><label>スプライト参照<input name="sprite"></label><label>アニメーション参照<input name="animation"></label><label>継承する基礎値 JSON<textarea name="defaults" placeholder='{"hp":100,"attack":10}'>{}</textarea></label><label>変更理由<input name="reason" required value="敵系統の新規登録"></label><div class="modal-actions"><button type="submit" class="primary">差分を確認</button></div></form>`);$('#familyForm').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target);const changes={name:f.get('name'),element:f.get('element'),behavior:f.get('behavior')||null,sprite:f.get('sprite')||null,animation:f.get('animation')||null,defaults:JSON.parse(f.get('defaults'))};await propose([{collection:'monster_families',id:f.get('family_id'),changes}],f.get('reason'))}catch(e){toast(e.message)}}}
function variantEditor(monsterId){const d=previewData().data,v=monsterId?d.monster_variants[monsterId]:{monster_id:id('monster'),family_id:Object.keys(d.monster_families)[0],region_id:activeMap().region_id,name:'',base_level:null,hp:null,attack:null,defense:null,exp:null,drops:null,behavior:null,sprite:null,animation:null,classification:'normal',element:null};openModal(monsterId?'地域別Variantを編集':'地域別Variantを作成',`<form id="variantForm"><div class="row"><label>固定monster_id<input name="monster_id" required ${monsterId?'readonly':''} value="${esc(v.monster_id)}"></label><label>表示名<input name="name" required value="${esc(v.name)}"></label></div><div class="row"><label>敵系統<select name="family_id">${Object.values(d.monster_families).map(f=>`<option value="${esc(f.family_id)}" ${f.family_id===v.family_id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label><label>地域<select name="region_id">${maps.map(m=>`<option value="${esc(m.region_id)}" ${m.region_id===v.region_id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><label>分類<select name="classification">${['normal','elite','local_legend','boss','weekly_boss'].map(x=>`<option ${x===v.classification?'selected':''}>${x}</option>`).join('')}</select></label></div><div class="row">${['base_level','hp','attack','defense','exp'].map(k=>`<label>${({base_level:'基準Lv',hp:'HP',attack:'攻撃',defense:'防御',exp:'EXP'})[k]}<input name="${k}" type="number" min="${k==='base_level'?1:0}" ${k==='base_level'?'max="200"':''} value="${v[k]??''}"></label>`).join('')}</div><p class="help">空欄は系統から継承します。基準Lvの変更は参照中の全フィールドへ反映し、特殊個体のLv上書きは維持します。</p><div class="row">${['element','behavior','sprite','animation'].map(k=>`<label>${({element:'元素',behavior:'行動パターン参照',sprite:'スプライト参照',animation:'アニメ参照'})[k]}<input name="${k}" value="${esc(v[k])}"></label>`).join('')}</div><label>ドロップテーブル JSON（nullで系統を継承）<textarea name="drops">${esc(JSON.stringify(v.drops))}</textarea></label><label>変更理由<input name="reason" required value="${monsterId?'地域別の基準値を調整':'地域別Variantの新規登録'}"></label><div class="modal-actions"><button type="submit" class="primary">影響フィールドと差分を確認</button></div></form>`);
 $('#variantForm').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target),changes={};for(const k of ['name','family_id','region_id','classification'])changes[k]=f.get(k);for(const k of ['base_level','hp','attack','defense','exp'])changes[k]=f.get(k)===''?null:Number(f.get(k));for(const k of ['element','behavior','sprite','animation'])changes[k]=f.get(k)||null;changes.drops=JSON.parse(f.get('drops'));if(monsterId)for(const k of Object.keys(changes))if(JSON.stringify(changes[k])===JSON.stringify(v[k]))delete changes[k];await propose([{collection:'monster_variants',id:f.get('monster_id'),changes}],f.get('reason'))}catch(e){toast(e.message)}};
}
async function refreshProposals() {
 if (dirty) {
  toast('入力中の編集を保存してから変更案を更新してください。');
  return;
 }
 try {
  await refresh();
  toast('変更案を最新の状態に更新しました。');
 } catch (error) {
  toast(error.message);
 }
}
function renderDock(){for(const b of $$('[data-dock]'))b.classList.toggle('active',b.dataset.dock===dock);const body=$('#dockBody');if(dock==='chat'){body.innerHTML=`<div class="chat-intro"><span class="spark">✦</span><p>地点と敵を一つずつ決めて、冒険をつくりましょう。<br>ここではID・登録名による指示を変更案に変換します。ChatGPT相談用Markdown・変更JSONも利用できます。</p></div><div class="chat-examples"><button data-example="比較">この地域のフィールドLvを比較</button><button data-example="樹形図を表示">接続グラフを表示</button><button id="importChanges">変更JSONを取り込む</button></div><form id="chatForm" class="chat-form"><input id="chatInput" value="${esc(chatText)}" placeholder="例：teyvat:3の推奨Lvを8にする" aria-label="設計指示"><button type="submit" class="primary">変更案を作成 ↑</button></form><label class="check" style="margin:7px 0"><input type="checkbox" id="useSelected"> ${selected?'選択中の '+esc(selected)+' を明示的な対象にする':'地図で選択した地点を明示的な対象にする'}</label><div id="chatResult" class="chat-result"></div>`;$('#chatForm').onsubmit=async e=>{e.preventDefault();chatText=$('#chatInput').value;const selectedArg=$('#useSelected').checked?selected:null;try{const r=await api('/api/compile',{text:chatText,region_id:activeMap().region_id,selected_field_id:selectedArg,base_revision:project.revision});chatResult=r;if(r.proposal){preview=r.proposal;await refresh();showDiff(preview)}else if(r.status==='graph'){view='graph';setView(view)}else renderChatResult(r)}catch(e){toast(e.message)}};$$('[data-example]').forEach(b=>b.onclick=()=>{$('#chatInput').value=b.dataset.example;$('#chatForm').requestSubmit()});$('#importChanges').onclick=importDialog;if(chatResult)renderChatResult(chatResult)}
 else if(dock==='proposals'){const ps=Object.values(project.proposals).filter(p=>p.status==='proposed').reverse();body.innerHTML=`<div class="row"><p class="help">採用するまで正本には反映されません。金色の表示が提案レイヤーです。</p><button id="hidePreview">プレビュー解除</button><button id="refreshProposals">更新</button><button id="importProposal">JSON取込</button></div>`+ps.map(p=>`<article class="proposal-card"><header><b>${esc(p.reason)}</b>${badge('proposed')}</header><p>${esc(p.actor)} / rev ${p.base_revision} / 影響 ${p.impact.affected_count}地点 / ${new Date(p.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} JST</p><button data-proposal="${esc(p.proposal_id)}">差分を確認・採用</button><button data-preview="${esc(p.proposal_id)}">地図で見る</button></article>`).join('');$('#hidePreview').onclick=()=>{preview=null;persistView();graph.draw();renderInspector();renderHeader();toast('保存済み変更案のプレビューを解除しました')};$('#importProposal').onclick=importDialog;$('#refreshProposals').onclick=refreshProposals;$$('[data-proposal]').forEach(b=>b.onclick=()=>showDiff(project.proposals[b.dataset.proposal]));$$('[data-preview]').forEach(b=>b.onclick=()=>showProposalMap(project.proposals[b.dataset.preview]))}
 else if(dock==='history'){body.innerHTML=project.design_history.slice().reverse().map(h=>`<article class="history-card"><header><b>${esc(h.reason)}</b><span class="badge">rev ${h.revision}</span></header><p>${esc(h.actor)} → user採用 / ${new Date(h.timestamp).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} JST / ${h.changes.length}項目</p><p>${esc(h.field_ids.join(', '))}</p><button data-history="${esc(h.change_id)}">変更前後</button><button data-rollback="${esc(h.change_id)}">巻き戻し案</button><button data-lifecycle="${esc(h.change_id)}">実装・検証状態</button></article>`).join('')||'<p class="help">採用した変更の履歴がここに表示されます。</p>';$$('[data-history]').forEach(b=>b.onclick=()=>{const h=project.design_history.find(h=>h.change_id===b.dataset.history);openModal('変更履歴',`<p>${esc(h.reason)}</p><pre class="code-input">${esc(JSON.stringify(h,null,2))}</pre>`)});$$('[data-rollback]').forEach(b=>b.onclick=()=>rollback(b.dataset.rollback));$$('[data-lifecycle]').forEach(b=>b.onclick=()=>lifecycle(project.design_history.find(h=>h.change_id===b.dataset.lifecycle)))}
 else {const localIds=new Set(mapFieldIds(activeMap(),project));body.innerHTML=report?`<p class="help">開始 ${esc(report.start_field)} / 到達 ${report.reachable_count} / 全${report.total_fields}地点。条件が満たされた場合の静的な経路検査です。</p><p class="help">未接続は未設計として警告します。意図した行き止まり・隠し部屋は理由を付けて例外承認できます。</p>${report.issues.filter(x=>localIds.has(x.target_id)||localIds.has(project.field_edges[x.target_id]?.from_field)).map((x,i)=>`<div class="report-row"><b>${esc(x.code)}</b><span>${esc(x.target_id)} / ${esc(x.message)} ${x.exception?'[例外承認済み]':''}</span>${x.exception?'':`<button data-exception="${report.issues.indexOf(x)}">例外を提案</button>`}</div>`).join('')}`:'<p class="help">「接続を検査」で未到達・一方通行の帰還・Lvの飛び・必須経路を確認できます。</p>';$$('[data-exception]').forEach(b=>b.onclick=()=>exceptionEditor(report.issues[Number(b.dataset.exception)]))}
}
function renderChatResult(r){const container=$('#chatResult');if(!container)return;container.replaceChildren();const p=document.createElement('p');p.textContent=r.message||r.status;container.append(p);if(r.status==='read'){const table=document.createElement('table');table.className='diff-table';table.innerHTML='<tr><th>フィールド</th><th>推奨Lv</th><th>敵</th></tr>'+r.result.fields.map(f=>`<tr><td>${esc(f.field_id+' '+f.name)}</td><td>${f.recommended_level??'未設定'}</td><td>${esc(f.spawns.map(s=>s.monster.name+' Lv'+s.effective_level+'×'+s.count).join(', '))}</td></tr>`).join('');container.append(table)}if(r.candidates?.length){const div=document.createElement('div');div.className='candidate-list';for(const f of r.candidates){const b=document.createElement('button');b.textContent=f.field_id+' '+(f.name||'名称未確認');b.onclick=()=>{choose(f.field_id);$('#useSelected').checked=true;toast('対象を選択しました。指示内容を確認して再送信してください。')};div.append(b)}container.append(div)}}
async function rollback(changeId){try{const p=await api('/api/rollback',{change_id:changeId});preview=p;await refresh();showDiff(p)}catch(e){toast(e.message)}}
async function undo(){if(dirty){toast('未保存のフォームは入力欄内でCtrl+Zを使用してください。');return}if(preview){redoOps={type:'preview',operations:clone(preview.operations)};preview=null;persistView();graph.draw();renderInspector();renderHeader();toast('変更案のプレビューを取り消しました。Redoで再表示できます。');return}const h=project.design_history.at(-1);if(h){try{const undoChange=await api('/api/undo',{change_id:h.change_id,revision:project.revision});redoOps={type:'applied',change_id:undoChange.change_id};await refresh();toast('直前の採用を取り消し、逆差分を履歴に保存しました。')}catch(e){toast(e.message)}}}
async function redo(){if(!redoOps)return;const entry=redoOps;try{if(entry.type==='preview'){await propose(entry.operations,'Redo: 変更案を再表示')}else{await api('/api/undo',{change_id:entry.change_id,revision:project.revision});preview=null;await refresh();toast('取り消した設定を復元し、履歴に保存しました。')}redoOps=null;renderHeader()}catch(e){toast(e.message)}}
function lifecycle(h){const records=new Map();for(const x of h.changes){if(x.item==='*'||!project[x.collection]?.[x.id])continue;const key=x.collection+':'+x.id;if(!records.has(key))records.set(key,{collection:x.collection,id:x.id,changes:{},states:{}});records.get(key).states[x.item]='implemented'}openModal('実装・検証状態を記録',`<p class="help">ゲームへ実際に取り込んだ項目だけを実装済み、動作確認を終えた項目だけを検証済みにしてください。値の変更と状態の昇格は分離します。</p><label>状態<select id="lifecycleState"><option value="implemented">ゲームに実装済み</option><option value="verified">動作検証済み</option></select></label><label>実装コミット・検証記録などの出典<input id="lifecycleSource" required></label><div class="modal-actions"><button id="lifecyclePropose" class="primary">状態変更の差分を確認</button></div>`);$('#lifecyclePropose').onclick=()=>{const source=$('#lifecycleSource').value;if(!source.trim()){toast('実装・検証の出典を入力してください');return}for(const op of records.values())for(const k of Object.keys(op.states))op.states[k]=$('#lifecycleState').value;propose([...records.values()],source,'user',source).catch(e=>toast(e.message))}}
function exceptionEditor(issue){openModal('接続警告の例外を提案',`<p>${esc(issue.target_id)} / ${esc(issue.message)}</p><label>意図した設計である理由<textarea id="exceptionReason" placeholder="例：探索後に同じポータルで帰還できる隠し部屋"></textarea></label><div class="modal-actions"><button id="saveException" class="primary">例外の差分を確認</button></div>`);$('#saveException').onclick=()=>{const reason=$('#exceptionReason').value;propose([{collection:'graph_exceptions',id:id('exception'),changes:{code:issue.code,target_id:issue.target_id,reason}}],reason).catch(e=>toast(e.message))}}
function importDialog(){const sample={schema_version:1,base_revision:project.revision,actor:'ChatGPT',reason:'相談で作成した変更案',source:'ChatGPTとの相談',operations:[{collection:'field_definitions',id:selected||activeMap().node_ids[0]||'地点ID',changes:{recommended_level:8}}]};openModal('ChatGPT・Codexの変更JSONを取り込む',`<p class="help">変更指示JSONを貼り付けるかファイルを読み込みます。承認済み設計JSONからの再取込も、差分を提案として扱います。</p><textarea id="changeJson" class="code-input">${esc(JSON.stringify(sample,null,2))}</textarea><div class="modal-actions"><button id="loadJson">JSONファイルを選択</button><button id="parseJson" class="primary">検証して差分を作成</button></div>`);$('#loadJson').onclick=()=>$('#importFile').click();$('#parseJson').onclick=async()=>{try{await importObject(JSON.parse($('#changeJson').value))}catch(e){toast(e.message)}}}
async function importObject(input){if(input.operations){const p=await api('/api/proposals',input);preview=p;await refresh();showDiff(p);return}const ops=[];for(const c of ['field_definitions','field_edges','monster_families','monster_variants','field_spawns','graph_layouts'])for(const [i,r] of Object.entries(input[c]||{})){const current=project[c][i];const changes={};for(const [k,v] of Object.entries(r)){if(k==='_meta'||k===({field_definitions:'field_id',field_edges:'edge_id',monster_families:'family_id',monster_variants:'monster_id',field_spawns:'spawn_id',graph_layouts:'layout_id'})[c])continue;if(JSON.stringify(current?.[k])!==JSON.stringify(v))changes[k]=v}if(Object.keys(changes).length)ops.push({collection:c,id:i,changes})}await propose(ops,'設計JSONの再取込（追加・更新。削除は変更指示JSONで明示）','ChatGPT','Imported design JSON')}
function download(name,body,type='application/json'){const b=body instanceof Blob?body:new Blob([typeof body==='string'?body:JSON.stringify(body,null,2)+'\n'],{type});const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000)}
function exportDialog(){openModal('設計を持ち出す',`<p class="help">対象：${esc(activeMap().name)} / 正本 rev ${project.revision}。JSON・Markdownは最新の正本を出力します。PNGは現在の表示と提案レイヤーを含みます。</p><div class="export-grid">${[['json','地域別設計JSON','全地点・敵配置・接続・項目別の決定状態'],['markdown','ChatGPT相談用Markdown','確定事項・未決定事項・直近の変更'],['changes','変更指示JSON','表示中の提案をCodexへ渡す'],['png','公式マップ重ね合わせPNG','表示範囲にID・Lv・敵・精鋭を重ねる'],['csv','敵・精鋭配置CSV','フィールド別の敵・Lv・数一覧'],['edges','接続グラフJSON','双方向・一方通行・条件付きの移動'],['runtime','ゲーム実装用JSON','承認済みの項目だけ。Lua側の手動導入用'],['world-runtime','全地域ゲーム実装用JSON','地域間接続を含む承認済み全データ'],['report','地域間レベル整合性レポート','通常8地域・高難度9地域の基準と接続検査']].map(([key,title,desc])=>`<button data-export="${key}"><b>${title} ↗</b><small>${desc}</small></button>`).join('')}</div><p class="help">公式地形画像の再配布許可は確認できていません。PNGは権利条件を確認した用途で利用してください。</p>`);$$('[data-export]').forEach(b=>b.onclick=async()=>{try{const fmt=b.dataset.export,base=activeMap().region_id;if(fmt==='png')download(base+'-overlay.png',await graph.exportPNG(),'image/png');else if(fmt==='changes'){if(!preview)throw Error('変更案をプレビューしてから出力してください');download(base+'-changes.json',{schema_version:1,base_revision:preview.base_revision,reason:preview.reason,source:preview.source,actor:preview.actor,operations:preview.operations})}else if(fmt==='report')download('level-consistency-report.json',await api('/api/report?start='+encodeURIComponent((project.field_definitions[selected]?selected:null)||mapFieldIds(activeMap(),project)[0]||Object.keys(nodes)[0])));else{const out=await api('/api/export?map_id='+encodeURIComponent(fmt==='world-runtime'?'all':currentMap)+'&format='+(fmt==='world-runtime'?'runtime':fmt));download(base+'-'+fmt+(fmt==='markdown'?'.md':fmt==='csv'?'.csv':'.json'),out,fmt==='markdown'?'text/markdown':fmt==='csv'?'text/csv':'application/json')}toast('出力ファイルを作成しました')}catch(e){toast(e.message)}})}
function manualImageDialog(image){const m=activeMap(),ns=m.node_ids.map(i=>nodes[i]),xs=ns.map(n=>n.x),ys=ns.map(n=>n.y);openModal('公式地形画像を座標に合わせる',`<p class="help">画像の左上・右下が対応する公式座標を入力してください。画像が未較正なら、公式地点を目印に範囲を調整してください。公式座標そのものは変更しません。</p><form id="calibrateForm"><div class="row"><label>左上 X<input type="number" name="x0" step="any" value="${ns.length?Math.min(...xs)-100:0}"></label><label>左上 Y<input type="number" name="y0" step="any" value="${ns.length?Math.min(...ys)-100:0}"></label><label>右下 X<input type="number" name="x1" step="any" value="${ns.length?Math.max(...xs)+100:image.width}"></label><label>右下 Y<input type="number" name="y1" step="any" value="${ns.length?Math.max(...ys)+100:image.height}"></label></div><p class="warning">初期値は地点の外接範囲です。公式画像との位置一致を保証する較正値ではありません。正しい画像範囲を確認してください。</p><div class="modal-actions"><button type="submit" class="primary">指定範囲に表示</button></div></form>`);$('#calibrateForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),x=Number(f.get('x0')),y=Number(f.get('y0')),w=Number(f.get('x1'))-x,h=Number(f.get('y1'))-y;if(w<=0||h<=0){toast('右下が左上より大きい座標範囲を指定してください');return}graph.manual={image,x,y,w,h,mapId:currentMap};if(floorId)setFloor('');graph.draw();closeModal()}}
function renderMapDrafts(){
 renderHeader();renderInspector();graph.draw();
}
async function submitMapDrafts(){
 if(apiBusy||!mapDrafts.size)return;
 apiBusy=true;
 const drafts=[...mapDrafts.values()];
 const submit=$('#submitMapDrafts')||$('#edgeForm .primary');
 if(submit)submit.disabled=true;
 try{
  const reasons=[...new Set(drafts.map(x=>x.reason))];
  const reason=reasons.length===1?reasons[0]:'地図上の変更 '+drafts.length+'件（'+reasons.join(' / ').slice(0,1900)+'）';
  await propose(drafts.map(x=>x.op),reason);
  mapDrafts.clear();renderMapDrafts();
 }catch(e){toast(e.message)}finally{apiBusy=false;if(submit)submit.disabled=false}
}
function reviewMapDrafts(){
 if(!discardMapDraft())return;
 const d=previewData().data;
 openModal('編集中の追加',`<ul class="map-drafts">${[...mapDrafts.values()].map(({op})=>{
  const e=op.changes,label=op.collection==='field_edges'?fieldName(e.from_field,d)+(e.direction==='both'?' ↔ ':' → ')+fieldName(e.to_field,d):e.name+'（ワープポイント）';
  return `<li><span>${esc(label)}</span><button type="button" data-remove-draft="${esc(op.id)}">外す</button></li>`;
 }).join('')}</ul><div class="modal-actions"><button id="continueMapDrafts">地図に戻る</button><button id="submitMapDrafts" class="primary">まとめて差分を見る</button></div>`);
 $('#continueMapDrafts').onclick=closeModal;
 $('#submitMapDrafts').onclick=submitMapDrafts;
 $$('[data-remove-draft]').forEach(button=>button.onclick=()=>{
  if(apiBusy)return;
  const i=button.dataset.removeDraft;
  const links=[...mapDrafts.values()].filter(({op})=>op.collection==='field_edges'&&[op.changes.from_field,op.changes.to_field].includes(i));
  if(links.length&&!confirm('この地点につないだ編集中の接続も外しますか？'))return;
  mapDrafts.delete(i);for(const {op} of links)mapDrafts.delete(op.id);
  if(selected===i)selected=null;
  renderMapDrafts();
  if(mapDrafts.size)reviewMapDrafts();else closeModal();
 });
}
function setWaypointPlacement(enabled){
 placingWaypoint=enabled;renderHeader();updateMapHint();
}
function waypointEditor(position){
 setWaypointPlacement(false);
 const mapId=currentMap;
 openModal('ワープポイントを追加',`<form id="waypointForm"><label>フィールド名<input name="name" required maxlength="200" autofocus></label><div class="row"><label>地図 X<input type="number" name="x" required step="any" value="${position.x.toFixed(2)}"></label><label>地図 Y<input type="number" name="y" required step="any" value="${position.y.toFixed(2)}"></label></div><div class="modal-actions"><button type="submit" class="primary">追加して地図に戻る</button></div></form>`);
 $('#waypointForm').onsubmit=ev=>{
  ev.preventDefault();
  const f=new FormData(ev.target),name=f.get('name').trim();
  if(!name){toast('フィールド名を入力してください');return}
  const x=Number(f.get('x')),y=Number(f.get('y'));
  if(Math.abs(x)>=1e7||Math.abs(y)>=1e7){toast('地図座標は絶対値が1,000万未満の数値を指定してください');return}
  const fieldId=id('waypoint');
  const op={collection:'field_definitions',id:fieldId,changes:{name,region_id:activeMap().region_id,waypoint_position:{map_id:mapId,x,y}}};
  mapDrafts.set(fieldId,{op,reason:'ワープポイントを追加'});
  choose(fieldId,false);renderMapDrafts();closeModal();
 };
}
function discardMapDraft(){
 if(dirty&&!confirm('地点に未保存の入力があります。破棄して続けますか？'))return false;
 dirty=false;
 return true;
}
function selectMapEdge(i){
 if(!discardMapDraft())return false;
 selectedEdge=i;renderInspector();graph.draw();
 return true;
}
function setView(v){view=v;placingWaypoint=false;floorId='';renderFloorPicker();$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));renderHeader();graph.setMode(v);persistView();updateMapHint()}
function updateMapHint(){const v=view;$('#mapHint').textContent=placingWaypoint?'追加したい位置をクリック':v==='graph'?'本体をドラッグで配置 · 丸いハンドルで接続 · 線を右クリックで編集':v==='route'?'推奨Lv順に配置 · 地点をドラッグで接続 · 線を右クリックで編集':'地点をドラッグで接続 · 地図の背景をドラッグで移動 · 線を右クリックで編集'}
async function start(){try{boot=await fetch('/api/bootstrap').then(r=>{if(!r.ok)throw Error('エディタの初期化に失敗しました');return r.json()});({project,maps,map_nodes:nodes,map_sources:mapSources,ui_token:token}=boot);let saved={};try{saved=JSON.parse(localStorage.getItem('field-editor-view')||'{}')}catch{}currentMap=maps.some(m=>m.map_id===saved.map)?saved.map:'region-01-map';preview=project.proposals[saved.proposal]?.status==='proposed'?project.proposals[saved.proposal]:null;selected=previewData().data.field_definitions[saved.selected]?saved.selected:null;graph=new FieldMap($('#mapViewport'),{getScene:scene,onPlace:waypointEditor,onSelect:choose,onEdge:selectMapEdge,onEditEdge:i=>{if(selectMapEdge(i))edgeEditor(i)},onConnect:(a,b)=>{if(discardMapDraft()){choose(a,false);edgeEditor(null,a,b)}},onLayout:async(i,p)=>{if(!discardMapDraft())return;choose(i,false);try{const existing=Object.values(project.graph_layouts).find(l=>l.field_id===i&&l.view_id===currentMap);await propose([{collection:'graph_layouts',id:existing?.layout_id||id('layout'),changes:{field_id:i,view_id:currentMap,x:Math.round(p.x),y:Math.round(p.y)}}],'接続グラフのノード配置を変更')}catch(e){toast(e.message)}}});renderHeader();renderRegions();renderInspector();renderDock();setView(['geo','graph','route'].includes(saved.view)?saved.view:'geo');
 $('#floorSelect').onchange=e=>{if(discardMapDraft())setFloor(e.target.value);else e.target.value=floorId};$('#addWaypoint').onclick=()=>{if(!boot.custom_waypoints){toast('ワープポイントを追加するには設計室を再起動してください');return}if(placingWaypoint||discardMapDraft()){renderInspector();setWaypointPlacement(!placingWaypoint)}};$('#reviewMapDrafts').onclick=reviewMapDrafts;$('#regionSearch').oninput=renderRegions;for(const sel of ['#kindFilter','#scopeFilter','#layerFilter','#minLevel','#maxLevel','#eliteFilter','#stateFilter','#productionFilter'])$(sel).oninput=()=>{renderHeader();graph.draw()};$('#clearFilters').onclick=()=>{$$('#kindFilter,#scopeFilter,#layerFilter,#eliteFilter,#stateFilter,#productionFilter').forEach(x=>x.value='all');$('#minLevel').value='';$('#maxLevel').value='';renderHeader();graph.fit()};$('#pointSearch').oninput=renderPointPicker;$('#fitMap').onclick=()=>graph.fit();$('#zoomIn').onclick=()=>graph.zoom(1.5);$('#zoomOut').onclick=()=>graph.zoom(1/1.5);$('#connectMode').onchange=()=>graph.draw();$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$$('[data-dock]').forEach(b=>b.onclick=()=>{dock=b.dataset.dock;renderDock()});$('#monsterOpen').onclick=()=>monsterLibrary();$('#modalClose').onclick=closeModal;$('#exportOpen').onclick=exportDialog;$('#undo').onclick=undo;$('#redo').onclick=redo;$('#checkGraph').onclick=async()=>{try{report=await api('/api/report?start='+encodeURIComponent(selected||activeMap().node_ids[0]||Object.keys(nodes)[0]));dock='report';renderDock();toast('接続と地域Lvの検査結果を表示しました')}catch(e){toast(e.message)}};$('#manualMap').onclick=()=>$('#imageFile').click();$('#imageFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const im=new Image(),url=URL.createObjectURL(f);im.onload=()=>{URL.revokeObjectURL(url);manualImageDialog(im)};im.src=url};$('#importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const text=await f.text();if($('#changeJson'))$('#changeJson').value=text;else await importObject(JSON.parse(text))}catch(e){toast(e.message)}e.target.value=''};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&placingWaypoint)setWaypointPlacement(false);if(e.target.matches('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}});window.addEventListener('beforeunload',e=>{if(dirty||mapDrafts.size){e.preventDefault();e.returnValue=''}});
 }catch(e){toast(e.message);$('#mapLoading').textContent=e.message}}
start();
