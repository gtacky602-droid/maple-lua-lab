return function(C)
 local hare={}

 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function hare.spawn(b,spec) b.recovering,b.barrier=false,spec.barrier end
 function hare.cancel(b,spec) hare.spawn(b,spec) end

 function hare.shareCast(cast,actors)
  C.shareFieldHits({cast.seen},actors)
 end

 function hare.begin(b,spec,move,target)
  b.facing=target.x<b.x and -1 or 1
  local lanes={}
  for i,offset in ipairs(move.offsets) do
   local center=b.x+offset*b.facing
   lanes[i]={left=center-move.halfWidth,right=center+move.halfWidth,top=spec.floorY-move.height,
    at=move.windup+(i-1)*move.interval}
  end
  return {move=move,lanes=lanes,tick=0,seen={},ends=lanes[#lanes].at+move.active,
   source={id=b.id,owner=b,y=spec.floorY,damageElement=move.element}}
 end

 function hare.tick(s,b,spec,cast)
  cast.tick=cast.tick+1
  local move=cast.move
  for _,lane in ipairs(cast.lanes) do
   if cast.tick>=lane.at and cast.tick<lane.at+move.active then
    C.hitFieldArea(s,cast.source,cast.seen,lane.left,lane.right,lane.top,move.damage)
   end
  end
  if cast.tick>=cast.ends then b.recovering,b.barrier=true,0 end
  if cast.tick<cast.ends+move.recovery then return false end
  hare.spawn(b,spec)
  return true
 end

 function hare.damageFactor(_,_,b,spec) return b.recovering and spec.recoveryFactor or 1 end
 function hare.label(b) if b.recovering then return '足が止まった・反撃の機会' end end

 function hare.frame(f,b,_,cast)
  f.recovering,f.barrier=b.recovering,b.barrier
  if cast and not b.recovering then f.lanes,f.activeTicks=cast.lanes,cast.move.active end
 end

 function hare.draw(f,s,b,spec,cast,mode,profile)
  if cast and not b.recovering then
   local y=b.y
   for _,lane in ipairs(cast.lanes) do
    if cast.tick<lane.at+cast.move.active then
     local left,right=lane.left-s.camera,lane.right-s.camera
     local active=cast.tick>=lane.at
     rect(f,left,lane.top,right-left,y-lane.top,active and '#c8f5ff74' or '#acdfff20')
     for x=left+4,right-9,17 do rect(f,x,y-5,9,4,active and '#f0fdff' or '#aadceb') end
    end
   end
  end
  local x=b.x-s.camera
  C.drawRimeHareArt(f,x,b.y,spec.artHeight,mode,profile,b.facing>0)
  if b.recovering then rect(f,x-17,b.y-4,34,3,'#f9d389') end
 end
 return hare
end
