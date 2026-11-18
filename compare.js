import {sessionLifecycle,frameResponse} from './session-lifecycle.js';
const lifecycle=sessionLifecycle('maple-compare-session');
import {loadSpriteImages,elementTintedSprite,combatOpacity,drawCombatRect,omitCombatDraw} from './sprite-images.js';
import {scenery} from './scenery.js';
const $=id=>document.getElementById(id);
const data=await(await fetch('assets/variants.json')).json(),variants=data.variants;
const {bossImages,bossAtlas,atlas}=await loadSpriteImages($('state'));
const names={png:'原画像 PNG',...Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,v.label]))};
for(const id of ['left','right'])for(const [key,name]of Object.entries(names))$(id).add(new Option(name,key));
$('left').value='legacy';$('right').value='h48c32';
let session=lifecycle.savedSession,frozen=true,auto=false,reset=!session,busy=false,actions=[],keys=new Set(),samples=[],frame=null,last=performance.now(),acc=0,signature='';
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)]||0;
function sprite(ctx,key,id,x,y,h){const s=(variants[key]||variants.legacy).sprites[id-1],w=h*s.box[2]/s.box[3];if(key==='png'){ctx.drawImage(atlas,...s.box,x-w/2,y-h,w,h);return}for(const r of s.runs){ctx.fillStyle=r[4];ctx.fillRect(x-w/2+r[0]*w/s.width,y-h+r[1]*h/s.height,r[2]*w/s.width+.05,r[3]*h/s.height+.05)}}
function draw(canvas,draws,scene){const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);scenery(ctx,scene);for(const d of draws){if(omitCombatDraw(d))continue;ctx.globalAlpha=combatOpacity(d);if(d.kind==='rect'){drawCombatRect(ctx,d)}else if(d.kind==='text'){ctx.font=`bold ${d.size}px sans-serif`;ctx.textAlign='center';ctx.strokeStyle='#23494480';ctx.lineWidth=3;ctx.strokeText(d.text,d.x,d.y);ctx.fillStyle=d.color;ctx.fillText(d.text,d.x,d.y)}else if(d.kind==='boss_sprite'){ctx.save();ctx.translate(d.x,d.y);if(d.rotation)ctx.rotate(d.rotation);if(d.flip)ctx.scale(-1,1);ctx.drawImage(elementTintedSprite(bossImages[d.source]||bossAtlas,d.tint),...d.box,-d.w*(d.anchorX??.5),-d.h*(d.anchorY??1),d.w,d.h);ctx.restore()}else if(d.kind==='sprite'){ctx.save();ctx.translate(d.x,d.y);if(d.flip)ctx.scale(-1,1);sprite(ctx,'png',d.asset,0,0,d.h);ctx.restore()}else if(d.kind==='effect'){ctx.globalAlpha=d.alpha*.65;ctx.strokeStyle=d.color;ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(d.x,d.y,d.w/2,d.h/2,-.2,0,Math.PI*2);ctx.stroke()}}ctx.globalAlpha=1}
function portraits(){const id=+$('asset').value,h=(id<5?88:id===8?66:40)*+$('zoom').value;for(const [canvas,key]of [['original','png'],['portraitA',$('left').value],['portraitB',$('right').value]]){const ctx=$(canvas).getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,440,320);sprite(ctx,key,id,220,295,h)}for(const side of ['A','B']){const key=$(side==='A'?'left':'right').value,s=(variants[key]||variants.legacy).sprites[id-1];$('label'+side).textContent=side+' / '+names[key];$('detail'+side).textContent=key==='png'?'原画像を同じ寸法で表示':`${s.width} × ${s.height}px · ${s.runs.length.toLocaleString()}矩形${s.palette_colors?' · 共通パレット'+s.palette_colors+'色':''}`}document.querySelectorAll('tr[data-key]').forEach(r=>r.classList.toggle('selected',r.dataset.key===$('right').value))}
for(const id of ['left','right','asset','zoom'])$(id).onchange=()=>{portraits();samples=[];$(id).blur()};
$('pyroCompare').onclick=()=>{actions.push('boss_pyro_regisvine');samples=[];$('pyroCompare').blur()};
$('farkaCompare').onclick=()=>{actions.push('boss_farka');samples=[];$('farkaCompare').blur()};
$('anemoCompare').onclick=()=>{actions.push('boss_anemo');samples=[];$('anemoCompare').blur()};
$('bossCompare').onclick=()=>{actions.push('boss_cryo_regisvine');samples=[];$('bossCompare').blur()};
$('freeze').onclick=()=>{frozen=!frozen;$('freeze').textContent=frozen?'▶ 動かして比較':'Ⅱ この場面で止める';$('freeze').blur()};
$('auto').onclick=()=>{actions.push('auto');$('auto').blur()};
$('reset').onclick=()=>{reset=true;samples=[];keys.clear();$('reset').blur()};
$('density').onchange=()=>{reset=true;samples=[];$('density').blur()};
const map={KeyJ:'normal',KeyK:'skill1',KeyL:'skill2',KeyE:'swap',KeyQ:'light',ShiftLeft:'dodge'};
addEventListener('keydown',e=>{if(['SELECT','BUTTON','INPUT'].includes(document.activeElement.tagName))return;if(['Space','ArrowLeft','ArrowRight','ArrowDown'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code==='Space')actions.push(keys.has('KeyS')?'drop':'jump');else if(map[e.code])actions.push(map[e.code])}});addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({scope:'local same-state rendering comparison; excludes Miliastra',source_sha256:data.source_sha256,profiles:[$('left').value,$('right').value],density:+$('density').value,samples},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sprite-comparison.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
try{const bench=await(await fetch('evidence/variant-benchmark.json')).json();for(const row of bench.results){const tr=document.createElement('tr');tr.dataset.key=row.profile;tr.innerHTML=`<td><button>${names[row.profile]}</button></td><td>${row.commands.toLocaleString()}</td><td>${row.reduction_pct.toFixed(1)}% 減</td><td>${row.median_ms.toFixed(2)} ms</td><td>${row.p95_ms.toFixed(2)} ms</td><td>${(row.json_bytes/1024).toFixed(1)} KB</td>`;tr.querySelector('button').onclick=()=>{$('right').value=row.profile;portraits();samples=[];tr.querySelector('button').blur()};$('table').append(tr)}}catch{$('table').innerHTML='<tr><td>固定場面の計測結果はまだありません。</td></tr>'}
portraits();
async function tick(now){requestAnimationFrame(tick);acc=Math.min(100,acc+now-last);last=now;if(document.hidden||lifecycle.leaving){acc=0;keys.clear();return}if(busy||acc<100)return;busy=true;const steps=frozen?0:6;acc=0;const sent=actions;actions=[];const doReset=reset;reset=false;const profiles=[$('left').value,$('right').value];const sig=profiles.join('/')+'/'+$('density').value;if(sig!==signature){signature=sig;samples=[]}try{const res=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,...lifecycle.request(),steps,compare:true,profiles,reset:doReset,density:+$('density').value,actions:sent,input:{left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight'),jump:keys.has('Space'),attack:keys.has('KeyJ')}})});frame=await frameResponse(res);session=frame.session;lifecycle.accept(session);const item={t:frame.t,profiles,values:[]};for(let i=0;i<2;i++){const f=frame.comparisons[i],start=performance.now();draw($(i?'sceneB':'sceneA'),f.draws,frame);item.values.push({commands:f.commands,lua_ms:f.draw_ms,canvas_ms:performance.now()-start})}samples.push(item);if(samples.length>60)samples.shift();for(let i=0;i<2;i++)$('stats'+(i?'B':'A')).innerHTML=`<span>描画指示 <b>${item.values[i].commands.toLocaleString()}</b></span><span>Lua <b>${median(samples.map(s=>s.values[i].lua_ms)).toFixed(2)}</b> ms</span><span>Canvas <b>${median(samples.map(s=>s.values[i].canvas_ms)).toFixed(2)}</b> ms</span>`;const diff=100*(1-item.values[1].commands/item.values[0].commands);$('reduction').textContent=`Bは描画指示が ${Math.abs(diff).toFixed(1)}% ${diff>=0?'少ない':'多い'}`;$('state').textContent=`同一時刻 ${frame.t.toFixed(1)}秒 / 敵 ${frame.visible}体 / ${samples.length}サンプル / ${frozen?'停止中':'比較更新10Hz'}`;$('auto').textContent='自動戦闘 '+(frame.auto?'ON':'OFF');window.compareLab={frame,samples,frozen,profiles,requestedSteps:steps}}catch(e){$('state').textContent='接続エラー: '+e.message}finally{busy=false}}
requestAnimationFrame(tick);

$('electroCompare').onclick=()=>{actions.push('boss_electro');samples=[];$('electroCompare').blur()};

$('geoCompare').onclick=()=>{actions.push('boss_geo');samples=[];$('geoCompare').blur()};

$('oceanidCompare').onclick=()=>{actions.push('boss_oceanid');samples=[];$('oceanidCompare').blur()};

$('primoCompare').onclick=()=>{actions.push('boss_primo');samples=[];$('primoCompare').blur()};

$('maguuCompare').onclick=()=>{actions.push('boss_maguu');samples=[];$('maguuCompare').blur()};

$('arrayCompare').onclick=()=>{actions.push('boss_array');samples=[];$('arrayCompare').blur()};
