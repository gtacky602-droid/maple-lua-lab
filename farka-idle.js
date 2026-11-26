import {loadImageSet} from './sprite-images.js';

const $=id=>document.getElementById(id);

async function readJson(path){
 const response=await fetch(path);
 if(!response.ok)throw new Error(path);
 return response.json();
}

try{
 const pose=await readJson('content/farka-idle-layers.json');
 const files=[pose.sword.file,...Object.values(pose.facings).flatMap(facing=>[facing.body,facing.reference]),
  ...Object.values(pose.guide.facings).map(facing=>facing.body)];
 const sprites=Object.fromEntries(await Promise.all(files.map(async file=>[file,await readJson(`assets/${file}`)])));
 const images=await loadImageSet(Object.values(sprites).map(art=>art.source));
 const contexts=['reference','layered'].map(id=>{
  const canvas=$(id);[canvas.width,canvas.height]=pose.cell;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;return ctx;
 });

 function paint(ctx,command,mode){
  const {file,left,top,width:w,height:h,origin,angle}=command,art=sprites[file];
  ctx.save();
  if(origin){ctx.translate(...origin);ctx.rotate(angle)}
  if(mode==='png'){
   ctx.drawImage(images[art.source],...art.box,left,top,w,h);
  }else{
   const profile=art.profiles[mode],sx=w/profile.width,sy=h/profile.height;
   for(const [x,y,width,height,color] of profile.runs){
    ctx.fillStyle=color;ctx.fillRect(left+x*sx,top+y*sy,width*sx+.05,height*sy+.05);
   }
  }
  ctx.restore();
 }

 function paintLayers(ctx,layer,mode,root){
  for(const command of layer.draws)paint(ctx,command,mode);
  if(!$('markers').checked)return;
  for(const [color,points] of [['#e6e8c4',[root]],['#68e6e6',layer.hands],['#fff0ad',Object.values(layer.weapons).map(w=>w.tip)]]){
   ctx.fillStyle=color;
   for(const [x,y] of points)ctx.fillRect(x-1,y-1,3,3);
  }
 }

 function show(frame){
  const [reference,result]=contexts,{root,mode,baseline}=frame;
  document.querySelector('.scenes').dataset.variant=frame.variant;
  for(const ctx of contexts){
   ctx.clearRect(0,0,...pose.cell);
   ctx.fillStyle='#77958a';ctx.fillRect(9,root[1],pose.cell[0]-18,1);
  }
  paintLayers(result,frame,mode,root);
  const stats=layer=>mode==='png'?`透過PNG ${layer.draws.length}枚`:`${layer.rectangles.toLocaleString()}矩形`;
  if(baseline){
   paintLayers(reference,baseline,mode,root);
   $('referenceTitle').textContent=`現行の待機絵 ${baseline.height}px`;
   $('layeredTitle').textContent=`低頭身の試作 ${frame.height}px`;
   $('status').textContent=`現行 ${stats(baseline)} ／ 試作 ${stats(frame)}`;
  }else{
   paint(reference,frame.reference,'png');
   $('referenceTitle').textContent='元の待機絵';
   $('layeredTitle').textContent='身体と二刀を重ねた絵';
   $('status').textContent=stats(frame);
  }
  window.farkaIdle=frame;
 }

 let request;
 async function render(){
  request?.abort();
  const current=request=new AbortController();
  const options={side:$('facing').value,mode:$('profile').value,variant:$('variant').value,body:$('body').checked,
   front:$('front').checked,back:$('back').checked,
   frontAngle:Number($('frontAngle').value),backAngle:Number($('backAngle').value)};
  try{
   const response=await fetch('/api/farka-idle',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(options),signal:current.signal});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const frame=await response.json();
   if(request===current)show(frame);
  }catch(error){
   if(request===current)$('status').textContent=`Luaの描画指示を取得できませんでした。${error.message}`;
  }
 }

 $('pose').addEventListener('input',event=>{
  if(event.target===$('markers')&&window.farkaIdle)show(window.farkaIdle);
  else render();
 });
 $('pose').addEventListener('reset',()=>requestAnimationFrame(render));
 const requested=new URLSearchParams(location.search);
 for(const id of ['variant','profile','facing']){
  const value=requested.get(id);
  if([...$(id).options].some(option=>option.value===value))$(id).value=value;
 }
 render();
}catch(error){
 $('status').textContent=`素材の読み込みに失敗しました。${error.message}`;
}
