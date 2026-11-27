import {showArenaEntrances} from './arena-entrances.js';
import {setupGalleryUrl} from './gallery-url.js';
import {characterDetail} from './character-detail.js';
import {spriteBounds,paintSprite,rectangleCount,openingRects,drawShoukiCore} from './sprite-layers.js';
const $=id=>document.getElementById(id),assets=[];
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(path);return r.json()}
const images=new Map();
function galleryImage(source){
 if(images.has(source))return images.get(source);
 const image=new Image();
 image.src='assets/'+source;
 const entry={image,decoded:false};
 entry.ready=image.decode().then(()=>{entry.decoded=true},error=>{
  images.delete(source);
  throw error;
 });
 images.set(source,entry);
 return entry;
}
let shoukiOpening,updateArenaLinks,poseStore;
function galleryPoses(index,kind){
 const requests=new Map();
 const read=path=>{
  if(!requests.has(path))requests.set(path,json(path).catch(error=>{requests.delete(path);throw error}));
  return requests.get(path);
 };
 let bundle;
 function all(){
  return bundle??=read('assets/'+kind+'-gallery-packed.json').then(data=>{
   for(const [file,pose] of Object.entries(data))Object.assign(index[file],pose);
  }).catch(error=>{bundle=null;throw error});
 }
 async function load(pose){
  const data=await read('assets/'+pose.poseFile);
  if(data.geometrySpecies){
   const layouts=await read('content/enemy-art-layout.json');
   const base=await read('assets/field-packed/'+layouts[data.geometrySpecies].file);
   const profiles=Object.fromEntries(Object.entries(data.palettes).map(([key,palette])=>
    [key,{...base.profiles[key],geometry:base.profiles[key],palette}]));
   Object.assign(pose,data,{profiles});
  }else Object.assign(pose,data);
 }
 return {all,load};
}
function add(id,name,data,h,leftData,rear){
 const right={data},left=leftData&&{data:leftData};
 const article=document.createElement('article');article.dataset.id=id;article.innerHTML=`<h2>${name}</h2><div class="pair"><div><small>元PNG</small><canvas width="340" height="300"></canvas></div><div><small>矩形版</small><canvas width="340" height="300"></canvas></div></div><div class="stats"></div>`;
 if(id==='shouki'){
  article.querySelector('h2').textContent='正機の神';
  const label=document.createElement('label');
  label.textContent='表示する姿 ';
  const pose=document.createElement('select');pose.id='shoukiForm';
  pose.add(new Option('会場開幕・くびれから上','opening'));
  pose.add(new Option('試練中・胸の核を封鎖','shielded'));
  pose.add(new Option('装甲起動後・胸の核','armored'));
  pose.add(new Option('全身の待機候補','candidate'));
  const requested=new URL(location.href).searchParams.get('pose');
  if([...pose.options].some(o=>o.value===requested))pose.value=requested;
  label.append(pose);article.querySelector('.pair').before(label);
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
 const detail=document.body.hasAttribute('data-character-measure')?characterDetail(article):null;
 $('cards').append(article);assets.push({id,name,right,left,article,h,detail,rear});
}
let layouts={};
const enemies=document.documentElement.dataset.gallery==='enemies';
try{
 if($('bossArena')){
  const groups=await json('content/boss-arena-index.json'),picker=$('bossArena');
  for(const [name,entries] of Object.entries(groups)){
   const group=document.createElement('optgroup');group.label=name+'（'+entries.length+'）';
   for(const entry of entries){
    const option=new Option(entry.region+'・'+entry.name,entry.node);
    if(name==='フィールド・地方伝説')option.dataset.poseGroup='field';
    if(name==='幽境専用')option.dataset.poseGroup='stygian';
    if(name==='週ボス')option.dataset.poseGroup='weekly';
    group.append(option);
    if(entry.opening)shoukiOpening={...entry.opening};
   }
   picker.append(group);
  }
  picker.value='shouki-godmaking-arena';
  const arenas=new Map(Object.values(groups).flat().map(entry=>[entry.node,entry]));
  const panel=$('arenaEntrances');
  let previous='';
  updateArenaLinks=()=>{
   const profile=$('profile').value, node=picker.value, key=node+'/'+profile;
   if(key===previous)return;
   previous=key;
   $('bossArenaLink').href='map-art.html?'+new URLSearchParams({node,placements:'live',profile});
   const poseLink=$('arenaPoseLink'),group=picker.selectedOptions[0].dataset.poseGroup;
   poseLink.hidden=!group;
   if(group==='stygian')poseLink.href='map-art.html?'+new URLSearchParams({node,placements:'live',background:'original',profile})+'#stygianPoses';
   else if(group)poseLink.href='weekly-poses.html?'+new URLSearchParams({group,node,pixels:'1'});
   const gates=arenas.get(node)?.entrances??[];
   showArenaEntrances(panel,node,gates,profile);
  };
  picker.onchange=updateArenaLinks;
  picker.onchange();
 }
 if(enemies){
  layouts=await json('content/enemy-art-layout.json');
  const slimePreviews=await json('assets/slime-preview-packed.json');
  for(const [id,name] of [['hydro-slime','水スライム（既存候補）'],['pyro-slime','炎スライム（既存候補）']]){
   add(id,name,slimePreviews[id],40);
  }
  add('hilichurl','ヒルチャール（待機候補）',await json('assets/field-packed/hilichurl-idle-sprites.json'),76);
  add('hydro-slime-reference','水スライム（参照付き候補・本編表示中）',await json('assets/field-packed/hydro-slime-idle-sprites.json'),40);
  add('pyro-slime-reference','炎スライム（参照付き候補・本編表示中）',await json('assets/field-packed/pyro-slime-idle-sprites.json'),40);
  add('cryo-slime','氷スライム（小型・雪山に仮配置）',await json('assets/field-packed/cryo-slime-idle-sprites.json'),layouts['cryo-slime'].height);
  add('ruin-guard','遺跡守衛（待機候補・璃月に仮配置）',await json('assets/field-packed/ruin-guard-idle-sprites.json'),144);
  add('dendro-fungus','浮遊草キノコン（待機候補・スメールに仮配置）',await json('assets/field-packed/dendro-fungus-idle-sprites.json'),64);
  add('nobushi','野伏・陣刀番（待機候補・稲妻に仮配置）',await json('assets/field-packed/nobushi-idle-sprites.json'),104);
  add('treasure-scout','宝盗団・斥候（待機候補・璃月に仮配置）',await json('assets/field-packed/treasure-scout-idle-sprites.json'),layouts['treasure-scout'].height);
  add('armored-crab','重甲ヤドカニ（全身参照v2・フォンテーヌに仮配置）',await json('assets/field-packed/armored-crab-idle-sprites.json'),64);
  add('frostarm-lawachurl','ヒルチャール・霜鎧の王（ドラゴンスパインに仮配置）',await json('assets/field-packed/frostarm-lawachurl-idle-sprites.json'),layouts['frostarm-lawachurl'].height);
  add('hunter-seeker','秘源機兵・ハンターシーカー（ナタに仮配置）',await json('assets/field-packed/hunter-seeker-idle-sprites.json'),layouts['hunter-seeker'].height);
  add('fanged-beast','聖骸牙獣（トゥニギの黒淵に仮配置）',await json('assets/field-packed/fanged-beast-idle-sprites.json'),layouts['fanged-beast'].height);
  const shown=new Set(assets.map(item=>item.id));
  for(const [id,{height,file,name}] of Object.entries(layouts)){
   if(!shown.has(id))add(id,name??id,await json('assets/field-packed/'+(file??`${id}-idle-sprites.json`)),height);
  }
  for(const item of assets){
   const habitat=Object.keys(layouts[item.id]?.habitats??{})[0];
   if(!habitat)continue;
   const link=document.createElement('a');link.textContent='水中での大きさと配置を見る';
   link.href='map-art.html?'+new URLSearchParams({node:habitat,placements:'live'});
   item.article.append(link);
  }
 }else{
  const catalog=document.documentElement.dataset.gallery==='bosses'?'boss-art-gallery.json':'character-art-gallery.json';
  const kind=document.documentElement.dataset.gallery==='bosses'?'boss':'character';
  const filtered=Boolean(new URL(location.href).searchParams.get('q')?.trim());
  const [packed,{items}]=await Promise.all([json(filtered?'assets/placement-pose-index.json':'assets/'+kind+'-gallery-packed.json'),json('content/'+catalog)]);
  if(filtered)poseStore=galleryPoses(packed,kind);
  if(shoukiOpening)shoukiOpening.data=filtered?packed['weekly/'+shoukiOpening.file]:await json('assets/weekly-packed/'+shoukiOpening.file);
  for(const item of items){
   add(item.id,item.name,packed[item.file],item.height,packed[item.leftFile],item.rear&&{...item.rear,data:packed[item.rear.file]});
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
 let renderVersion=0;
 function render(){
  const version=++renderVersion,pending=[],missing=new Set();
  updateArenaLinks?.();const terms=normalize(search.value).trim().split(/\s+/u).filter(Boolean);let visible=0;const profile=$('profile').value,zoom=Number($('zoom').value),flip=$('flip').checked;
  updateUrl();const dimensions=[];
  for(const {id,name,right,left,article,h:sheetHeight,rear,detail} of assets){
   const form=id==='shouki'?$('shoukiForm').value:null;
   const arena=form&&form!=='candidate'?shoukiOpening:null;
   if(form)article.querySelector('a').href='map-art.html?'+new URLSearchParams({
    node:'shouki-godmaking-arena',placements:'live',profile,
    core:form==='armored'?'exposed':form==='shielded'?'shielded':'opening'
   });
   const {data}=arena??(flip&&left?left:right);
   const h=arena?.artHeight??sheetHeight,ratio=data.box[2]/data.box[3],w=h*ratio;
   dimensions.push({id,h,w,ratio,source:data.source??data.sourceImage,...(rear&&{rearSource:rear.data.source??rear.data.sourceImage})});
   article.hidden=!terms.every(term=>normalize(name+' '+id).includes(term));if(article.hidden)continue;visible++;
   const save=article.querySelector('.save-comparison');
   if(save)save.disabled=true;
   const both=$('compareBoth')?.checked;
   const nativeSize=zoom===1&&document.body.hasAttribute('data-character-measure');
   const pair=article.querySelector('.pair');
   pair.toggleAttribute('data-native',nativeSize);
   if(pair.children.length===3){
    pair.children[1].querySelector('small').textContent=both?'32色版':'矩形版';
    pair.children[2].hidden=!both;
   }
   if(!data.profiles||rear&&!rear.data.profiles){
    if(!data.profiles)missing.add(data);
    if(rear&&!rear.data.profiles)missing.add(rear.data);
    pair.style.visibility='hidden';
    article.setAttribute('aria-busy','true');
    article.querySelector('.stats').textContent='矩形データを読み込み中…';
    continue;
   }
   const a=data.profiles[both?'h48c32':profile],hover=(layouts[id.replace('-reference','')]?.hover??0)*zoom;
   const palettePixels=$('palettePixels')?.checked;
   const body=spriteBounds(data,arena?h:h*zoom);
   const bodyImage=galleryImage(data.source),rearImage=rear&&galleryImage(rear.data.source);
   function draw(){
    if(version!==renderVersion)return;
    pair.style.visibility='';
    article.removeAttribute('aria-busy');
    const layer=rear&&spriteBounds(rear.data,rear.height*zoom,rear.bottom*zoom);
    const halfWidth=Math.max(-body.x,body.x+body.width,(layer?.width??0)/2);
    const top=Math.min(body.y,layer?.y??0),painted=[];
    for(const [i,canvas] of [...pair.querySelectorAll('canvas')].entries()){
     if(i===2&&!both)continue;
     const selected=i===0?null:both?(i===1?'h48c32':'h32c16'):profile;
     canvas.width=arena?960:Math.max(nativeSize?96:340,Math.ceil(halfWidth*2+30));
     canvas.height=arena?540:Math.max(nativeSize?112:300,Math.ceil(hover-top+30));
     canvas.style.width=nativeSize?canvas.width+'px':'';
     canvas.style.maxWidth=nativeSize?'100%':'';
     const floor=arena?.floorY??(canvas.height-15-hover);
     const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.save();ctx.translate(arena?.center??canvas.width/2,floor);
     if(layer)paintSprite(ctx,rear.data,rearImage?.image,layer,selected,palettePixels);
     if(flip&&!left)ctx.scale(-1,1);
     if(arena&&selected){
      if(palettePixels)paintSprite(ctx,data,bodyImage.image,body,selected,true);
      else ctx.setTransform(1,0,0,1,0,0);
      const visible=openingRects(ctx,data.profiles[selected],body,arena.center,floor,flip,true,!palettePixels);
      painted.push((selected==='legacy'?'標準':selected==='h48c32'?'32色':'16色')+' '+visible.toLocaleString('ja-JP')+'矩形');
     }else paintSprite(ctx,data,bodyImage.image,body,selected,palettePixels);
     ctx.restore();ctx.fillStyle='#dae5cc';ctx.fillRect(0,arena?.floorY??(canvas.height-15),canvas.width,1);
     if(form==='armored'||form==='shielded'){
      drawShoukiCore(ctx,data.box,h,arena.center,floor,arena.chestSourceY,form==='armored');
     }
    }
    if(save)save.disabled=false;
    const total=key=>rectangleCount(data.profiles[key])+(rear?rectangleCount(rear.data.profiles[key]):0);
    detail?.(zoom,flip,both?['32色','16色']:[$('profile').selectedOptions[0].textContent]);
    const runs=total(profile);
    const standard=total('legacy');
    article.querySelector('.stats').textContent=both?`32色版 ${total('h48c32')}矩形 ／ 16色版 ${total('h32c16')}矩形${rear?'（翼込み）':''}`:`表示${h}px高${rear?'（本体）':''} ／ ${a.width}×${a.height}px${rear?`・各素材${a.colors}色`:''} ／ ${runs.toLocaleString()}矩形${rear?'（翼込み）':''} ／ ${(100*(1-runs/standard)).toFixed(1)}%減`;
    if(nativeSize&&both&&!arena){
     const facing=flip?(left?'左向き専用の絵':'右向きの絵を左右反転'):'右向き';
     article.querySelector('.stats').prepend(`表示高 ${h}px ／ ${facing} ／ `);
    }
    if(arena)article.querySelector('.stats').textContent='会場の画角 960×540 px ／ 腰の位置は床面 ／ 表示高 '+h.toLocaleString('ja-JP')+' px ／ 画面内にかかる矩形 '+painted.join('・');
   }
   if(bodyImage.decoded&&(!rearImage||rearImage.decoded))draw();
   else{
    pair.style.visibility='hidden';
    article.setAttribute('aria-busy','true');
    article.querySelector('.stats').textContent='元画像を読み込み中…';
    pending.push(Promise.all([bodyImage.ready,rearImage?.ready]).then(draw).catch(error=>{
     if(version===renderVersion){
      article.removeAttribute('aria-busy');
      article.querySelector('.stats').textContent='元画像を読み込めませんでした。';
     }
     throw error;
    }));
   }
  }result.textContent=visible?`${visible} / ${assets.length}候補を表示`: '該当する素材がありません。名前を短くするか、絞り込みを解除してください。';clear.disabled=!search.value; $('status').textContent=`${visible} / ${assets.length}候補を表示。原画像を変更せず比較しています。`;window.charactersGallery={ready:!missing.size&&!pending.length,count:assets.length,visibleCount:visible,query:search.value,profile,zoom,flip,dimensions};
  if(missing.size||pending.length){
   if(!terms.length&&[...missing].some(pose=>pose!==shoukiOpening?.data))pending.push(poseStore.all());
   for(const pose of missing)if(terms.length||pose===shoukiOpening?.data)pending.push(poseStore.load(pose));
   Promise.all(pending).then(()=>{
    if(version!==renderVersion)return;
    if(missing.size)render();else window.charactersGallery.ready=true;
   }).catch(error=>{
    if(version===renderVersion)$('status').textContent='素材の読み込みに失敗しました: '+error.message;
   });
  }
 }
 if($('shoukiForm'))$('shoukiForm').onchange=()=>{
  const url=new URL(location.href),form=$('shoukiForm').value;
  if(form==='opening')url.searchParams.delete('pose');else url.searchParams.set('pose',form);
  history.replaceState(history.state,'',url);render();
 };
 if($('palettePixels'))$('palettePixels').onchange=render;
 if($('compareBoth'))$('compareBoth').onchange=()=>{$('profile').disabled=$('compareBoth').checked;render()};
 for(const id of ['profile','zoom','flip'])$(id).onchange=render;render();
}catch(e){$('status').textContent='素材の読み込みに失敗しました: '+e.message;throw e}
