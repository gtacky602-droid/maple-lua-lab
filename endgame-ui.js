import {initArtifactDomainUI} from './artifact-domain-ui.js';

const raidenSlashResults={protected:'花蕊で大太刀を防いだ',hit:'大太刀が命中',unharmed:'大太刀の被ダメージなし'};

export function raidenFlowerText(flower,move){
 if(flower.slashResult)return raidenSlashResults[flower.slashResult];
 if(flower.protected)return flower.inside?'保護域内 ｜ 大太刀を防げる':'保護域外 ｜ 円の内側へ';
 if(move==='WR15')return '保護域なし ｜ 大太刀に備える';
 if(flower.ready)return `通常攻撃で充填 ${flower.value} / ${flower.max} ｜ 残り${Math.ceil(flower.limit/60)}秒`;
 return flower.limit?'花蕊が現れるまで待つ':'充填受付終了';
}

const narwhalForms={WV12:'獣の突進','WV12.vishap':'竜の跳躍','WV12.jellyfish':'クラゲの水弾'};

export function narwhalJourneyText(journey,stage){
 const v=journey;
 if(v.kernelStagger)return `核を中断 ｜ 幻影に${v.kernelStagger.loss}ダメージ・残り${Math.ceil(v.kernelStagger.ticks/60)}秒`;
 if(v.incoming)return `核の受付終了 ｜ ${narwhalForms[v.incoming]}`;
 if(v.exposure)return `反撃できる時間 残り${Math.ceil(v.exposure/60)}秒`;
 if(v.returnLoss!==undefined)return `星海へ帰還 ｜ 鯨に${v.returnLoss}ダメージ`;
 if(stage==='swallow')return '腹中へ移動中';
 if(stage==='expel')return '星海へ帰還中';
 if(v.scene==='inner')return '幻影を倒すと星海へ帰還';
 if(v.low)return '鯨が衰弱。以後は星海で戦う';
 return v.queued?'現在の技の後に腹中へ':'';
}

const primalObjectNames={gate:'障壁',bud:'芽',pillar:'柱'};
const primalTrialNames={WG05:'障壁',WG06:'擬態芽',WG14:'柱',WG16:'障壁'};

export function primalTrialText(primal){
 const {cuts,objects,closing,tick,trial,exposure,exposureOpensIn,cutAt,largeOrbWarning}=primal;
 const parts=[`足場 ${10-cuts}/10`];
 const targets=Array.isArray(objects)?objects:[];
 if(targets.length){
  parts.push(targets.map((o,i)=>`${primalObjectNames[o.kind]}${targets.length>1?i+1:''} ${o.units}/${o.max}`).join(' ｜ '),
   `残り ${Math.ceil((closing-tick)/60)}秒`);
 }else{
  const name=primalTrialNames[trial?.card];
  if(trial?.outcome==='expired')parts.push(`${name}の受付終了`);
  if(trial?.outcome==='broken'&&(exposureOpensIn||exposure))parts.push(`${name}を破壊`);
  if(exposureOpensIn)parts.push('反撃までもうすぐ');
  else if(exposure)parts.push(`反撃できる時間 ${(exposure/60).toFixed(1)}秒`);
  else if(trial?.outcome==='broken')parts.push('反撃終了');
 }
 if(largeOrbWarning)parts.push('大玉に注意');
 if(cutAt&&tick<cutAt)parts.push('左端が崩れます。白線より右へ');
 return parts.join(' ｜ ');
}

