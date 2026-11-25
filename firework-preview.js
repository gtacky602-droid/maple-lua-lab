import {drawCombatRect,combatOpacity} from './sprite-images.js';
import {drawFireworkSparks} from './firework-sparks.js';
import {loadScenery,sceneryStatus,drawPlayScenery,sceneryDefinitions} from './scenery.js';
const el=id=>document.getElementById(id);
const beach={story:{active:true,node:'ina-firework-beach'},campaign:{zone:'story:ina-firework-beach'},storyScenery:'fireworkBeach',camera:0,platforms:[]};
const definition=sceneryDefinitions.fireworkBeach;
const query=new URLSearchParams(location.search);
const initialColor=query.get('color')||'sunset',initialShape=query.get('shape')||'fan';
let revision=0;
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;

async function render(){
 const current=++revision,beat=Number(el('beat').value);
 el('progress').textContent=beat+'%';
 try{
  const response=await fetch('api/firework-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({beat,color:el('color').value||initialColor,shape:el('shape').value||initialShape})});
  if(!response.ok)throw Error('花火の描画データを読み込めませんでした');
  const scene=await response.json();
  const tier=Number(el('tier').value);
  const file=tier===6144?definition.decodedPreview:tier?definition.decodedTiers:definition.file;
  await loadScenery(beach,file);
  if(sceneryStatus(beach,file).state!=='ready')throw Error('海辺の仮背景を読み込めませんでした');
  if(current!==revision)return;
  for(const [id,list,initial] of [['color',scene.colors,initialColor],['shape',scene.shapes,initialShape]]){
   const select=el(id);
   if(!select.options.length){
    select.replaceChildren(...list.map(row=>new Option(row.label,row.id)));
    select.value=initial;
   }
  }
  const pixels=[];
  for(const id of ['reference','packed']){
   const ctx=el(id).getContext('2d',{willReadFrequently:true});
   ctx.save();
   ctx.imageSmoothingEnabled=false;
   ctx.translate(-240,-15);
   drawPlayScenery(ctx,beach,tier);
   for(const draw of scene[id]){
    if(draw.kind==='firework_sparks')drawFireworkSparks(ctx,draw);
    else{ctx.globalAlpha=combatOpacity(draw);drawCombatRect(ctx,draw)}
   }
   ctx.restore();
   pixels.push(new Uint32Array(ctx.getImageData(0,0,480,300).data.buffer));
  }
  const changed=pixels[0].reduce((n,p,i)=>n+Number(p!==pixels[1][i]),0);
  const raw=bytes(scene.reference),packed=bytes(scene.packed);
  el('result').textContent='花火1コマのJSON（空白除く）　'+raw.toLocaleString('ja-JP')+' → '+packed.toLocaleString('ja-JP')+' B（'+((1-packed/raw)*100).toFixed(1)+'%削減）　画素差 '+changed+' ／ 144,000';
  el('result').dataset.sample=[el('color').value,el('shape').value,beat,tier].join('/');
  el('result').dataset.difference=changed;
 }catch(error){if(current===revision)el('result').textContent=error.message}
}
for(const id of ['color','shape','beat','tier'])el(id).addEventListener('input',render);
render();
