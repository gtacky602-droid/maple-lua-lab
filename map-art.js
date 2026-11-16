import {scenery,sceneryKey,sceneryDefinitions,sceneryStatus,backgroundReady} from './scenery.js';
import {liveNodeDraft,validatePlacementDraft,MAX_DRAFT_BYTES,MAX_NODE_PLACEMENTS,MAX_TOTAL_PLACEMENTS} from './placement-drafts.js';
const $=id=>document.getElementById(id),assets={},histories={};
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(path);return r.json()}
try{
 const [graph,initial,variants]=await Promise.all([json('content/story-graph.json'),json('content/enemy-placement-drafts.json'),json('assets/variants.json'),backgroundReady]);
 let drafts=structuredClone(initial),serial=0,importTicket=0;const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
 for(const [id,index] of [['hydro-slime',4],['pyro-slime',6]]){const profiles=Object.fromEntries(Object.entries(variants.variants).map(([k,v])=>[k,v.sprites[index]]));assets[id]={source:'atlas-transparent.png',box:profiles.legacy.box,profiles,h:40}}
 assets['ruin-guard']={...await json('assets/ruin-guard-idle-sprites.json'),h:144};
 assets['dendro-fungus']={...await json('assets/dendro-fungus-idle-sprites.json'),h:64};
 assets.hilichurl={...await json('assets/hilichurl-idle-sprites.json'),h:76};
 for(const element of ['hydro','pyro'])assets[`${element}-slime-reference`]={...await json(`assets/${element}-slime-idle-sprites.json`),h:40};
 for(const data of Object.values(assets)){data.image=new Image();data.image.src='assets/'+data.source;await data.image.decode()}
 drafts=validatePlacementDraft(drafts,graph,Object.keys(assets));
 for(const n of graph.nodes){const option=document.createElement('option');option.value=n.id;option.textContent=`${n.region}｜${n.name}`;$('node').append(option)}$('node').value='mond-road';
 function node(){return nodes.get($('node').value)}
 function placements(){return drafts.nodes[node().id]??=[]}
 function render(){
  const n=node(),camera=Number($('camera').value),profile=$('profile').value,items=placements(),frame={camera,platforms:n.platforms,campaign:{zone:n.hub?'town':`story:${n.id}`},story:{active:true,node:n.id},storyGraph:graph};
  const background=sceneryStatus(frame);
  const mapped=Object.values(sceneryDefinitions).some(d=>d.region===n.region),valid=items.every(e=>n.platforms.some(p=>p.y===e.y&&e.x>=p.x&&e.x<=p.x+p.w));
  $('cameraValue').value=camera;$('context').textContent=`${n.name} ／ 幅${n.width}px ／ ${n.hub?'拠点':n.peaceful?'非戦闘地点':'戦闘地点の仮構成'} ／ ${background.state!=='ready'?'背景画像を読み込めません：単色で表示（'+background.file+'）':mapped?(sceneryDefinitions[background.key].note||'地域用の仮背景'):'専用背景未制作：モンド画像で代用'}。敵${items.length}体（見た目確認用）。`;
  for(const mode of ['png','rect']){const ctx=$(mode).getContext('2d');ctx.clearRect(0,0,960,540);scenery(ctx,frame);ctx.imageSmoothingEnabled=false;
   for(const e of items){const a=assets[e.species],w=a.h*a.box[2]/a.box[3],anchor=a.anchorX??.5,x=e.x-camera;ctx.save();ctx.translate(x,e.y);if(e.flip)ctx.scale(-1,1);
    if(mode==='png')ctx.drawImage(a.image,...a.box,-w*anchor,-a.h,w,a.h);else{const p=a.profiles[profile];for(const r of p.runs){ctx.fillStyle=r[4];ctx.fillRect(-w*anchor+r[0]*w/p.width,-a.h+r[1]*a.h/p.height,r[2]*w/p.width+.05,r[3]*a.h/p.height+.05)}}ctx.restore();
    ctx.fillStyle='#ffffff';ctx.fillRect(x-3,e.y-1,6,2);
   }
  }
  $('placements').replaceChildren();for(const e of items){const label=document.createElement('span');label.textContent=`${e.species}：(${e.x}, ${e.y})`;$('placements').append(label)}
  const runs=items.reduce((sum,e)=>sum+assets[e.species].profiles[profile].runs.length,0);$('status').textContent=`配置${items.length}体 ／ 矩形${runs.toLocaleString()}個（配置した全体の合計・FPSではありません） ／ ${valid?'全個体が足場に接地':'足場外の配置あり'}`;$('undo').disabled=!(histories[n.id]?.length);
  window.mapArt={ready:true,node:n.id,nodeCount:nodes.size,camera,profile,count:items.length,placements:structuredClone(items),grounded:valid,background:sceneryKey(frame),backgroundFallback:!mapped,backgroundState:background.state,backgroundFile:background.file};
 }
 function remember(id){const history=histories[id]??=[];history.push(structuredClone(drafts.nodes[id]??[]));if(history.length>100)history.shift()}
 function select(){const n=node();$('camera').max=Math.max(0,n.width-960);$('camera').value=0;render()}
 $('node').onchange=select;for(const id of ['camera','profile'])$(id).oninput=render;
 for(const mode of ['png','rect'])$(mode).onclick=event=>{const box=$(mode).getBoundingClientRect(),n=node(),x=Math.round((event.clientX-box.left)*960/box.width+Number($('camera').value)),y=(event.clientY-box.top)*540/box.height;const supports=n.platforms.filter(p=>x>=p.x&&x<=p.x+p.w&&x<=n.width).sort((a,b)=>Math.abs(a.y-y)-Math.abs(b.y-y));if(!supports.length)return;
  if(placements().length>=MAX_NODE_PLACEMENTS||Object.values(drafts.nodes).reduce((s,x)=>s+x.length,0)>=MAX_TOTAL_PLACEMENTS){$('fileStatus').textContent='配置数の上限です。別の案として保存してから編集してください。';return}
  let id;do{id=`added-${++serial}`}while(placements().some(e=>e.id===id));const item={id,species:$('species').value,x,y:supports[0].y,flip:false};remember(n.id);placements().push(item);render()};
 $('undo').onclick=()=>{const previous=histories[node().id]?.pop();if(previous)drafts.nodes[node().id]=previous;render()};
 $('reset').onclick=()=>{remember(node().id);drafts.nodes[node().id]=structuredClone(initial.nodes[node().id]||[]);render()};
 $('loadLive').onclick=async()=>{const id=node().id;$('loadLive').disabled=true;try{const source=await json('content/enemy-spawns.json');if(node().id!==id)throw Error('地点が切り替わったため読み込みを中止しました。');const items=liveNodeDraft(source,graph,id,Object.keys(assets));if(Object.entries(drafts.nodes).reduce((sum,[key,list])=>sum+(key===id?0:list.length),items.length)>MAX_TOTAL_PLACEMENTS)throw Error('全地点の配置数の上限を超えます。');remember(id);drafts.nodes[id]=items;render();$('fileStatus').textContent='この地点の本編配置を編集案にコピーしました。取り消すと直前の案に戻ります。';}catch(e){$('fileStatus').textContent='読み込み中止：'+e.message+' 編集中の案は保持しています。';}finally{$('loadLive').disabled=false}};
 $('export').onclick=()=>{const blob=new Blob([JSON.stringify(drafts,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='enemy-placement-drafts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 $('import').onchange=async()=>{
  const file=$('import').files[0],ticket=++importTicket;if(!file)return;
  try{
   if(file.size>MAX_DRAFT_BYTES)throw Error('512KB以下の配置案を選んでください。');
   const text=await file.text();if(ticket!==importTicket)return;
   let parsed;try{parsed=JSON.parse(text)}catch{throw Error('JSONを読み取れませんでした。')}
   const next=validatePlacementDraft(parsed,graph,Object.keys(assets));drafts=next;for(const id of Object.keys(histories))delete histories[id];
   render();$('fileStatus').textContent=`${file.name}を読み込みました。全地点の編集案を置き換えました。`;
  }catch(e){if(ticket===importTicket)$('fileStatus').textContent=`読み込み中止：${e.message} 編集中の案は保持しています。`}
  finally{if(ticket===importTicket)$('import').value=''}
 };
 select();
}catch(e){$('status').textContent='読み込みに失敗しました: '+e.message;throw e}
