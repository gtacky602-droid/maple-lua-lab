import {json,sheet} from './sprite-comparison.js';
import {spriteBounds,paintSprite,rectangleCount} from './sprite-layers.js';
import {compareMasks} from './sprite-fidelity.js';
const el=id=>document.getElementById(id);
const side=el('side'),play=el('play'),step=el('step');
try{
 const [files,jumps]=await Promise.all([json('content/motion-pose-files.json'),json('content/traveler-jump-preview.json')]);
 const motion=el('motion');
 const samples=()=>jumps[side.value][motion.value];
 const cache=new Map();
 const runLayers=new Map();
 const runCache=el('runCache');
 runCache.onchange=()=>{
  runLayers.clear();
  if(frames.length)draw();
 };
 const canvases=[...document.querySelectorAll('.art canvas')];
 for(const canvas of canvases){
  const wrap=document.createElement('div');wrap.className='motion-frame';canvas.replaceWith(wrap);wrap.append(canvas);
 }
 let phase=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,frames=[],version=0,timer=0;
 function draw(){
  const sample=samples()?.[phase];
  el('jumpNote').hidden=!sample;
  el('runCacheControl').hidden=Boolean(sample);
  const pose=sample?sample.pose-1:phase;
  el('footRevision').hidden=motion.value!=='run'||side.value!=='left'||pose!==2;
  const {art,image}=frames[pose],height=pose===0?88:88*art.box[3]/100;
  const scale=sample?0.62:1.6;
  const bounds=spriteBounds(art,height*scale,-(sample?.lift??0)*scale);
  let original,lightOverlap;
  const quality=el('quality'),region=el('bodyRegion').value;
  if(quality.open)quality.querySelector('tbody').replaceChildren();
  for(const canvas of canvases){
   const ctx=canvas.getContext('2d');
   ctx.clearRect(0,0,canvas.width,canvas.height);
   ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(canvas.width/2,canvas.height-12);
   const profile=canvas.id==='source'?null:canvas.id;
   let cost='';
   if(profile && !sample && runCache.checked){
    const key=files[side.value][pose+1]+'/'+profile;
    let layer=runLayers.get(key);
    if(!layer){
     layer=document.createElement('canvas');
     layer.width=canvas.width;layer.height=canvas.height;
     const layerCtx=layer.getContext('2d');
     layerCtx.translate(layer.width/2,layer.height-12);
     paintSprite(layerCtx,art,image,bounds,profile);
     runLayers.set(key,layer);
     cost='初回生成＋画像1枚';
    }else cost='再利用・画像1枚';
    ctx.drawImage(layer,-canvas.width/2,12-canvas.height);
   }else{
    paintSprite(ctx,art,image,bounds,profile);
    if(profile)cost='矩形を直接描画';
   }
   const wrap=canvas.parentElement;
   wrap.toggleAttribute('data-band',quality.open&&region!=='all');
   if(quality.open){
    const bottom=canvas.height-12+bounds.y+bounds.height,top=bottom-bounds.height;
    const start=Math.max(0,Math.floor(region==='lower'?bottom-bounds.height/3:top));
    const end=Math.min(canvas.height,Math.ceil(region==='upper'?top+bounds.height/3:bottom));
    if(region!=='all'){
     wrap.style.setProperty('--x',(canvas.width/2+bounds.x)/canvas.width*100+'%');
     wrap.style.setProperty('--y',start/canvas.height*100+'%');
     wrap.style.setProperty('--w',bounds.width/canvas.width*100+'%');
     wrap.style.setProperty('--h',(end-start)/canvas.height*100+'%');
    }
    const pixels=ctx.getImageData(0,start,canvas.width,end-start).data;
    if(!profile)original=pixels;
    else{
     const score=compareMasks(original,pixels),row=quality.querySelector('tbody').insertRow();
     if(profile==='h32c16'&&score.union)lightOverlap=score.overlapPercent;
     for(const value of [profile==='h48c32'?'32色':'16色',score.union?score.overlapPercent.toFixed(1)+'%':'—',score.meanRgbError?.toFixed(2)??'—'])row.insertCell().textContent=value;
    }
   }
   ctx.fillStyle='#adc7bb';ctx.fillRect(-56,0,112,1);
   if(sample)for(let x=-56-(sample.distance*scale%12);x<56;x+=12){if(x>=-56)ctx.fillRect(x,1,1,3)}
   ctx.restore();
   if(profile){const g=art.profiles[profile];canvas.closest('figure').querySelector('small').textContent=g.width+' × '+g.height+' px・'+rectangleCount(g)+'矩形・'+cost}
  }
  el('phase').textContent=(phase+1)+' / '+(samples()?.length??frames.length)+' コマ'+(sample?'・'+(sample.ground?'接地':'地面から '+sample.lift.toFixed(1)+' px'):'');
  el('phase').dataset.file=files[side.value][pose+1];
  if(quality.open){
   const url=new URL(location.href);
   for(const [key,value] of Object.entries({side:side.value,motion:motion.value,frame:phase+1,region}))url.searchParams.set(key,value);
   el('frameLink').href=url.href;
  }
  return lightOverlap;
 }
 function advance(){phase=(phase+1)%(samples()?.length??frames.length);draw()}
 function schedule(){
  clearInterval(timer);play.textContent=playing?'一時停止':'再生';
  if(playing&&frames.length)timer=setInterval(advance,samples()?50:160);
 }
 async function select(initialFrame=0){
  const value=side.value,token=++version;frames=[];phase=0;schedule();
  play.disabled=step.disabled=el('worstFrame').disabled=true;el('error').textContent='';el('frameLink').removeAttribute('href');
  try{
   if(!cache.has(value))cache.set(value,Promise.all(Object.values(files[value]).map(async file=>{
    const art=await json('assets/motion-packed/'+file);return {art,image:await sheet(art.source)};
   })).catch(e=>{cache.delete(value);throw e}));
   const selected=await cache.get(value);
   if(token!==version)return;
   frames=selected;
   if(Number.isInteger(initialFrame)&&initialFrame>=0&&initialFrame<(samples()?.length??frames.length))phase=initialFrame;
   draw();play.disabled=step.disabled=el('worstFrame').disabled=false;schedule();
  }catch{if(token===version)el('error').textContent='走行素材を読み込めませんでした。'}
 }
 play.onclick=()=>{playing=!playing;schedule()};
 step.onclick=()=>{playing=false;schedule();advance()};
 el('quality').ontoggle=()=>{
  if(el('quality').open){playing=false;schedule()}
  if(frames.length)draw();
 };
 el('bodyRegion').onchange=()=>{if(frames.length)draw()};
 el('worstFrame').onclick=()=>{
  playing=false;schedule();
  let lowest=Infinity,first=phase;
  const count=samples()?.length??frames.length;
  for(phase=0;phase<count;phase++){
   const overlap=draw();
   if(overlap<lowest){lowest=overlap;first=phase}
  }
  phase=first;draw();
 };
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
 const params=new URL(location.href).searchParams;
 for(const [key,control] of [['side',side],['motion',motion],['region',el('bodyRegion')]]){
  if([...control.options].some(o=>o.value===params.get(key)))control.value=params.get(key);
 }
 if(params.has('frame')){playing=false;el('quality').open=true}
 side.onchange=motion.onchange=()=>select();await select(Number(params.get('frame'))-1);
}catch{el('error').textContent='走行素材の一覧を読み込めませんでした。'}
