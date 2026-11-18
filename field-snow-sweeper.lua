return function(C)
 local sweeper={}
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function sweeper.spawn(b)
  b.pose='idle'
  b.cooling=false
 end
 function sweeper.cancel(b) sweeper.spawn(b) end
 function sweeper.damageFactor(_,_,b,spec)
  return b.cooling and spec.coolingDamageFactor or 1
 end

 function sweeper.begin(b,spec,move,target)
  local dir=target.x<b.x and -1 or 1
  local destination=b.x
  if move.kind=='plow' then
   destination=math.max(spec.arenaMin+spec.railMargin,math.min(spec.arenaMax-spec.railMargin,b.x+dir*move.distance))
  end
  b.facing=dir
  return {move=move,tick=0,origin=b.x,destination=destination,seen={},
   left=math.min(b.x,destination)-move.radius,right=math.max(b.x,destination)+move.radius,
   source={id=b.id,owner=b,y=spec.floorY,damageElement=move.element}}
 end

 function sweeper.tick(state,b,spec,cast)
  local move=cast.move
  cast.tick=cast.tick+1
  if cast.tick>=move.windup and cast.tick<move.windup+move.activeTicks then
   local previous=b.x
   local fraction=(cast.tick-move.windup+1)/move.activeTicks
   b.x=cast.origin+(cast.destination-cast.origin)*fraction
   b.pose=move.kind=='plow' and 'plow' or 'vent'
   C.hitFieldArea(state,cast.source,cast.seen,
    math.min(previous,b.x)-move.radius,math.max(previous,b.x)+move.radius,
    spec.floorY-move.height,move.damage)
  elseif cast.tick>=move.windup+move.activeTicks then
   b.pose,b.cooling='vent',true
  end
  if cast.tick<move.windup+move.activeTicks+move.coolingTicks then return false end
  sweeper.spawn(b)
  return true
 end

 function sweeper.label(b)
  if b.cooling then return '冷却中・攻撃の好機' end
 end

 function sweeper.frame(f,b,spec,cast)
  f.pose=b.pose
  f.cooling=b.cooling
  if cast and not b.cooling then
   f.lane={left=cast.left,right=cast.right,top=spec.floorY-cast.move.height,
    active=cast.tick>=cast.move.windup}
  end
 end

 function sweeper.draw(f,state,b,spec,cast,mode,profile)
  local camera=state.camera
  if cast and not b.cooling then
   local left,right=cast.left-camera,cast.right-camera
   local color=cast.move.kind=='plow' and '#ffb261' or '#affade'
   if cast.tick>=cast.move.windup then
    local radius=cast.move.radius
    rect(f,b.x-camera-radius,spec.floorY-cast.move.height,radius*2,cast.move.height,color..'42')
   end
   for x=left+2,right-7,15 do rect(f,x,spec.floorY-4,8,3,color) end
  end
  C.drawSnowSweeperArt(f,b.x-camera,b.y,b.pose,spec.artHeight,mode,profile,b.facing>0)
 end
 return sweeper
end
