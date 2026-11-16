// Explicit apply keeps unfinished coordinate input out of the placement draft.
export function setupPlacementPosition({getNode,getSelected,commit,report}){
 const controls=document.createElement('div');controls.className='controls';
 controls.innerHTML='<label>横位置（px） <input id="placementX" type="number" min="0" step="any" disabled></label><label>足場 <select id="placementPlatform" disabled></select></label><button id="applyPlacementPosition" disabled>指定位置へ移動</button>';
 document.getElementById('selectionStatus').closest('.controls').after(controls);
 const x=controls.querySelector('input'),platform=controls.querySelector('select'),apply=controls.querySelector('button');
 let signature='';
 apply.onclick=()=>{
  const n=getNode(),e=getSelected();if(!e)return;
  const value=x.value.trim()===''?NaN:Number(x.value),support=n.platforms[Number(platform.value)];
  if(!Number.isFinite(value)||!support||platform.value===''||value<0||value>n.width||value<support.x||value>support.x+support.w){report('指定位置へ移動できません。選んだ足場の範囲内の横位置を入力してください。配置案は変更していません。');return}
  if(e.x===value&&e.y===support.y){report('同じ位置です。配置案は変わりません。');return}
  commit(e,value,support.y);report('指定位置へ移動しました。絵・向き・IDは保持しています。取り消しで戻せます。');
 };
 return {update(){
  const n=getNode(),e=getSelected(),next=JSON.stringify([n.id,n.platforms,e?.id,e?.x,e?.y]);
  for(const control of [x,platform,apply])control.disabled=!e;
  if(next===signature)return;signature=next;
  platform.replaceChildren(...n.platforms.map((p,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${i+1}：高さ${p.y}px ／ 横${Math.max(0,p.x)}〜${Math.min(n.width,p.x+p.w)}px`;return option}));
  x.max=n.width;x.value=e?String(e.x):'';platform.value=e?String(n.platforms.findIndex(p=>p.y===e.y&&e.x>=p.x&&e.x<=p.x+p.w)):'';
 }};
}
