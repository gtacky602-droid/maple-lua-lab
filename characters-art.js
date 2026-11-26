import {setupGalleryUrl} from './gallery-url.js';
import {spriteBounds,paintSprite,rectangleCount} from './sprite-layers.js';
const $=id=>document.getElementById(id),assets=[];
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(path);return r.json()}
async function art(data){const image=new Image();image.src='assets/'+data.source;await image.decode();return {data,image}}
async function add(id,name,data,h,leftData,rear){
 const [right,left,layer]=await Promise.all([art(data),leftData&&art(leftData),rear&&art(rear.data)]);
 const article=document.createElement('article');article.dataset.id=id;article.innerHTML=`<h2>${name}</h2><div class="pair"><div><small>元PNG</small><canvas width="340" height="300"></canvas></div><div><small>矩形版</small><canvas width="340" height="300"></canvas></div></div><div class="stats"></div>`;
 if(id==='shouki'){
  const link=document.createElement('a');
  link.href='map-art.html?node=shouki-godmaking-arena&placements=live';
  link.textContent='週ボス会場で、地面から伸びる上半身を見る';
  article.append(link);
 }
 if($('compareBoth')){
  const extra=document.createElement('div');
  extra.hidden=true;extra.innerHTML='<small>16色版</small><canvas width="340" height="300"></canvas>';
  article.querySelector('.pair').append(extra);
 }
 $('cards').append(article);assets.push({id,name,right,left,article,h,rear:layer&&{...layer,height:rear.height,bottom:rear.bottom}});
}
let layouts={};
const enemies=document.documentElement.dataset.gallery==='enemies';
try{
 if(enemies){
  layouts=await json('content/enemy-art-layout.json');
  const variants=(await json('assets/variants.json')).variants;
  for(const [id,name,index] of [['hydro-slime','水スライム（既存候補）',4],['pyro-slime','炎スライム（既存候補）',6]]){const profiles=Object.fromEntries(['legacy','h48c32','h32c16'].map(k=>[k,variants[k].sprites[index]]));await add(id,name,{source:'atlas-transparent.png',box:profiles.legacy.box,profiles},40)}
  await add('hilichurl','ヒルチャール（待機候補）',await json('assets/hilichurl-idle-sprites.json'),76);
  await add('hydro-slime-reference','水スライム（参照付き候補・本編表示中）',await json('assets/hydro-slime-idle-sprites.json'),40);
  await add('pyro-slime-reference','炎スライム（参照付き候補・本編表示中）',await json('assets/pyro-slime-idle-sprites.json'),40);
  await add('cryo-slime','氷スライム（小型・雪山に仮配置）',await json('assets/cryo-slime-idle-sprites.json'),layouts['cryo-slime'].height);
  await add('ruin-guard','遺跡守衛（待機候補・璃月に仮配置）',await json('assets/ruin-guard-idle-sprites.json'),144);
  await add('dendro-fungus','浮遊草キノコン（待機候補・スメールに仮配置）',await json('assets/dendro-fungus-idle-sprites.json'),64);
  await add('nobushi','野伏・陣刀番（待機候補・稲妻に仮配置）',await json('assets/nobushi-idle-sprites.json'),104);
  await add('treasure-scout','宝盗団・斥候（待機候補・璃月に仮配置）',await json('assets/treasure-scout-idle-sprites.json'),layouts['treasure-scout'].height);
  await add('armored-crab','重甲ヤドカニ（全身参照v2・フォンテーヌに仮配置）',await json('assets/armored-crab-idle-sprites.json'),64);
  await add('frostarm-lawachurl','ヒルチャール・霜鎧の王（ドラゴンスパインに仮配置）',await json('assets/frostarm-lawachurl-idle-sprites.json'),layouts['frostarm-lawachurl'].height);
  await add('hunter-seeker','秘源機兵・ハンターシーカー（ナタに仮配置）',await json('assets/hunter-seeker-idle-sprites.json'),layouts['hunter-seeker'].height);
  await add('fanged-beast','聖骸牙獣（トゥニギの黒淵に仮配置）',await json('assets/fanged-beast-idle-sprites.json'),layouts['fanged-beast'].height);
  const shown=new Set(assets.map(item=>item.id));
  for(const [id,{height,file,name}] of Object.entries(layouts)){
   if(!shown.has(id))await add(id,name??id,await json('assets/'+(file??`${id}-idle-sprites.json`)),height);
  }
 }else{
  const catalog=document.documentElement.dataset.gallery==='bosses'?'boss-art-gallery.json':'character-art-gallery.json';
  const kind=document.documentElement.dataset.gallery==='bosses'?'boss':'character';
  const [packed,{items}]=await Promise.all([json('assets/'+kind+'-gallery-packed.json'),json('content/'+catalog)]);
  for(const item of items){
   await add(item.id,item.name,packed[item.file],item.height,packed[item.leftFile],item.rear&&{...item.rear,data:packed[item.rear.file]});
  }
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
  updateUrl();const dimensions=[];
  for(const {id,name,right,left,article,h,rear} of assets){const {data,image}=flip&&left?left:right;const ratio=data.box[2]/data.box[3],w=h*ratio;
   dimensions.push({id,h,w,ratio,source:data.source,...(rear&&{rearSource:rear.data.source})});
   article.hidden=!terms.every(term=>normalize(name+' '+id).includes(term));if(article.hidden)continue;visible++;
   const both=$('compareBoth')?.checked;
   const pair=article.querySelector('.pair');
   if(pair.children.length===3){
    pair.children[1].querySelector('small').textContent=both?'32色版':'矩形版';
    pair.children[2].hidden=!both;
   }
   const a=data.profiles[both?'h48c32':profile],hover=(layouts[id.replace('-reference','')]?.hover??0)*zoom;
   const body=spriteBounds(data,h*zoom);
   const layer=rear&&spriteBounds(rear.data,rear.height*zoom,rear.bottom*zoom);
   const halfWidth=Math.max(-body.x,body.x+body.width,(layer?.width??0)/2);
   const top=Math.min(body.y,layer?.y??0);
   for(const [i,canvas] of [...article.querySelectorAll('canvas')].entries()){
    if(i===2&&!both)continue;
    const selected=i===0?null:both?(i===1?'h48c32':'h32c16'):profile;
    canvas.width=Math.max(340,Math.ceil(halfWidth*2+30));canvas.height=Math.max(300,Math.ceil(hover-top+30));
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.save();ctx.translate(canvas.width/2,canvas.height-15-hover);
    if(layer)paintSprite(ctx,rear.data,rear.image,layer,selected);
    if(flip&&!left)ctx.scale(-1,1);
    paintSprite(ctx,data,image,body,selected);
    ctx.restore();ctx.fillStyle='#dae5cc';ctx.fillRect(0,canvas.height-15,canvas.width,1);
   }
   const total=key=>rectangleCount(data.profiles[key])+(rear?rectangleCount(rear.data.profiles[key]):0);
   const runs=total(profile);
   const standard=total('legacy');
   article.querySelector('.stats').textContent=both?`32色版 ${total('h48c32')}矩形 ／ 16色版 ${total('h32c16')}矩形${rear?'（翼込み）':''}`:`表示${h}px高${rear?'（本体）':''} ／ ${a.width}×${a.height}px${rear?`・各素材${a.colors}色`:''} ／ ${runs.toLocaleString()}矩形${rear?'（翼込み）':''} ／ ${(100*(1-runs/standard)).toFixed(1)}%減`;
  }result.textContent=visible?`${visible} / ${assets.length}候補を表示`: '該当する素材がありません。名前を短くするか、絞り込みを解除してください。';clear.disabled=!search.value; $('status').textContent=`${visible} / ${assets.length}候補を表示。原画像を変更せず比較しています。`;window.charactersGallery={ready:true,count:assets.length,visibleCount:visible,query:search.value,profile,zoom,flip,dimensions};
 }
 if($('compareBoth'))$('compareBoth').onchange=()=>{$('profile').disabled=$('compareBoth').checked;render()};
 for(const id of ['profile','zoom','flip'])$(id).onchange=render;render();
}catch(e){$('status').textContent='素材の読み込みに失敗しました: '+e.message;throw e}
