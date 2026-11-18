export function initSurveyMap(){
 const panel=document.getElementById('surveyMap');
 const caption=document.getElementById('surveyMapCaption');
 const canvas=document.getElementById('surveyMapCanvas'),ctx=canvas.getContext('2d');
 let displayed;
 return function update(map){
  panel.hidden=!map;
  if(map?.id===displayed)return;
  displayed=map?.id;
  if(!map)return;
  caption.textContent=map.caption;
  ctx.fillStyle='#203d3a';ctx.fillRect(0,0,420,132);
  ctx.strokeStyle='#55746e';ctx.lineWidth=1;
  for(const y of [32,62,93,117]){
   ctx.beginPath();ctx.moveTo(18,y);ctx.lineTo(401,y);ctx.stroke();
  }
  for(const route of map.routes){
   ctx.strokeStyle=route.color;ctx.lineWidth=3;
   ctx.beginPath();
   route.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
   ctx.stroke();
  }
  ctx.textAlign='center';ctx.font="14px 'Yu Gothic UI', sans-serif";
  for(const mark of map.marks){
   ctx.fillStyle='#f6e8b9';ctx.fillRect(mark.x-3,mark.y-3,6,6);
   ctx.fillStyle='#fff8d6';ctx.fillText(mark.name,mark.x,mark.y+(mark.below?18:-8));
  }
 }
}
