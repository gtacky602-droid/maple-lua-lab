export function initEndgameUI(action){
 const get=id=>document.getElementById(id);
 const desk=get('endgameDesk'),run=get('endgameRun'),status=get('endgameRunStatus');
 const next=get('abyssNext'),weekly=get('endgameWeekly'),personal=get('endgamePersonal');
 const goals=get('endgameGoals'),goalHelp=get('endgameGoalHelp');
 const companion={amber:'アンバー',columbina:'コロンビーナ',wanderer:'放浪者',beidou:'北斗',
  ayaka:'綾華',emilie:'エミリエ',kachina:'カチーナ',mitya:'ミティヤ'};
 const goalLabels={gear:'狙うセットから、より主能力の高い聖遺物を装備する',
  discover:'新しい高難度・隠しエリアへ入るか、隠し入口を発見する',
  boss:'好きなボスを初めて倒すか、自分の最速タイムを更新する'};
 const record=r=>`${(r.bestTicks/60).toFixed(1)}秒・${companion[r.companion]}同行・${r.clears}勝`;
 let previousDesk='';
 for(const [el,mode] of [[get('abyssEntry'),'entry'],[get('abyssElite'),'elite']]){
  el.onclick=()=>{action(`abyss_start:${mode}:${get('abyssSet').value}`);el.blur()};
 }
 return function update(frame){
  const fight=frame.endgameRun;
  run.hidden=!fight;desk.hidden=!frame.endgameDesk||!!frame.growthTrial;
  if(fight){
   next.hidden=fight.kind!=='abyss'||fight.status!=='between';
   const result=fight.status==='clear'?`突破：${fight.reward?`星${fight.stars}・${fight.reward}`:'自己記録を保存しました'}`:
    fight.status==='failed'?'挑戦終了。入口から再挑戦できます。':
    fight.kind==='abyss'?`${fight.mode} ${fight.room}/3・${fight.name} ｜ 残り ${Math.ceil(fight.remaining)}秒・${fight.targets}体`:
     'ファルカの通常模擬戦。突進は進路を空け、低い斬撃は跳んで回避。攻撃後の隙を狙います。';
   if(status.textContent!==result)status.textContent=result;
  }
  if(desk.hidden)return;
  const all=frame.endgame,quest=frame.story.quests['growth-next-goal'];
  const signature=JSON.stringify([frame.endgameDesk,all,quest,frame.progression?.level]);
  if(signature===previousDesk)return;
  previousDesk=signature;
  const graph=frame.storyGraph;
  weekly.replaceChildren(...frame.endgameDesk.weekly.map(boss=>{
   const li=document.createElement('li');
   const entrances=graph.nodes.filter(node=>node.exits.some(edge=>edge.to===boss.node)).map(node=>node.name);
   const route=entrances.length?entrances.join('・')+'から':'入口は探索で確認';
   const best=all?.bosses?.[boss.id];
   li.textContent=`${boss.name} Lv${boss.level} ｜ ${route}${best?` ｜ ${record(best)}`:''}`;
   return li;
  }));
  const results=[];
  for(const [id,name] of [['entry','入門'],['elite','精鋭']]){
   const best=all?.abyss?.[id];
   if(best)results.push(`螺旋${name} 星${best.bestStars}・${record(best)}`);
  }
  if(all?.bosses?.farka)results.push(`幽境ファルカ 通常・${record(all.bosses.farka)}`);
  personal.hidden=results.length===0;
  personal.textContent=results.join(' ／ ');
  goals.hidden=!quest||quest.status!=='active';
  const complete=quest?.count===2;
  goalHelp.textContent=complete?'目標達成。アンバーに報告できます。':all?.goal?`今の目標　${goalLabels[all.goal]}`:'次の目標を一つ選べます。';
  for(const button of goals.querySelectorAll('button'))button.disabled=complete;
 };
}
