return function(C)
 local jade={}
 local U=88
 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end

 local function aim(boss,spec,cast,target)
  if not target then return end
  cast.dir=target.x<boss.x and -1 or 1
  if cast.move.pattern=='leap' then
   cast.land=clamp(boss.x+clamp(target.x-boss.x,-1.8*U,1.8*U),spec.arenaMin+63,spec.arenaMax-63)
  elseif cast.move.pattern=='spores' then
   local center=clamp(target.x,spec.arenaMin+110,spec.arenaMax-110)
   cast.spots={center,center-85,center+85}
  end
 end

 function jade.begin(boss,spec,move,target)
  local cast={move=move,tick=0,origin=boss.x,dir=boss.facing or -1,groups={}}
  aim(boss,spec,cast,target)
  boss.facing=cast.dir
  return cast
 end
 function jade.shareCast(cast,actors)
  C.shareFieldHits(cast.groups,actors)
 end

 local function region(spec,cast,index)
  local y=spec.floorY
  if cast.move.pattern=='peck' then
   local a,b=cast.origin+cast.dir*.2*U,cast.origin+cast.dir*1.2*U
   return math.min(a,b),math.max(a,b),y-U,y-.3*U
  elseif cast.move.pattern=='leap' then
   return cast.land-.7*U,cast.land+.7*U,y-.65*U,y
  end
  local x=cast.spots[index]
  return x-.275*U,x+.275*U,y-.55*U,y
 end

 local function warningVisible(cast,index,window)
  local move,tick=cast.move,cast.tick
  return (tick>=move.lock or move.pattern~='peck') and tick<window[2] and
   (move.pattern=='spores' or index==1 or tick>=move.active[index-1][2])
 end

 function jade.frame(f,boss,spec,cast)
  f.flying=boss.y<spec.floorY
  if not cast then return end
  local locked=cast.tick>=cast.move.lock
  f.landingX=locked and cast.land or nil
  f.warnings={}
  for index,window in ipairs(cast.move.active) do
   if warningVisible(cast,index,window) then
    local left,right,top,bottom=region(spec,cast,index)
    f.warnings[#f.warnings+1]={left=left,right=right,top=top,bottom=bottom,
     first=window[1],after=window[2],active=cast.tick>=window[1],locked=locked}
   end
  end
 end

 function jade.tick(s,boss,spec,cast,target)
  local tick=cast.tick+1
  cast.tick=tick
  if tick<=cast.move.lock then
   aim(boss,spec,cast,target)
   boss.facing=cast.dir
  end
  if cast.move.pattern=='leap' and tick>=72 and tick<=108 then
   local progress=(tick-72)/36
   boss.x=cast.origin+(cast.land-cast.origin)*progress
   boss.y=tick<108 and spec.floorY-76*math.sin(math.pi*progress) or spec.floorY
   local spring=C.jadeplumeArt.spring.profiles.legacy.height
   local idle=C.jadeplumeArt.idle.profiles.legacy.height
   boss.drawHeight=tick<108 and spring*spec.artHeight/idle or spec.artHeight
   boss.hitBottom=boss.y;boss.hitTop=boss.y-boss.drawHeight
  end
  for index,window in ipairs(cast.move.active) do
   if tick>=window[1] and tick<window[2] then
    local seen=cast.groups[index] or {}
    cast.groups[index]=seen
    local x0,x1,y0,y1=region(spec,cast,index)
    if cast.move.pattern=='peck' then
     local radius,center=(y1-y0)/2,(y0+y1)/2
     C.hitFieldCapsule(s,boss,seen,x0+radius,x1-radius,center,radius,cast.move.damage)
    else
     C.hitFieldArea(s,boss,seen,x0,x1,y0,cast.move.damage,y1)
    end
   end
  end
  return tick>=cast.move.total
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function jade.draw(f,s,boss,spec,cast,mode,profile)
  local pose,height,bottom='idle',spec.artHeight,boss.y
  if cast then
   local move,tick=cast.move,cast.tick
   for index,window in ipairs(move.active) do
    if warningVisible(cast,index,window) then
     local x0,x1,y0,y1=region(spec,cast,index)
     x0=x0-s.camera;x1=x1-s.camera
     local active=tick>=window[1]
     local color=active and '#ffe19a' or tick<move.lock and '#b9a277' or '#de8554'
     rect(f.draws,x0,y1-4,x1-x0,4,color)
     rect(f.draws,x0,y0,3,y1-y0,color)
     rect(f.draws,x1-3,y0,3,y1-y0,color)
     if move.pattern=='spores' then
      local fall=math.min(1,math.max(0,(tick-window[1]+32)/32))
      if fall>0 then
       rect(f.draws,(x0+x1)/2-5,y1-13-135*(1-fall),10,11,'#f4d98a')
      end
     end
    end
   end
   if move.pattern=='peck' then
    pose='peck_ready'
    for _,window in ipairs(move.active) do
     if tick>=window[1]-6 and tick<window[2]+6 then pose='peck' end
    end
    if tick>=move.recover then pose='idle' end
   elseif move.pattern=='leap' then
    if tick<72 then pose='crouch'
    elseif tick<108 then
     pose='spring'
    else pose='stagger' end
   elseif tick<move.recover then pose='spores'
   end
  end
  C.drawJadeplumeArt(f,boss.x-s.camera,bottom,height,boss.facing>0,pose,mode,profile)
 end
 return jade
end
