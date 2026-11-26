return function(C,art)
 local guardian={}

 function guardian.spawn(b) b.recovering=false end
 guardian.cancel=guardian.spawn

 function guardian.shareCast(cast,actors)
  for _,zone in ipairs(cast.zones) do C.shareFieldHits({zone.seen},actors) end
 end

 function guardian.begin(b,spec,move,target)
  b.facing=target.x<b.x and -1 or 1
  local anchor=move.aimAtTarget and target.x or b.x
  local cast={move=move,tick=0,zones={},source={id=b.id,owner=b,x=b.x,y=spec.floorY,damageElement=move.element}}
  if move.travel then
   cast.origin=b.x
   cast.destination=math.max(spec.arenaMin+move.halfWidth,
    math.min(spec.arenaMax-move.halfWidth,b.x+b.facing*move.travel))
  end
  for index,offset in ipairs(move.offsets) do
   local center=anchor+offset*b.facing
   local goal=cast.destination or center
   cast.zones[index]={left=math.max(spec.arenaMin,math.min(center,goal)-move.halfWidth),
    right=math.min(spec.arenaMax,math.max(center,goal)+move.halfWidth),top=spec.floorY-move.height,
    first=move.windup+(index-1)*move.interval,seen={}}
  end
  cast.ends=cast.zones[#cast.zones].first+move.active
  return cast
 end

 function guardian.tick(state,b,_,cast)
  cast.tick=cast.tick+1
  local move=cast.move
  for _,zone in ipairs(cast.zones) do
   if cast.tick>=zone.first and cast.tick<zone.first+move.active then
    local left,right=zone.left,zone.right
    if cast.destination then
     local previous=b.x
     local fraction=(cast.tick-zone.first+1)/move.active
     b.x=cast.origin+(cast.destination-cast.origin)*fraction
     cast.source.x=b.x
     left,right=math.min(previous,b.x)-move.halfWidth,math.max(previous,b.x)+move.halfWidth
     zone.hitLeft,zone.hitRight=left,right
    end
    C.hitFieldArea(state,cast.source,zone.seen,left,right,zone.top,move.damage)
   end
  end
  b.recovering=cast.tick>=cast.ends
  if cast.tick<cast.ends+move.recovery then return false end
  b.recovering=false
  return true
 end

 function guardian.damageFactor(_,_,b,spec)
  return b.recovering and spec.recoveryFactor or 1
 end

 function guardian.label(b)
  if b.recovering then return '動きが止まった・反撃の好機' end
 end

 function guardian.frame(f,b,_,cast)
  f.recovering=b.recovering
  if not cast or b.recovering then return end
  f.zones={}
  for index,zone in ipairs(cast.zones) do
   local active=cast.tick>=zone.first and cast.tick<zone.first+cast.move.active
   f.zones[index]={left=zone.left,right=zone.right,top=zone.top,first=zone.first,
    active=active,hitLeft=active and zone.hitLeft or nil,hitRight=active and zone.hitRight or nil}
  end
 end

 function guardian.draw(f,s,b,spec,cast,mode,profile)
  local function rect(x,y,w,h,color)
   f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
  end
  local y=spec.floorY
  if cast and not b.recovering then
   for _,zone in ipairs(cast.zones) do
    if cast.tick<zone.first+cast.move.active then
     local left,right=zone.left-s.camera,zone.right-s.camera
     local active=cast.tick>=zone.first
     rect(left,zone.top,right-left,y-zone.top,cast.move.color..(active and not cast.destination and '66' or '25'))
     if active and zone.hitLeft then
      rect(zone.hitLeft-s.camera,zone.top,zone.hitRight-zone.hitLeft,y-zone.top,cast.move.color..'66')
     end
     rect(left,zone.top,3,y-zone.top,'#192332')
     rect(right-3,zone.top,3,y-zone.top,'#192332')
     for x=left+5,right-11,18 do
      rect(x,y-5,10,4,active and '#fff8db' or cast.move.color)
     end
    end
   end
  end
  local x=b.x-s.camera
  C.drawFieldDisplayArt(f,art.idle or art,x,b.y,spec.artHeight,mode,profile,b.facing>0)
  if b.recovering then rect(x-24,y-4,48,4,'#ffe5a5') end
 end

 return guardian
end
