export function initHarborBook(images,dispatch){
 const panel=document.getElementById('harborBook'),select=document.getElementById('harborPage');
 const canvas=document.getElementById('harborDrawing'),ctx=canvas.getContext('2d');
 const headline=document.getElementById('harborHeadline'),description=document.getElementById('harborText');
 const note=document.getElementById('harborChoice'),locate=document.getElementById('harborLocate');
 let entries=[],last;
 function show(){
  const page=entries.find(p=>p.id===select.value);
  if(!page)return;
  headline.textContent=page.title;description.textContent=page.text;
  note.hidden=!page.choice;note.textContent=page.choice||'';
  locate.onclick=()=>dispatch('world_map_focus:'+page.node);
  canvas.setAttribute('aria-label',page.title+'の挿絵');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const img=images[page.source]??new Image();
  if(!images[page.source]){images[page.source]=img;img.src='assets/'+page.source}
  const draw=()=>{
   if(panel.hidden||entries.find(p=>p.id===select.value)!==page)return;
   const [,,w,h]=page.box,k=Math.min(186/w,126/h);
   ctx.imageSmoothingEnabled=false;
   ctx.drawImage(img,...page.box,(200-w*k)/2,(138-h*k)/2,w*k,h*k);
  };
  if(img.naturalWidth)draw();
  else img.addEventListener('load',draw,{once:true});
 }
 select.onchange=show;
 return function update(pages){
  panel.hidden=!pages?.length;
  const stamp=pages&&JSON.stringify(pages);
  if(stamp===last)return;
  last=stamp;entries=pages||[];
  const previous=select.value;
  select.replaceChildren(...entries.map(p=>new Option(p.tab,p.id)));
  if(entries.some(p=>p.id===previous))select.value=previous;
  show();
 };
}
