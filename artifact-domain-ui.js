export function initArtifactDomainUI(action){
 const get=id=>document.getElementById(id);
 const panel=get('artifactDomain'),title=get('artifactDomainName'),choices=get('artifactDomainChoices');
 const rankInput=get('artifactDomainRank'),setInput=get('artifactDomainSet'),start=get('artifactDomainStart');
 const details=get('artifactDomainDetails'),result=get('artifactDomainResult');
 const parts=['','花','羽','時計','杯','冠'];
 let view;
 function text(el,value){
  if(el.textContent!==value)el.textContent=value;
 }
 function update(){
  if(!view)return;
  const rank=view.ranks.find(row=>row.id===rankInput.value);
  const set=view.sets.find(row=>row.id===setInput.value);
  const fighting=view.status==='fighting';
  choices.hidden=fighting;
  start.disabled=!rank?.available||view.blocked;
  text(start,view.status==='ready'?'挑戦する':'再挑戦する');
  if(fighting){
   const rule=view.rule==='chain'?` ｜ 通常攻撃で蓄積 ${view.chain}/5`:' ｜ シールドが攻撃を吸収すると反撃';
   text(details,`第${view.wave}陣 / ${view.waves} ｜ 残り ${view.remainingEnemies}体・${Math.ceil(view.remaining)}秒${rule}`);
  }else if(rank&&set){
   const reward=`★${rank.rarity} itemLv${rank.itemLevel}・${rank.xp.toLocaleString()} EXP・${rank.mora.toLocaleString()}モラ`;
   const record=rank.record?` ｜ ${rank.record.clears}勝・最速${(rank.record.bestTicks/60).toFixed(1)}秒`:'';
   text(details,`必要Lv${rank.level}・${rank.count}体 ｜ ${reward} ｜ 2部位 ${set.twoPiece}${record}`);
  }
  const item=view.result;
  result.hidden=!item&&view.status!=='timeout';
  text(result,item?`制覇 ｜ ${item.setName}の${parts[item.slot]} ★${item.rarity} ｜ ${item.xp.toLocaleString()} EXP・${item.mora.toLocaleString()}モラ${item.held?' ｜ バッグ満杯のため町に保留':''}`
   :view.status==='timeout'?'時間切れです。難易度とセットを選んで再挑戦できます。':'');
 }
 rankInput.onchange=setInput.onchange=update;
 start.onclick=()=>{
  if(!view||start.disabled)return;
  action(`artifact_domain_start:${rankInput.value}:${setInput.value}`);
  start.blur();
 };
 return function render(next){
  panel.hidden=!next;
  const previous=view;
  view=next;
  if(!view)return;
  if(view.id!==previous?.id){
   text(title,view.name);
   rankInput.replaceChildren(...view.ranks.map(rank=>new Option(`${rank.name}・Lv${rank.level}`,rank.id)));
   rankInput.value=(view.ranks.find(rank=>rank.available)??view.ranks[0]).id;
   setInput.replaceChildren(...view.sets.map(set=>new Option(set.name,set.id)));
  }
  update();
 };
}
