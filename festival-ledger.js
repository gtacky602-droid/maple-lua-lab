export function initFestivalLedger(dispatch){
 const panel=document.getElementById('festivalLedger'),list=panel.querySelector('dl');
 let previous;
 return function update(rows){
  panel.hidden=!rows;
  const key=rows&&JSON.stringify(rows);
  if(key===previous)return;
  previous=key;
  list.replaceChildren();
  for(const row of rows??[]){
   const term=document.createElement('dt'),detail=document.createElement('dd'),button=document.createElement('button');
   button.type='button';button.textContent=row.name;button.title='地図で場所を見る';
   button.onclick=()=>dispatch('world_map_focus:'+row.node);
   term.append(button);detail.textContent=row.detail;
   list.append(term,detail);
  }
 };
}
