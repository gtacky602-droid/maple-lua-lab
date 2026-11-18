const rehearsalTitle=document.getElementById('rehearsalTitle');
const rehearsalPanel=document.getElementById('furinaRehearsal');
const rehearsalCaption=document.getElementById('rehearsalCaption');
const rehearsalButtons=[...rehearsalPanel.querySelectorAll('[data-rehearsal-cue]')];

export function updateFurinaRehearsal(view){
 rehearsalPanel.hidden=!view?.open;
 if(!view?.open)return;
 const title=view.round===1?'一つずつ動かす稽古':'一拍置く稽古';
 if(rehearsalTitle.textContent!==title)rehearsalTitle.textContent=title;
 if(rehearsalCaption.textContent!==view.message)rehearsalCaption.textContent=view.message;
 for(const button of rehearsalButtons){
  const cue=button.dataset.rehearsalCue;
  button.hidden=view.round===1?cue==='pair':cue==='curtain'||cue==='lamp';
  button.disabled=view.paused||view.cue!==cue;
  button.classList.toggle('active-cue',view.ready&&view.cue===cue);
 }
}
