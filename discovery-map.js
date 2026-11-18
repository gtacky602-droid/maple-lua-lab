const paper='#eadcae', ink='#3a5040';

function drawMap(canvas,images,cards){
 const ctx=canvas.getContext('2d');
 const {width,height}=canvas;
 ctx.fillStyle=paper;
 ctx.fillRect(0,0,width,height);
 ctx.strokeStyle='#85754f';
 ctx.strokeRect(8,8,width-16,height-16);
 ctx.strokeStyle='#b3a574';
 ctx.strokeRect(12,12,width-24,height-24);

 ctx.fillStyle='#adbc8b';
 ctx.beginPath();
 ctx.moveTo(16,106);ctx.bezierCurveTo(130,34,215,91,307,61);
 ctx.bezierCurveTo(407,30,497,65,564,40);ctx.lineTo(564,131);
 ctx.bezierCurveTo(490,171,376,127,308,172);ctx.bezierCurveTo(208,224,101,159,16,222);
 ctx.closePath();ctx.fill();

 ctx.strokeStyle='#729d9d';
 ctx.lineWidth=9;ctx.beginPath();
 ctx.moveTo(16,235);ctx.bezierCurveTo(165,160,233,281,351,203);
 ctx.bezierCurveTo(413,162,511,198,564,154);ctx.stroke();

 ctx.strokeStyle='#59684c';
 ctx.setLineDash([4,7]);ctx.lineWidth=2;ctx.beginPath();
 ctx.moveTo(58,220);ctx.bezierCurveTo(139,218,168,135,245,145);
 ctx.bezierCurveTo(316,147,364,64,518,95);ctx.stroke();
 ctx.beginPath();ctx.moveTo(315,137);ctx.quadraticCurveTo(374,180,468,218);ctx.stroke();
 ctx.setLineDash([]);

 ctx.imageSmoothingEnabled=false;
 ctx.textAlign='center';ctx.font="bold 16px 'Yu Gothic UI', sans-serif";
 for(const card of cards){
  if(!card.known)continue;
  const sprite=images[card.source], w=Math.min(64,46*card.box[2]/card.box[3]);
  const h=w*card.box[3]/card.box[2];
  if(card.method!==undefined){
   ctx.fillStyle='#fff1bf';ctx.strokeStyle='#9d763f';ctx.lineWidth=2;
   ctx.beginPath();ctx.ellipse(card.x,card.y-17,38,26,0,0,2*Math.PI);ctx.fill();ctx.stroke();
  }
  if(sprite?.naturalWidth)ctx.drawImage(sprite,...card.box,card.x-w/2,card.y-h,w,h);
  ctx.fillStyle=ink;ctx.fillText(card.label,card.x,card.y+19);
 }
}

export function initDiscoveryMap(images,dispatch){
 const panel=document.getElementById('discoveryMap');
 const canvas=document.getElementById('discoveryMapCanvas');
 const title=document.getElementById('discoveryMapTitle');
 const summary=document.getElementById('discoveryMapSummary');
 const list=document.getElementById('discoveryMapCards');
 const confirm=document.getElementById('discoveryMapConfirm');
 const close=document.getElementById('discoveryMapClose');
 const rows=new Map();
 let signature,layout;
 confirm.onclick=()=>dispatch('story_discovery_confirm');
 close.onclick=()=>{
  dispatch('story_discovery_close');
  document.getElementById('nearbyCargoGo').focus();
 };

 function build(cards,readOnly){
  list.replaceChildren();
  rows.clear();
  for(const card of cards){
   const item=document.createElement('li');
   const name=document.createElement(readOnly?'strong':'button');
   name.textContent=card.label;
   const description=document.createElement('p');
   item.append(name,description);
   rows.set(card.id,{name,description});
   if(!readOnly){
    name.type='button';name.dataset.discoveryPick=card.id;
    name.onclick=()=>dispatch('story_discovery_pick:'+card.id);
    const label=document.createElement('label'), select=document.createElement('select');
    label.textContent='見つけ方';
    select.dataset.discoveryMethod=card.id;
    select.setAttribute('aria-label',card.label+'の見つけ方');
    const empty=new Option('見つけ方を選ぶ','');
    empty.disabled=true;
    select.append(empty,...card.methods.map(method=>new Option(method.label,method.id)));
    select.onchange=()=>dispatch('story_discovery_method:'+card.id+':'+select.value);
    label.append(select);item.append(label);
    Object.assign(rows.get(card.id),{label,select});
   }
   list.append(item);
  }
 }

 return function update(view){
  panel.hidden=!view;
  if(!view){signature=undefined;return}
  const nextSignature=JSON.stringify(view);
  if(signature===nextSignature)return;
  signature=nextSignature;
  const nextLayout=[view.readOnly,...view.cards.map(card=>card.id)].join(':');
  if(layout!==nextLayout){
   build(view.cards,view.readOnly);
   layout=nextLayout;
  }
  title.textContent=view.posted?'広場の絵地図':view.readOnly?'報告前の絵地図':'森で見つけたこと';
  summary.textContent=view.posted?'広場を訪れた人に、あなたの三つの発見を紹介しています。':
      view.readOnly?'依頼手帳から報告すると、広場に掲示されます。':
      `発見 ${view.selected}/3　見つけ方 ${view.described}/3`;
  for(const card of view.cards){
   const row=rows.get(card.id);
   if(view.readOnly){
    const method=card.methods.find(method=>method.id===card.method);
    row.description.textContent=card.where+'。'+method.label;
    continue;
   }
   const chosen=card.method!==undefined;
   row.name.disabled=!card.known||(!chosen&&view.selected===3);
   row.name.setAttribute('aria-pressed',String(chosen));
   row.description.textContent=card.known?card.where:card.hint;
   row.label.hidden=!chosen;
   row.select.value=card.method??'';
  }
  confirm.hidden=view.readOnly;
  confirm.disabled=!view.ready;
  drawMap(canvas,images,view.cards);
 };
}
