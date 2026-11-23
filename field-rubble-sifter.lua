return function(C)
 local sifter={}
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function sifter.spawn(b)
  b.pose,b.exposed,b.barrier,b.weakpoint='idle',false,0,nil
 end
 function sifter.cancel(b) sifter.spawn(b) end
 function sifter.shareCast(cast,actors) C.shareFieldHits({cast.seen},actors) end

 function sifter.damageFactor(_,cast,b,spec)
  if b.exposed and C.hitFieldWeakpoint(cast,b) then return spec.rotorFactor end
  return 1
 end

 function sifter.begin(b,spec,move,target)
  local dir=target.x<b.x and -1 or 1
  b.facing=dir
  local center=b.x
  if move.track then
   local limit=move.spacing+move.halfWidth
   center=math.max(spec.arenaMin+limit,math.min(spec.arenaMax-limit,target.x))
  end
  local lanes={}
  for i,offset in ipairs(move.offsets) do
   local x=center+offset*dir
   lanes[i]={left=x-move.halfWidth,right=x+move.halfWidth,top=spec.floorY-move.height,
    at=move.windup+(i-1)*move.interval}
  end
  b.pose,b.barrier='heating',spec.barrier
  return {move=move,lanes=lanes,tick=0,seen={},ends=lanes[#lanes].at+move.active,
   source={id=b.id,owner=b,x=b.x,y=spec.floorY,damageElement=move.element}}
 end

 function sifter.tick(state,b,spec,cast)
  local m=cast.move
  cast.tick=cast.tick+1
  if cast.tick<cast.ends then
   for _,lane in ipairs(cast.lanes) do
    if cast.tick>=lane.at and cast.tick<lane.at+m.active then
     C.hitFieldArea(state,cast.source,cast.seen,lane.left,lane.right,lane.top,m.damage)
    end
   end
  elseif not b.exposed then
   b.exposed,b.pose,b.barrier=true,'open',0
   b.weakpoint={x=b.x,y=b.y-spec.rotorHeight,radius=spec.rotorRadius}
  end
  if cast.tick<cast.ends+m.recovery then return false end
  sifter.spawn(b)
  return true
 end

 function sifter.label(b)
  if b.exposed then return '冷却中・回転輪が露出' end
 end

 function sifter.frame(f,b,spec,cast)
  f.exposed,f.pose,f.barrier=b.exposed,b.pose,b.barrier
  if cast and not b.exposed then f.lanes=cast.lanes;f.activeTicks=cast.move.active end
 end

 function sifter.draw(f,state,b,spec,cast,mode,profile)
  local camera=state.camera
  if cast and not b.exposed then
   for _,lane in ipairs(cast.lanes) do
    if cast.tick<lane.at+cast.move.active then
     local left,right=lane.left-camera,lane.right-camera
     local color=cast.move.color
     rect(f,left,lane.top,right-left,spec.floorY-lane.top,color..(cast.tick>=lane.at and '58' or '1a'))
     for x=left+3,right-7,16 do rect(f,x,spec.floorY-4,9,3,color) end
    end
   end
  end
  C.drawRubbleSifterArt(f,b.x-camera,b.y,b.pose,spec.artHeight,mode,profile,b.facing>0)
 end
 return sifter
end
