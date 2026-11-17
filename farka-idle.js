import {loadImageSet} from './sprite-images.js';

const $=id=>document.getElementById(id);

async function readJson(path){
 const response=await fetch(path);
 if(!response.ok)throw new Error(path);
 return response.json();
}

try{
 const pose=await readJson('content/farka-idle-layers.json');
 const files=[pose.sword.file,...Object.values(pose.facings).flatMap(facing=>[facing.body,facing.reference])];
 const sprites=Object.fromEntries(await Promise.all(files.map(async file=>[file,await readJson(`assets/${file}`)])));
 const images=await loadImageSet(Object.values(sprites).map(art=>art.source));
 const contexts=['reference','layered'].map(id=>{
  const canvas=$(id);[canvas.width,canvas.height]=pose.cell;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;return ctx;
 });

 function paint(ctx,art,mode,left,top,w,h){
  if(mode==='png'){
   ctx.drawImage(images[art.source],...art.box,left,top,w,h);
   return 0;
  }
  const profile=art.profiles[mode],sx=w/profile.width,sy=h/profile.height;
  for(const [x,y,width,height,color] of profile.runs){
   ctx.fillStyle=color;ctx.fillRect(left+x*sx,top+y*sy,width*sx+.05,height*sy+.05);
  }
  return profile.runs.length;
 }

 function standing(ctx,art,mode){
  const [x,y]=pose.root,h=pose.displayHeight,w=h*art.box[2]/art.box[3];
  return paint(ctx,art,mode,x-art.anchorX*w,y-h,w,h);
 }

 function sword(ctx,mode,hand,target,offset){
  const art=sprites[pose.sword.file],[left,top,w,h]=art.box;
  const {grip:[gx,gy],tip:[tx,ty],widthScale}=pose.sword;
  const sx=tx-gx,sy=(ty-gy)*widthScale;
  const dx=target[0]-hand[0],dy=target[1]-hand[1];
  const length=Math.hypot(dx,dy),scale=length/Math.hypot(sx,sy);
  const angle=Math.atan2(dy,dx)+offset*Math.PI/180;
  ctx.save();ctx.translate(...hand);ctx.rotate(angle-Math.atan2(sy,sx));
  const rectangles=paint(ctx,art,mode,(left-gx)*scale,(top-gy)*scale*widthScale,w*scale,h*scale*widthScale);
  ctx.restore();
  return {hand,tip:[hand[0]+Math.cos(angle)*length,hand[1]+Math.sin(angle)*length],rectangles};
 }

 function render(){
  const [reference,result]=contexts,side=$('facing').value,mode=$('profile').value;
  const facing=pose.facings[side],sockets=facing.sockets;
  for(const ctx of contexts){
   ctx.clearRect(0,0,...pose.cell);
   ctx.fillStyle='#77958a';ctx.fillRect(9,pose.root[1],pose.cell[0]-18,1);
  }
  standing(reference,sprites[facing.reference],'png');
  const weapons={};let rectangles=0;
  for(const [hand,tip] of [['back','weapon_tip_B'],['front','weapon_tip_A']]){
   if(!$(hand).checked)continue;
   weapons[hand]=sword(result,mode,sockets[`hand_${hand}`],sockets[tip],Number($(`${hand}Angle`).value));
   rectangles+=weapons[hand].rectangles;
  }
  const body=$('body').checked;
  if(body)rectangles+=standing(result,sprites[facing.body],mode);
  if($('markers').checked){
   for(const [color,points] of [['#e6e8c4',[pose.root]],['#68e6e6',[sockets.hand_front,sockets.hand_back]],['#fff0ad',Object.values(weapons).map(w=>w.tip)]]){
    result.fillStyle=color;
    for(const [x,y] of points)result.fillRect(x-1,y-1,3,3);
   }
  }
  const layers=Object.keys(weapons).length+Number(body);
  $('status').textContent=mode==='png'?`透過PNG ${layers}枚を表示`:`身体と武器の合計 ${rectangles.toLocaleString()}矩形`;
  window.farkaIdle={side,mode,root:pose.root,body,weapons,rectangles};
 }

 $('pose').addEventListener('input',render);
 $('pose').addEventListener('reset',()=>requestAnimationFrame(render));
 render();
}catch(error){
 $('status').textContent=`素材の読み込みに失敗しました。${error.message}`;
}
