import {setupGalleryUrl} from './gallery-url.js';
const $=id=>document.getElementById(id),assets=[];
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(path);return r.json()}
async function add(id,name,data,h,w){const image=new Image();image.src='assets/'+data.source;await image.decode();const article=document.createElement('article');article.dataset.id=id;article.innerHTML=`<h2>${name}</h2><div class="pair"><div><small>元PNG</small><canvas width="340" height="300"></canvas></div><div><small>矩形版</small><canvas width="340" height="300"></canvas></div></div><div class="stats"></div>`;$('cards').append(article);assets.push({id,name,data,image,article,h,w:w||h*data.box[2]/data.box[3]})}
let layouts={};
const enemies=document.documentElement.dataset.gallery==='enemies';
try{
 if(document.documentElement.dataset.gallery==='bosses'){
  for(const item of (await json('content/boss-art-gallery.json')).items)await add(item.id,item.name,await json('assets/'+item.file),item.height);
 }else if(enemies){
  layouts=await json('content/enemy-art-layout.json');
  const variants=(await json('assets/variants.json')).variants;
  for(const [id,name,index] of [['hydro-slime','水スライム（既存候補）',4],['pyro-slime','炎スライム（既存候補）',6]]){const profiles=Object.fromEntries(['legacy','h48c32','h32c16'].map(k=>[k,variants[k].sprites[index]]));await add(id,name,{source:'atlas-transparent.png',box:profiles.legacy.box,profiles},40)}
  await add('hilichurl','ヒルチャール（待機候補）',await json('assets/hilichurl-idle-sprites.json'),76);
  await add('hydro-slime-reference','水スライム（参照付き候補・本編表示中）',await json('assets/hydro-slime-idle-sprites.json'),40);
  await add('pyro-slime-reference','炎スライム（参照付き候補・本編表示中）',await json('assets/pyro-slime-idle-sprites.json'),40);
  await add('ruin-guard','遺跡守衛（待機候補・璃月に仮配置）',await json('assets/ruin-guard-idle-sprites.json'),144);
  await add('dendro-fungus','浮遊草キノコン（待機候補・スメールに仮配置）',await json('assets/dendro-fungus-idle-sprites.json'),64);
  await add('nobushi','野伏・陣刀番（待機候補・稲妻に仮配置）',await json('assets/nobushi-idle-sprites.json'),104);
  await add('armored-crab','重甲ヤドカニ（全身参照v2・フォンテーヌに仮配置）',await json('assets/armored-crab-idle-sprites.json'),64);
  await add('frostarm-lawachurl','ヒルチャール・霜鎧の王（ドラゴンスパインに仮配置）',await json('assets/frostarm-lawachurl-idle-sprites.json'),layouts['frostarm-lawachurl'].height);
 }else{
 for(const item of (await json('content/character-art-gallery.json')).items)await add(item.id,item.name,await json('assets/'+item.file),item.height);
 }
 const searchControls=document.createElement('div');searchControls.className='gallery-search';
 const searchLabel=document.createElement('label');searchLabel.textContent='素材名で絞り込む ';
 const search=document.createElement('input');search.type='search';search.id='assetSearch';search.placeholder='例：無相、水、旅人';searchLabel.append(search);
 const clear=document.createElement('button');clear.type='button';clear.id='clearAssetSearch';clear.textContent='絞り込みを解除';
 const result=document.createElement('p');result.id='searchResults';result.setAttribute('role','status');
 searchControls.append(searchLabel,clear,result);$('cards').before(searchControls);
 const normalize=s=>s.normalize('NFKC').toLocaleLowerCase('ja');
 search.oninput=render;clear.onclick=()=>{search.value='';render();search.focus()};
 const updateUrl=setupGalleryUrl({search,render});
 function render(){const terms=normalize(search.value).trim().split(/\s+/u).filter(Boolean);let visible=0;const profile=$('profile').value,zoom=Number($('zoom').value),flip=$('flip').checked;
  updateUrl();
  for(const {id,name,data,image,article,h,w} of assets){article.hidden=!terms.every(term=>normalize(name+' '+id).includes(term));if(article.hidden)continue;visible++;const a=data.profiles[profile],hover=(layouts[id.replace('-reference','')]?.hover??0)*zoom,height=h*zoom,width=w*zoom,anchor=data.anchorX??.5;
   for(const [i,canvas] of [...article.querySelectorAll('canvas')].entries()){canvas.width=Math.max(340,Math.ceil(width*2*Math.max(anchor,1-anchor)+30));canvas.height=Math.max(300,Math.ceil(height+hover+30));const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;ctx.save();ctx.translate(canvas.width/2,canvas.height-15-hover);if(flip)ctx.scale(-1,1);const x=-width*anchor,y=-height;
    if(i===0)ctx.drawImage(image,...data.box,x,y,width,height);else for(const r of a.runs){ctx.fillStyle=r[4];ctx.fillRect(x+r[0]*width/a.width,y+r[1]*height/a.height,r[2]*width/a.width+.05,r[3]*height/a.height+.05)}ctx.restore();ctx.fillStyle='#dae5cc';ctx.fillRect(0,canvas.height-15,canvas.width,1);
   }
   article.querySelector('.stats').textContent=`表示${h}px高 ／ ${a.width}×${a.height}px ／ ${a.runs.length.toLocaleString()}矩形 ／ ${(100*(1-a.runs.length/data.profiles.legacy.runs.length)).toFixed(1)}%減`;
  }result.textContent=visible?`${visible} / ${assets.length}候補を表示`: '該当する素材がありません。名前を短くするか、絞り込みを解除してください。';clear.disabled=!search.value; $('status').textContent=`${visible} / ${assets.length}候補を表示。原画像を変更せず比較しています。`;window.charactersGallery={ready:true,count:assets.length,visibleCount:visible,query:search.value,profile,zoom,flip,dimensions:assets.map(({id,h,w,data})=>({id,h,w,ratio:data.box[2]/data.box[3]}))};
 }
 for(const id of ['profile','zoom','flip'])$(id).onchange=render;render();
}catch(e){$('status').textContent='素材の読み込みに失敗しました: '+e.message;throw e}
