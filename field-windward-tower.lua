return function(C)
 local tower={}
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function tower.spawn(b,spec)
  b.pose,b.exposed,b.barrier='idle',false,spec.barrier
 end
 function tower.cancel(b,spec) tower.spawn(b,spec) end

 function tower.begin(b,spec,move,target)
  b.facing=target.x<b.x and -1 or 1
  local from,to=b.x,b.x+b.facing*(move.length or 0)
  if move.column then
   from=math.max(spec.arenaMin+move.halfWidth,math.min(spec.arenaMax-move.halfWidth,target.x))
   to=from
  end
  return {
   move=move,tick=0,seen={},left=math.min(from,to)-move.halfWidth,
   right=math.max(from,to)+move.halfWidth,top=spec.floorY-move.height,
   source={id=b.id,owner=b,y=spec.floorY,damageElement=move.element},
  }
 end

 function tower.tick(state,b,spec,cast)
  local move=cast.move
  cast.tick=cast.tick+1
  if cast.tick<move.windup+move.active then
   b.pose='braced'
   if cast.tick>=move.windup then
    C.hitFieldArea(state,cast.source,cast.seen,cast.left,cast.right,cast.top,move.damage)
   end
  else
   b.pose,b.exposed,b.barrier='open',true,0
  end
  if cast.tick<move.windup+move.active+move.exposure then return false end
  tower.spawn(b,spec)
  return true
 end

 function tower.label(b)
  if b.exposed then return '排気口が開いた・障壁停止中' end
 end

 function tower.frame(f,b,spec,cast)
  f.exposed,f.pose,f.barrier=b.exposed,b.pose,b.barrier
  if cast and not b.exposed then
   f.lane={left=cast.left,right=cast.right,top=cast.top,at=cast.move.windup,active=cast.tick>=cast.move.windup}
  end
 end

 function tower.draw(f,state,b,spec,cast,mode,profile)
  local camera=state.camera
  if cast and not b.exposed then
   local left,right=cast.left-camera,cast.right-camera
   local active=cast.tick>=cast.move.windup
   rect(f,left,cast.top,right-left,spec.floorY-cast.top,cast.move.color..(active and '55' or '15'))
   for x=left+3,right-7,16 do rect(f,x,spec.floorY-4,9,3,cast.move.color) end
  end
  C.drawWindwardTowerArt(f,b.x-camera,b.y,b.pose,spec.artHeight,mode,profile,b.facing>0)
 end
 return tower
end
