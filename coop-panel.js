export function initCoopPanel(queueAction){
 const create=document.getElementById('coopCreate');
 const join=document.getElementById('coopJoin');
 const leave=document.getElementById('coopLeave');
 const code=document.getElementById('coopCode');
 const setup=document.getElementById('coopSetup');
 const state=document.getElementById('coopState');
 const status=document.getElementById('coopStatus');
 const pause=document.getElementById('pause');
 let view=null;
 function updateJoin(){
  join.disabled=!view?.eligible||!/^[0-9A-F]{8}$/.test(code.value.trim().toUpperCase());
 }
 code.addEventListener('input',updateJoin);
 setup.addEventListener('submit',event=>{
  event.preventDefault();
  if(join.disabled)return;
  queueAction('coop_join:'+code.value.trim().toUpperCase());
  code.blur();
 });
 create.addEventListener('click',()=>{
  queueAction('coop_create');
  create.blur();
 });
 leave.addEventListener('click',()=>{
  queueAction('coop_leave');
  leave.blur();
 });
 return frame=>{
  view=frame.coop;
  const inRoom=Boolean(view?.code);
  setup.hidden=!view||inRoom;
  leave.hidden=!inRoom;
  create.disabled=!view?.eligible;
  updateJoin();
  pause.disabled=inRoom;
  pause.title=inRoom?'協力中は戦闘が進み続けます。':'';
  if(inRoom){
   const online=view.peers.filter(peer=>peer.online).length+1;
   state.textContent=`合言葉 ${view.code}　参加中 ${online} / ${view.capacity}人`;
  }else if(view){
   state.textContent=view.eligible?'部屋を作るか、相手の合言葉で参加できます。':
    `通常の冒険で「${view.sites.join('・')}」まで移動してください。`;
  }
  if(status.textContent!==(view?.notice||''))status.textContent=view?.notice||'';
 };
}