export function falseMoonEncounterText(v){
 const votes=v.vote?` ｜ 同意 ${v.vote.count} / ${v.vote.required}`:'';
 const r=v.rule;
 if(r){
  const law=r.kind==='away'?`博士に背を向ける（${r.away==='left'?'左':'右'}向き）`:'移動・回避・ジャンプを止める';
  if(v.tick<420)return `${r.state==='rule'?'判定中':'準備'} ｜ ${law} ｜ ${Math.ceil(r.remaining/60)}秒${r.violated?' ｜ 違反':''}`;
  return r.violated?'判定終了 ｜ 罰の予告から離れる':'禁令をクリア';
 }
 if(v.card==='WM08'){
  if(v.wardResult){
   if(v.wardResult.protected)return '柱で衝撃を防いだ';
   return v.wardResult.damage?`衝撃が命中 ｜ ${v.wardResult.damage}ダメージ`:'衝撃の被ダメージなし';
  }
  return v.cover?'保護範囲の内側':'柱の青い枠の中へ';
 }
 if(v.confirm)return `異界へ移るまで ${(v.confirm/60).toFixed(1)}秒${votes}`;
 if(v.card==='WM13'){
  if(v.riftRemaining===undefined)return '盤面中央に裂け目が開く';
  if(!v.riftRemaining)return '裂け目の受付終了';
  return `中央の裂け目で入場を確認 ｜ 残り ${Math.ceil(v.riftRemaining/60)}秒${votes}`;
 }
 if(v.card==='WM14')return '異界へ移動中'+votes;
 if(v.card==='WM15')return `倒した擬影 ${v.pendingDamage} / 3 ｜ 残り ${v.seconds}秒 ｜ 右端から帰還可${votes}`;
 if(v.card==='WM16'){
  const loss=v.returnLoss>0?`博士に${v.returnLoss}ダメージ`:v.returnLoss===0?'擬影による損傷なし':'';
  const phase=v.exposure?`反撃できる時間 ${(v.exposure/60).toFixed(1)}秒`:
   v.exposureEnded?'反撃終了':v.scene==='outer'?'外界へ帰還':'外界へ帰還中';
  return [loss,phase].filter(Boolean).join(' ｜ ');
 }
 return '';
}

export function gateEncounterText(gate){
 const target=gate.run?.member?(gate.run.mine?' ｜ あなたが誘導':` ｜ 誘導：旅人 ${gate.run.member}`):'';
 if(gate.card==='WT03')return `ポーン ${gate.shield} / 3 ｜ ポーンの向こう側へ突進を誘導${target}`;
 if(gate.card==='WT05')return `雷障壁 ${gate.shield} / ${gate.maxShield} ｜ 通常攻撃でも削れる`;
 if(gate.exposure)return `${gate.lureCollision?'津波を中断 ｜ ':''}反撃できる時間 ${(gate.exposure/60).toFixed(1)}秒`;
 if(gate.lureCollision)return gate.exposureEnded?'反撃終了':'クイーンに突進が命中 ｜ 津波を中断';
 if(gate.transfer)return `HP譲渡まで ${(gate.transfer/60).toFixed(1)}秒 ｜ 残り ${gate.revives}回`;
 if(gate.tsunami)return gate.tsunamiDamage?`津波が命中 ｜ ${gate.tsunamiDamage}ダメージ`:'津波が発生';
 if(gate.run&&gate.lure){
  const phase=gate.run.goal?'走路固定。ジャンプでかわす':
   gate.lureMissed?'突進が外れた。クイーンの向こう側へ再誘導':'凍結完了 ｜ クイーンの向こう側へ';
  return phase+target;
 }
 if(gate.canFrost){
  const remaining=Math.ceil((gate.freezeBy-gate.tick+1)/60);
  const owner=gate.frostOwner&&gate.hold===undefined?` ｜ 旅人 ${gate.frostOwner}が霜印を使用中`:'';
  return `凍結 ${gate.freeze} / 100 ｜ 霜印は盤の両端 ｜ 残り ${remaining}秒${owner}`;
 }
 if(gate.deadline){
  const remaining=Math.max(0,Math.ceil((gate.deadline-gate.tick)/60));
  return gate.card==='WT17'?`${gate.lureMissed?'誘導失敗':'凍結の受付終了'} ｜ 津波まで ${remaining}秒`:
   `決着まで ${remaining}秒`;
 }
 if(gate.transferResult){
  const king=gate.transferResult.to==='king';
  return `${king?'クイーンからキングへ':'キングからクイーンへ'} ${gate.transferResult.amount} HP ｜ 残り ${gate.revives}回`;
 }
 return '';
}

