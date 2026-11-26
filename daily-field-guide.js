const el=id=>document.getElementById(id);
const region=el('region'),menu=el('quest'),images=new Map();
async function json(path){
 const res=await fetch(path);
 if(!res.ok)throw Error(path);
 return res.json();
}
function sheet(file){
 if(!images.has(file)){
  const img=new Image();img.src='assets/'+file;
  images.set(file,img.decode().then(()=>img).catch(e=>{images.delete(file);throw e}));
 }
 return images.get(file);
}
function paint(canvas,art,profile,img){
 const ctx=canvas.getContext('2d'),[,,w,h]=art.box;
 const scale=Math.min((canvas.width-16)/w,(canvas.height-12)/h);
 const x=(canvas.width-w*scale)/2,y=canvas.height-6-h*scale;
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
 if(!profile){ctx.drawImage(img,...art.box,x,y,w*scale,h*scale);return}
 const grid=art.profiles[profile],sx=w*scale/grid.width,sy=h*scale/grid.height;
 const bytes=Uint8Array.from(atob(grid.data),c=>c.charCodeAt(0));
 for(let i=0;i<bytes.length;i+=5){
  const left=Math.round(x+bytes[i]*sx),top=Math.round(y+bytes[i+1]*sy);
  ctx.fillStyle=grid.palette[bytes[i+4]];
  ctx.fillRect(left,top,Math.round(x+(bytes[i]+bytes[i+2])*sx)-left,Math.round(y+(bytes[i+1]+bytes[i+3])*sy)-top);
 }
 canvas.closest('figure').querySelector('small').textContent=grid.width+' × '+grid.height+' px・'+bytes.length/5+'矩形';
}
try{
 const [{quests},sprites]=await Promise.all([json('content/daily-field-guide.json'),json('assets/daily-guide-sprites.json')]);
 const byId=new Map(quests.map(q=>[q.id,q]));
 const params=new URLSearchParams(location.search);
 const first=byId.get(params.get('quest'))||quests[0];
 for(const label of new Set(quests.map(q=>q.region)))region.add(new Option(label));
 let revision=0;
 function render(){
  const q=byId.get(menu.value),art=sprites[q.art],token=++revision;
  const url=new URL(location.href);url.searchParams.set('quest',q.id);history.replaceState(null,'',url);
  el('name').textContent=q.name;el('conditions').textContent=[q.kind==='main'?'主依頼':'追加依頼','Lv'+q.level,q.hubName,q.giver,q.unlock].filter(Boolean).join(' ｜ ');
  el('objective').textContent=q.target+'　目標 '+q.goal;el('reward').textContent='報酬　'+q.xp.toLocaleString('ja-JP')+' EXP・'+q.mora.toLocaleString('ja-JP')+' モラ';
  el('place').textContent=q.place+(q.enemy?'　'+q.enemy:'');
  for(const [link,node] of [['hubMap',q.hub],['fieldMap',q.node]])el(link).href='map-art.html?'+new URLSearchParams({node,placements:'live'});
  for(const profile of ['h48c32','h32c16'])paint(el(profile),art,profile);
  const source=el('source');source.getContext('2d').clearRect(0,0,source.width,source.height);
  delete source.dataset.art;el('error').textContent='';
  sheet(art.source).then(img=>{if(revision===token){paint(source,art,null,img);source.dataset.art=q.art}})
   .catch(()=>{if(revision===token)el('error').textContent='元絵を読み込めませんでした。'});
 }
 function fill(id){
  menu.replaceChildren(...quests.filter(q=>q.region===region.value).map(q=>new Option(q.name,q.id)));
  if(id)menu.value=id;
  render();
 }
 region.onchange=()=>fill();menu.onchange=render;region.value=first.region;fill(first.id);
}catch{el('error').textContent='依頼図鑑を読み込めませんでした。'}
