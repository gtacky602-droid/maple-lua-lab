const $=id=>document.getElementById(id),assets=[];
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(path);return r.json()}
async function add(id,name,data,h,w){const image=new Image();image.src='assets/'+data.source;await image.decode();const article=document.createElement('article');article.innerHTML=`<h2>${name}</h2><div class="pair"><div><small>元PNG</small><canvas width="340" height="300"></canvas></div><div><small>矩形版</small><canvas width="340" height="300"></canvas></div></div><div class="stats"></div>`;$('cards').append(article);assets.push({id,data,image,article,h,w:w||h*data.box[2]/data.box[3]})}
const enemies=document.documentElement.dataset.gallery==='enemies';
try{
 if(enemies){
  const variants=(await json('assets/variants.json')).variants;
  for(const [id,name,index] of [['hydro-slime','水スライム（既存候補）',4],['pyro-slime','炎スライム（既存候補）',6]]){const profiles=Object.fromEntries(['legacy','h48c32','h32c16'].map(k=>[k,variants[k].sprites[index]]));await add(id,name,{source:'atlas-transparent.png',box:profiles.legacy.box,profiles},40)}
  await add('hilichurl','ヒルチャール（待機候補）',await json('assets/hilichurl-idle-sprites.json'),76);
  await add('hydro-slime-reference','水スライム（参照付き候補・本編表示中）',await json('assets/hydro-slime-idle-sprites.json'),40);
  await add('pyro-slime-reference','炎スライム（参照付き候補・本編表示中）',await json('assets/pyro-slime-idle-sprites.json'),40);
 }else{
 await add('traveler','旅人',await json('assets/traveler-idle-sprites.json'),88);
 await add('amber','アンバー',await json('assets/amber-idle-sprites.json'),88);
 for(const [id,name] of Object.entries({beidou:'北斗',ayaka:'神里綾華',wanderer:'放浪者',emilie:'エミリエ',kachina:'カチーナ',columbina:'コロンビーナ',mitya:'ミティヤ'}))await add(id,name,await json(`assets/${id}-idle-sprites.json`),id==='kachina'?76:88);
 }
 function render(){const profile=$('profile').value,zoom=Number($('zoom').value),flip=$('flip').checked;
  for(const {data,image,article,h,w} of assets){const a=data.profiles[profile],height=h*zoom,width=w*zoom,anchor=data.anchorX??.5;
   for(const [i,canvas] of [...article.querySelectorAll('canvas')].entries()){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,340,300);ctx.imageSmoothingEnabled=false;ctx.save();ctx.translate(170,285);if(flip)ctx.scale(-1,1);const x=-width*anchor,y=-height;
    if(i===0)ctx.drawImage(image,...data.box,x,y,width,height);else for(const r of a.runs){ctx.fillStyle=r[4];ctx.fillRect(x+r[0]*width/a.width,y+r[1]*height/a.height,r[2]*width/a.width+.05,r[3]*height/a.height+.05)}ctx.restore();ctx.fillStyle='#dae5cc';ctx.fillRect(0,285,340,1);
   }
   article.querySelector('.stats').textContent=`表示${h}px高 ／ ${a.width}×${a.height}px ／ ${a.runs.length.toLocaleString()}矩形 ／ ${(100*(1-a.runs.length/data.profiles.legacy.runs.length)).toFixed(1)}%減`;
  }$('status').textContent=`${assets.length}体を表示。原画像を変更せず比較しています。`;window.charactersGallery={ready:true,count:assets.length,profile,zoom,flip,dimensions:assets.map(({id,h,w,data})=>({id,h,w,ratio:data.box[2]/data.box[3]}))};
 }
 for(const id of ['profile','zoom','flip'])$(id).onchange=render;render();
}catch(e){$('status').textContent='素材の読み込みに失敗しました: '+e.message;throw e}
