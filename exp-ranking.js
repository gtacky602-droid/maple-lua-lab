export function initExpRanking(startAdventure){
 const panel=document.getElementById('expRanking');
 const scope=document.getElementById('expRankingScope');
 const adventure=document.getElementById('expRankingAdventure');
 const player=document.getElementById('expRankingPlayer');
 const rows=document.getElementById('expRankingRows');
 const status=document.getElementById('expRankingStatus');
 const week=document.getElementById('expRankingWeek');
 const refresh=document.getElementById('refreshExpRanking');
 const start=document.getElementById('startRankedAdventure');
 const number=new Intl.NumberFormat('ja-JP');
 let board=null,ranked=null,pending=false,refreshAgain=false;

 function render(){
  week.hidden=scope.value!=='weekly'||!board;
  week.textContent=board?`集計週の開始日 ${board.weekStart}（月曜 04:00 日本時間）`:'';
  if(!board)return;
  const selected=board[scope.value];
  rows.replaceChildren(...selected.entries.map(({name,score,place,own})=>{
   const row=document.createElement('tr');
   if(own)row.className='my-exp-rank';
   for(const label of [place,own?`${name}（あなた）`:name,number.format(score)]){
    const cell=document.createElement('td');
    cell.textContent=label;
    row.append(cell);
   }
   return row;
  }));
  const record=selected.own;
  player.textContent=record?`あなたの順位 ${record.place}位・${number.format(record.score)} EXP`:
   board.player?`${board.player}｜記録がありません`:'ランキング対象の冒険を始めると参加できます。';
 }

 async function load(){
  if(pending){
   refreshAgain=true;
   return;
  }
  pending=true;
  refresh.disabled=true;
  status.textContent='ランキングを読み込み中…';
  try{
   const response=await fetch('/api/exp-ranking');
   if(!response.ok)throw Error();
   board=await response.json();
   render();
   status.textContent=board[scope.value].entries.length?'ランキングを更新しました。':'この期間の記録はまだありません。';
  }catch{
   status.textContent='ランキングを読み込めません。もう一度更新してください。';
  }finally{
   pending=false;
   refresh.disabled=false;
   if(refreshAgain){
    refreshAgain=false;
    void load();
   }
  }
 }

 refresh.addEventListener('click',load);
 panel.addEventListener('toggle',()=>{if(panel.open)load()});
 scope.addEventListener('change',()=>{
  render();
  if(board)status.textContent=board[scope.value].entries.length?'':'この期間の記録はまだありません。';
 });
 start.addEventListener('click',()=>{
  if(!startAdventure())return;
  start.disabled=true;
  status.textContent='ランキング対象の冒険を開始しています…';
 });
 return (frame,started=false)=>{
  if(started){
   start.disabled=false;
   if(!frame||!frame.rankedAdventure){
    status.textContent='ランキング対象の冒険を開始できませんでした。';
    return;
   }
  }
  const next=Boolean(frame.rankedAdventure);
  if(next===ranked&&!started)return;
  adventure.textContent=next?'ランキング対象の冒険です。':'通常の冒険です。';
  if(panel.open)load();
  ranked=next;
 };
}
