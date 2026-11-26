import {json,sheet} from './sprite-comparison.js';
import {spriteBounds,paintSprite,rectangleCount} from './sprite-layers.js';
const el=id=>document.getElementById(id);
const side=el('side'),play=el('play'),step=el('step');
try{
 const files=await json('content/motion-pose-files.json');
 const cache=new Map();
 let phase=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,frames=[],version=0,timer=0;
 function draw(){
  const {art,image}=frames[phase],height=phase===0?88:88*art.box[3]/100;
  const bounds=spriteBounds(art,height*1.6);
  for(const canvas of document.querySelectorAll('canvas')){
   const ctx=canvas.getContext('2d');
   ctx.clearRect(0,0,canvas.width,canvas.height);
   ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(canvas.width/2,canvas.height-12);
   const profile=canvas.id==='source'?null:canvas.id;
   paintSprite(ctx,art,image,bounds,profile);
   ctx.fillStyle='#adc7bb';ctx.fillRect(-56,0,112,1);ctx.restore();
   if(profile){const g=art.profiles[profile];canvas.closest('figure').querySelector('small').textContent=g.width+' × '+g.height+' px・'+rectangleCount(g)+'矩形'}
  }
  el('phase').textContent=(phase+1)+' / '+frames.length+' コマ';
  el('phase').dataset.file=files[side.value][phase+1];
 }
 function advance(){phase=(phase+1)%frames.length;draw()}
 function schedule(){
  clearInterval(timer);play.textContent=playing?'一時停止':'再生';
  if(playing&&frames.length)timer=setInterval(advance,160);
 }
 async function select(){
  const value=side.value,token=++version;frames=[];phase=0;schedule();
  play.disabled=step.disabled=true;el('error').textContent='';
  try{
   if(!cache.has(value))cache.set(value,Promise.all(Object.values(files[value]).map(async file=>{
    const art=await json('assets/motion-packed/'+file);return {art,image:await sheet(art.source)};
   })).catch(e=>{cache.delete(value);throw e}));
   const selected=await cache.get(value);
   if(token!==version)return;
   frames=selected;draw();play.disabled=step.disabled=false;schedule();
  }catch{if(token===version)el('error').textContent='走行素材を読み込めませんでした。'}
 }
 play.onclick=()=>{playing=!playing;schedule()};
 step.onclick=()=>{playing=false;schedule();advance()};
 const measure=el('measure');
 measure.addEventListener('toggle',async()=>{
  if(!measure.open||measure.dataset.loaded)return;
  measure.dataset.loaded='pending';
  try{
   const result=await json('evidence/motion-load.json');
   const rows={runtime_init:'起動',idle:'待機',run_right:'右へ走る',run_left:'左へ走る',quest_return_box:'返却箱の依頼',oceanid_opening:'純水精霊の開幕',total:'合計'};
   const body=measure.querySelector('tbody');
   for(const [key,name] of Object.entries(rows)){
    const row=body.insertRow();row.insertCell().textContent=name;
    for(const version of ['before','after']){
     const entry=result[version][key];row.insertCell().textContent=(key==='total'?entry:entry.bytes).toLocaleString('ja-JP');
    }
   }
   measure.dataset.loaded='ready';
  }catch{delete measure.dataset.loaded;el('error').textContent='計測結果を読み込めませんでした。'}
 });
 const wire=el('wire'),scene=el('wireScene');
 wire.addEventListener('toggle',async()=>{
  if(!wire.open||wire.dataset.loaded)return;
  wire.dataset.loaded='pending';
  try{
   const samples=await json('evidence/frame-wire-sizes.json');
   const names={sprite:'元絵PNG',legacy:'標準矩形',h48c32:'32色',h32c16:'16色'};
   function showSizes(){
    const body=wire.querySelector('tbody');body.replaceChildren();
    for(const sample of samples.filter(row=>row.scene===scene.value)){
     const row=body.insertRow();
     for(const value of [names[sample.profile],sample.legacyBytes.toLocaleString('ja-JP'),sample.wireBytes.toLocaleString('ja-JP'),
                         (100*(1-sample.wireBytes/sample.legacyBytes)).toFixed(1)+'%'])row.insertCell().textContent=value;
    }
   }
   scene.onchange=showSizes;showSizes();wire.dataset.loaded='ready';
  }catch{delete wire.dataset.loaded;el('error').textContent='転送量を読み込めませんでした。'}
 });
 side.onchange=select;await select();
}catch{el('error').textContent='走行素材の一覧を読み込めませんでした。'}
