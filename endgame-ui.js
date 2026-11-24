import {initArtifactDomainUI} from './artifact-domain-ui.js';

export function initEndgameUI(action){
 const renderArtifactDomain=initArtifactDomainUI(action);
 const get=id=>document.getElementById(id);
 const desk=get('endgameDesk'),run=get('endgameRun'),status=get('endgameRunStatus');
 const next=get('abyssNext'),weekly=get('endgameWeekly'),personal=get('endgamePersonal');
 const weeklyDesk=get('weeklyDesk'),weeklyDifficulty=get('weeklyDifficulty'),weeklyStart=get('weeklyChallengeStart');
 const weeklyDetails=get('weeklyChallengeDetails'),weeklyRecord=get('weeklyChallengeRecord'),weeklyResult=get('weeklyChallengeResult');
 const goals=get('endgameGoals'),goalHelp=get('endgameGoalHelp');
 const duelDesk=get('stygianDesk'),duelMode=get('stygianMode'),duelStart=get('stygianStart');
 const duelBattle=get('stygianBattle'),duelHp=get('stygianHp');
 const mechanic=get('stygianMechanic'),lamp=get('stygianLamp');
 const lives=get('stygianLives'),life=get('stygianLife'),aid=get('stygianAid');
 let duel,previousDuel='';
 let weeklyChallenge,weeklySignature='';
 const companion={amber:'アンバー',columbina:'コロンビーナ',wanderer:'放浪者',beidou:'北斗',
  ayaka:'綾華',emilie:'エミリエ',kachina:'カチーナ',mitya:'ミティヤ'};
 const goalLabels={gear:'狙うセットから、より主能力の高い聖遺物を装備する',
  discover:'新しい高難度・隠しエリアへ入るか、隠し入口を発見する',
  boss:'好きなボスを初めて倒すか、自分の最速タイムを更新する'};
 const record=r=>`${(r.bestTicks/60).toFixed(1)}秒・${companion[r.companion]}同行・${r.clears}勝`;
 let previousDesk='';
 const amount=value=>value.toLocaleString();
 function updateWeeklySelection(){
  const pick=weeklyChallenge?.modes.find(mode=>mode.id===weeklyDifficulty.value);
  if(!pick)return;
  weeklyStart.disabled=!pick.available;
  const rewards=`勝利 ${amount(pick.xp)} EXP・${amount(pick.mora)}モラ${pick.record?'':` ｜ 初回追加 ${amount(pick.firstXp)} EXP・${amount(pick.firstMora)}モラ`}`;
  const pending=weeklyChallenge.wait>0?` ｜ 再出現まで ${weeklyChallenge.wait}秒`:'';
  weeklyDetails.textContent=`必要Lv${pick.level} ｜ 攻撃ダメージ×${pick.attackFactor} ｜ ${rewards}${pending}`;
  weeklyRecord.hidden=!pick.record;
  weeklyRecord.textContent=pick.record?record(pick.record):'';
 }
 weeklyDifficulty.onchange=updateWeeklySelection;
 weeklyStart.onclick=()=>{
  if(!weeklyChallenge||weeklyStart.disabled)return;
  action(`weekly_start:${weeklyChallenge.id}:${weeklyDifficulty.value}`);
  weeklyStart.blur();
 };
 function updateDuelSelection(){
  const pick=duel?.modes.find(mode=>mode.id===duelMode.value);
  if(!pick)return;
  duelStart.disabled=!pick.available;
  get('stygianReward').textContent=pick.available
   ? `勝利 ${pick.xp.toLocaleString()}EXP・${pick.mora.toLocaleString()}モラ・★${pick.rarity} 聖遺物Lv${pick.itemLevel}${pick.record?'':` ｜ 初回は+${pick.firstXp.toLocaleString()}EXP・+${pick.firstMora.toLocaleString()}モラ`}`
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
  renderArtifactDomain(frame.artifactDomain);
  const entry=frame.weeklyDesk;
  weeklyDesk.hidden=!entry;
  if(entry){
   const changed=weeklyChallenge?.id!==entry.id;
   weeklyChallenge={...entry,wait:Math.ceil(entry.remaining)};
   if(changed){
    get('weeklyChallengeName').textContent=entry.name;
    weeklyDifficulty.replaceChildren(...entry.modes.map(rank=>new Option(rank.name,rank.id)));
    weeklyDifficulty.value=(entry.modes.find(rank=>rank.available)||entry.modes[0]).id;
   }
   const signature=JSON.stringify([entry.id,entry.modes,weeklyChallenge.wait]);
   if(signature!==weeklySignature){
    weeklySignature=signature;
    updateWeeklySelection();
   }
  }else{
   weeklyChallenge=null;
   weeklySignature='';
  }
  const weeklyReward=frame.weeklyBoss?.reward;
  weeklyResult.hidden=!weeklyReward;
  const resultText=weeklyReward?`勝利 ｜ ${amount(weeklyReward.xp)} EXP・${amount(weeklyReward.mora)}モラ${weeklyReward.first?' ｜ 初回追加分を含む':''}`:'';
  if(weeklyResult.textContent!==resultText)weeklyResult.textContent=resultText;
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
   get('stygianDialogue').textContent=fight.targetSlot!==undefined&&fight.phase==='cast'
    ? `攻撃対象　プレイヤー ${fight.targetSlot}${fight.locked?'（確定）':''}`
    : fight.dialogue||fight.chain?.join(' → ')||'';
   const active=fight.status==='fighting';
   const roadProgress=fight.road?.total!==undefined;
   mechanic.hidden=!active||(fight.ward===undefined&&fight.trial===undefined&&fight.found===undefined
    &&!roadProgress&&fight.windMarks===undefined);
   if(!mechanic.hidden){
    mechanic.textContent=fight.trial ? `第${fight.trial}局面 ｜ 光 ${fight.collected} / 3`
     : roadProgress ? `通過 ${fight.road.passed} / ${fight.road.total}`
     : fight.windMarks!==undefined ? `風標 ${fight.windMarks} / ${fight.windGoal}${fight.markTime?` ｜ 残り ${Math.ceil(fight.markTime/60)}秒`:''}`
     : fight.found!==undefined ? `命の影 ${fight.found} / ${fight.goal}${fight.untilTick?` ｜ 残り ${Math.ceil(fight.untilTick/60)}秒`:''}`
     : `結界 ${fight.ward} / 2`;
   }
   lamp.hidden=!active||!fight.lampVisible;
   lamp.disabled=frame.paused;
   lamp.classList.toggle('accent',!!fight.lampReady);
   lives.hidden=fight.life===undefined;
   if(!lives.hidden){
    life.max=fight.maxLife;
    life.value=fight.life;
    get('stygianLifeText').textContent=`命 ${fight.life} / ${fight.maxLife}`;
    get('stygianFuel').textContent=`復活の灯 ${fight.lamps} / ${fight.maxLamps}`;
    aid.hidden=!fight.aidVisible;
    aid.disabled=frame.paused||!fight.aidReady;
    get('stygianAidHint').textContent=fight.aidVisible&&!fight.aidReady&&fight.aidTicks===undefined
     ? '相方のそばで救助できます' : '';
   }
  }
  if(fight){
   next.hidden=fight.kind!=='abyss'||fight.status!=='between';
   const prize=fight.matchReward;
   const result=fight.match?(fight.status==='clear'
    ? (prize?`勝利 ｜ ${prize.xp.toLocaleString()}EXP・${prize.mora.toLocaleString()}モラ・★${prize.rank} ${prize.set}${prize.bag?'':'（拠点で受取）'}`:'勝利 ｜ 個人報酬の対象外')
    :fight.status==='spectate'?'味方の挑戦を観戦しています。'
    :fight.gathering!==undefined?`同じ難度で仲間を待っています ｜ あと${fight.gathering}秒`
    : fight.status==='failed'?(fight.phase==='spectate'?fight.hint
      :fight.remaining===0?'時間切れ。入口から再挑戦できます。':'挑戦終了。入口から再挑戦できます。')
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
