import {paintSprite,rectangleCount,spriteBounds} from './sprite-layers.js';

const boss=document.querySelector('#boss'),pose=document.querySelector('#pose');
const result=document.querySelector('#result'),canvases=[...document.querySelectorAll('canvas')];
const names={
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
 const [{weeklyBosses},groups]=await Promise.all([read('content/weekly-boss-spawns.json'),read('content/weekly-pose-files.json')]);
 const entries=new Map(weeklyBosses.map(b=>[b.controller,{...b,poses:groups[aliases[b.controller]??b.controller+'WeeklyArt']}]));
 for(const [controller,b] of entries)boss.add(new Option(b.name,controller));
 const params=new URL(location.href).searchParams;
 boss.value=entries.has(params.get('boss'))?params.get('boss'):'andrius';
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
  const url=new URL(location.href);url.searchParams.set('boss',boss.value);url.searchParams.set('pose',pose.value);
  history.replaceState(history.state,'',url);
  for(const c of canvases)c.hidden=true;
  result.textContent='読み込み中';
  try{
   const [data,record]=await Promise.all([read('assets/weekly-packed/'+path),forge&&read('evidence/primal-forge-access.json')]);
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
   const height=shot?.height??Math.min(280,440*data.box[3]/data.box[2]),bounds=spriteBounds(data,height);
   for(const [i,c] of canvases.entries()){
    c.width=shot?960:480;c.height=shot?540:320;
    const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
    if(shot){
     sceneryRenderer(ctx,frame);paintRects(ctx,shot.behind);ctx.save();ctx.translate(shot.x,shot.y);
     if(shot.flip)ctx.scale(-1,1);
    }else ctx.translate((480-bounds.width)/2-bounds.x,300);
    paintSprite(ctx,data,image,bounds,[null,'h48c32','h32c16'][i]);
    if(shot){ctx.restore();paintRects(ctx,shot.front)}
    if(view){
     ctx.scale(height/view.height,height/view.height);
     for(const [x,y,w,h,color] of view.blades){ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}
    }
    c.hidden=false;
   }
   const standard=rectangleCount(data.profiles.h48c32),light=rectangleCount(data.profiles.h32c16);
   result.textContent='32色 '+standard.toLocaleString()+'矩形 ／ 16色 '+light.toLocaleString()+'矩形';
   if(shot)result.textContent+=' ／ 本編の表示高 '+shot.height+' px';
   if(view)result.textContent+=' ／ 両圧縮設定に剣 '+view.blades.length+'矩形を追加 ／ Lv'+record.level+'の戦闘記録';
  }catch(error){if(ticket===revision)result.textContent='素材を表示できませんでした。 '+error.message}
 }
 boss.onchange=()=>changeBoss();pose.onchange=draw;await changeBoss(params.get('pose'));
}catch(error){result.textContent='一覧を読み込めませんでした。 '+error.message}
