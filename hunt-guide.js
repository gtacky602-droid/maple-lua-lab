const names={'hilichurl':'ヒルチャール','hydro-slime':'水スライム','cryo-slime':'氷スライム','pyro-slime':'炎スライム','nobushi':'野伏','ruin-guard':'遺跡守衛','treasure-scout':'宝盗団・斥候'};

export function fieldGuide(frame,quest,pointId){
 const selected=pointId&&frame.storyWorksites?.[quest]?.find(point=>point.point===pointId);
 if(selected)return selected.node===frame.story.node?selected:undefined;
 return frame.storyHunts?.[quest];
}

export function huntHint(target,actor){
 if(!target)return '';
 if(target.wait!=null)return `狩場の対象は再出現待ち（あと約${target.wait}秒）`;
 const name=target.name||names[target.art]||'狩場の敵';
 const label=target.action?`${name}　${target.action}`:`討伐対象　${name}`;
 if(!actor)return label;
 const dx=target.x-actor.x,dy=target.y-actor.y;
 const aligned=Math.abs(dx)<(target.inspection?54:58);
 const level=Math.abs(dy)<(target.inspection?34:45);
 if(target.inspection&&aligned&&!level){
  const vertical=target.underwater?(dy<0?'上へ泳ぐ':'下へ潜る'):(dy<0?'今いる足場の上':'今いる足場の下');
  return `${label}（${vertical}）`;
 }
 const side=aligned?'すぐ近く':dx>0?'右手':'左手';
 const height=level?'':target.underwater?(dy<0?'・浅い方':'・深い方'):(dy<0?'・上段':'・下段');
 return `${label}（${side}${height}）`;
}

// Two small brackets at the live target's feet keep its face and attack pose visible.
export function drawHuntMarker(ctx,frame,quest,pointId){
 const target=fieldGuide(frame,quest,pointId);
 if(!(target?.spawn||target?.action) || frame.worldMap)return 0;
 const x=Math.round(target.x-frame.camera),y=Math.round(target.y);
 if(x<-10||x>ctx.canvas.width+10||y<0||y>=ctx.canvas.height)return 0;
 ctx.save();ctx.fillStyle=target.action?'#ffe081':'#81ffe0';
 ctx.fillRect(x-11,y-3,2,5);ctx.fillRect(x-11,y+2,7,2);
 ctx.fillRect(x+9,y-3,2,5);ctx.fillRect(x+4,y+2,7,2);ctx.restore();
 return 4;
}
