import {json,sheet} from './sprite-comparison.js';
import {paintSprite,rectangleCount,packedGeometrySize} from './sprite-layers.js';
import {compareMasks} from './sprite-fidelity.js';
const el=id=>document.getElementById(id);
const group=el('group'),part=el('part'),status=el('error');
try{
 const [catalog,labels]=await Promise.all([json('content/quest-pose-files.json'),json('content/quest-art-labels.json')]);
 const params=new URLSearchParams(location.search);
 const nativePixels=el('nativePixels');
 nativePixels.checked=params.get('pixels')==='1';
 let revision=0,selected;
 function draw(){
  if(!selected)return;
  const {art,image}=selected;
  let reference;
  for(const canvas of document.querySelectorAll('.art canvas')){
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.clearRect(0,0,canvas.width,canvas.height);
   const [,,w,h]=art.box,k=Math.min((canvas.width-16)/w,(canvas.height-12)/h);
   const bounds={x:(canvas.width-w*k)/2,y:canvas.height-6-h*k,width:w*k,height:h*k};
   const profile=canvas.id==='source'?null:canvas.id;
   ctx.imageSmoothingEnabled=false;
   paintSprite(ctx,art,image,bounds,profile,nativePixels.checked);
   const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   if(!profile){reference=rgba;continue}
   const grid=art.profiles[profile],fidelity=compareMasks(reference,rgba);
   const note=canvas.closest('figure').querySelector('small');
   note.textContent=grid.width+' × '+grid.height+' px・'+rectangleCount(grid).toLocaleString()+'矩形'
    +' ／ 座標と色番号 '+packedGeometrySize(grid).toLocaleString()+' B'
    +' ／ 元絵と重なる面積 '+(fidelity.overlapPercent?.toFixed(1)??'—')+'%';
  }
 }
 nativePixels.onchange=()=>{
  const url=new URL(location.href);
  if(nativePixels.checked)url.searchParams.set('pixels','1');else url.searchParams.delete('pixels');
  history.replaceState(null,'',url);draw();
 };
 function options(select,names,value){
  select.replaceChildren(...Object.entries(names).map(([key,name])=>new Option(name,key)));
  if(Object.hasOwn(names,value))select.value=value;
 }
 async function show(){
  const current=++revision,entry=catalog[group.value];
  const file=typeof entry==='string'?entry:entry[part.value];
  const url=new URL(location.href);
  url.searchParams.set('group',group.value);url.searchParams.set('part',part.value);
  history.replaceState(null,'',url);
  el('title').textContent=labels[group.value].parts[part.value];
  selected=null;delete el('source').dataset.file;
  const canvases=document.querySelectorAll('canvas');
  for(const canvas of canvases){
   canvas.getContext('2d',{willReadFrequently:true}).clearRect(0,0,canvas.width,canvas.height);
   const note=canvas.closest('figure').querySelector('small');if(note)note.textContent='';
  }
  status.textContent='';
  try{
   const art=await json('assets/quest-packed/'+file);
   const image=await sheet(art.source);
   if(current!==revision)return;
   selected={art,image};draw();
   el('source').dataset.file=file;
  }catch{if(current===revision)status.textContent='素材を読み込めませんでした。'}
 }
 function selectGroup(value){options(part,labels[group.value].parts,value);show()}
 options(group,Object.fromEntries(Object.keys(catalog).map(k=>[k,labels[k].title])),params.get('group'));
 group.onchange=()=>selectGroup();part.onchange=show;selectGroup(params.get('part'));
}catch{status.textContent='依頼の素材一覧を読み込めませんでした。'}
