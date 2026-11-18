export function initEndgameUI(action){
 const get=id=>document.getElementById(id);
 const desk=get('endgameDesk'),run=get('endgameRun'),status=get('endgameRunStatus');
 const next=get('abyssNext'),weekly=get('endgameWeekly'),personal=get('endgamePersonal');
 const goals=get('endgameGoals'),goalHelp=get('endgameGoalHelp');
 const duelDesk=get('stygianDesk'),duelMode=get('stygianMode'),duelStart=get('stygianStart');
 const duelBattle=get('stygianBattle'),duelHp=get('stygianHp');
 const mechanic=get('stygianMechanic'),lamp=get('stygianLamp');
 let duel,previousDuel='';
 const companion={amber:'アンバー',columbina:'コロンビーナ',wanderer:'放浪者',beidou:'北斗',
  ayaka:'綾華',emilie:'エミリエ',kachina:'カチーナ',mitya:'ミティヤ'};
 const goalLabels={gear:'狙うセットから、より主能力の高い聖遺物を装備する',
  discover:'新しい高難度・隠しエリアへ入るか、隠し入口を発見する',
  boss:'好きなボスを初めて倒すか、自分の最速タイムを更新する'};
 const record=r=>`${(r.bestTicks/60).toFixed(1)}秒・${companion[r.companion]}同行・${r.clears}勝`;
 let previousDesk='';
 function updateDuelSelection(){
  const pick=duel?.modes.find(mode=>mode.id===duelMode.value);
  if(!pick)return;
  duelStart.disabled=!pick.available;
  get('stygianReward').textContent=pick.available
   ? `勝利 ${pick.mora.toLocaleString()}モラ・★${pick.rarity} 聖遺物Lv${pick.itemLevel}${pick.record?'':` ｜ 初回は+${pick.firstMora.toLocaleString()}モラ`}`
   : `Lv${pick.level}で挑戦できます`;
  const history=get('stygianRecord');
  history.hidden=!pick.record;
  const primary=pick.record?.mainSkill==='normal'?'通常攻撃':pick.record?.mainSkill;
  if(pick.record)history.textContent=`自己記録 ${record(pick.record)} ｜ 主力 ${primary}`;
 }
 duelMode.onchange=updateDuelSelection;
 duelStart.onclick=()=>{
  if(!duel||duelStart.disabled)return;
  action(`stygian_start:${duel.id}:${duelMode.value}:${get('stygianSet').value}`);
  duelStart.blur();
 };

 for(const [el,mode] of [[get('abyssEntry'),'entry'],[get('abyssElite'),'elite']]){
  el.onclick=()=>{action(`abyss_start:${mode}:${get('abyssSet').value}`);el.blur()};
 }
 return function update(frame){
  const fight=frame.endgameRun;
  run.hidden=!fight;desk.hidden=!frame.endgameDesk||!!frame.growthTrial;
  duel=frame.stygianDesk;
  duelDesk.hidden=!duel||!!frame.growthTrial;
  if(!duelDesk.hidden){
   const signature=JSON.stringify(duel);
   if(signature!==previousDuel){
    const before=duelMode.value;
    get('stygianName').textContent=duel.name;
    duelMode.replaceChildren(...duel.modes.map(mode=>new Option(`${mode.name} Lv${mode.level}〜`,mode.id)));
    if(duel.modes.some(mode=>mode.id===before))duelMode.value=before;
    previousDuel=signature;
    updateDuelSelection();
   }
  }
  duelBattle.hidden=!fight?.match;
  if(fight?.match){
   const health=frame.boss;
   duelHp.max=health.maxhp;
   duelHp.value=health.hp;
   get('stygianHealth').textContent=`${fight.mode}${fight.stageName?` ｜ ${fight.stageName}`:''} ｜ HP ${health.hp} / ${health.maxhp}`;
   get('stygianClock').textContent=fight.status==='fighting'
    ? (fight.remaining!==undefined?`残り ${Math.ceil(fight.remaining)}秒`:'') : fight.elapsed?`${fight.elapsed.toFixed(1)}秒`:'';
   get('stygianDialogue').textContent=fight.dialogue||fight.chain?.join(' → ')||'';
   const active=fight.status==='fighting';
   mechanic.hidden=!active||(fight.ward===undefined&&fight.trial===undefined);
   if(!mechanic.hidden){
    mechanic.textContent=fight.trial ? `第${fight.trial}局面 ｜ 光 ${fight.collected} / 3` : `結界 ${fight.ward} / 2`;
   }
   lamp.hidden=!active||!fight.lampVisible;
   lamp.disabled=frame.paused;
   lamp.classList.toggle('accent',!!fight.lampReady);
  }
  if(fight){
   next.hidden=fight.kind!=='abyss'||fight.status!=='between';
   const prize=fight.matchReward;
   const result=fight.match?(fight.status==='clear'
    ? `勝利 ｜ ${prize.mora.toLocaleString()}モラ・★${prize.rank} ${prize.set}${prize.bag?'':'（広場で受取）'}`
    : fight.status==='failed'?(fight.remaining===0?'時間切れ。入口から再挑戦できます。':'挑戦終了。入口から再挑戦できます。')
    :fight.hint)
    :fight.status==='clear'?`突破：${fight.reward?`星${fight.stars}・${fight.reward}`:'自己記録を保存しました'}`:
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
