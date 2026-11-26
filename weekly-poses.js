import {paintSprite,rectangleCount,packedGeometrySize,spriteBounds} from './sprite-layers.js';

const boss=document.querySelector('#boss'),pose=document.querySelector('#pose');
const result=document.querySelector('#result'),canvases=[...document.querySelectorAll('canvas')];
const fieldMode=new URL(location.href).searchParams.get('group')==='field';
const names={
 peck_ready:'くちばしの構え',peck:'ついばみ',crouch:'かがむ',spring:'跳ね上がり',stagger:'よろめき',spores:'胞子', slam_ready:'叩きつけの構え',
 slam:'叩きつけ',sweep_ready:'薙ぎ払いの構え',sweep:'薙ぎ払い',bolts:'連弾',raised:'持ち上げ',bowed:'うなだれ',impact:'着弾',
 bud_first:'一つ目のつぼみ',bud_second:'二つ目のつぼみ', windup:'振りかぶり',claw_first:'一段目の爪',claw_second:'二段目の爪',tail_ready:'尾の構え',tail_sweep:'尾の薙ぎ払い',
 charge:'突進',burst:'放出',gather:'集束',branches:'枝',rain:'雨',vine:'つる',ball:'球体',
 core:'核',ray:'光線',pillars:'柱',cloak:'隠蔽',recover:'復帰',stream:'奔流',dive:'潜行',
 emerge:'出現',bolt:'弾',fall:'落下',rings:'環',guard:'防御',fire:'発射',exposed:'露出',
 dim:'消灯',stones:'岩',quake:'震動',spear:'槍',hammer:'槌',merge:'合体',surge:'奔流',
 settled:'静止',half:'半展開',attack:'攻撃',focus:'集中',bow:'お辞儀',conduct:'指揮',water:'水流',
 rest:'休息',wing:'翼','gold-hover':'金焔・滞空','gold-dive':'金焔・急降下',feather:'羽根',fruit:'果実','claw-a':'爪・一段目',
 'claw-b':'爪・二段目',beam:'光線',collector:'集積器','stem-ready':'茎の構え','stem-strike':'茎の一撃','wing-ready':'翼の構え','wing-strike':'翼の一撃',
 'fungus-ready':'キノコンの構え','fungus-strike':'キノコンの一撃','slam-ready':'叩きつけの構え','slam-strike':'叩きつけ',fissure:'地割れ',lunge:'踏み込み',eruption:'噴出',
 overburn:'過熱',molten:'溶融','blade-ready':'刃の構え','blade-cross':'交差斬り',purge:'放出',cooled:'冷却',crest:'冠',
 plume:'羽飾り',punch:'拳',stomp:'踏みつけ',mecha:'機械形態','saw-ready':'丸鋸の構え',cannon:'砲撃',heated:'加熱',
 ward:'防壁',gloom:'暗転',shield:'盾',fisher:'釣り',kick:'蹴り',green:'緑色形態',flame:'炎',
 cocoon:'繭',anchor:'錨',cast:'詠唱',ritual:'儀式',reflection:'幻影',throw:'投擲',monitor:'監視',
 star:'星',slash:'斬撃',coffin:'棺',rake:'引っかき',bloom:'開花',drink:'吸収',wing_first:'翼・一段目',
 wing_second:'翼・二段目',dash:'突進',roll:'回転',bombs:'爆弾',drill:'ドリル',ram:'体当たり',jaw:'顎',
 skull:'頭骨',dolphin:'イルカ',boar:'イノシシ',snake:'ヘビ',fist:'拳',wheel:'車輪',clap:'挟撃',
 feathers:'羽根',blade:'刃',rocket:'ロケット',plow:'除雪板',vent:'排気',scrape:'地面をかく',braced:'踏ん張り',
 brace:'構え',strike:'攻撃姿勢',shell:'外殻',pillar:'岩柱',mask:'仮面',stance:'構え',host:'本体',crane:'ツル',mallard:'アヒル',
 ferret:'フェレット',crab:'カニ',raptor:'タカ',frog:'カエル',finch:'スズメ',
 heating:'加熱中',cracked:'ひび割れ',
 hover:'滞空',glide:'滑空',perch:'着地',breath:'ブレス',roar:'咆哮',down:'ダウン',claw:'爪',head:'頭',crystal:'結晶',orb:'弾',
 'perch-body':'着地・胴体','breath-body':'ブレス・胴体',ready:'待機',swipe:'前脚',tail:'尾',leap:'跳躍',run:'疾走',land:'着地',rise:'立ち上がり',howl:'遠吠え',
 meter:'計器',sight:'照準',pendulum:'振り子',swing:'振り',stand:'直立',reset:'復帰',closed:'閉鎖',open:'展開',shuttle:'杼',broken:'破損',
 human:'人型',foul:'魔王武装',idle:'待機',cryo:'氷形態',pyro:'炎形態',armored:'装甲形態',normal:'通常形態',full:'全身候補',upper:'本編・くびれから上',
 dark:'暗色形態',prime:'後半形態',seed:'種子',whale:'鯨',shadow:'影',single:'片鎌',double:'凶月',king:'キング',queen:'クイーン'
};
function label(key){
 const match=/^(awake|normal)-(.+)$/.exec(key);
 return match?(match[1]==='awake'?'覚醒':'通常')+'・'+names[match[2]]:names[key]??key;
}
async function read(path){
 const response=await fetch(path);
 if(!response.ok)throw Error(path+' '+response.status);
 return response.json();
}
const arenaViews={
 signora:{frost:['氷形態・炎心','cryo'],emerging:['焔蝶の羽化・繭から出る瞬間','pyro'],blaze:['炎形態・霜眼','pyro']},
 childe:{water:['黄金屋・第1形態','human'],delusion:['黄金屋・第2形態（邪眼）','human'],'legacy-form':['黄金屋・第3形態（魔王武装）','foul']},
 narwhal:{arrival:['星海・開幕','whale'],inside:['異界・幻影戦','shadow'],return:['星海・帰還後の衰弱','whale']},
 knave:{court:['開幕・片鎌','single'],frenzy:['形態移行・双鎌','double'],moon:['凶月と双鎌','double']}
};
function paintRects(ctx,rects=[]){
 ctx.save();
 for(const [x,y,w,h,color,opacity] of rects){ctx.fillStyle=color;ctx.globalAlpha=opacity;ctx.fillRect(x,y,w,h)}
 ctx.restore();
}
const aliases={surveyor:'surveyorArt',loom:'loomArt',primal_fire:'primalWeeklyArt',game_before_gate:'gateWeeklyArt',false_moon:'falseMoonWeeklyArt'};
try{
 const kind=fieldMode?'field-boss':'weekly';
 const [roster,groups]=await Promise.all([read('content/'+(fieldMode?'field':'weekly')+'-boss-spawns.json'),read('content/'+kind+'-pose-files.json')]);
 let entries;
 if(fieldMode){
  document.title=document.querySelector('h1').textContent='フィールドボスの形態・部位比較';
  entries=new Map();
  const special={cryo:'cryoRegisvine',pyro:'pyroRegisvine',primo:'primoGeovishap',rimebiter:'bathysmal',bolteater:'bathysmal'};
  for(const [group,{poses,idleAnchor}] of Object.entries(groups)){
   const key=group.replace(/(?:Field)?Art$/,'');
   const boss=roster.fieldBosses.find(b=>b.node==='icewind-'+key+'-field'||b.controller===(special[key]??key));
   if(!boss)throw Error(group);
   const part={rimebiter:'・噛氷',bolteater:'・呑雷'}[key]??'';
   entries.set(key,{...boss,name:boss.name+part,poses,idleAnchor});
  }
  const [motion,quest]=await Promise.all([read('content/motion-pose-files.json'),read('content/quest-pose-files.json')]);
  const common={
   anemoHypostasis:{shell:'anemo-shell',core:'anemo-core'},
   electroHypostasis:{shell:'electro-shell',core:'electro-core'},
   geoHypostasis:{shell:'geo-shell',core:'geo-core',pillar:'geo-pillar'},
   maguu:{idle:'maguu',stance:'maguu-stance',slash:'maguu-slash',mask:'maguu-mask'}
  };
  for(const [controller,parts] of Object.entries(common)){
   const poses=Object.fromEntries(Object.entries(parts).map(([key,stem])=>[key,stem+'-sprites.json']));
   entries.set(controller,{...roster.fieldBosses.find(b=>b.controller===controller),poses,pack:'common-boss'});
  }
  for(const [controller,pack,poses] of [['oceanid','motion',motion.oceanid],['grandFinale','quest',{idle:quest.grandFinaleArt}]]){
   entries.set(controller,{...roster.fieldBosses.find(b=>b.controller===controller),poses,pack});
  }
  for(const boss of roster.fieldBosses.filter(b=>['branchLegend','waterLegend'].includes(b.controller))){
   const bodies=[boss,boss.partner,...(boss.members??[])].filter(body=>body?.art);
   for(const body of bodies){
    const member=body.memberName??(body!==boss?body.name:null)??({pyro:'炎',cryo:'氷'}[body.element])??body.art;
    const name=bodies.length>1?boss.name+'・'+member:boss.name;
    const poses=Object.fromEntries(['idle','brace','strike'].map(key=>[key,body.art+'-field-'+key+'-sprites-v'+(boss.artRevision??1)+'.json']));
    entries.set(body.art,{...boss,name,poses,pack:'field',legend:true});
   }
  }
 }else entries=new Map(roster.weeklyBosses.map(b=>[b.controller,{...b,poses:groups[aliases[b.controller]??b.controller+'WeeklyArt']}]));
 const legends=document.createElement('optgroup');legends.label='地方伝説';
 for(const [controller,b] of entries)(b.legend?legends:boss).append(new Option(b.name,controller));
 if(legends.children.length)boss.append(legends);
 const params=new URL(location.href).searchParams;
 const byNode=[...entries].find(([,entry])=>entry.node===params.get('node'));
 boss.value=entries.has(params.get('boss'))?params.get('boss'):byNode?.[0]??(fieldMode?'battleship':'andrius');
 const pixels=document.querySelector('#palettePixels');
 pixels.checked=params.get('pixels')==='1';
 let commonPack;
 function readPose(selected,path){
  if(selected.pack==='common-boss'){
   commonPack??=read('assets/common-boss-packed.json').catch(error=>{commonPack=null;throw error});
   return commonPack.then(parts=>parts[path]);
  }
  return read('assets/'+(selected.pack??kind)+'-packed/'+path);
 }
 let repaint;
 pixels.onchange=()=>{
  const url=new URL(location.href);
  if(pixels.checked)url.searchParams.set('pixels','1');else url.searchParams.delete('pixels');
  history.replaceState(history.state,'',url);
  repaint?.();
 };
 let revision=0;
 function changeBoss(requested){
  const b=entries.get(boss.value);
  pose.replaceChildren(...Object.keys(b.poses).map(k=>new Option(label(k),k)));
  if(boss.value==='primal_fire')pose.append(new Option('炎剣・開幕の予兆','flame'),new Option('双剣・床切断後','dual'));
  for(const [key,[title]] of Object.entries(arenaViews[boss.value]??{}))pose.add(new Option(title,key));
  if([...pose.options].some(option=>option.value===requested))pose.value=requested;
  else if(boss.value==='shouki')pose.value='upper';
  return draw();
 }
 async function draw(){
  const ticket=++revision;
  repaint=null;
  const forge=boss.value==='primal_fire'&&['flame','dual'].includes(pose.value)?pose.value:null;
  const selected=entries.get(boss.value);
  const controller=boss.value,sceneKey=pose.value;
  const scene=arenaViews[controller]?.[sceneKey];
  const asset=scene?.[1]??(forge?'idle':pose.value);
  const path=selected.poses[asset];
  const arena=document.querySelector('#arena');
  arena.textContent=boss.value==='narwhal'&&asset==='shadow'?'異界の配置を見る':'本編の開幕配置';
  arena.href='map-art.html?'+new URLSearchParams({node:boss.value==='narwhal'&&asset==='shadow'?selected.innerNode:selected.node,placements:'live'});
  document.querySelector('#scaleNote').textContent=scene?'戦闘中の960×540画面と同じ構図です。各場面の床と背景に、ボスを同じ位置・大きさで重ねています。':'同じ素材を同じ倍率で並べています。姿全体を収めるため、倍率は素材ごとに変わります。';
  const url=new URL(location.href);url.searchParams.delete('node');url.searchParams.set('boss',boss.value);url.searchParams.set('pose',pose.value);
  history.replaceState(history.state,'',url);
  for(const c of canvases)c.hidden=true;
  result.textContent='読み込み中';
  try{
   const [data,record]=await Promise.all([readPose(selected,path),forge&&read('evidence/primal-forge-access.json')]);
   const view=record?.views?.[forge];
   let shot,frame,sceneryRenderer;
   if(scene){
    const [replay,renderer]=await Promise.all([read('evidence/'+controller+'-access-views.json'),import('./scenery.js')]);
    shot=replay.views[sceneKey];
    frame={story:{node:shot.node,active:true},campaign:{zone:'story:'+shot.node},camera:shot.camera,platforms:shot.platforms,t:shot.tick/60};
    await renderer.loadScenery(frame);
    if(renderer.sceneryStatus(frame).state!=='ready')throw Error('会場の背景を読み込めませんでした');
    sceneryRenderer=renderer.scenery;
   }
   if(ticket!==revision)return;
   const image=new Image();image.src='assets/'+data.source;await image.decode();
   if(ticket!==revision)return;
   const height=shot?.height??Math.min(280,440*data.box[3]/data.box[2]),bounds=spriteBounds(asset==='idle'&&selected.idleAnchor!=null?{...data,anchorX:selected.idleAnchor}:data,height);
   repaint=()=>{
    for(const [i,c] of canvases.entries()){
     c.width=shot?960:480;c.height=shot?540:320;
     const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
     if(shot){
      sceneryRenderer(ctx,frame);paintRects(ctx,shot.behind);ctx.save();ctx.translate(shot.x,shot.y);
      if(shot.flip)ctx.scale(-1,1);
     }else ctx.translate((480-bounds.width)/2-bounds.x,300);
     paintSprite(ctx,data,image,bounds,[null,'h48c32','h32c16'][i],pixels.checked);
     if(shot){ctx.restore();paintRects(ctx,shot.front)}
     if(view){
      ctx.scale(height/view.height,height/view.height);
      for(const [x,y,w,h,color] of view.blades){ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}
     }
     c.hidden=false;
    }
   };
   repaint();
   const standard=rectangleCount(data.profiles.h48c32),light=rectangleCount(data.profiles.h32c16);
   const standardBytes=packedGeometrySize(data.profiles.h48c32),lightBytes=packedGeometrySize(data.profiles.h32c16);
   const reduction=(standard-light)/standard*100;
   result.textContent='ボス素材　32色 '+standard.toLocaleString()+'矩形 → 16色 '+light.toLocaleString()+'矩形'
    +'（'+Math.abs(reduction).toFixed(1)+'%'+(reduction<0?'増':'減')+'）'
    +' ／ 座標・色番号のデータ量 '+standardBytes.toLocaleString()+' B → '+lightBytes.toLocaleString()+' B';
   if(shot)result.textContent+=' ／ 本編の表示高 '+shot.height+' px';
   if(shot?.device)result.textContent+=' ／ 場内装置 '+shot.device+' × 2';
   if(view)result.textContent+=' ／ 両圧縮設定に剣 '+view.blades.length+'矩形を追加 ／ Lv'+record.level+'の戦闘記録';
  }catch(error){if(ticket===revision)result.textContent='素材を表示できませんでした。 '+error.message}
 }
 boss.onchange=()=>changeBoss();pose.onchange=draw;await changeBoss(params.get('pose'));
}catch(error){result.textContent='一覧を読み込めませんでした。 '+error.message}
