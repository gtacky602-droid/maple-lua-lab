export function initTheaterProgramme(images,dispatch){
 const panel=document.getElementById('theaterProgramme');
 panel.innerHTML=` <h2 id="programmeHeading">大劇場の公演記念展示</h2>
 <label>元絵と見比べる <select id="programmeProfile"><option value="h32c16">16色</option><option value="h48c32">32色</option><option value="legacy">標準</option></select></label>
 <div id="programmeExhibits"></div>
 <p id="programmeMeasurement" hidden></p>`;
 const list=document.getElementById('programmeExhibits');
 const select=document.getElementById('programmeProfile'),assets=new Map();
 const measurement=document.getElementById('programmeMeasurement');
 let current,last,report;
 function asset(id){
  if(!assets.has(id)){
   const request=fetch('assets/'+id+'-sprites-v1.json').then(response=>{
    if(!response.ok)throw new Error('展示画像の読み込みに失敗');
    return response.json();
   }).catch(error=>{assets.delete(id);throw error});
   assets.set(id,request);
  }
  return assets.get(id);
 }
 async function paint(canvas,item,profile,status){
  try{
   const data=await asset(item.asset);
   if(!images[data.source]){
    images[data.source]=new Image();
    images[data.source].src='assets/'+data.source;
   }
   const image=images[data.source];
   await image.decode();
   const ctx=canvas.getContext('2d'),rect=data.profiles[profile];
   ctx.imageSmoothingEnabled=false;
   const [,,w,h]=data.box,scale=Math.min(91/w,57/h),width=w*scale,height=h*scale;
   ctx.fillStyle='#423b45';ctx.fillRect(0,0,200,74);
   ctx.drawImage(image,...data.box,50-width/2,61-height,width,height);
   for(const [x,y,rw,rh,color] of rect.runs){
    ctx.fillStyle=color;
    ctx.fillRect(150-width/2+x*width/rect.width,61-height+y*height/rect.height,
                 rw*width/rect.width+.05,rh*height/rect.height+.05);
   }
   status.textContent='左は元絵 ／ 右は'+rect.colors+'色・'+rect.runs.length+'矩形';
  }catch{
   status.textContent='比較画像を読み込めませんでした';
  }
 }
 async function showMeasurement(count,profile){
  measurement.hidden=true;
  if(![3,5].includes(count))return;
  try{
   report??=fetch('evidence/fontaine-theater-packing.json').then(r=>{
    if(!r.ok)throw new Error();
    return r.json();
   }).catch(error=>{report=undefined;throw error});
   const data=await report;
   if(current?.entries?.length!==count||select.value!==profile)return;
   const sample=data[count][profile],percent=(100*(1-sample.after/sample.before)).toFixed(1);
   measurement.textContent='展示'+count+'点を収めた固定画面の計測　描画用JSON '+sample.before.toLocaleString('ja-JP')+
    ' → '+sample.after.toLocaleString('ja-JP')+' バイト（'+percent+'%減）。矩形をまとめる前後で、展開した描画命令は一致。';
   measurement.hidden=false;
  }catch{measurement.hidden=true}
 }
 function show(){
  list.replaceChildren();
  const entries=current?.entries;
  showMeasurement(entries?.length,select.value);
  if(!Array.isArray(entries)||!entries.length){
   list.textContent='公演は幕を開けた。劇場の仲間から依頼を引き受けると、ここに記念品が並ぶ。';
   return;
  }
  for(const item of entries){
   const card=document.createElement('article'),author=document.createElement('small');
   const title=document.createElement('h3'),description=document.createElement('p');
   const canvas=document.createElement('canvas'),status=document.createElement('small');
   const button=document.createElement('button');
   author.textContent=item.author;title.textContent=item.title;description.textContent=item.detail;
   canvas.width=200;canvas.height=74;canvas.setAttribute('aria-label',item.title+'の元絵と矩形版');
   button.type='button';button.textContent=item.place+'を地図で見る';
   button.onclick=()=>dispatch('world_map_focus:'+item.node);
   card.append(author,title,canvas,status,description);
   if(item.node==='fon-photo-terrace'){
    const print=document.createElement('button');
    print.type='button';print.textContent='掲示した写真を開く';
    print.onclick=()=>dispatch('story_photo_print');
    card.append(print);
   }
   card.append(button);list.append(card);
   paint(canvas,item,select.value,status);
  }
 }
 select.onchange=show;
 return function update(view){
  panel.hidden=!view;
  const key=view&&JSON.stringify(view.entries);
  if(key===last)return;
  current=view;last=key;
  if(view)show();
 };
}
