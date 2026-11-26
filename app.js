import {paintRectangleGrid,rectangleCount} from './sprite-layers.js';
import {drawFireworkSparks} from './firework-sparks.js';
import {teaCardPicture} from './tea-notebook.js';
import {drawHuntMarker} from './hunt-guide.js';
import {surveyPointUrl} from './survey-point.js';
import {forestSketches} from './forest-preview.js';
import {initSaveTransfer} from './save-transfer.js';
import {sessionLifecycle,frameResponse} from './session-lifecycle.js';
const lifecycle=sessionLifecycle('maple-lab-session');
import {loadSpriteImages,spriteImageFor,elementTintedSprite,combatOpacity,drawCombatRect,drawCombatRuns,omitCombatDraw} from './sprite-images.js';
import {initInventoryUI} from './inventory-ui.js';
import {initAirflowAudio} from './airflow-audio.js';
import {initRockView} from './rock-view.js';
import {initSurveyMap} from './survey-map.js';
import {initTheaterProgramme} from './theater-programme.js';
import {initFestivalLedger} from './festival-ledger.js';
import {initHarborBook} from './harbor-book.js';
import {initFrostPrints} from './frost-prints.js';
import {initReadingModel} from './reading-model.js';
import {initDiscoveryMap} from './discovery-map.js';
import {updateFurinaRehearsal} from './furina-rehearsal.js';
import {initGroupPhoto} from './group-photo.js';
import {initStoneOrnaments} from './stone-ornaments.js';
import {initSpringCourse} from './spring-course.js';
import {initIansanTraining} from './iansan-training.js';
import {initDailyBoard} from './daily-board.js';
import {initExpRanking} from './exp-ranking.js';
import {initCoopPanel} from './coop-panel.js';
import {initWorldUI} from './world-ui.js';
import {initAtlas} from './atlas-ui.js';
import {initSkillUI} from './loadout-ui.js';
import {drawPlayScenery} from './scenery.js';
const $=id=>document.getElementById(id), canvas=$('game'),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
let session=lifecycle.savedSession,frame=null, actions=[], reset=false, busy=false,last=performance.now(),acc=0,records=[], keys=new Set(), spriteData=null;
let checkpointRequested=false,restoreRequested=null,pendingLoadout=null,pendingImport=null,rankedStartRequested=false;
const skillUI=await initSkillUI(a=>actions.push(a),slots=>pendingLoadout=slots);
await initWorldUI(a=>actions.push(a));
const updateAtlas=initAtlas(a=>actions.push(a),()=>keys.clear());
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
const updateReadingModel=initReadingModel(bossImages,key=>actions.push(key));
const updateDiscoveryMap=initDiscoveryMap(bossImages,key=>actions.push(key));
const updateGroupPhoto=initGroupPhoto(bossImages,key=>actions.push(key));
const updateTheaterProgramme=initTheaterProgramme(bossImages,key=>actions.push(key));
const updateFestivalLedger=initFestivalLedger(key=>actions.push(key));
const updateHarborBook=initHarborBook(bossImages,key=>actions.push(key));
const updateFrostPrints=initFrostPrints(key=>actions.push(key));
const updateStoneOrnaments=initStoneOrnaments(bossImages,key=>actions.push(key));
const updateSpringCourse=initSpringCourse(key=>actions.push(key));
const updateIansanTraining=initIansanTraining(key=>actions.push(key));
const dailyBoard=initDailyBoard(key=>actions.push(key));
const updateCoop=initCoopPanel(key=>actions.push(key));
const updateExpRanking=initExpRanking(()=>{
 if(restoreRequested||pendingImport||checkpointRequested)return false;
 if(frame?.campaign&&!confirm('ランキング対象の新規冒険を始めますか？ 保存済みの冒険は残ります。'))return false;
 rankedStartRequested=true;
 reset=false;
 keys.clear();
 actions=[];
 return true;
});
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
   const picture=teaCardPicture(card,bossImages[card.source]);
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
try{spriteData=await (await fetch('assets/base-packed/legacy.json')).json()}catch{}
const mapping={KeyF:'story_nearby_portal',KeyG:'story_collect',KeyK:'skill1',KeyL:'skill2',KeyI:'skill3',KeyN:'skill4',KeyQ:'light',KeyE:'swap',ShiftLeft:'dodge',ShiftRight:'dodge',KeyP:'pause'};
addEventListener('keydown',e=>{
 if(e.repeat||frame?.worldMap||/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName))return;
 const shouki=frame?.weeklyBoss?.shouki;
 if(shouki&&!frame.paused&&!frame.auto){
  const aim=shouki.aim,device=shouki.device;
  if(e.code==='Escape'&&aim?.mine&&!aim.fired){actions.push('encounter_cancel');return}
  if(e.code==='KeyH'){
   if(aim?.mine&&!aim.confirmed)actions.push('encounter_confirm');
   else if(shouki.canAim||(device&&!device.cooldown&&shouki.charge>=shouki.max))actions.push('encounter_interact');
   return;
  }
 }
 if(e.code==='KeyH'&&(frame?.weeklyBoss?.knave||frame?.weeklyBoss?.falseMoon?.canUse||frame?.endgameRun?.lampVisible||frame?.endgameRun?.aidReady))actions.push('encounter_interact');
});
for(let i=1;i<=8;i++)mapping['Digit'+i]='slot'+i;
addEventListener('keydown',e=>{if(frame?.worldMap)return;if(e.code==='Escape'&&frame?.growthTrial){actions.push('growth_practice_exit');return}if(e.code==='Escape'&&frame?.storyIansan?.panel){actions.push('story_iansan_close');return}if(e.code==='Escape'&&frame?.storySpringCourse?.panel){actions.push('story_spring_close');return}if(e.code==='Escape'&&frame?.storyStonePair){actions.push('story_charm_close');return}if(e.code==='Escape'&&frame?.storyNaviaPhoto?.panel){actions.push('story_photo_close');return}if(e.code==='Escape'&&frame?.storyFurinaRehearsal?.open){actions.push('story_rehearsal:close');return}if(e.code==='Escape'&&frame?.storyDiscoveryMap){actions.push('story_discovery_close');return}if(e.code==='Escape'&&frame?.storyKavehModel){actions.push('story_model_close');return}if(/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName))return;if(['Space','ArrowLeft','ArrowRight','ArrowDown'].includes(e.code)||(e.code==='ArrowUp'&&(frame?.storyToyDive||frame?.storySwim)))e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code==='Space')actions.push(keys.has('KeyS')||keys.has('ArrowDown')?'drop':'jump');else if(e.code==='KeyJ'&&frame?.storySurf?.phase==='cove')actions.push('story_surf_hit');else if(mapping[e.code])actions.push(mapping[e.code])}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{actions.push(b.dataset.action);b.blur()});
let holds={};document.querySelectorAll('[data-hold]').forEach(b=>{b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);holds[b.dataset.hold]=true};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>holds[b.dataset.hold]=false});
$('density').onchange=$('reset').onclick=()=>{reset=true;records=[];keys.clear()};
$('export').onclick=()=>{const data={version:'trial-a-r1',runtime:'Lua 5.3 via Lupa / localhost',scope:'offline only; not Miliastra performance',density:+$('density').value,render:$('renderMode').value,samples:records,events:frame?.events};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lua-lab-measurement.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
const playBackgroundTier=$('playBackgroundTier'),playBackgroundStatus=$('playBackgroundStatus');
function draw(f){let calls=0;ctx.clearRect(0,0,960,540);
 const backgroundStatus=drawPlayScenery(ctx,f,Number(playBackgroundTier.value));
 if(playBackgroundStatus.textContent!==backgroundStatus)playBackgroundStatus.textContent=backgroundStatus;
 for(const d of f.draws){if(omitCombatDraw(d))continue;ctx.globalAlpha=combatOpacity(d);if(d.kind==='rect'){drawCombatRect(ctx,d);calls++}else if(d.kind==='firework_sparks'){calls+=drawFireworkSparks(ctx,d)}else if(d.kind==='rect_runs'){calls+=drawCombatRuns(ctx,d,f.rectBatches[d.batch-1])}else if(d.kind==='text'){ctx.font=`bold ${d.size}px 'Yu Gothic UI',sans-serif`;ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#2a484868';ctx.strokeText(d.text,d.x,d.y);ctx.fillStyle=d.color;ctx.fillText(d.text,d.x,d.y);calls+=2}else if(d.kind==='boss_sprite'){const img=spriteImageFor(d.source,bossImages,bossAtlas);if(img.complete&&img.naturalWidth){ctx.save();ctx.translate(d.x,d.y);if(d.rotation)ctx.rotate(d.rotation);if(d.flip)ctx.scale(-1,1);const left=-d.w*(d.anchorX??.5),top=-d.h*(d.anchorY??1);ctx.drawImage(elementTintedSprite(img,d.tint),...d.box,left,top,d.w,d.h);if(d.glow){ctx.strokeStyle='#fff3bd';ctx.lineWidth=2;ctx.strokeRect(left-4,top-4,d.w+8,d.h+8);calls++}ctx.restore();calls++}}else if(d.kind==='sprite'){const asset=spriteData?.sprites[d.asset-1];ctx.save();ctx.translate(d.x,d.y);if(d.flip)ctx.scale(-1,1);if(asset&&$('renderMode').value!=='sprite'){paintRectangleGrid(ctx,asset,{x:-d.w/2,y:-d.h,width:d.w,height:d.h});calls+=rectangleCount(asset)}else if(asset&&atlas.complete){ctx.drawImage(atlas,...asset.box,-d.w/2,-d.h,d.w,d.h);calls++}else{ctx.fillStyle=d.asset<5?'#f4d394':'#51bada';ctx.fillRect(-d.w/2,-d.h,d.w,d.h);calls++}if(d.glow){ctx.strokeStyle='#fff3bd';ctx.lineWidth=2;ctx.strokeRect(-d.w/2-4,-d.h-4,d.w+8,d.h+8);calls++}ctx.restore()}else if(d.kind==='effect'){ctx.globalAlpha=d.alpha*.65;ctx.strokeStyle=d.color;ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(d.x,d.y,d.w/2,d.h/2,-.2,0,Math.PI*2);ctx.stroke();calls++}}ctx.globalAlpha=1;return calls+drawHuntMarker(ctx,f,$('trackedHuntHint').dataset.quest,$('trackedWorksite').value)}
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
let propArt;
function loadPropArt(){
 if(!propArt)propArt=fetch('content/worksite-props.json').then(response=>{
  if(!response.ok)throw Error(String(response.status));
  return response.json();
 }).catch(()=>{propArt=null;return null});
 return propArt;
}
function sightPicture(id){
 const canvas=document.createElement('canvas');
 canvas.className='sight-picture';canvas.width=216;canvas.height=78;
 canvas.setAttribute('aria-hidden','true');
 loadPropArt().then(data=>{
  const art=data?.worksites['ayaka-join'];
  if(!art?.[id])return;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#eadbb8';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const [dx,dy,w,h,color] of art[id]){
   ctx.fillStyle=color;ctx.fillRect(108+dx,74+dy,w,h);
  }
  canvas.dataset.sight=id;
 });
 return canvas;
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
  button.type='button';button.append(sightPicture(id),name+'に印を付ける');
  button.onclick=()=>actions.push('story_sight_mark:'+id);
  return button;
 }));
}
let lanternNote='';
function updateLanternNote(note,sight,maze){
 const panel=$('storyLanternNotes'),sketches=$('forestSketches');
 const count=maze?.forest?Math.min(3,maze.count):0;
 panel.hidden=!(note||sight||count||frame?.story?.quests?.['inazuma-lantern-contest']?.status==='complete');
 if(sketches.dataset.count!==String(count)){
  sketches.dataset.count=String(count);
  sketches.hidden=!count;
  const links=sketches.querySelector('div');links.replaceChildren();
  if(count)loadPropArt().then(data=>{
   if(data?.forest&&sketches.dataset.count===String(count)){
    links.replaceChildren();forestSketches(links,data.forest,count);
   }
  });
 }
 $('storyLanternEntry').hidden=!note;
 const sightLabel=$('storySightNote');
 const text=sight?`城下の案内絵図で「${sight.name}」に印を付けた。`:'';
 sightLabel.hidden=!sight;
 if(sightLabel.dataset.sight!==(sight?.id??'')){
  sightLabel.dataset.sight=sight?.id??'';
  sightLabel.replaceChildren();
  if(sight){
   const link=document.createElement('a');
   link.href=surveyPointUrl({quest:sight.quest,node:sight.node,worksite:sight.id});
   link.target='_blank';link.rel='noopener';link.textContent='この景色を地図で見る';
   sightLabel.append(sightPicture(sight.id),text,' ',link);
  }
 }
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
 const surf=f.storySurf, boarding=surf?.phase==='run', rally=surf?.phase==='cove';
 const springActive=!!f.storySpringCourse&&f.storySpringCourse.phase!=='idle';
 const solo=boarding||rally||springActive;
 $('springCourseStatus').closest('.game').classList.toggle('spring-playing',springActive);
 updateSpringCourse(f.storySpringCourse);
 updateIansanTraining(f.storyIansan);
 dailyBoard.update(f.daily,f.storyGraph);
 const diving=Boolean(f.storyToyDive), swimming=Boolean(f.storySwim);
 const waterCombat=f.storySwimCombat, waterCounter=waterCombat?.counter, waterSonar=waterCombat?.sonar, waterReflect=waterCombat?.reflect;
 $('surfControls').hidden=!boarding&&!rally;
 $('surfControls').closest('.game').classList.toggle('surf-playing',boarding||rally);
 $('surfHit').hidden=!rally;
 $('surfHit').disabled=!!f.paused;
 $('surfHit').classList.toggle('selected',!!surf?.ready);
 $('surfJump').hidden=!boarding;
 const surfText=boarding?`左右で進む・Spaceで跳ぶ　｜　輪 ${surf.rings} / ${surf.ringTotal}`:
  rally?(surf.ready?'返球！':'左右で合わせ、合図で J を押す'):'';
 if($('surfStatus').textContent!==surfText)$('surfStatus').textContent=surfText;
 $('touchJump').hidden=diving||swimming||solo;
 document.querySelectorAll('.touch [data-hold="left"],.touch [data-hold="right"]').forEach(button=>{button.hidden=solo});
 document.querySelector('.game').classList.toggle('toy-dive',diving);
 $('a1').hidden=solo&&f.active===2;
 $('a2').hidden=diving||(solo&&f.active===1);
 $('diveHelp').hidden=!diving;
 const swimHelp=$('fieldSwimHelp');
 swimHelp.closest('.game').classList.toggle('field-swim',swimming);
 swimHelp.hidden=!swimming;
 if(swimming){
  let instructions=waterCombat?'WASD・方向キーで泳ぐ ｜ Jで水撃 ｜ Space・Shiftで急回避 ｜ Fで退く':'WASD・方向キーで泳ぐ ｜ 門の深さを合わせてF ｜ 目印の近くでG';
  if(waterCounter)instructions+=waterCounter.ready?' ｜ Jで反撃の水撃':' ｜ 薄緑の波はKで受け止める';
  if(waterSonar)instructions+=waterSonar.exposed>0?' ｜ Jで反撃 残り'+(Math.ceil(waterSonar.exposed*10)/10).toFixed(1)+'秒':' ｜ 潜ったら波紋へKで探知';
  if(waterReflect)instructions+=waterReflect.ready&&!waterReflect.cooldown?' ｜ 今Kで泡返し':' ｜ K印の泡に向いてKで泡返し';
  if(swimHelp.textContent!==instructions)swimHelp.textContent=instructions;
 }
 $('touchSwimBurst').hidden=!waterCombat;
 $('touchSwimBurst').disabled=!!waterCombat?.burstCooldown;
 const waterSecondary=$('touchSwimGuard');
 waterSecondary.hidden=!waterCounter&&!waterSonar&&!waterReflect;
 waterSecondary.disabled=!!(waterCounter?.cooldown||waterSonar?.cooldown||waterReflect?.cooldown);
 const waterSecondaryLabel=waterReflect?'泡返し':waterSonar?'探知':'水の構え';
 if(waterSecondary.textContent!==waterSecondaryLabel)waterSecondary.textContent=waterSecondaryLabel;
 $('diveReset').disabled=f.paused;
 document.querySelectorAll('[data-swim]').forEach(button=>{button.hidden=!diving&&!swimming});
 document.querySelectorAll('[data-land]').forEach(button=>{button.hidden=diving||swimming||solo});
 const touchAttack=document.querySelector('[data-hold="attack"]');
 touchAttack.hidden=solo||diving||(swimming&&!waterCombat);
 touchAttack.textContent=waterCombat?'水撃':snowMatch?'雪玉を投げる':'攻撃';
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
 const capped=p.level===f.levelCap;
 const training=capped?`上限後のEXP ${expFormat.format(p.overflowXp)}`:
  `EXP ${expFormat.format(p.xp)} / ${expFormat.format(f.nextExp)}`;
 $('progressionStatus').textContent=`旅人・仲間 共通Lv ${p.level}${capped?' MAX':''} ｜ ${training} ｜ 累計EXP ${expFormat.format(p.total)}（基礎 ${expFormat.format(p.baseXp)}） ｜ 討伐 ${expFormat.format(p.killXp)}・依頼・初回勝利 ${expFormat.format(p.questXp)}（試算）`;
 $('regionLevels').textContent=f.regionEligibility.map(r=>`${r.name} Lv${r.required}：${r.eligible?'レベル条件達成':'未達'}・正式マップ未実装`).join(' ／ ');
}
function hud(f,calls,renderMs){
 $('allyFire').setAttribute('aria-pressed',String(Boolean(f.holdAllyFire)));
 $('allyFire').textContent=f.holdAllyFire?'同行者の攻撃を再開':'同行者の攻撃を控える';
 $('grappleNext').hidden=(f.grappleNodes?.length||0)<2;
 const balance=f.fieldBalance, balanceNote=$('fieldBalance');
 balanceNote.hidden=!balance;
 if(balance){
  const hp=balance.minHp===balance.maxHp?balance.minHp?.toLocaleString('ja-JP'):
   `${balance.minHp?.toLocaleString('ja-JP')}〜${balance.maxHp?.toLocaleString('ja-JP')}`;
  const text=balance.count?`比較版（試作）　通常敵 ${balance.count}体 ／ 最大HP ${hp}`:
   '比較版（試作）　通常敵と一部のボスのHP、報酬剣のATKを調整しています。';
  if(balanceNote.textContent!==text)balanceNote.textContent=text;
 }
 $('expRanking').hidden=!!balance;
 updateAtlas(f);
 updateDelivery(f);
 updateCooking(f.storyCooking);
 updateBook(f.storyBook);
 updateStone(f.storyStone);
 updateConstruction(f.storyConstruction);
 updateSights(f);
 updateLanternNote(f.storyLanternNote,f.storySightNote,f.story?.quests?.['inazuma-torii-maze']);
 const vista=$('capeVista');
 vista.hidden=!f.storyContest?.vista||Boolean(f.worldMap);
 if(!vista.hidden&&!vista.querySelector('img').hasAttribute('src'))vista.querySelector('img').src='assets/inazuma-shiomi-cape-background-v1.png';
 const memory=$('ayakaRevisit');
 memory.hidden=!f.storyAyakaMemory||Boolean(f.worldMap);
 if(!memory.hidden&&memory.lastElementChild.textContent!==f.storyAyakaMemory)memory.lastElementChild.textContent=f.storyAyakaMemory;
 const forest=$('storyForest');
 const observation=f.storyContest??f.storyForest??f.storyRest??f.storyCave??f.storyRoof;
 const fieldNote=observation?.message??f.storyAppraisal?.message??f.storyRumor?.message??f.storyBloom?.message??f.storyPatrol?.message??f.storySurvey?.message??f.storySnowball?.message??f.storyReturnBox?.message??f.storyFireworkStatus?.message??f.storyStealth?.message??f.storyIttoGames?.message??f.storyTeaCase?.message??f.storyWandererSurvey?.message??f.storyObservationVisitors?.message??f.storyColleiGuide?.message??f.storyKavehRoom?.message??f.storyNahidaDiscovery?.message??f.storyEmilieScent?.message??f.storyNaviaPhoto?.message??f.storyIansan?.message??f.storySpringCourse?.message??f.storyKinichHunt?.message??f.storySurf?.message??f.storyToyDive?.message??f.storyDiveExhibit?.message??f.storyLyneyMagic?.message??f.storyFurinaFinale?.message??(!f.storyFurinaRehearsal?.open?f.storyFurinaRehearsal?.message:undefined)??f.storyDuel?.label??f.storyPathStatus??f.storyFlagStatus;
 forest.hidden=!fieldNote;
 if(fieldNote&&forest.textContent!==fieldNote)forest.textContent=fieldNote;
 const trolley=f.voyage?.kind==='trolley'?f.voyage:null;
 const voyage=f.voyage;
 const lift=f.storyLift??(voyage&&{destination:voyage.destinationName??voyage.destination,seconds:voyage.total??voyage.seconds+voyage.elapsed,remaining:voyage.seconds});
 const rail=f.storyRailTransit;
 const market=$('storyMarket');
 market.hidden=!(rail||f.storyMarketOpen);
 if(!market.hidden)market.textContent=rail?(rail.release?'荷車が分岐へ移動中':'荷車が港へ移動中'):'山海の大市 開催中 ｜ 茶器・料理・布';
 $('storyLift').hidden=!lift;
 if(lift){
  $('storyLiftText').textContent=trolley?(trolley.stopover?'停留所に停車中 ｜ Fで途中下車できます':'トロッコで移動中'):
   voyage?.kind==='ferry'?(voyage.stopover?'オシカ・ナタに寄港中':'航海中')+' ｜ '+lift.destination+'まで '+Math.ceil(lift.remaining)+'秒':
   voyage?.kind==='train'?'列車で移動中 ｜ '+lift.destination+'まで '+Math.ceil(lift.remaining)+'秒':
   (lift.boat?'小舟で移動中':lift.waterway?'水路を移動中':lift.phase?'位相門で移動中':lift.wall?'壁伝いに移動中':lift.spiritway?'スピリットウェイを移動中':lift.windLift?'風に乗って移動中':'昇降台で移動中')+' ｜ '+lift.destination;
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
 const phases=$('weeklyPhases');
 const temperature=$('weeklyTemperature');
 const raiden=$('weeklyRaiden');
 const shouki=$('weeklyShouki');
 const apep=$('weeklyApep');
 const narwhal=$('weeklyNarwhal'),journey=field?.narwhal;
 const knave=field?.knave;
 const primal=field?.primal;
 const gate=field?.gate;
 const heretic=field?.heretic,hereticHint=$('weeklyHeretic');
 let hereticText='';
 if(heretic&&field.phase!=='respawn'){
  if(heretic.deadline){
   const remainder=`残り ${Math.max(0,Math.ceil((heretic.deadline-heretic.tick)/60))}秒`;
   const anchors=Array.isArray(heretic.anchors)?heretic.anchors.map(a=>a.hp).join(' / '):'';
   const gap=heretic.hole?` ｜ 押し壁の穴は${heretic.hole.upper?'上段':'床側'}`:'';
   hereticText=heretic.open?`詠唱 ${heretic.chant} / ${heretic.maxChant} ｜ 本体へ攻撃を当てる ｜ ${remainder}`:
    anchors?`結合点 左・右 ${anchors} ｜ 片方を壊す ｜ ${remainder}${gap}`:`結合点が現れる ｜ ${remainder}`;
  }else if(heretic.exposure){
   hereticText=`反撃できる時間 ${(heretic.exposure/60).toFixed(1)}秒`;
  }else if(heretic.card==='WH10'){
   hereticText='光背を構築中';
  }else if(heretic.card==='WH18'){
   hereticText='詠唱が完了した ｜ 衝撃に備える';
  }
 }
 hereticHint.hidden=!hereticText;
 hereticHint.textContent=hereticText;
 const falseMoon=field?.falseMoon;
 $('weeklyFalseMoon').hidden=!falseMoon||field.phase==='respawn';
 if(falseMoon&&field.phase!=='respawn'){
  const v=falseMoon,r=v.rule;
  const votes=v.vote?` ｜ 同意 ${v.vote.count} / ${v.vote.required}`:'';
  const law=r?.kind==='away'?`博士に背を向ける（${r.away==='left'?'左':'右'}向き）`:'移動・回避・ジャンプを止める';
  const hint=r?v.tick<420?`${r.state==='rule'?'判定中':'準備'} ｜ ${law} ｜ ${Math.ceil(r.remaining/60)}秒${r.violated?' ｜ 違反':''}`:
   r.violated?'判定終了 ｜ 罰の予告から離れる':'禁令をクリア':
   v.exposure?`反撃できる時間 ${(v.exposure/60).toFixed(1)}秒`:
   v.card==='WM08'?v.cover?'保護範囲の内側':'柱の青い枠の中へ':
   v.confirm?`異界へ移るまで ${(v.confirm/60).toFixed(1)}秒${votes}`:
   v.card==='WM13'?'盤面中央の裂け目で入場を確認'+votes:
   v.card==='WM14'?'異界へ移動中'+votes:
   v.card==='WM15'?`擬影 ${v.pendingDamage} / 3 ｜ 残り ${v.seconds}秒 ｜ 右端から帰還可${votes}`:'';
  $('weeklyFalseMoonHint').textContent=hint;
  $('weeklyFalseMoonUse').hidden=!v.canUse;
  $('weeklyFalseMoonUse').textContent=v.scene==='inner'?'外界へ戻る（H）':'異界へ入る（H）';
  $('weeklyFalseMoonCancel').hidden=!(v.vote?v.vote.mine:v.confirm);
 }
 $('weeklyGate').hidden=!gate||field.phase==='respawn';
 if(gate&&field.phase!=='respawn'){
  const target=gate.run?.member?(gate.run.mine?' ｜ あなたが誘導':' ｜ 誘導：旅人 '+gate.run.member):'';
  const hint=gate.card==='WT03'?`ポーン ${gate.shield} / 3 ｜ ポーンの向こう側へ突進を誘導${target}`:
   gate.card==='WT05'?`雷障壁 ${gate.shield} / ${gate.maxShield} ｜ 通常攻撃でも削れる`:
   gate.exposure?`反撃できる時間 ${(gate.exposure/60).toFixed(1)}秒`:
   gate.transfer?`HP譲渡まで ${(gate.transfer/60).toFixed(1)}秒 ｜ 残り ${gate.revives}回`:
   gate.run&&gate.lure?`凍結完了 ｜ ${gate.run.goal?'走路固定。ジャンプでかわす':'クイーンの向こう側へ'}${target}`:
   gate.canFrost?`凍結 ${gate.freeze} / 100 ｜ 霜印は盤の両端 ｜ 残り ${Math.ceil((gate.freezeBy-gate.tick+1)/60)}秒${gate.frostOwner&&gate.hold===undefined?' ｜ 旅人 '+gate.frostOwner+'が霜印を使用中':''}`:
   gate.deadline?`決着まで ${Math.max(0,Math.ceil((gate.deadline-gate.tick)/60))}秒`:'';
  $('weeklyGateHint').textContent=hint;
  $('weeklyGateFrost').hidden=!(gate.canFrost&&gate.nearFrost);
  $('weeklyGateFrost').textContent=gate.hold!==undefined?`霜印を保持中 ${(gate.hold/60).toFixed(1)} / 1.5秒`:
   gate.frostOwner?'ほかの旅人が霜印を使用中':
   gate.releaseRequired?'いったん長押しを離す':
   gate.frostReady>0?`次の霜印まで ${(gate.frostReady/60).toFixed(1)}秒`:'霜印を長押し（G）';
 }
 $('weeklyPrimal').hidden=!primal||field.phase==='respawn';
 if(primal&&field.phase!=='respawn'){
  const objects=Array.isArray(primal.objects)?primal.objects:[];
  const objectNames={gate:'障壁',bud:'芽',pillar:'柱'};
  const trial=objects.length?objects.map((o,i)=>`${objectNames[o.kind]}${objects.length>1?i+1:''} ${o.units}/${o.max}`).join(' ｜ '):'';
  $('weeklyPrimalHint').textContent=[`足場 ${10-primal.cuts}/10`,trial,trial?`残り ${Math.ceil((primal.closing-primal.tick)/60)}秒`:
   primal.exposure?`反撃できる時間 ${(primal.exposure/60).toFixed(1)}秒`:
   primal.cutAt&&primal.tick<primal.cutAt?'左端が崩れます。白線より右へ':''].filter(Boolean).join(' ｜ ');
  $('weeklyPrimalErosion').textContent=primal.actors.map(a=>`${a.id===1?'旅人':'同行'} 蝕破 ${a.count}/4${a.count?`（次の損傷まで ${(a.remaining/60).toFixed(1)}秒）`:''}`).join(' ｜ ');
 }
 $('weeklyKnave').hidden=!knave;
 if(knave){
  const selected=knave.actors[knave.active-1];
  $('weeklyKnaveActors').textContent=knave.actors.map(a=>`${a.id===1?'旅人':'同行'} 契約 ${a.debt} / ${a.cap}${a.feather?' ◇ 羽印':''}`).join(' ｜ ');
  $('weeklyKnaveLamp').hidden=!(knave.nearLamp&&selected.debt);
  $('weeklyKnaveLamp').textContent=knave.hold?`返済灯を保持中 ｜ 次まで ${(knave.hold/60).toFixed(1)}秒`:'返済灯を長押し（G）';
  $('weeklyKnaveStrike').hidden=!selected.feather;
  $('weeklyKnaveHint').textContent=[knave.title,knave.window?'赤宴を中断できる':knave.exposure?`反撃できる時間 ${(knave.exposure/60).toFixed(1)}秒`:
   knave.airborne?'高空。地面の赤い予告から離れる':selected.debt?'回復するか、両端の返済灯へ':''].filter(Boolean).join(' ｜ ');
 }
 phases.hidden=!field?.phaseHp||field.phase==='respawn';
 temperature.hidden=field?.temperature===undefined||field.phase==='respawn'||field.hp===0;
 raiden.hidden=!field?.raidenMeter||field.phase==='respawn'||field.hp===0;
 shouki.hidden=!field?.shouki||field.phase==='respawn'||field.hp===0;
 const oasis=field?.apep;
 apep.hidden=!oasis||field.phase==='respawn'||!(oasis.defense||oasis.domes||oasis.exposure)||field.hp===0;
 narwhal.hidden=!journey||field.phase==='respawn'||field.hp===0;
 fieldPanel.hidden=!field;
 if(field){
  const status=field.phase==='respawn'?`再出現まで ${Math.ceil(field.remaining)}秒`:field.phase==='cleared'||oasis?.defense||journey?.scene==='inner'?field.label:
   `HP ${Math.ceil(field.hp)} / ${field.maxhp} ｜ ${field.label}`;
  const elementNames={pyro:'炎',cryo:'氷',hydro:'水',electro:'雷'};
  const bodyNames={anemo:'風',cryo:'❄ 氷',electro:'⚡ 雷',pyro:'炎'};
  const elements=field.elementSlots?(' ｜ '+field.elementSlots.map(e=>elementNames[e]).join(' → ')):
   field.bodies?.[0]?.maxhp?' ｜ '+field.bodies.map(body=>body.name+' '+(body.hp>0?Math.ceil(body.hp)+'/'+body.maxhp:'討伐')).join(' / '):
   field.bodies?.length===2?' '+field.bodies.map((body,i)=>body.name??(bodyNames[body.element]??elementNames[body.element]??'')+['①','②'][i]).join(' / '):'';
  let mark=field.mark?` ｜ ${elementNames[field.mark]}断流・両端で解除`:'';
  if(field.marks){
   for(const [id,item] of Object.entries(field.marks)){
    const role=id==='1'?'旅人':'同行';
    const effect=typeof item==='number'
     ?`測距印 ${Math.ceil(item)}秒`
     :`${elementNames[item.element]}刻印 ${Math.ceil(item.ticks/60)}秒`;
    mark+=` ｜ ${role} ${effect}`;
   }
  }
  const form=field.formName?`・${field.formName}`:'';
  const party=f.storyTravelerTrial?(f.coop?.shared?' ｜ 旅人のみで共闘':' ｜ 旅人単独'):'';
  const difficulty=field.difficulty?` ｜ ${field.difficulty}`:'';
  const tuning=(field.draftHp?' ｜ 比較版HP':'')+(field.draftMoves?' ｜ 短縮技案':'');
  const line=`${field.name}${form}（Lv${field.level}）${difficulty}${elements} ｜ ${status}${tuning}${mark}${party}`;
  if(fieldLabel.textContent!==line)fieldLabel.textContent=line;
  fieldHp.hidden=field.phase==='respawn'||field.phase==='cleared'||!phases.hidden||!!oasis?.defense||journey?.scene==='inner';
  fieldHp.max=field.maxhp;fieldHp.value=field.hp;
  if(!phases.hidden){
   if(phases.childElementCount!==field.phaseHp.length||phases.dataset.boss!==field.id){
    phases.dataset.boss=field.id;
    const labels=['水弓','邪眼','魔王武装'];
    phases.replaceChildren(...field.phaseHp.map((phase,i)=>{
     const label=document.createElement('label');
     label.append(phase.name??labels[i],document.createElement('progress'));return label;
    }));
   }
   [...phases.querySelectorAll('progress')].forEach((meter,i)=>{
    meter.max=field.phaseHp[i].max;meter.value=field.phaseHp[i].hp;
   });
  }
  if(!temperature.hidden){
   const causes={floor:'床から蓄積',hit:'攻撃で蓄積',release:'装置を放出',overload:'温度上限'};
   $('weeklyTempText').textContent=field.temperatureLabel+' '+Math.round(field.temperature)+'%';
   $('weeklyTempMeter').value=field.temperature;
   const devices=field.devices.map((ticks,i)=>['左','右'][i]+' '+(ticks?Math.ceil(ticks/60)+'秒':'使用可')).join(' ／ ');
   const held=field.deviceHold?(' ｜ 放出 '+Math.floor(100*field.deviceHold/field.deviceTotal)+'%'):'';
   $('weeklyDevices').textContent=field.deviceEnabled?
    field.deviceLabel+'（両端） '+devices+held+(causes[field.cause]?' ｜ '+causes[field.cause]:''):'変身中';
   $('weeklyDeviceButton').hidden=!field.deviceEnabled;
   $('weeklySeal').hidden=!field.seal;
   if(field.seal){
    $('weeklySealHp').max=field.seal.max;$('weeklySealHp').value=field.seal.hp;
    $('weeklySealText').textContent=!field.seal.ready?'結晶化中':field.seal.carrying?'紅蓮蛾を所持。繭に攻撃':'紅蓮蛾を拾って攻撃';
   }
  }
  if(!raiden.hidden){
   const gauge=field.raidenMeter,flower=field.flower,hint=$('weeklyRaidenHint');
   $('weeklyRaidenText').textContent=gauge.name+' '+Math.round(gauge.value)+'%';
   $('weeklyRaidenMeter').value=gauge.value;
   $('weeklyFlower').hidden=!flower;
   if(flower){
    $('weeklyFlowerMeter').max=flower.max;$('weeklyFlowerMeter').value=flower.value;
    $('weeklyFlowerText').textContent=flower.protected?'保護域の内側へ':field.move==='WR15'?'保護なし・大太刀に備える':
     flower.ready?`通常攻撃で充填 ${flower.value} / ${flower.max} ｜ 残り${Math.ceil(flower.limit/60)}秒`:flower.limit?'花蕊が現れるまで待つ':'充填受付終了';
   }
   const targets=Array.isArray(field.targets)?field.targets:[];
   hint.textContent=field.move==='WR16'?(field.damageable?`攻撃の好機 ｜ 残り${Math.ceil(field.down/60)}秒`:'装甲の崩壊中'):
    targets[0]?.kind==='eye'?'雷眼を攻撃するか、予兆の外へ':targets[0]?.kind==='shade'?'╳を出した残影に近づいて攻撃':'';
   hint.hidden=!hint.textContent;
  }
  if(!shouki.hidden){
   const v=field.shouki,aim=v.aim,device=v.device;
   const use=$('weeklyShoukiAction');
   const reserved=aim&&!aim.fired?(aim.mine?'（自分が予約中）':`（${aim.slot?`参加者${aim.slot}`:'同行者'}が予約中）`):'';
   $('weeklyShoukiChargeText').textContent=`共有充填 ${v.charge} / ${v.max}${reserved}`;
   $('weeklyShoukiCharge').value=v.charge;
   $('weeklyShoukiArmor').hidden=!v.p2;
   $('weeklyShoukiArmorText').textContent=`装甲 ${v.shield} / ${v.shieldMax}`;
   $('weeklyShoukiArmorMeter').value=v.shield;
   const effects={pyro:'氷床を解除',anemo:'ジャンプを補助',left:'左腕を抑制',hydro:'回復場を展開',cryo:'炎床を解除',right:'右腕を抑制'};
   const info=device?`${device.title}・${effects[device.id]}${device.cooldown?` ｜ 再使用まで${Math.ceil(device.cooldown/60)}秒`:''}`:'';
   const hands=v.left||v.right?` ｜ 抑制中 ${v.left?'雷A':''}${v.right?'雷B':''}`:'';
   const trial=v.trialTime===undefined?'':v.trialLeft?`滅度機を攻撃（J） ｜ 残り${v.trialLeft}基・${Math.ceil(v.trialTime/60)}秒`:
    v.canAim?`端末を構える（H） ｜ 残り${Math.ceil(v.trialTime/60)}秒`:'端末の発射受付終了';
   const combatHint=field.shoukiStage==='p1'?(info||(
    v.charge===v.max?'元素装置に近づいて起動':'充填ブロックを拾う'))+hands:
    field.shoukiStage==='p2'?(field.damageable?'足元から本体を攻撃':v.canAim?'端末で胸部を照準':'充填ブロックを拾う'):'';
   $('weeklyShoukiHint').textContent=v.exposure?`攻撃できる時間 残り${Math.ceil(v.exposure/60)}秒`:
    aim?(aim.fired?'端末を発射':!aim.mine?'端末が使用中':aim.confirmed?'端末を発射準備中':'Hで射撃を確定・Escで中止'):
    trial||combatHint;
   use.hidden=!device&&!v.canAim;
   use.disabled=!!device&&(device.cooldown>0||v.charge<v.max)||f.paused||f.auto;
   use.textContent=device?device.title+'装置を起動（H）':'端末を構える（H）';
   const pods=$('weeklyShoukiPods'),targets=Array.isArray(v.targets)?v.targets:[];
   pods.hidden=targets.length===0||f.actors[2-f.active]?.hp<=0;
   for(const button of pods.querySelectorAll('button')){
    const index=Number(button.dataset.action.slice(-1));
    button.disabled=f.paused||f.auto||!targets.some(target=>target.index===index);
    button.setAttribute('aria-pressed',String(v.assist===index));
   }
   const panel=$('weeklyShoukiAim');
   panel.hidden=!aim?.mine||aim.fired;
   for(const button of panel.querySelectorAll('button')){
    const action=button.dataset.action;
    button.disabled=f.paused||f.auto||!aim?.mine||aim.confirmed&&action!=='encounter_cancel';
    if(action.startsWith('encounter_target:'))button.setAttribute('aria-pressed',String(action.endsWith(':'+aim?.target)));
   }
  }
  if(!apep.hidden){
   const v=oasis,units=Array.isArray(v.units)?v.units:[];
   $('weeklyApepProgress').hidden=!v.defense;
   $('weeklyApepProgressText').textContent=`オアシスの蘇生 ${v.progress} / ${v.max}`;
   $('weeklyApepMeter').value=v.progress??0;
   const roleNames={warden:'護衛',breeder:'飼育',eater:'捕食',barrier:'障壁',burst:'自爆'};
   const special=[...new Set(units.map(e=>roleNames[e.role]).filter(Boolean))];
   $('weeklyApepHint').textContent=v.failed?'心を守りきれませんでした。':v.defense?
    `残り${units.length}体${special.length?' ｜ '+special.join('、'):''}${v.incoming?' ｜ 次の増殖体が接近中':''}`:
    v.exposure?`攻撃の好機 ｜ 残り${Math.ceil(v.exposure/60)}秒`:
    (v.domes[0].open?(v.protected?'保護域の内側':'ドームの内側へ'):'ドームが開くまで待つ')+
     (v.nextPulse?` ｜ 次の余波まで${Math.ceil(v.nextPulse/60)}秒`:'');
   $('weeklyApepRetry').hidden=!v.failed;
   $('weeklyApepRetry').disabled=f.paused||f.auto;
   const walls=$('weeklyApepWalls'),placed=Array.isArray(v.walls)?v.walls:[];
   walls.hidden=placed.length===0||f.actors[2-f.active]?.hp<=0;
   for(const button of walls.querySelectorAll('button')){
    const part=placed.find(w=>w.index===Number(button.dataset.action.slice(-1)));
    button.disabled=!part||f.paused||f.auto;
    button.setAttribute('aria-pressed',String(!!part?.selected));
   }
  }
  if(!narwhal.hidden){
   const v=journey,shadow=v.shadow,object=v.object;
   $('weeklyNarwhalGauge').hidden=v.scene==='inner'&&!shadow;
   $('weeklyNarwhalGaugeText').textContent=v.scene==='inner'?
    `幻影の耐久 ${shadow?Math.ceil(shadow.hp*100/shadow.max):0}%`:`敵意 ${v.h} / ${v.maxH}`;
   $('weeklyNarwhalMeter').max=v.scene==='inner'?shadow?.max||100:v.maxH;
   $('weeklyNarwhalMeter').value=v.scene==='inner'?shadow?.hp||0:v.h;
   $('weeklyNarwhalObject').hidden=!object;
   if(object){
    const n=object.max-object.hp;
    $('weeklyNarwhalObjectText').textContent=object.kind==='kernel'?
     `幻形の核　通常攻撃 ${n} / ${object.max}回 ｜ 残り${Math.ceil(object.time/60)}秒`:
     object.time?`渦の眼　命中 ${n} / ${object.max}回 ｜ 残り${Math.ceil(object.time/60)}秒`:'渦の眼の爆発範囲から離れる';
    $('weeklyNarwhalObjectMeter').max=object.max;
    $('weeklyNarwhalObjectMeter').value=n;
   }
   const forms={WV12:'獣の突進','WV12.vishap':'竜の跳躍','WV12.jellyfish':'クラゲの水弾'};
   $('weeklyNarwhalHint').textContent=v.incoming?`核の受付終了 ｜ ${forms[v.incoming]}`:
    v.exposure?`反撃できる時間 残り${Math.ceil(v.exposure/60)}秒`:
    field.narwhalStage==='swallow'?'腹中へ移動中':field.narwhalStage==='expel'?'星海へ帰還中':
    v.scene==='inner'?'幻影を倒すと星海へ帰還':v.low?'鯨が衰弱。以後は星海で戦う':v.queued?'現在の技の後に腹中へ':'';
  }
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
 $('airflowSound').hidden=!(airflow?.sound||cue||resonance||resonanceCue||f.storyObservationVisitors?.toneReady);
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
 updateSurveyMap(f.storySurveyMap,f);
 updateTheaterProgramme(f.storyTheaterProgramme);
 updateFestivalLedger(f.storyFestivalLedger);
 updateHarborBook(f.storyHarborBook);
 updateFrostPrints(f.storyFrostPrints,f.storyGraph);
 updateReadingModel(f.storyKavehModel);
 updateDiscoveryMap(f.storyDiscoveryMap);
 updateFurinaRehearsal(f.storyFurinaRehearsal);
 updateGroupPhoto(f.storyNaviaPhoto);
 updateStoneOrnaments(f.storyStonePair);
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
 const portal=f.storyNearbyPortal;
 $('nearbyPortal').hidden=!portal;
 if(portal){
  const go=$('nearbyPortalGo');
  const automatic=Boolean(portal.automaticArrival);
  const status=automatic?'着岸後に自動で移動':portal.available?'移動できます':portal.reason;
  const wind=portal.wind?` ｜ ${portal.wind.calm?'風が止んでいます　残り':'風が止むまで'} ${Math.ceil(portal.wind.seconds)}秒`:'';
  const level=portal.available && portal.level>1 ? `（必要Lv${portal.level}）` : '';
  $('nearbyPortalText').textContent=`行き先：${portal.name}${level} ｜ ${status}${wind}`;
  const cooldown=$('nearbyPortalCooldown');
  cooldown.hidden=!portal.weeklyRespawnSeconds;
  if(!cooldown.hidden){
   const remaining=`ボスの再出現まで ${Math.ceil(portal.weeklyRespawnSeconds)}秒`;
   if(cooldown.textContent!==remaining)cooldown.textContent=remaining;
  }
  go.hidden=automatic;
  go.disabled=!portal.available;
  go.textContent=portal.ferryStop?'F：途中下船する':portal.ferryReboard?'F：再乗船する':portal.ferryBoard?'F：乗船する':
   portal.trolleyStop?'F：途中下車する':portal.boatSeconds?'F：小舟に乗る':portal.waterwaySeconds?'F：水路を渡る':
   portal.phaseSeconds?'F：位相門をくぐる':portal.liftSeconds?'F：昇降台に乗る':
   portal.trolleyBoard?'F：トロッコに乗る':portal.trainBoard?'F：列車に乗る':'F：この門を通る';
 }
 updateProgression(f);if(f.campaign){const q=f.campaign;$("quest").textContent=`${f.location} ｜ 討伐 ${q.count}/${q.goal} ｜ ${q.message}`+(f.boss?` ｜ ${f.boss.name} HP ${f.boss.hp}/${f.boss.maxhp} ${f.boss.label||("第"+f.boss.phase+"段階")}${f.boss.orbs!==undefined?" ｜ 風玉 "+f.boss.orbs+"/4":""}`:"");document.querySelector(".location").textContent=f.location}else{$("quest").textContent="冒険モードは仮配置・仮ボスで進行を検証します。公式ボスの実装数には含めません。";document.querySelector(".location").textContent="モンド風・試験用狩場 / 3画面・2段足場";}$('a2').hidden=!!f.storyTravelerTrial;$('companionStatus').hidden=!!f.storyTravelerTrial;for(const a of f.actors){$('a'+a.id).className='card'+(a.id===f.active?' active':'');$('a'+a.id).innerHTML=`<small>${a.id===f.active?'操作中':'AI 同行'}</small><strong>${a.id===1?'旅人':(f.companion?.name||'アンバー')} <small>${a.hp} / ${a.maxhp}</small></strong><div class="bar"><i style="width:${a.hp/a.maxhp*100}%"></i></div>`}$('companionStatus').textContent=(f.companion?.name||'アンバー')+' ／ 反撃 '+(f.companion?.counterSeconds||0).toFixed(1)+'秒 ／ 防御 '+(f.companion?.guardSeconds||0).toFixed(1)+'秒 ／ 盾 '+(f.companion?.shieldHP||0)+' ／ 燃焼強化 '+(f.companion?.burnBoostSeconds||0).toFixed(1)+'秒 ／ 浮遊 '+(f.companion?.floatSeconds||0).toFixed(1)+'秒 ／ 領域 '+(f.companion?.moonDomain||0).toFixed(1)+'秒 ／ 印 '+(f.companion?.moonMark||0).toFixed(1)+'秒';if(f.companion?.dodgeSeconds)$('companionStatus').textContent+=' ／ 霜影回避 '+f.companion.dodgeSeconds.toFixed(1)+'秒';if(f.companion?.moonReaction)$('companionStatus').textContent+=' ／ '+f.companion.moonReaction+'（試作）';if(f.companion?.climbBoostSeconds)$('companionStatus').textContent+=' / '+f.companion.skills[3]+' '+f.companion.climbBoostSeconds.toFixed(1)+'s';document.querySelector('[data-action="skill3"] span').textContent=f.companion?.skills[3]||'ウサギ伯爵';document.querySelector('[data-action="skill4"] span').textContent=f.companion?.skills[4]||'跳躍射撃';const a=f.actors[f.active-1];document.querySelectorAll('[data-amber]').forEach(b=>b.disabled=f.active!==2);$('name1').textContent=f.active===1?'旋風斬り':(f.companion?.skills[1]||'火矢');$('name2').textContent=f.active===1?'竜巻':(f.companion?.skills[2]||'矢の雨');for(const key of ['normal','skill1','skill2','skill3','skill4','light'])$('cd-'+key).textContent=a.cd[key]>0?a.cd[key].toFixed(1):'';$('echoStatus').textContent='光界反響の記録：'+(f.echoSource||'なし')+'（直接攻撃・照射のみ試作対応）';$('gaugeText').textContent=`${f.gauge} / 100${f.lightForm?.seconds>0?' ｜ 光界 '+f.lightForm.seconds.toFixed(1)+'秒':''}`;$('gaugeBar').style.width=f.gauge+'%';$('ms').textContent=f.lua_ms.toFixed(2)+' ms';$('memory').textContent=(f.lua_kb/1024).toFixed(2)+' MB';$('enemies').textContent=f.visible+' / '+f.total;$('draws').textContent=calls.toLocaleString();$('kills').textContent=f.hits+' / '+f.kills;$('mora').textContent=f.mora.toLocaleString();$('auto').textContent='自動戦闘 '+(f.auto?'ON':'OFF');$('auto').classList.toggle('selected',f.auto);$('pause').textContent=f.paused?'再開':'一時停止';$('status').textContent=`ローカルLua実行中 · 経過 ${f.t.toFixed(1)} 秒 · 描画 ${renderMs.toFixed(2)} ms · 戦闘不能帰還 ${f.returns} 回 / 幻境実機は未検証`}
async function tick(now){requestAnimationFrame(tick);const dt=now-last;last=now;if(document.hidden||lifecycle.leaving){keys.clear();acc=0;return}acc=Math.min(100,acc+dt);if(busy||acc<33)return;if(frame?.worldMap&&!frame.coop?.code&&!actions.length&&!restoreRequested&&!reset&&!rankedStartRequested)return;const steps=Math.min(6,Math.floor(acc/(1000/60)));acc-=steps*1000/60;busy=true;const sent=actions;actions=[];const doReset=reset;reset=false;const rankedStart=rankedStartRequested;rankedStartRequested=false;const saveNow=checkpointRequested;checkpointRequested=false;const restoreNow=restoreRequested;restoreRequested=null;const importNow=pendingImport;pendingImport=null;const configureNow=pendingLoadout;pendingLoadout=null;const renderProfile=$('renderMode').value;try{const res=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,...lifecycle.request(),...dailyBoard.request(),steps,packRectArt:true,packFireworks:true,...(configureNow?{loadout:configureNow}:{}),checkpoint:saveNow||!!importNow,...(restoreNow?{restore:restoreNow}:{}),render:renderProfile==='sprite'?'sprite':'rect',profile:renderProfile,reset:doReset,rankedStart,density:+$('density').value,actions:sent,input:{left:keys.has('KeyA')||keys.has('ArrowLeft')||holds.left,right:keys.has('KeyD')||keys.has('ArrowRight')||holds.right,up:keys.has('KeyW')||keys.has('ArrowUp')||holds.up,down:keys.has('KeyS')||keys.has('ArrowDown')||holds.down,jump:keys.has('Space'),attack:keys.has('KeyJ')||holds.attack,interact:keys.has('KeyG')||holds.interact}})});frame=lifecycle.restoreStoryGraph(await frameResponse(res));session=frame.session;lifecycle.accept(session);updateExpRanking(frame,rankedStart);updateCoop(frame);skillUI.update(frame);$('skillCondition').textContent=frame.skillNotice||'';$('reactionStatus').textContent='元素反応の試作：付着 '+(frame.auras?.length||0)+'体 ／ 反応 '+(frame.reactions?.length||0)+'回（直近80件、燃焼を含む）。蒸発・凍結などは未実装。';inventoryUI.update(frame);if(saveNow){try{if(!frame.checkpoint)throw Error('冒険を開始してから保存してください');localStorage.setItem(SAVE_KEY,JSON.stringify(frame.checkpoint));$('saveStatus').textContent='冒険を保存しました。'+new Date().toLocaleTimeString()}catch(e){$('saveStatus').textContent='保存できません: '+e.message}}if(restoreNow)$('saveStatus').textContent='保存した進行で町から再開しました。';if(importNow){try{if(!frame.checkpoint)throw Error('再開後の保存データがありません');localStorage.setItem(SAVE_KEY,JSON.stringify(frame.checkpoint));importNow.resolve('ファイルの進行で町から再開し、このブラウザにも保存しました。')}catch(e){importNow.resolve('ファイルの進行で再開しましたが、ブラウザへの保存に失敗しました。元の保存は保持しています。 '+e.message)}}const start=performance.now(),calls=draw(frame),ms=performance.now()-start;hud(frame,calls,ms);records.push({t:frame.t,lua_ms:frame.lua_ms,lua_kb:frame.lua_kb,render_ms:ms,calls,hits:frame.hits,kills:frame.kills,visible:frame.visible});if(records.length>1800)records.shift();const firstReady=!window.lab;window.lab={frame,records,action:a=>actions.push(a)};if(firstReady)window.dispatchEvent(new Event('lab-ready'))}catch(e){if(rankedStart)updateExpRanking(null,true);if(importNow)importNow.reject(e);if(saveNow||restoreNow)$('saveStatus').textContent='保存・再開に失敗しました。元の保存データは保持しています。 '+e.message;$('status').className='note error';$('status').textContent='通信に失敗しました。 '+e.message}finally{busy=false}}
requestAnimationFrame(tick);
