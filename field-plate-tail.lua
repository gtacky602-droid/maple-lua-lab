return function(C)
 local plate={}

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function plate.spawn(b,spec) b.exposed,b.stopped,b.barrier=false,false,spec.barrier end
 function plate.cancel(b,spec) plate.spawn(b,spec) end

 local function stopAtRock(spec,m,origin,finish,dir)
  local stopped=false
  for _,rock in ipairs(spec.cover) do
   local side=dir>0 and rock.x or rock.x+rock.w
   local contact=side-dir*m.radius
   if (side-origin)*dir>=0 and (finish-contact)*dir>0 then
    finish=(contact-origin)*dir>0 and contact or origin
    stopped=true
   end
  end
  return finish,stopped
 end

 function plate.begin(b,spec,move,target)
  local dir=target.x<b.x and -1 or 1
  b.facing=dir
  local origin=b.x
  local finish,stopped=origin,false
  if move.distance then
   finish=math.max(spec.arenaMin+move.radius,math.min(spec.arenaMax-move.radius,origin+move.distance*dir))
   finish,stopped=stopAtRock(spec,move,origin,finish,dir)
  end
  return {move=move,tick=0,left=math.min(origin,finish)-move.radius,right=math.max(origin,finish)+move.radius,
   top=spec.floorY-move.height,origin=origin,finish=finish,stopped=stopped,seen={},
   source={id=b.id,owner=b,y=spec.floorY,damageElement=move.element}}
 end

 function plate.tick(s,b,spec,cast)
  cast.tick=cast.tick+1
  local move,t=cast.move,cast.tick
  if t>=move.windup and t<move.windup+move.active then
   local previous=b.x
   if move.distance then b.x=cast.origin+(cast.finish-cast.origin)*(t-move.windup+1)/move.active end
   C.hitFieldArea(s,cast.source,cast.seen,math.min(previous,b.x)-move.radius,
    math.max(previous,b.x)+move.radius,cast.top,move.damage)
  elseif t==move.windup+move.active then
   b.exposed,b.stopped,b.barrier=true,cast.stopped,0
  end
  local extra=cast.stopped and spec.rockRecovery or 0
  if t<move.windup+move.active+move.recovery+extra then return false end
  plate.spawn(b,spec)
  return true
 end

 function plate.damageFactor(_,_,b,spec) return b.exposed and spec.recoveryFactor or 1 end
 function plate.label(b)
  if b.stopped then return '岩に突進を止められた・反撃の機会' end
  if b.exposed then return '動きが止まった・反撃の機会' end
 end

 function plate.frame(f,b,spec,cast)
  f.exposed,f.stopped,f.barrier,f.cover=b.exposed,b.stopped,b.barrier,spec.cover
  if cast and not b.exposed then
   f.lane={left=cast.left,right=cast.right,top=cast.top,at=cast.move.windup,
    active=cast.tick>=cast.move.windup,activeTicks=cast.move.active,finish=cast.finish}
  end
 end

 function plate.draw(f,s,b,spec,cast,mode,profile)
  if cast and not b.exposed then
   local y=b.y
   local left,right=cast.left-s.camera,cast.right-s.camera
   local active=cast.tick>=cast.move.windup
   if active and cast.move.distance then
    left,right=b.x-s.camera-cast.move.radius,b.x-s.camera+cast.move.radius
   end
   rect(f,left,cast.top,right-left,y-cast.top,active and '#c0f0e589' or '#b0dfcb20')
   for x=left+3,right-10,18 do rect(f,x,y-6,10,4,active and '#e1ffdb' or '#8dd9d3') end
  end
  local x=b.x-s.camera
  C.drawPlateTailArt(f,x,b.y,spec.artHeight,mode,profile,b.facing>0)
  if b.exposed then rect(f,x-19,b.y-4,38,3,'#ffd797') end
 end
 return plate
end
