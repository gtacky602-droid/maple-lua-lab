export function initSpringCourse(dispatch){
 const info=document.getElementById('springCourseStatus');
 const runControls=document.getElementById('springRunControls');
 const panel=document.getElementById('springLayout');
 const form=document.getElementById('springSlots');
 const sampleResult=document.getElementById('springSampleResult');
 const save=document.getElementById('springLayoutSave');
 const fields=new Map();
 const time=ticks=>(ticks/60).toFixed(1)+'秒';
 return view=>{
  if(!view)info.hidden=true;
  panel.hidden=!view?.panel;
  if(!view?.panel&&panel.contains(document.activeElement))document.activeElement.blur();
  const active=!!view&&view.phase!=='idle';
  runControls.hidden=!active;
  document.getElementById('springMove').hidden=view?.phase!=='lap';
  if(!view)return;
  const result=view.result;
  const message=view.phase==='sample'?'ジャンプで、踏み台の高さを測る':
   view.phase==='lap'?(view.section<=3?`踏み台 ${view.section} / 3　｜　踏み台の上でジャンプ`:'三か所通過。右の旗へ'):
   result?.kind==='lap'?`今回 ${time(result.ticks)}　｜　この配置の最速 ${time(result.best)}`:
   view.best?`この配置の最速 ${time(view.best)}`:
   result?.kind==='sample'?`今回の跳ね上がり 約 ${result.rise} px`:'';
  info.hidden=!active&&!message;
  const status=document.getElementById('springCourseText');
  if(status.textContent!==message)status.textContent=message;
  if(!view.panel)return;
  const sampleText=`試走時の高さ　高い型 約 ${view.samples.high} px ／ 低い型 約 ${view.samples.low} px`;
  if(sampleResult.textContent!==sampleText)sampleResult.textContent=sampleText;
  for(const section of view.sections){
   let input=fields.get(section.id);
   if(!input){
    const row=document.createElement('div');
    const label=document.createElement('label');
    input=document.createElement('select');
    input.id='springSlot-'+section.id;
    label.htmlFor=input.id;
    label.textContent=section.label;
    input.replaceChildren(new Option('型を選ぶ',''),new Option('高い型','high'),new Option('低い型','low'));
    input.options[0].disabled=true;
    input.onchange=()=>dispatch(`story_spring_pick:${section.id}:${input.value}`);
    const hint=document.createElement('p');
    hint.id=input.id+'Hint';
    hint.textContent=section.hint;
    input.setAttribute('aria-describedby',hint.id);
    row.append(label,input,hint);
    form.append(row);
    fields.set(section.id,input);
   }
   input.value=view.layout?.[section.id]??'';
   input.disabled=view.paused;
  }
  save.disabled=!view.ready||view.paused;
 };
}
