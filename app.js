import {initSaveTransfer} from './save-transfer.js';
import {sessionLifecycle,frameResponse} from './session-lifecycle.js';
const lifecycle=sessionLifecycle('maple-lab-session');
import {loadSpriteImages,elementTintedSprite,combatOpacity} from './sprite-images.js';
import {initInventoryUI} from './inventory-ui.js';
import {initAirflowAudio} from './airflow-audio.js';
import {initRockView} from './rock-view.js';
import {initSurveyMap} from './survey-map.js';
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
const airflowAudio=initAirflowAudio();
const updateRockView=initRockView();
const updateSurveyMap=initSurveyMap();
const fireworkControls={
 color:{input:$('fireworkColor'),choices:'colors'},
 shape:{input:$('fireworkShape'),choices:'shapes'},
};
for(const [field,{input}] of Object.entries(fireworkControls)){
 input.addEventListener('change',()=>actions.push(`story_firework_select:${field}:${input.value}`));
}
function updateFireworkDesign(design){
 $('fireworkDesign').hidden=!design;
 if(!design)return;
 for(const [field,{input,choices}] of Object.entries(fireworkControls)){
  if(!input.options.length)input.replaceChildren(...design[choices].map(option=>new Option(option.label,option.id)));
  if(document.activeElement!==input)input.value=design[field];
 }
}
const SAVE_KEY='maple-lua-lab.checkpoint.v1';
$('saveProgress').onclick=()=>{checkpointRequested=true;$('saveStatus').textContent='保存中…'};
$('loadProgress').onclick=()=>{try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)throw Error('保存データがありません');restoreRequested=JSON.parse(raw);if(!restoreRequested||typeof restoreRequested!=='object')throw Error('保存データを読み取れません');$('saveStatus').textContent='読み込み中…'}catch(e){restoreRequested=null;$('saveStatus').textContent=e.message}};
initSaveTransfer({readSaved:()=>localStorage.getItem(SAVE_KEY),restore:data=>new Promise((resolve,reject)=>{restoreRequested=data;pendingImport={resolve,reject}})});
const {bossImages,bossAtlas,atlas}=await loadSpriteImages($('status'));
function updateTeaCase(view){
 const panel=$('teaCaseBoard'),cards=$('teaEvidenceCards');
 panel.hidden=!view;
 if(!view){
  if(cards.childElementCount)cards.replaceChildren();
  return;
 }
 if(!cards.childElementCount){
  for(const card of view.cards){
   const button=document.createElement('button');
   button.dataset.teaEvidence=card.id;
   button.type='button';
   const picture=document.createElement('canvas');
   picture.width=104;picture.height=60;picture.setAttribute('aria-hidden','true');
   const context=picture.getContext('2d'),[x,y,w,h]=card.box;
   const scale=Math.min(picture.width/w,picture.height/h);
   context.imageSmoothingEnabled=false;
   context.drawImage(bossImages[card.source],x,y,w,h,(picture.width-w*scale)/2,(picture.height-h*scale)/2,w*scale,h*scale);
   const label=document.createElement('strong');
   label.textContent=card.label;
   const detail=document.createElement('small');
   detail.textContent=card.detail;
   button.append(picture,label,detail);
   button.style.cssText='display:grid;justify-items:start;gap:4px;text-align:left';
   button.onclick=event=>{
    actions.push('story_tea_card:'+card.id);
    if(event.detail>0)button.blur();
   };
   cards.append(button);
  }
 }
 for(const [index,card] of view.cards.entries()){
  const button=cards.children[index];
  button.setAttribute('aria-pressed',String(card.selected));
  button.classList.toggle('tea-selected',card.selected);
 }
 $('teaEvidenceConfirm').disabled=!view.ready;
 if($('teaCaseFeedback').textContent!==view.feedback)$('teaCaseFeedback').textContent=view.feedback;
}
try{spriteData=await (await fetch('assets/sprites.json')).json()}catch{}
const mapping={KeyF:'story_nearby_portal',KeyG:'story_collect',KeyK:'skill1',KeyL:'skill2',KeyM:'skill3',KeyN:'skill4',KeyQ:'light',KeyE:'swap',ShiftLeft:'dodge',ShiftRight:'dodge',KeyP:'pause'};
for(let i=1;i<=8;i++)mapping['Digit'+i]='slot'+i;
addEventListener('keydown',e=>{if(/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName))return;if(['Space','ArrowLeft','ArrowRight','ArrowDown'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code==='Space')actions.push(keys.has('KeyS')||keys.has('ArrowDown')?'drop':'jump');else if(mapping[e.code])actions.push(mapping[e.code])}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{actions.push(b.dataset.action);b.blur()});
let holds={};document.querySelectorAll('[data-hold]').forEach(b=>{b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);holds[b.dataset.hold]=true};b.onpointerup=b.onpointercancel=()=>holds[b.dataset.hold]=false});
$('density').onchange=$('reset').onclick=()=>{reset=true;records=[];keys.clear()};
$('export').onclick=()=>{const data={version:'trial-a-r1',runtime:'Lua 5.3 via Lupa / localhost',scope:'offline only; not Miliastra performance',density:+$('density').value,render:$('renderMode').value,samples:records,events:frame?.events};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lua-lab-measurement.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
function draw(f){let calls=0;ctx.clearRect(0,0,960,540);scenery(ctx,f);for(const d of f.draws){ctx.globalAlpha=combatOpacity(d);if(d.kind==='rect'){ctx.fillStyle=d.color;ctx.fillRect(d.x,d.y,d.w,d.h);calls++}else if(d.kind==='text'){ctx.font=`bold ${d.size}px 'Yu Gothic UI',sans-serif`;ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#2a484868';ctx.strokeText(d.text,d.x,d.y);ctx.fillStyle=d.color;ctx.fillText(d.text,d.x,d.y);calls+=2}else if(d.kind==='boss_sprite'){const img=bossImages[d.source]||bossAtlas;if(img.complete&&img.naturalWidth){ctx.save();ctx.translate(d.x,d.y);if(d.flip)ctx.scale(-1,1);const left=-d.w*(d.anchorX??.5);ctx.drawImage(elementTintedSprite(img,d.tint),...d.box,left,-d.h,d.w,d.h);if(d.glow){ctx.strokeStyle='#fff3bd';ctx.lineWidth=2;ctx.strokeRect(left-4,-d.h-4,d.w+8,d.h+8);calls++}ctx.restore();calls++}}else if(d.kind==='sprite'){const asset=spriteData?.sprites[d.asset-1];ctx.save();ctx.translate(d.x,d.y);if(d.flip)ctx.scale(-1,1);if(asset&&$('renderMode').value!=='sprite'){const sx=d.w/asset.width,sy=d.h/asset.height;for(const r of asset.runs){ctx.fillStyle=r[4];ctx.fillRect(-d.w/2+r[0]*sx,-d.h+r[1]*sy,r[2]*sx,r[3]*sy);calls++}}else if(asset&&atlas.complete){ctx.drawImage(atlas,...asset.box,-d.w/2,-d.h,d.w,d.h);calls++}else{ctx.fillStyle=d.asset<5?'#f4d394':'#51bada';ctx.fillRect(-d.w/2,-d.h,d.w,d.h);calls++}if(d.glow){ctx.strokeStyle='#fff3bd';ctx.lineWidth=2;ctx.strokeRect(-d.w/2-4,-d.h-4,d.w+8,d.h+8);calls++}ctx.restore()}else if(d.kind==='effect'){ctx.globalAlpha=d.alpha*.65;ctx.strokeStyle=d.color;ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(d.x,d.y,d.w/2,d.h/2,-.2,0,Math.PI*2);ctx.stroke();calls++}}ctx.globalAlpha=1;return calls}
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
let cookingView='';
function updateCooking(view){
 $('storyCooking').hidden=!view;
 const signature=JSON.stringify(view??null);
 if(signature===cookingView)return;
 cookingView=signature;
 const options=$('storyCookingActions');
 options.replaceChildren();
 if(!view)return;
 function addOption(label,action,disabled){
  const button=document.createElement('button');
  button.type='button';button.textContent=label;button.disabled=disabled;
  button.onclick=()=>{actions.push(action);button.blur()};
  options.append(button);
 }
 if(view.choosing){
  $('storyCookingText').textContent='香菱の屋台 ｜ 荷運びの合間に片手で食べられるように、具を包みます。どんな味にしますか？';
  for(const flavor of view.flavors)addOption(flavor.label,'story_cook:'+view.quest+':'+flavor.id,view.paused);
 }else if(view.stock===undefined){
  $('storyCookingText').textContent=view.meal+'ができました。依頼手帳から香菱に報告できます。';
 }else{
  $('storyCookingText').textContent=`${view.meal} ｜ 所持 ${view.stock}/${view.capacity} ｜ 操作中のキャラのHPを最大${view.heal}回復`;
  if(view.price!==undefined)addOption(`購入（${view.price}モラ）`,'story_buy_meal:'+view.quest,!view.canBuy);
  addOption('食べる','story_eat_meal:'+view.quest,!view.canEat);
 }
}
let bookView='';
function updateBook(view){
 $('storyBook').hidden=!view;
 const signature=JSON.stringify(view??null);
 if(signature===bookView)return;
 bookView=signature;
 if(!view)return;
 $('storyBookTitle').textContent=view.proof?'拾った試し刷り':view.title;
 $('storyBookText').textContent=view.proof?'二本の柱を横梁でつないだ石門が描かれている。':view.story;
 const canvas=$('storyBookPicture'),pen=canvas.getContext('2d');
 canvas.setAttribute('aria-label',view.proof?'二本の柱を横梁でつないだ石門の絵':view.caption);
 pen.fillStyle='#e8d9ae';pen.fillRect(0,0,160,64);
 pen.fillStyle='#a7a989';pen.fillRect(0,50,160,14);
 pen.fillStyle='#625d4c';pen.fillRect(31,13,72,10);
 pen.fillStyle='#838572';pen.fillRect(36,23,13,27);pen.fillRect(85,23,13,27);
 if(!view.proof){
  pen.fillStyle='#77513d';pen.fillRect(108,36,34,18);
  pen.fillStyle='#c58c56';pen.fillRect(111,39,28,7);
  pen.fillStyle='#e3c38f';pen.fillRect(121,33,14,5);
 }
}
let stoneView='';
function updateStone(view){
 const section=$('storyStone');
 section.hidden=!view;
 const signature=JSON.stringify(view??null);
 if(signature===stoneView)return;
 stoneView=signature;
 const tiles=$('storyStoneTiles');
 tiles.replaceChildren();
 const notice=$('storyStoneNotice');
 notice.hidden=!view?.notice;
 if(notice.textContent!==(view?.notice??''))notice.textContent=view?.notice??'';
 if(!view)return;
 $('storyStoneText').textContent=view.exhibit?'職人の模型展示 ｜ 山道から運んだ石で造られた港の建物':
  view.modelTaken?'職人の壁画 ｜ 建物模型を回収済み':
  view.solved?'石板が開いた ｜ 上段で建物模型を探す':
  `職人の壁画 ｜ 山で石を取り出し、街道を経て、港で建物を造る ｜ 石板 ${view.sequence}/${view.total}`;
 if(view.mural&&!view.solved){
  for(const tile of view.tiles){
   const button=document.createElement('button');
   button.type='button';button.textContent=tile.label;button.disabled=view.paused;
   button.onclick=()=>{actions.push('story_stone_tile:'+view.id+':'+tile.id);button.blur()};
   tiles.append(button);
  }
 }
}
let constructionView='';
function updateConstruction(view){
 $('storyConstruction').hidden=!view;
 const signature=JSON.stringify(view??null);
 if(signature===constructionView)return;
 constructionView=signature;
 const plans=$('storyConstructionPlans');
 plans.replaceChildren();
 if(!view)return;
 for(const plan of view.plans){
  const row=document.createElement('div');
  const detail=document.createElement('p');
  detail.textContent=plan.description;
  const button=document.createElement('button');
  button.type='button';button.textContent=plan.name;button.disabled=view.paused;
  button.onclick=()=>{actions.push('story_construction_plan:'+view.quest+':'+plan.id);button.blur()};
  row.append(button,detail);plans.append(row);
 }
}
let sightOptions='';
function updateSights(f){
 const message=f.storySightMessage??'';
 const options=f.storySightChoices??[];
 $('storySights').hidden=!(message||options.length);
 const status=$('storySightMessage');
 if(status.textContent!==message)status.textContent=message;
 const key=JSON.stringify(options.map(({id,name})=>[id,name]));
 if(key===sightOptions)return;
 sightOptions=key;
 const host=$('storySightChoices');
 host.hidden=!options.length;
 host.replaceChildren(...options.map(({id,name})=>{
  const button=document.createElement('button');
  button.type='button';button.textContent=name+'に印を付ける';
  button.onclick=()=>actions.push('story_sight_mark:'+id);
  return button;
 }));
}
let lanternNote='';
function updateLanternNote(note,sight){
 const panel=$('storyLanternNotes');
 panel.hidden=!(note||sight);
 $('storyLanternEntry').hidden=!note;
 const sightLabel=$('storySightNote');
 const text=sight?`城下の案内絵図で「${sight.name}」に印を付けた。`:'';
 sightLabel.hidden=!sight;
 if(sightLabel.textContent!==text)sightLabel.textContent=text;
 if(panel.hidden)panel.open=false;
 const signature=JSON.stringify(note??null);
 if(signature===lanternNote)return;
 lanternNote=signature;
 if(!note)return;
 const canvas=$('storyLanternPicture'),pen=canvas.getContext('2d');
 canvas.setAttribute('aria-label',note.challenge?'海の大灯籠と勝負の絵':note.smile?'鳥居、大灯籠、海、狸の笑顔の絵':'鳥居、大灯籠、海の絵');
 $('storyLanternNoteText').textContent=note.challenge?'海の先の大灯籠に、向き合う二人が描き足された。狸からの勝負のお誘い。':
  note.smile?'鳥居、大灯籠、海。狸が招待状に笑顔を描き足した。':'鳥居、大灯籠、海。化け狸が渡してくれた絵。';
 pen.fillStyle='#e9dab4';pen.fillRect(0,0,180,64);
 pen.fillStyle='#a25245';
 pen.fillRect(14,15,40,5);pen.fillRect(18,26,32,3);pen.fillRect(22,20,5,29);pen.fillRect(41,20,5,29);
 pen.fillStyle='#5b4c45';pen.fillRect(73,16,31,34);
 pen.fillStyle='#d5a35d';pen.fillRect(79,22,19,21);
 pen.fillStyle='#497d87';pen.fillRect(121,32,40,4);pen.fillRect(126,41,38,4);pen.fillRect(119,49,35,3);
 if(note.smile){
  pen.fillStyle='#765b44';pen.fillRect(160,12,3,3);pen.fillRect(169,12,3,3);
  pen.fillRect(160,19,3,2);pen.fillRect(163,21,6,2);pen.fillRect(169,19,3,2);
 }
 if(note.challenge){
  pen.fillStyle='#a4664e';pen.fillRect(63,46,5,9);pen.fillRect(110,46,5,9);
  pen.fillRect(62,42,6,5);pen.fillRect(110,42,6,5);
  pen.fillStyle='#8b735a';pen.fillRect(77,52,22,2);
 }
}
let progressionView;
const expFormat=new Intl.NumberFormat('ja-JP');
function updateProgression(f){
 const snowMatch=f.storySnowball;
 $('snowMatchControls').closest('.game').classList.toggle('snow-match',!!snowMatch);
 $('snowMatchControls').hidden=!snowMatch;
 $('snowMatchThrow').disabled=!snowMatch?.running;
 const touchAttack=document.querySelector('[data-hold="attack"]');
 touchAttack.textContent=snowMatch?'雪玉を投げる':'攻撃';
 touchAttack.disabled=!!snowMatch&&!snowMatch.running;
 const p=f.progression;
 const summary=p?[p.level,p.xp,p.total,p.baseXp,p.overflowXp,p.killXp,p.questXp,f.nextExp]:[];
 const key=summary.join('|');
 if(key===progressionView)return;
 progressionView=key;
 if(!p){
  $('progressionStatus').textContent='共通レベル：冒険モードで有効。経験値は試算値です。';
  $('regionLevels').textContent='冒険モードで確認できます。';
  return;
 }
 const training=p.level===f.levelCap?`上限後のEXP ${expFormat.format(p.overflowXp)}`:
  `EXP ${expFormat.format(p.xp)} / ${expFormat.format(f.nextExp)}`;
 $('progressionStatus').textContent=`旅人・仲間 共通Lv ${p.level} ｜ ${training} ｜ 累計EXP ${expFormat.format(p.total)}（基礎 ${expFormat.format(p.baseXp)}） ｜ 討伐 ${expFormat.format(p.killXp)}・依頼・初回勝利 ${expFormat.format(p.questXp)}（試算）`;
 $('regionLevels').textContent=f.regionEligibility.map(r=>`${r.name} Lv${r.required}：${r.eligible?'レベル条件達成':'未達'}・正式マップ未実装`).join(' ／ ');
}
function hud(f,calls,renderMs){
 updateDelivery(f);
 updateCooking(f.storyCooking);
 updateBook(f.storyBook);
 updateStone(f.storyStone);
 updateConstruction(f.storyConstruction);
 updateSights(f);
 updateLanternNote(f.storyLanternNote,f.storySightNote);
 const forest=$('storyForest');
 const observation=f.storyContest??f.storyForest??f.storyRest??f.storyCave??f.storyRoof;
 const fieldNote=observation?.message??f.storyAppraisal?.message??f.storyRumor?.message??f.storyBloom?.message??f.storyPatrol?.message??f.storySurvey?.message??f.storySnowball?.message??f.storyReturnBox?.message??f.storyFireworkStatus?.message??f.storyStealth?.message??f.storyIttoGames?.message??f.storyTeaCase?.message??f.storyDuel?.label??f.storyPathStatus??f.storyFlagStatus;
 forest.hidden=!fieldNote;
 if(fieldNote&&forest.textContent!==fieldNote)forest.textContent=fieldNote;
 const trolley=f.voyage?.kind==='trolley'?f.voyage:null;
 const lift=f.storyLift??(trolley&&{destination:trolley.destination,seconds:trolley.seconds+trolley.elapsed,remaining:trolley.seconds});
 const rail=f.storyRailTransit;
 const market=$('storyMarket');
 market.hidden=!(rail||f.storyMarketOpen);
 if(!market.hidden)market.textContent=rail?(rail.release?'荷車が分岐へ移動中':'荷車が港へ移動中'):'山海の大市 開催中 ｜ 茶器・料理・布';
 $('storyLift').hidden=!lift;
 if(lift){
  $('storyLiftText').textContent=trolley?(trolley.stopover?'停留所に停車中 ｜ Fで途中下車できます':'トロッコで移動中'):
   (lift.boat?'小舟で移動中':lift.waterway?'水路を移動中':'昇降台で移動中')+' ｜ '+lift.destination;
  $('storyLiftProgress').max=lift.seconds;
  $('storyLiftProgress').value=lift.seconds-lift.remaining;
 }
 const reward=$('storyChapterReward');
 reward.hidden=!f.storyFirstClear;
 const rewardText=f.storyFirstClear?`章ボス初回勝利　+${expFormat.format(f.storyFirstClear.xp)} EXP`:'';
 if(reward.textContent!==rewardText)reward.textContent=rewardText;
 const elite=f.storyElite,encounter=$('storyElite');
 encounter.hidden=!elite;
 if(elite){
  const line=`${elite.name}（試作）　HP ${elite.hp} / ${elite.maxhp}`;
  if(encounter.textContent!==line)encounter.textContent=line;
 }
 const field=f.weeklyBoss||f.fieldBoss,fieldPanel=$('fieldBoss'),fieldLabel=$('fieldBossLabel'),fieldHp=$('fieldBossHp');
 fieldPanel.hidden=!field;
 if(field){
  const status=field.phase==='respawn'?`再出現まで ${Math.ceil(field.remaining)}秒`:
   `HP ${field.hp} / ${field.maxhp} ｜ ${field.label}`;
  const elementNames={pyro:'炎',cryo:'氷',hydro:'水',electro:'雷'};
  const bodyNames={anemo:'風',cryo:'❄ 氷',electro:'⚡ 雷'};
  const elements=field.elementSlots?(' ｜ '+field.elementSlots.map(e=>elementNames[e]).join(' → ')):
   field.bodies?.length===2?' '+field.bodies.map((body,i)=>bodyNames[body.element]+['①','②'][i]).join(' / '):'';
  const line=`${field.name}（Lv${field.level}）${elements} ｜ ${status}`;
  if(fieldLabel.textContent!==line)fieldLabel.textContent=line;
  fieldHp.hidden=field.phase==='respawn';
  fieldHp.max=field.maxhp;fieldHp.value=field.hp;
 }
 const cargo=f.storyNearbyCargo??f.storyNearbyParcel,clue=f.storyNearbyClue;
 const ingredient=f.storyNearbyIngredient;
 const book=f.storyNearbyBook;
 const stone=f.storyNearbyStone;
 const construction=f.storyNearbyConstruction;
 const interact=f.storyNearbyMilestone??f.storyNearbyContest??f.storyNearbyForest??f.storyNearbyLantern??f.storyNearbySight??f.storyNearbyRest??f.storyNearbyCave??f.storyNearbyRoof??construction??stone??book;
 const airflow=f.storyAirflow,cue=f.storyAirflowCue;
 const resonance=f.storyResonance,resonanceCue=f.storyResonanceCue;
 const paper=f.storyPaper;
 const collect=interact||ingredient||cargo||clue;
 $('nearbyCargo').hidden=!(collect||airflow||cue||resonance||resonanceCue||paper);
 $('nearbyCargoGo').hidden=!collect;
 $('airflowControls').hidden=!(airflow||cue);
 $('airflowSound').hidden=!(airflow?.sound||cue||resonance||resonanceCue);
 $('airflowCommit').hidden=!airflow?.confirm;
 $('airflowCommit').textContent=airflow?.confirmLabel??'この位置で固定する';
 $('airflowStatus').textContent=airflow?
  [airflow.target&&'目印 '+airflow.target,airflow.pattern||airflow.selection,airflow.result].filter(Boolean).join(' ｜ '):
  cue?'音の印 '+cue.pattern:'';
 const resonanceText=resonance?.order?
  `壁の印 ${resonance.order.join(' → ')} ｜ 点灯 ${resonance.progress}/${resonance.total}`:
  [resonance?.page>0?`第${resonance.page}頁 / ${resonance.total}　${resonance.title}`:resonance?.title,
   resonance?.pattern||resonanceCue?.pattern,resonance?.line].filter(Boolean).join('　');
 if($('resonanceStatus').textContent!==resonanceText)$('resonanceStatus').textContent=resonanceText;
 $('paperControls').hidden=!paper;
 if(paper){
  $('paperConfirm').textContent=paper.confirm;
  $('paperStatus').textContent=[paper.choice,paper.line].filter(Boolean).join(' ｜ ');
 }
 airflowAudio.update(f);
 updateRockView(f.storyRockView);
 updateSurveyMap(f.storySurveyMap);
 updateTeaCase(f.storyTeaBoard);
 updateFireworkDesign(f.storyFireworkDesign);
 const reflection=f.storyReflection;
 $('reflectionControls').hidden=!reflection?.record;
 if(reflection?.record)$('reflectionLight').textContent=reflection.lit?'消灯する':'点灯する';
 $('reflectionImage').textContent=reflection?(reflection.lit?'照射像　':reflection.darkLabel??'消灯時の刻線　')+reflection.image:'';
 const surveyRig=f.storySurveyRig;
 const surveyControls=$('surveyRigControls');
 surveyControls.hidden=!surveyRig;
 const surveyReading=surveyRig?`${surveyRig.label} ｜ ${surveyRig.ratings} ｜ ${surveyRig.reading}`:'';
 if(surveyReading!==$('surveyRigReading').textContent)$('surveyRigReading').textContent=surveyReading;
 if(interact||ingredient||cargo||clue)$('nearbyCargoGo').textContent=interact?`G：${interact.label}`:ingredient?`G：${ingredient.name}を集める`:clue?'G：'+(clue.label??clue.name+'を調べる'):
  cargo.guarded?`${cargo.name} ｜ 先に魔物を退ける`:`G：${cargo.name}を回収`;
 const portal=f.storyNearbyPortal;$('nearbyPortal').hidden=!portal;if(portal){$('nearbyPortalText').textContent=`行き先：${portal.name} ｜ ${portal.available?'移動できます':portal.reason}${portal.wind?` ｜ ${portal.wind.calm?'風が止んでいます　残り':'風が止むまで'} ${Math.ceil(portal.wind.seconds)}秒`:''}`;$('nearbyPortalGo').disabled=!portal.available;$('nearbyPortalGo').textContent=portal.trolleyStop?'F：途中下車する':portal.boatSeconds?'F：小舟に乗る':portal.waterwaySeconds?'F：水路を渡る':portal.liftSeconds?'F：昇降台に乗る':portal.trolleyBoard?'F：トロッコに乗る':'F：この門を通る';}updateProgression(f);if(f.campaign){const q=f.campaign;$("quest").textContent=`${f.location} ｜ 討伐 ${q.count}/${q.goal} ｜ ${q.message}`+(f.boss?` ｜ ${f.boss.name} HP ${f.boss.hp}/${f.boss.maxhp} ${f.boss.label||("第"+f.boss.phase+"段階")}${f.boss.orbs!==undefined?" ｜ 風玉 "+f.boss.orbs+"/4":""}`:"");document.querySelector(".location").textContent=f.location}else{$("quest").textContent="冒険モードは仮配置・仮ボスで進行を検証します。公式ボスの実装数には含めません。";document.querySelector(".location").textContent="モンド風・試験用狩場 / 3画面・2段足場";}for(const a of f.actors){$('a'+a.id).className='card'+(a.id===f.active?' active':'');$('a'+a.id).innerHTML=`<small>${a.id===f.active?'操作中':'AI 同行'}</small><strong>${a.id===1?'旅人':(f.companion?.name||'アンバー')} <small>${a.hp} / ${a.maxhp}</small></strong><div class="bar"><i style="width:${a.hp/a.maxhp*100}%"></i></div>`}$('companionStatus').textContent=(f.companion?.name||'アンバー')+' ／ 反撃 '+(f.companion?.counterSeconds||0).toFixed(1)+'秒 ／ 防御 '+(f.companion?.guardSeconds||0).toFixed(1)+'秒 ／ 盾 '+(f.companion?.shieldHP||0)+' ／ 燃焼強化 '+(f.companion?.burnBoostSeconds||0).toFixed(1)+'秒 ／ 浮遊 '+(f.companion?.floatSeconds||0).toFixed(1)+'秒 ／ 領域 '+(f.companion?.moonDomain||0).toFixed(1)+'秒 ／ 印 '+(f.companion?.moonMark||0).toFixed(1)+'秒';if(f.companion?.climbBoostSeconds)$('companionStatus').textContent+=' / '+f.companion.skills[3]+' '+f.companion.climbBoostSeconds.toFixed(1)+'s';document.querySelector('[data-action="skill3"] span').textContent=f.companion?.skills[3]||'ウサギ伯爵';document.querySelector('[data-action="skill4"] span').textContent=f.companion?.skills[4]||'跳躍射撃';const a=f.actors[f.active-1];document.querySelectorAll('[data-amber]').forEach(b=>b.disabled=f.active!==2);$('name1').textContent=f.active===1?'旋風斬り':(f.companion?.skills[1]||'火矢');$('name2').textContent=f.active===1?'竜巻':(f.companion?.skills[2]||'矢の雨');for(const key of ['normal','skill1','skill2','skill3','skill4','light'])$('cd-'+key).textContent=a.cd[key]>0?a.cd[key].toFixed(1):'';$('echoStatus').textContent='光界反響の記録：'+(f.echoSource||'なし')+'（直接攻撃・照射のみ試作対応）';$('gaugeText').textContent=`${f.gauge} / 100${f.lightForm?.seconds>0?' ｜ 光界 '+f.lightForm.seconds.toFixed(1)+'秒':''}`;$('gaugeBar').style.width=f.gauge+'%';$('ms').textContent=f.lua_ms.toFixed(2)+' ms';$('memory').textContent=(f.lua_kb/1024).toFixed(2)+' MB';$('enemies').textContent=f.visible+' / '+f.total;$('draws').textContent=calls.toLocaleString();$('kills').textContent=f.hits+' / '+f.kills;$('mora').textContent=f.mora.toLocaleString();$('auto').textContent='自動戦闘 '+(f.auto?'ON':'OFF');$('auto').classList.toggle('selected',f.auto);$('pause').textContent=f.paused?'再開':'一時停止';$('status').textContent=`ローカルLua実行中 · 経過 ${f.t.toFixed(1)} 秒 · 描画 ${renderMs.toFixed(2)} ms · 戦闘不能帰還 ${f.returns} 回 / 幻境実機は未検証`}
async function tick(now){requestAnimationFrame(tick);const dt=now-last;last=now;if(document.hidden||lifecycle.leaving){keys.clear();acc=0;return}acc=Math.min(100,acc+dt);if(busy||acc<33)return;const steps=Math.min(6,Math.floor(acc/(1000/60)));acc-=steps*1000/60;busy=true;const sent=actions;actions=[];const doReset=reset;reset=false;const saveNow=checkpointRequested;checkpointRequested=false;const restoreNow=restoreRequested;restoreRequested=null;const importNow=pendingImport;pendingImport=null;const configureNow=pendingLoadout;pendingLoadout=null;const renderProfile=$('renderMode').value;try{const res=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,...lifecycle.request(),steps,...(configureNow?{loadout:configureNow}:{}),checkpoint:saveNow||!!importNow,...(restoreNow?{restore:restoreNow}:{}),render:renderProfile==='sprite'?'sprite':'rect',profile:renderProfile,reset:doReset,density:+$('density').value,actions:sent,input:{left:keys.has('KeyA')||keys.has('ArrowLeft')||holds.left,right:keys.has('KeyD')||keys.has('ArrowRight')||holds.right,jump:keys.has('Space'),attack:keys.has('KeyJ')||holds.attack}})});frame=await frameResponse(res);session=frame.session;lifecycle.accept(session);skillUI.update(frame);$('skillCondition').textContent=frame.skillNotice||'';$('reactionStatus').textContent='元素反応の試作：付着 '+(frame.auras?.length||0)+'体 ／ 反応 '+(frame.reactions?.length||0)+'回（直近80件、燃焼を含む）。蒸発・凍結などは未実装。';inventoryUI.update(frame);if(saveNow){try{if(!frame.checkpoint)throw Error('冒険を開始してから保存してください');localStorage.setItem(SAVE_KEY,JSON.stringify(frame.checkpoint));$('saveStatus').textContent='冒険を保存しました。'+new Date().toLocaleTimeString()}catch(e){$('saveStatus').textContent='保存できません: '+e.message}}if(restoreNow)$('saveStatus').textContent='保存した進行で町から再開しました。';if(importNow){try{if(!frame.checkpoint)throw Error('再開後の保存データがありません');localStorage.setItem(SAVE_KEY,JSON.stringify(frame.checkpoint));importNow.resolve('ファイルの進行で町から再開し、このブラウザにも保存しました。')}catch(e){importNow.resolve('ファイルの進行で再開しましたが、ブラウザへの保存に失敗しました。元の保存は保持しています。 '+e.message)}}const start=performance.now(),calls=draw(frame),ms=performance.now()-start;hud(frame,calls,ms);records.push({t:frame.t,lua_ms:frame.lua_ms,lua_kb:frame.lua_kb,render_ms:ms,calls,hits:frame.hits,kills:frame.kills,visible:frame.visible});if(records.length>1800)records.shift();const firstReady=!window.lab;window.lab={frame,records,action:a=>actions.push(a)};if(firstReady)window.dispatchEvent(new Event('lab-ready'))}catch(e){if(importNow)importNow.reject(e);if(saveNow||restoreNow)$('saveStatus').textContent='保存・再開に失敗しました。元の保存データは保持しています。 '+e.message;$('status').className='note error';$('status').textContent='通信に失敗しました。 '+e.message}finally{busy=false}}
requestAnimationFrame(tick);
