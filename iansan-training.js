const byId=id=>document.getElementById(id);
const seconds=ticks=>(ticks/60).toFixed(1)+'秒';
const hits=count=>count+'回';

export function initIansanTraining(dispatch){
 const run=byId('iansanRun');
 const panel=byId('iansanReview');
 const table=byId('iansanResults');
 const choices=byId('iansanChoices');
 const replay=byId('iansanReplay');
 let rowsKey='',choiceKey='';

 function renderTable(view){
  const key=JSON.stringify([view.baseline,view.retest,view.latest]);
  if(key===rowsKey)return;
  rowsKey=key;
  const attempts=[['初回',view.baseline],['再試行',view.retest],['今回',view.latest]].filter(([,trial])=>trial);
  if(attempts.length>1)table.createCaption().textContent='括弧内は初回との差';
  else table.deleteCaption();
  const head=table.createTHead();
  head.replaceChildren();
  const heading=head.insertRow();
  for(const name of ['計測項目',...attempts.map(([name])=>name)]){
   const cell=document.createElement('th');
   cell.scope='col';
   cell.textContent=name;
   heading.append(cell);
  }
  const body=table.tBodies[0];
  body.replaceChildren();
  const metrics=[
   ['時間',trial=>trial.ticks,seconds],
   ['被弾',trial=>trial.hits,hits],
   ...view.sectors.map((name,i)=>[name+'で停止',trial=>trial.stopped[i],seconds]),
  ];
  for(const [label,get,format] of metrics){
   const row=body.insertRow(),name=document.createElement('th');
   name.scope='row';
   name.textContent=label;
   row.append(name);
   for(const [,trial] of attempts){
    const cell=row.insertCell();
    cell.textContent=format(get(trial));
    if(trial===view.baseline)continue;
    const difference=get(trial)-get(view.baseline);
    const amount=format(Math.abs(difference));
    const sign=amount===format(0)?'±':difference<0?'−':'+';
    const comparison=document.createElement('small');
    comparison.textContent='（'+sign+amount+'）';
    cell.append(comparison);
   }
  }
 }

 return view=>{
  run.hidden=!view?.running;
  panel.hidden=!view?.panel;
  if(!view?.panel&&panel.contains(document.activeElement))document.activeElement.blur();
  if(view?.running){
   const status=`${seconds(view.ticks)} ｜ 被弾 ${view.hits}回 ｜ ${view.marker?'印 通過済み':'上段の印へ'} ｜ 残りの的 ${view.remaining}`;
   if(run.textContent!==status)run.textContent=status;
  }
  if(!view?.panel)return;
  renderTable(view);
  const hint=byId('iansanInsight');
  const focus=view.focusLabel?`意識したこと　${view.focusLabel}`:'';
  const suggestion=view.options?view.suggestion.advice:focus;
  if(hint.textContent!==suggestion)hint.textContent=suggestion;
  const key=JSON.stringify(view.options??null);
  if(choiceKey!==key){
   choiceKey=key;
   choices.replaceChildren(...(view.options??[]).map(option=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=option.label;
    button.dataset.focus=option.id;
    button.classList.toggle('selected',option.id===view.suggestion.id);
    button.onclick=()=>dispatch('story_iansan_focus:'+option.id);
    return button;
   }));
  }
  choices.querySelectorAll('button').forEach(button=>{button.disabled=view.paused});
  replay.hidden=!view.replay;
  replay.disabled=view.paused;
 };
}
