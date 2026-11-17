import {initSaveTransfer} from './save-transfer.js';
import {sessionLifecycle,frameResponse} from './session-lifecycle.js';
const lifecycle=sessionLifecycle('maple-lab-session');
import {loadSpriteImages} from './sprite-images.js';
import {initInventoryUI} from './inventory-ui.js';
import {initWorldUI} from './world-ui.js';
import {initSkillUI} from './loadout-ui.js';
import {scenery} from './scenery.js';
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
let session=lifecycle.savedSession,frame=null, actions=[], reset=false, busy=false,last=performance.now(),acc=0,records=[], keys=new Set(), spriteData=null;
let checkpointRequested=false,restoreRequested=null,pendingLoadout=null,pendingImport=null;
const skillUI=await initSkillUI(a=>actions.push(a),slots=>pendingLoadout=slots);
await initWorldUI(a=>actions.push(a));
const inventoryUI=initInventoryUI(a=>actions.push(a));
const SAVE_KEY='maple-lua-lab.checkpoint.v1';
$('saveProgress').onclick=()=>{checkpointRequested=true;$('saveStatus').textContent='保存中…'};
$('loadProgress').onclick=()=>{try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)throw Error('保存データがありません');restoreRequested=JSON.parse(raw);if(!restoreRequested||typeof restoreRequested!=='object')throw Error('保存データを読み取れません');$('saveStatus').textContent='読み込み中…'}catch(e){restoreRequested=null;$('saveStatus').textContent=e.message}};
initSaveTransfer({readSaved:()=>localStorage.getItem(SAVE_KEY),restore:data=>new Promise((resolve,reject)=>{restoreRequested=data;pendingImport={resolve,reject}})});
const {bossImages,bossAtlas,atlas}=await loadSpriteImages($('status'));
try{spriteData=await (await fetch('assets/sprites.json')).json()}catch{}
const mapping={KeyF:'story_nearby_portal',KeyG:'story_collect',KeyK:'skill1',KeyL:'skill2',KeyM:'skill3',KeyN:'skill4',KeyQ:'light',KeyE:'swap',ShiftLeft:'dodge',ShiftRight:'dodge',KeyP:'pause'};
for(let i=1;i<=8;i++)mapping['Digit'+i]='slot'+i;
addEventListener('keydown',e=>{if(/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName))return;if(['Space','ArrowLeft','ArrowRight','ArrowDown'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code==='Space')actions.push(keys.has('KeyS')||keys.has('ArrowDown')?'drop':'jump');else if(mapping[e.code])actions.push(mapping[e.code])}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{actions.push(b.dataset.action);b.blur()});
let holds={};document.querySelectorAll('[data-hold]').forEach(b=>{b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);holds[b.dataset.hold]=true};b.onpointerup=b.onpointercancel=()=>holds[b.dataset.hold]=false});
$('density').onchange=$('reset').onclick=()=>{reset=true;records=[];keys.clear()};
$('export').onclick=()=>{const data={version:'trial-a-r1',runtime:'Lua 5.3 via Lupa / localhost',scope:'offline only; not Miliastra performance',density:+$('density').value,render:$('renderMode').value,samples:records,events:frame?.events};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lua-lab-measurement.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
function draw(f){let calls=0;ctx.clearRect(0,0,960,540);scenery(ctx,f);for(const d of f.draws){ctx.globalAlpha=1;if(d.kind==='rect'){ctx.fillStyle=d.color;ctx.fillRect(d.x,d.y,d.w,d.h);calls++}else if(d.kind==='text'){ctx.font=`bold ${d.size}px 'Yu Gothic UI',sans-serif`;ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#2a484868';ctx.strokeText(d.text,d.x,d.y);ctx.fillStyle=d.color;ctx.fillText(d.text,d.x,d.y);calls+=2}else if(d.kind==='boss_sprite'){const img=bossImages[d.source]||bossAtlas;if(img.complete&&img.naturalWidth){ctx.save();ctx.translate(d.x,d.y);if(d.flip)ctx.scale(-1,1);const left=-d.w*(d.anchorX??.5);ctx.drawImage(img,...d.box,left,-d.h,d.w,d.h);if(d.glow){ctx.strokeStyle='#fff3bd';ctx.lineWidth=2;ctx.strokeRect(left-4,-d.h-4,d.w+8,d.h+8);calls++}ctx.restore();calls++}}else if(d.kind==='sprite'){const asset=spriteData?.sprites[d.asset-1];ctx.save();ctx.translate(d.x,d.y);if(d.flip)ctx.scale(-1,1);if(asset&&$('renderMode').value==='rect'){const sx=d.w/asset.width,sy=d.h/asset.height;for(const r of asset.runs){ctx.fillStyle=r[4];ctx.fillRect(-d.w/2+r[0]*sx,-d.h+r[1]*sy,r[2]*sx,r[3]*sy);calls++}}else if(asset&&atlas.complete){ctx.drawImage(atlas,...asset.box,-d.w/2,-d.h,d.w,d.h);calls++}else{ctx.fillStyle=d.asset<5?'#f4d394':'#51bada';ctx.fillRect(-d.w/2,-d.h,d.w,d.h);calls++}if(d.glow){ctx.strokeStyle='#fff3bd';ctx.lineWidth=2;ctx.strokeRect(-d.w/2-4,-d.h-4,d.w+8,d.h+8);calls++}ctx.restore()}else if(d.kind==='effect'){ctx.globalAlpha=d.alpha*.65;ctx.strokeStyle=d.color;ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(d.x,d.y,d.w/2,d.h/2,-.2,0,Math.PI*2);ctx.stroke();calls++}}ctx.globalAlpha=1;return calls}
let deliveryView='';
function updateDelivery(f){
 const shop=f.storyDelivery;
 $('storyDelivery').hidden=!shop;
 const signature=JSON.stringify(shop??null);
 if(signature!==deliveryView){
  deliveryView=signature;
  const options=$('storyDeliveryOptions');
  options.replaceChildren();
  if(shop){
   $('storyDeliveryText').textContent=shop.stall+' ｜ '+(shop.stocked?'荷物を届けました。':shop.hint);
   for(const option of Object.values(shop.options)){
    const button=document.createElement('button');
    button.type='button';
    button.textContent='荷札「'+option.label+'」を渡す';
    button.onclick=()=>{actions.push('story_deliver:'+shop.quest+':'+option.id);button.blur()};
    options.append(button);
   }
  }
 }
 const feedback=shop?.feedback??'',result=$('storyDeliveryResult');
 result.hidden=!feedback;
 if(result.textContent!==feedback)result.textContent=feedback;
}
function hud(f,calls,renderMs){
 updateDelivery(f);
 const lift=f.storyLift;
 const rail=f.storyRailTransit;
 const market=$('storyMarket');
 market.hidden=!(rail||f.storyMarketOpen);
 if(!market.hidden)market.textContent=rail?(rail.release?'荷車が分岐へ移動中':'荷車が港へ移動中'):'山海の大市 開催中 ｜ 茶器・料理・布';
 $('storyLift').hidden=!lift;
 if(lift){
  $('storyLiftText').textContent='昇降台で移動中 ｜ '+lift.destination;
  $('storyLiftProgress').max=lift.seconds;
  $('storyLiftProgress').value=lift.seconds-lift.remaining;
 }
 const elite=f.storyElite,encounter=$('storyElite');
 encounter.hidden=!elite;
 if(elite){
  const line=`${elite.name}（試作）　HP ${elite.hp} / ${elite.maxhp}`;
  if(encounter.textContent!==line)encounter.textContent=line;
 }
 const cargo=f.storyNearbyCargo??f.storyNearbyParcel,clue=f.storyNearbyClue;
 $('nearbyCargo').hidden=!(cargo||clue);
 if(cargo||clue)$('nearbyCargoGo').textContent=clue?'G：'+(clue.label??clue.name+'を調べる'):
  cargo.guarded?`${cargo.name} ｜ 先に魔物を退ける`:`G：${cargo.name}を回収`;
 const portal=f.storyNearbyPortal;$('nearbyPortal').hidden=!portal;if(portal){$('nearbyPortalText').textContent=`行き先：${portal.name} ｜ ${portal.available?'移動できます':portal.reason}`;$('nearbyPortalGo').disabled=!portal.available;$('nearbyPortalGo').textContent=portal.liftSeconds?'F：昇降台に乗る':'F：この門を通る';}if(f.progression){const p=f.progression;$('progressionStatus').textContent=`旅人・仲間 共通Lv ${p.level} ｜ EXP ${p.xp} / ${f.nextExp} ｜ 討伐EXP ${p.killXp}・依頼EXP ${p.questXp}（試算値／装備ATKは自動加算しません）`;$('regionLevels').textContent=f.regionEligibility.map(r=>`${r.name} Lv${r.required}：${r.eligible?'レベル条件達成':'未達'}・正式マップ未実装`).join(' ／ ')}else{$('progressionStatus').textContent='共通レベル：冒険モードで有効。経験値は試算値です。';$('regionLevels').textContent='冒険モードで確認できます。'}if(f.campaign){const q=f.campaign;$("quest").textContent=`${f.location} ｜ 討伐 ${q.count}/${q.goal} ｜ ${q.message}`+(f.boss?` ｜ ${f.boss.name} HP ${f.boss.hp}/${f.boss.maxhp} ${f.boss.label||("第"+f.boss.phase+"段階")}${f.boss.orbs!==undefined?" ｜ 風玉 "+f.boss.orbs+"/4":""}`:"");document.querySelector(".location").textContent=f.location}else{$("quest").textContent="冒険モードは仮配置・仮ボスで進行を検証します。公式ボスの実装数には含めません。";document.querySelector(".location").textContent="モンド風・試験用狩場 / 3画面・2段足場";}for(const a of f.actors){$('a'+a.id).className='card'+(a.id===f.active?' active':'');$('a'+a.id).innerHTML=`<small>${a.id===f.active?'操作中':'AI 同行'}</small><strong>${a.id===1?'旅人':(f.companion?.name||'アンバー')} <small>${a.hp} / ${a.maxhp}</small></strong><div class="bar"><i style="width:${a.hp/a.maxhp*100}%"></i></div>`}$('companionStatus').textContent=(f.companion?.name||'アンバー')+' ／ 反撃 '+(f.companion?.counterSeconds||0).toFixed(1)+'秒 ／ 防御 '+(f.companion?.guardSeconds||0).toFixed(1)+'秒 ／ 盾 '+(f.companion?.shieldHP||0)+' ／ 燃焼強化 '+(f.companion?.burnBoostSeconds||0).toFixed(1)+'秒 ／ 浮遊 '+(f.companion?.floatSeconds||0).toFixed(1)+'秒 ／ 領域 '+(f.companion?.moonDomain||0).toFixed(1)+'秒 ／ 印 '+(f.companion?.moonMark||0).toFixed(1)+'秒';if(f.companion?.climbBoostSeconds)$('companionStatus').textContent+=' / '+f.companion.skills[3]+' '+f.companion.climbBoostSeconds.toFixed(1)+'s';document.querySelector('[data-action="skill3"] span').textContent=f.companion?.skills[3]||'ウサギ伯爵';document.querySelector('[data-action="skill4"] span').textContent=f.companion?.skills[4]||'跳躍射撃';const a=f.actors[f.active-1];document.querySelectorAll('[data-amber]').forEach(b=>b.disabled=f.active!==2);$('name1').textContent=f.active===1?'旋風斬り':(f.companion?.skills[1]||'火矢');$('name2').textContent=f.active===1?'竜巻':(f.companion?.skills[2]||'矢の雨');for(const key of ['normal','skill1','skill2','skill3','skill4','light'])$('cd-'+key).textContent=a.cd[key]>0?a.cd[key].toFixed(1):'';$('echoStatus').textContent='光界反響の記録：'+(f.echoSource||'なし')+'（直接攻撃・照射のみ試作対応）';$('gaugeText').textContent=`${f.gauge} / 100${f.lightForm?.seconds>0?' ｜ 光界 '+f.lightForm.seconds.toFixed(1)+'秒':''}`;$('gaugeBar').style.width=f.gauge+'%';$('ms').textContent=f.lua_ms.toFixed(2)+' ms';$('memory').textContent=(f.lua_kb/1024).toFixed(2)+' MB';$('enemies').textContent=f.visible+' / '+f.total;$('draws').textContent=calls.toLocaleString();$('kills').textContent=f.hits+' / '+f.kills;$('mora').textContent=f.mora.toLocaleString();$('auto').textContent='自動戦闘 '+(f.auto?'ON':'OFF');$('auto').classList.toggle('selected',f.auto);$('pause').textContent=f.paused?'再開':'一時停止';$('status').textContent=`ローカルLua実行中 · 経過 ${f.t.toFixed(1)} 秒 · 描画 ${renderMs.toFixed(2)} ms · 戦闘不能帰還 ${f.returns} 回 / 幻境実機は未検証`}
async function tick(now){requestAnimationFrame(tick);const dt=now-last;last=now;if(document.hidden||lifecycle.leaving){keys.clear();acc=0;return}acc=Math.min(100,acc+dt);if(busy||acc<33)return;const steps=Math.min(6,Math.floor(acc/(1000/60)));acc-=steps*1000/60;busy=true;const sent=actions;actions=[];const doReset=reset;reset=false;const saveNow=checkpointRequested;checkpointRequested=false;const restoreNow=restoreRequested;restoreRequested=null;const importNow=pendingImport;pendingImport=null;const configureNow=pendingLoadout;pendingLoadout=null;try{const res=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,...lifecycle.request(),steps,...(configureNow?{loadout:configureNow}:{}),checkpoint:saveNow||!!importNow,...(restoreNow?{restore:restoreNow}:{}),render:document.getElementById("renderMode").value,reset:doReset,density:+$('density').value,actions:sent,input:{left:keys.has('KeyA')||keys.has('ArrowLeft')||holds.left,right:keys.has('KeyD')||keys.has('ArrowRight')||holds.right,jump:keys.has('Space'),attack:keys.has('KeyJ')||holds.attack}})});frame=await frameResponse(res);session=frame.session;lifecycle.accept(session);skillUI.update(frame);$('skillCondition').textContent=frame.skillNotice||'';$('reactionStatus').textContent='元素反応の試作：付着 '+(frame.auras?.length||0)+'体 ／ 反応 '+(frame.reactions?.length||0)+'回（直近80件、燃焼を含む）。蒸発・凍結などは未実装。';inventoryUI.update(frame);if(saveNow){try{if(!frame.checkpoint)throw Error('冒険を開始してから保存してください');localStorage.setItem(SAVE_KEY,JSON.stringify(frame.checkpoint));$('saveStatus').textContent='冒険を保存しました。'+new Date().toLocaleTimeString()}catch(e){$('saveStatus').textContent='保存できません: '+e.message}}if(restoreNow)$('saveStatus').textContent='保存した進行で町から再開しました。';if(importNow){try{if(!frame.checkpoint)throw Error('再開後の保存データがありません');localStorage.setItem(SAVE_KEY,JSON.stringify(frame.checkpoint));importNow.resolve('ファイルの進行で町から再開し、このブラウザにも保存しました。')}catch(e){importNow.resolve('ファイルの進行で再開しましたが、ブラウザへの保存に失敗しました。元の保存は保持しています。 '+e.message)}}const start=performance.now(),calls=draw(frame),ms=performance.now()-start;hud(frame,calls,ms);records.push({t:frame.t,lua_ms:frame.lua_ms,lua_kb:frame.lua_kb,render_ms:ms,calls,hits:frame.hits,kills:frame.kills,visible:frame.visible});if(records.length>1800)records.shift();const firstReady=!window.lab;window.lab={frame,records,action:a=>actions.push(a)};if(firstReady)window.dispatchEvent(new Event('lab-ready'))}catch(e){if(importNow)importNow.reject(e);if(saveNow||restoreNow)$('saveStatus').textContent='保存・再開に失敗しました。元の保存データは保持しています。 '+e.message;$('status').className='note error';$('status').textContent='通信に失敗しました。 '+e.message}finally{busy=false}}
requestAnimationFrame(tick);
