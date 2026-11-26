export function initRockView(panel=document.getElementById('rockView'),caption=document.getElementById('rockViewCaption'),canvas=document.getElementById('rockViewCanvas')){
 const ctx=canvas.getContext('2d');
 let displayed;
 return function update(view){
  panel.hidden=!view;
  if(view?.id===displayed)return;
  displayed=view?.id;
  if(!view)return;
  caption.textContent=`${view.name}　${view.line}`;
  ctx.fillStyle='#f8d7a2';ctx.fillRect(0,0,340,108);
  ctx.fillStyle='#94c8cc';ctx.fillRect(0,72,340,36);
  ctx.fillStyle='#668e9c';ctx.fillRect(0,101,340,7);
  for(const rock of view.rocks){
   const left=Math.round(170+rock.left*1.55),right=Math.round(170+rock.right*1.55);
   const top=101-rock.height;
   ctx.fillStyle=rock.color;ctx.beginPath();
   ctx.moveTo(left,101);
   if(rock.shape==='fin'){
    ctx.lineTo(left+7,top+31);ctx.lineTo(right-12,top);ctx.lineTo(right,top+9);
   }else{
    ctx.lineTo(left+3,top+29);ctx.lineTo(left+15,top+12);ctx.lineTo(left+20,top);
    ctx.lineTo(right-18,top+3);ctx.lineTo(right-9,top+17);ctx.lineTo(right-3,top+21);
   }
   ctx.lineTo(right,101);ctx.closePath();ctx.fill();
  }
 }
}