export function hereticChantText(v){
 if(v.deadline){
  const remaining=`残り ${Math.max(0,Math.ceil((v.deadline-v.tick)/60))}秒`;
  if(v.open)return `結合点を破壊 ｜ 詠唱 ${v.chant} / ${v.maxChant} ｜ 本体へ攻撃 ｜ ${remaining}`;
  const anchors=Array.isArray(v.anchors)?v.anchors.map(a=>a.hp).join(' / '):'';
  const gap=v.hole?` ｜ 押し壁の穴は${v.hole.upper?'上段':'床側'}`:'';
  return anchors?`結合点 左・右 ${anchors} ｜ 片方を壊す ｜ ${remaining}${gap}`:`結合点が現れる ｜ ${remaining}`;
 }
 if(v.card==='WH10')return '光背を構築中';
 if(v.card==='WH19'){
  if(v.exposure)return `詠唱を中断 ｜ 反撃できる時間 ${(v.exposure/60).toFixed(1)}秒`;
  return v.exposureEnded?'反撃終了':'詠唱を中断 ｜ 反撃までもうすぐ';
 }
 if(v.card==='WH18'){
  if(v.failureDamage>0)return `腐敗の衝撃が命中 ｜ ${v.failureDamage}ダメージ`;
  if(v.failureDamage===0)return '腐敗の衝撃の被ダメージなし';
  const remaining=v.trialResult?.anchorsBroken?`詠唱残り ${v.trialResult.remainingChant}`:'結合点が残った';
  return `期限切れ ｜ ${remaining} ｜ 衝撃に備える`;
 }
 return '';
}

export function initEndgameUI(action){
 const renderArtifactDomain=initArtifactDomainUI(action);
 const get=id=>document.getElementById(id);
 const desk=get('endgameDesk'),run=get('endgameRun'),status=get('endgameRunStatus');
 const next=get('abyssNext'),weekly=get('endgameWeekly'),personal=get('endgamePersonal');
 const abyssButtons={entry:get('abyssEntry'),elite:get('abyssElite'),upper:get('abyssUpper')};
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
 const hpLabel=pick=>`HP ${amount(pick.hp)}${pick.draftHp?'（比較版）':''}`;
 function updateWeeklySelection(){
  const pick=weeklyChallenge?.modes.find(mode=>mode.id===weeklyDifficulty.value);
  if(!pick)return;
  weeklyStart.disabled=!pick.available;
  const rewards=`勝利 ${amount(pick.xp)} EXP・${amount(pick.mora)}モラ${pick.record?'':` ｜ 初回追加 ${amount(pick.firstXp)} EXP・${amount(pick.firstMora)}モラ`}`;
  const pending=weeklyChallenge.wait>0?` ｜ 再出現まで ${weeklyChallenge.wait}秒`:'';
  weeklyDetails.textContent=`必要Lv${pick.level} ｜ ${hpLabel(pick)} ｜ 攻撃ダメージ×${pick.attackFactor} ｜ ${rewards}${pending}`;
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
  const hp=pick.secondHp?`第一幕 ${hpLabel(pick)}・第二幕 HP ${amount(pick.secondHp)}`:hpLabel(pick);
  get('stygianReward').textContent=pick.available
   ? `${hp} ｜ 勝利 ${amount(pick.xp)}EXP・${amount(pick.mora)}モラ・★${pick.rarity} 聖遺物Lv${pick.itemLevel}${pick.record?'':` ｜ 初回は+${amount(pick.firstXp)}EXP・+${amount(pick.firstMora)}モラ`}`
   : `Lv${pick.level}で挑戦できます ｜ ${hp}`;
  const history=get('stygianRecord');
  history.hidden=!pick.record;
  const skill=pick.record?.mainSkill;
  const primary=({normal:'通常攻撃',support:'ギミック支援'})[skill]||skill;
  if(pick.record)history.textContent=`自己記録 ${record(pick.record)} ｜ 主力 ${primary}`;
 }
 duelMode.onchange=updateDuelSelection;
 duelStart.onclick=()=>{
  if(!duel||duelStart.disabled)return;
  action(`stygian_start:${duel.id}:${duelMode.value}:${get('stygianSet').value}`);
  duelStart.blur();
 };

 for(const [mode,el] of Object.entries(abyssButtons)){
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
    fight.kind==='abyss'?`${fight.mode} ${fight.room}/${fight.roomCount}・${fight.name} ｜ 残り ${Math.ceil(fight.remaining)}秒・${fight.targets}体${fight.armored?' ｜ 装甲のある精鋭には元素攻撃':''}`:
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
  for(const [id,button] of Object.entries(abyssButtons)){
   const mode=frame.endgameDesk.abyss[id];
   button.hidden=!mode;
   if(!mode)continue;
   button.disabled=!mode.available;
   button.textContent=`深境螺旋・${mode.name}${mode.draft?'（比較版）':''}${mode.soloBlock?'・ソロ専用':mode.level&&!mode.available?`・Lv${mode.level}〜`:''}`;
   const best=all?.abyss?.[id];
   if(best)results.push(`螺旋${mode.name} 星${best.bestStars}・${record(best)}`);
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
