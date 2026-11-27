import {paintSprite,spriteBounds} from './sprite-layers.js';

const $=id=>document.getElementById(id);
const height=88;
const backgrounds={
 mond:'mondstadt-background.png',
 liyue:'liyue-background-v1.png',
 inazuma:'inazuma-background-v1.png',
 fontaine:'fontaine-background-v1.png',
};
// Source-image rows chosen visually. The crown excludes the standing hair tuft.
const landmarks={
 'traveler-idle-sprites-v3.json':{crown:132,chin:529},
 'traveler-idle-left-sprites-v1.json':{crown:118,chin:496},
 'traveler-proportion-b-front-sprites-v1.json':{crown:66,chin:282},
 'traveler-proportion-b-right-sprites-v1.json':{crown:68,chin:282},
 'traveler-proportion-c-front-sprites-v1.json':{crown:83,chin:341},
 'traveler-proportion-c-right-sprites-v1.json':{crown:82,chin:339},
};
const images=new Map();
async function loadImage(file){
 if(!images.has(file)){
  const image=new Image();
  image.src='assets/'+file;
  images.set(file,image.decode().then(()=>image));
 }
 return images.get(file);
}
async function loadSprite(file) {
 const response=await fetch('assets/'+file);
 if(!response.ok)throw Error(file);
 const art=await response.json();
 return {art,image:await loadImage(art.source),landmark:landmarks[file]};
}
function card(item){
 const article=document.createElement('article');
 article.dataset.variant=item.id;
 article.innerHTML='<h2></h2><p class="measurement"></p><div class="pair"><figure><figcaption>元PNG</figcaption><div class="preview"><canvas></canvas></div></figure><figure><figcaption>矩形版</figcaption><div class="preview"><canvas></canvas></div></figure></div><p class="stats"></p>';
 article.querySelector('h2').textContent=item.name;
 $('cards').append(article);
 return article;
}
function draw(canvas,sprite,profile,zoom,background,width,showGuides){
 const floor=height*zoom+24,panelHeight=floor+14;
 canvas.width=width;
 canvas.height=panelHeight;
 canvas.dataset.floor=floor;
 const ctx=canvas.getContext('2d');
 if(background){
  const sourceH=background.naturalHeight*.68,sourceW=sourceH*width/panelHeight;
  ctx.drawImage(background,(background.naturalWidth-sourceW)/2,(background.naturalHeight-sourceH)*.76,sourceW,sourceH,0,0,width,panelHeight);
 }else{
  ctx.fillStyle='#294c55';
  ctx.fillRect(0,0,width,panelHeight);
 }
 ctx.fillStyle='#a9bdb5';
 ctx.fillRect(0,floor,width,1);
 ctx.imageSmoothingEnabled=false;
 ctx.translate(width/2,floor);
 const box=spriteBounds(sprite.art,height*zoom);
 paintSprite(ctx,sprite.art,sprite.image,box,profile);
 if(showGuides&&sprite.landmark){
  for(const [row,color] of [[sprite.landmark.crown,'#f4cf7b'],[sprite.landmark.chin,'#9ae9e3']]){
   const y=box.y+(row-sprite.art.box[1])*box.height/sprite.art.box[3];
   ctx.fillStyle=color;
   ctx.fillRect(5-width/2,Math.round(y),width-10,1);
  }
 }
}
try{
 const catalogResponse=await fetch('content/character-art-gallery.json');
 if(!catalogResponse.ok)throw Error('character art gallery');
 const catalog=await catalogResponse.json();
 const current=catalog.items.find(item=>item.id==='traveler');
 const currentFiles={right:current.file};
 if(current.leftFile)currentFiles.left=current.leftFile;
 const files=[
  {id:'current',name:'現行',files:currentFiles},
  {id:'b',name:'B案'},
  {id:'c',name:'C案'},
 ];
 const cards=await Promise.all(files.map(async item=>{
  const poses=item.files??Object.fromEntries(['front','right','back'].map(direction=>
   [direction,`traveler-proportion-${item.id}-${direction}-sprites-v1.json`]));
  const art=await Promise.all(Object.entries(poses).map(async([view,file])=>[view,await loadSprite(file)]));
  return {...item,poses:Object.fromEntries(art)};
 }));
 for(const item of cards)item.element=card(item);
 let revision=0;
 async function render(){
  const ticket=++revision;
  const direction=$('direction').value,profile=$('profile').value;
  const zoom=Number($('zoom').value),backdrop=$('backdrop').value;
  const showGuides=$('headGuides').checked;
  try{
   const background=backdrop==='plain'?null:await loadImage(backgrounds[backdrop]);
   if(ticket!==revision)return;
   const widths=cards.flatMap(item=>{
    const pose=item.poses[direction];
    if(!pose)return [];
    const box=spriteBounds(pose.art,height*zoom);
    return [2*Math.max(-box.x,box.x+box.width)+20];
   });
   const width=Math.max(152,Math.ceil(Math.max(...widths)));
   $('cards').style.setProperty('--card-width',Math.max(362,2*width+44)+'px');
   $('cards').dataset.zoom=zoom;
   for(const item of cards){
    const sprite=item.poses[direction];
    const measurement=item.element.querySelector('.measurement'),panels=item.element.querySelector('.pair');
    const stats=item.element.querySelector('.stats');
    panels.hidden=!sprite;
    if(!sprite){measurement.textContent='';stats.textContent='この向きの待機絵はありません。';continue}
    if(sprite.landmark){
     const {crown,chin}=sprite.landmark;
     const heads=(sprite.art.box[1]+sprite.art.box[3]-crown)/(chin-crown);
     measurement.textContent=`約${heads.toFixed(1)}頭身`;
    }else measurement.textContent=direction==='back'?'背面は輪郭を比較':'頭頂とあごの計測点は未登録';
    const [png,rect]=panels.querySelectorAll('canvas');
    draw(png,sprite,null,zoom,background,width,showGuides);
    draw(rect,sprite,profile,zoom,background,width,showGuides);
    const p=sprite.art.profiles[profile],standard=sprite.art.profiles.legacy.runs.length;
    stats.textContent=`${p.width}×${p.height}px・${p.colors}色枠 ／ ${p.runs.length.toLocaleString('ja')}矩形（標準比 ${(100*(1-p.runs.length/standard)).toFixed(1)}%減）`;
   }
   $('status').textContent='B案とC案は待機姿勢の比較候補です。';
   $('cards').dataset.ready='true';
   $('cards').dataset.backdrop=backdrop;
  }catch(e){
   if(ticket===revision)$('status').textContent='仮背景を読み込めませんでした。別の背景を選んでください。';
  }
 }
 for(const id of ['direction','profile','zoom','backdrop','headGuides'])$(id).addEventListener('change',render);
 $('controls').disabled=false;
 await render();
}catch(e){
 $('status').textContent='素材を読み込めませんでした。ページを再読み込みしてください。';
 throw e;
}
