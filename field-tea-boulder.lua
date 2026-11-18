return function(C)
 local boulder={}

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function boulder.spawn(b,spec) b.exposed,b.barrier=false,spec.barrier end
 function boulder.cancel(b,spec) boulder.spawn(b,spec) end

 local function stopAtRock(spec,origin,destination,dir)
  for _,rock in ipairs(spec.cover) do
   local face=dir>0 and rock.x or rock.x+rock.w
   if (face-origin)*dir>0 and (destination-face)*dir>0 then destination=face end
  end
  return destination
 end

 function boulder.begin(b,spec,move,target)
  b.facing=target.x<b.x and -1 or 1
  local origin=b.x
  local left,right=origin-move.width,origin+move.width
  if move.castType=='beam' then
   local dir=b.facing
   local destination=math.max(spec.arenaMin,math.min(spec.arenaMax,origin+dir*move.reach))
   local endX=stopAtRock(spec,origin,destination,dir)
   left,right=math.min(origin,endX),math.max(origin,endX)
  end
  return {move=move,left=left,right=right,top=spec.floorY-move.height,tick=0,seen={},
   source={id=b.id,owner=b,y=spec.floorY,damageElement=move.element}}
 end

 function boulder.tick(s,b,spec,cast)
  cast.tick=cast.tick+1
  local move,t=cast.move,cast.tick
  if t>=move.windup and t<move.windup+move.active then
   C.hitFieldArea(s,cast.source,cast.seen,cast.left,cast.right,cast.top,move.damage)
  elseif t==move.windup+move.active then b.exposed,b.barrier=true,0 end
  if t<move.windup+move.active+move.recovery then return false end
  boulder.spawn(b,spec)
  return true
 end

 function boulder.damageFactor(_,_,b,spec) return b.exposed and spec.recoveryFactor or 1 end
 function boulder.label(b) if b.exposed then return '岩粉が落ちる・反撃の機会' end end

 function boulder.frame(f,b,spec,cast)
  f.exposed,f.barrier,f.cover=b.exposed,b.barrier,spec.cover
  if cast and not b.exposed then
   f.lane={left=cast.left,right=cast.right,top=cast.top,at=cast.move.windup,
    active=cast.tick>=cast.move.windup,activeTicks=cast.move.active}
  end
 end

 function boulder.draw(f,s,b,spec,cast,mode,profile)
  if cast and not b.exposed then
   local y=b.y
   local left,right=cast.left-s.camera,cast.right-s.camera
   local active=cast.tick>=cast.move.windup
   rect(f,left,cast.top,right-left,y-cast.top,active and '#fee9ab82' or '#ffda842a')
   for x=left+3,right-9,17 do rect(f,x,y-6,10,4,active and '#fff7c7' or '#f5cd83') end
  end
  local x=b.x-s.camera
  C.drawTeaBoulderArt(f,x,b.y,spec.artHeight,mode,profile,b.facing>0)
  if b.exposed then rect(f,x-19,b.y-4,38,3,'#eaca7c') end
 end
 return boulder
end
