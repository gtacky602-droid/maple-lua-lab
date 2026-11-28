return function(C)
 local antler={}
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function antler.spawn(b) b.pose,b.recovering='idle',false end
 function antler.cancel(b) antler.spawn(b) end
 function antler.shareCast(cast,actors) C.shareFieldHits({cast.seen},actors) end
 function antler.damageFactor(_,_,b,spec)
  return b.recovering and spec.recoveryFactor or 1
 end

 function antler.begin(b,spec,m,target)
  b.facing=target.x<b.x and -1 or 1
  local origin=b.x
  local destination=math.max(spec.arenaMin+80,math.min(spec.arenaMax-80,origin+b.facing*(m.travel or 0)))
  local forward=origin+b.facing*(m.forward or 0)
  return {move=m,tick=0,seen={},origin=origin,destination=destination,
   left=math.min(origin,destination,forward)-m.radius,right=math.max(origin,destination,forward)+m.radius,
   source={id=b.id,owner=b,x=origin,y=spec.floorY,damageElement=m.element}}
 end

 function antler.tick(state,b,spec,cast)
  local m=cast.move
  cast.tick=cast.tick+1
  if cast.tick<m.windup then
   b.pose=m.pose
  elseif cast.tick<m.windup+m.activeTicks then
   local left,right=cast.left,cast.right
   if m.travel then
    local previous=b.x
    b.x=cast.origin+(cast.destination-cast.origin)*(cast.tick-m.windup+1)/m.activeTicks
    cast.source.x=b.x
    left,right=math.min(previous,b.x)-m.radius,math.max(previous,b.x)+m.radius
   end
   cast.hitLeft,cast.hitRight=left,right
   C.hitFieldArea(state,cast.source,cast.seen,left,right,spec.floorY-m.height,m.damage)
  else
   b.pose,b.recovering='exposed',true
  end
  if cast.tick<m.windup+m.activeTicks+m.recoveryTicks then return false end
  antler.spawn(b)
  return true
 end

 function antler.label(b) if b.recovering then return '息継ぎ・胸の継ぎ目が開いた' end end
 local function recoveryTicks(cast)
  local move=cast.move
  return math.max(0,move.windup+move.activeTicks+move.recoveryTicks-cast.tick)
 end
 function antler.frame(f,b,spec,cast)
  f.pose,f.recovering=b.pose,b.recovering
  if cast and b.recovering then
   f.recovery={ticks=recoveryTicks(cast),total=cast.move.recoveryTicks,factor=spec.recoveryFactor}
  elseif cast then
   f.lane={left=cast.left,right=cast.right,top=spec.floorY-cast.move.height,
    at=cast.move.windup,active=cast.tick>=cast.move.windup,hitLeft=cast.hitLeft,hitRight=cast.hitRight}
  end
 end

 function antler.draw(f,state,b,spec,cast,mode,profile)
  local camera,y=state.camera,spec.floorY
  if cast and b.recovering then
   local remaining=recoveryTicks(cast)
   local x=b.x-camera
   rect(f,x-60,y-spec.artHeight-27,120,5,'#263a50')
   rect(f,x-60,y-spec.artHeight-27,math.ceil(120*remaining/cast.move.recoveryTicks),5,'#ffd895')
   f.draws[#f.draws+1]={kind='text',x=x,y=y-spec.artHeight-36,size=14,color='#fff0b9',
                       text=string.format('胸の継ぎ目・反撃 %.1f秒',math.ceil(remaining/6)/10)}
  elseif cast then
   local active=cast.tick>=cast.move.windup
   local left,right=cast.left-camera,cast.right-camera
   if active and cast.hitLeft then
    local height=cast.move.height
    local from,to=cast.hitLeft-camera,cast.hitRight-camera
    rect(f,from,y-height,to-from,height,cast.move.color..'42')
   end
   for x=left+1,right-8,16 do rect(f,x,y-4,9,3,cast.move.color) end
  end
  C.drawFrostAntlerArt(f,b.x-camera,b.y,b.pose,spec.artHeight,mode,profile,b.facing>0)
 end
 return antler
end
