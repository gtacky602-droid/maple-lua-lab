import {json,sheet} from './sprite-comparison.js';
import {paintSprite,rectangleCount} from './sprite-layers.js';
const el=id=>document.getElementById(id);
const group=el('group'),part=el('part'),status=el('error');
try{
 const [catalog,labels]=await Promise.all([json('content/quest-pose-files.json'),json('content/quest-art-labels.json')]);
 const params=new URLSearchParams(location.search);
 let revision=0;
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
  delete el('source').dataset.file;
  const canvases=document.querySelectorAll('canvas');
  for(const canvas of canvases){
   canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
   const note=canvas.closest('figure').querySelector('small');if(note)note.textContent='';
  }
  status.textContent='';
  try{
   const art=await json('assets/quest-packed/'+file);
   const image=await sheet(art.source);
   if(current!==revision)return;
   for(const canvas of canvases){
    const ctx=canvas.getContext('2d'),[,,w,h]=art.box;
    const k=Math.min((canvas.width-16)/w,(canvas.height-12)/h);
    const bounds={x:(canvas.width-w*k)/2,y:canvas.height-6-h*k,width:w*k,height:h*k};
    const profile=canvas.id==='source'?null:canvas.id;
    ctx.imageSmoothingEnabled=false;paintSprite(ctx,art,image,bounds,profile);
    if(profile){
     const grid=art.profiles[profile];
     canvas.closest('figure').querySelector('small').textContent=grid.width+' × '+grid.height+' px・'+rectangleCount(grid)+'矩形';
    }
   }
   el('source').dataset.file=file;
  }catch{if(current===revision)status.textContent='素材を読み込めませんでした。'}
 }
 function selectGroup(value){options(part,labels[group.value].parts,value);show()}
 options(group,Object.fromEntries(Object.keys(catalog).map(k=>[k,labels[k].title])),params.get('group'));
 group.onchange=()=>selectGroup();part.onchange=show;selectGroup(params.get('part'));
}catch{status.textContent='依頼の素材一覧を読み込めませんでした。'}
