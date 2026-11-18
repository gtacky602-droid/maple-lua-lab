return function(C)
 local crawler={}

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function crawler.spawn(b,spec)
  b.exposed,b.pose,b.barrier=false,'idle',spec.barrier
 end
 function crawler.cancel(b,spec) crawler.spawn(b,spec) end

 function crawler.begin(b,spec,move,target)
  b.facing=target.x<b.x and -1 or 1
  local center=move.track and target.x or b.x
  center=math.max(spec.arenaMin+move.halfWidth,math.min(spec.arenaMax-move.halfWidth,center))
  return {move=move,tick=0,left=center-move.halfWidth,right=center+move.halfWidth,
   top=spec.floorY-move.height,seen={},
   source={id=b.id,owner=b,y=spec.floorY,damageElement=move.element}}
 end

 function crawler.tick(s,b,spec,cast)
  cast.tick=cast.tick+1
  local move,t=cast.move,cast.tick
  if t>=move.windup and t<move.windup+move.active then
   C.hitFieldArea(s,cast.source,cast.seen,cast.left,cast.right,cast.top,move.damage)
  elseif t==move.windup+move.active then
   b.exposed,b.pose,b.barrier=true,'open',0
  end
  if t<move.windup+move.active+move.recovery then return false end
  crawler.spawn(b,spec)
  return true
 end

 function crawler.damageFactor(_,_,b,spec) return b.exposed and spec.recoveryFactor or 1 end
 function crawler.label(b) if b.exposed then return '甲殻が開いた・反撃の機会' end end

 function crawler.frame(f,b,_,cast)
  f.exposed,f.pose,f.barrier=b.exposed,b.pose,b.barrier
  if cast and not b.exposed then
   f.lane={left=cast.left,right=cast.right,top=cast.top,at=cast.move.windup,
    active=cast.tick>=cast.move.windup,activeTicks=cast.move.active}
  end
 end

 function crawler.draw(f,s,b,spec,cast,mode,profile)
  if cast and not b.exposed then
   local y=b.y
   local left,right=cast.left-s.camera,cast.right-s.camera
   local active=cast.tick>=cast.move.windup
   rect(f,left,cast.top,right-left,y-cast.top,active and '#baf0ff78' or '#9fe2ff24')
   rect(f,left,y-6,right-left,6,active and '#e2f7ff' or '#8fe3ff')
   for x=left+6,right-9,32 do rect(f,x,cast.top,10,2,'#b7e7fc') end
  end
  local height=b.exposed and spec.openHeight or spec.artHeight
  C.drawIceCrawlerArt(f,b.x-s.camera,b.y,b.pose,height,mode,profile,b.facing>0)
 end
 return crawler
end
