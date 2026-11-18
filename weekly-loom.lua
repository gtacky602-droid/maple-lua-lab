-- The closed body and each shuttle use separate hit targets.
return function(C)
 local loom={}
 local previousAvoid=C.aiAvoidTarget
 local gold,mint,rose='#ffd083','#b4f4d4','#efa4cd'
 local function current(state)
  local slot,spec=C.currentWeeklyBoss(state)
  if spec and spec.controller=='loom' then return slot,spec end
 end
 local function removeTargets(state,slot,keepBody)
  for i=#state.enemies,1,-1 do
   local enemy=state.enemies[i]
   if (not keepBody and enemy==slot.primary) or enemy.loomOwner==slot.primary then
    table.remove(state.enemies,i)
   end
  end
 end
 local function newShuttles(slot,spec)
  slot.shuttles={}
  for i,row in ipairs(spec.shuttles) do
   slot.shuttles[i]={id=row.entity,name=row.name,x=row.x,y=spec.floorY,
       hitTop=spec.floorY-70,hitBottom=spec.floorY,hp=spec.shuttleHP,maxhp=spec.shuttleHP,
       level=spec.level,custom=true,noRewards=true,boss=true,warning=0,
       respawn=math.huge,loomOwner=slot.primary}
  end
 end
 local function installShuttles(state,slot)
  for _,part in ipairs(slot.shuttles) do state.enemies[#state.enemies+1]=part end
 end
 function loom.spawn(_,slot,spec)
  slot.intro=spec.noticeTicks
  slot.cycle=0
  slot.rotationIndex=1
  slot.openUntil=nil
  slot.primary.underground=true
  slot.primary.invulnerable=true
  slot.primary.hitTop=spec.floorY-115
  slot.primary.hitBottom=spec.floorY-43
  -- Previously locked attacks must still consult this on contact.
  slot.primary.acceptsCast=function() return slot.openUntil~=nil end
  newShuttles(slot,spec)
 end
 function loom.attach(state,slot)
  removeTargets(state,slot)
  state.enemies[#state.enemies+1]=slot.primary
  installShuttles(state,slot)
  state.grappleNodes={}
  state.selectedGrapple=1
  for _,actor in ipairs(state.actors) do actor.grapple=nil end
 end
 function loom.cleanup(state,slot)
  removeTargets(state,slot)
  slot.cast=nil
  slot.openUntil=nil
  slot.shuttles={}
 end
 local function newCast(state,slot,spec,move)
  local actor=state.actors[state.active]
  local x=math.max(150,math.min(810,actor.x))
  local zones={}
  local function add(left,right,top,bottom,at,sourceIndex)
   if sourceIndex and slot.shuttles[sourceIndex].hp<=0 then return end
   zones[#zones+1]={left=left,right=right,top=top,bottom=bottom,at=at,
         untilTick=at+12,sourceIndex=sourceIndex,seen={}}
  end
  if move.id=='LW01' then
   add(160,415,392,480,64,1)
   add(545,800,392,480,106,2)
  elseif move.id=='LW02' then
   add(x-72,x+72,315,480,70)
  elseif move.id=='LW03' then
   add(90,870,438,480,70)
  elseif move.id=='LW04' then
   add(140,408,331,390,64,1)
   add(552,820,331,390,64,2)
   add(390,570,422,480,126)
  end
  return {move=move,tick=0,zones=zones}
 end
 function loom.prepare(state,slot,spec,_,dt)
  if slot.intro>0 then
   slot.intro=slot.intro-1
   slot.phase='notice'
   return
  end
  slot.phase='combat'
  if slot.openUntil then
   if state.t+dt+1e-8<slot.openUntil then return end
   slot.openUntil=nil
   slot.primary.underground=true
   slot.primary.invulnerable=true
   newShuttles(slot,spec)
   installShuttles(state,slot)
   slot.rotationIndex=1
  end
  if not slot.cast then
   local rotation=slot.cycle>0 and spec.rewiredRotation or spec.rotation
   local move=spec.moves[rotation[slot.rotationIndex]]
   slot.rotationIndex=1+slot.rotationIndex%#rotation
   slot.cast=newCast(state,slot,spec,move)
  end
  slot.cast.tick=slot.cast.tick+1
 end
 local function aliveSource(slot,area)
  return not area.sourceIndex or slot.shuttles[area.sourceIndex].hp>0
 end
 function loom.finish(state,slot,spec)
  if slot.phase~='combat' or slot.openUntil then return end
  if slot.shuttles[1].hp<=0 and slot.shuttles[2].hp<=0 then
   slot.cycle=slot.cycle+1
   slot.cast=nil
   removeTargets(state,slot,true)
   slot.primary.underground=false
   slot.primary.invulnerable=false
   slot.openUntil=state.t+spec.openTicks/60
   C.combatEvent(state,'loom_exposed',0,slot.primary.id,slot.cycle)
   return
  end
  local cast=slot.cast
  if not cast then return end
  for _,area in ipairs(cast.zones) do
   if aliveSource(slot,area) and cast.tick>=area.at and cast.tick<area.untilTick then
    C.hitFieldArea(state,slot.primary,area.seen,area.left,area.right,area.top,cast.move.damage,area.bottom)
   end
  end
  if cast.tick>=cast.move.total then slot.cast=nil end
 end
 function C.aiAvoidTarget(state,actor)
  local slot=current(state)
  if slot and slot.cast then
   local cast=slot.cast
   for _,area in ipairs(cast.zones) do
    if aliveSource(slot,area) and area.at-46<=cast.tick and cast.tick<area.untilTick
        and actor.x>=area.left-12 and actor.x<=area.right+12
        and actor.y>area.top and actor.y-50<area.bottom then
     if area.right-area.left>650 and actor.ground then
      if cast.tick>=area.at-15 then actor.buffer=.1 end
      return actor.x
     end
     local left,right=area.left-22,area.right+22
     if right>930 or (left>=30 and actor.x-left<right-actor.x) then return math.max(24,left) end
     return math.min(936,right)
    end
   end
  end
  return previousAvoid and previousAvoid(state,actor)
 end
 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function label(draws,x,y,text,color,size)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,color=color,size=size or 12}
 end
 function loom.observe(frame,state,slot,spec,mode,profile)
  local info=frame.weeklyBoss
  info.cycle=slot.cycle
  info.openTicks=slot.openUntil and math.max(0,math.ceil((slot.openUntil-state.t)*60-1e-7)) or 0
  info.stage=slot.openUntil and 'open' or 'sealed'
  info.shuttles={}
  info.zones={}
  if slot.waitUntil then info.label='織機は停止中';return end
  local cast=slot.cast
  info.move=cast and cast.move.id
  info.tick=cast and cast.tick
  info.label=slot.openUntil and '芯が露出' or cast and cast.move.name or '左右の杼を壊す'

  local draws,old={},frame.draws
  local portalPrefix=#(frame.storyPortals or {})*4
  for i=1,portalPrefix do draws[#draws+1]=old[i] end
  if cast then
   for _,area in ipairs(cast.zones) do
    if aliveSource(slot,area) and area.at-60<=cast.tick and cast.tick<area.untilTick then
     local active=cast.tick>=area.at
     rect(draws,area.left,area.top,area.right-area.left,area.bottom-area.top,active and '#fa839259' or '#ec8ba728')
     rect(draws,area.left,area.top,area.right-area.left,2,rose)
     rect(draws,area.left,area.bottom-3,area.right-area.left,3,rose)
     info.zones[#info.zones+1]={left=area.left,right=area.right,top=area.top,bottom=area.bottom,
                              active=active,at=area.at}
    end
   end
  end
  local layer={draws=draws}
  local body=slot.primary
  C.drawLoomArt(layer,body.x,body.y,slot.openUntil and 'open' or 'closed',mode,profile)
  for i,part in ipairs(slot.shuttles) do
   local broken=part.hp<=0
   C.drawLoomArt(layer,part.x,part.y,broken and 'broken' or 'shuttle',mode,profile)
   info.shuttles[i]={id=part.id,name=part.name,broken=broken,hp=part.hp,maxhp=part.maxhp,x=part.x,y=part.y}
   label(draws,part.x,part.y-84,part.name,broken and '#c3b2c4' or gold)
  end
  for i=portalPrefix+1,#old do draws[#draws+1]=old[i] end
  if slot.openUntil then
   label(draws,480,65,string.format('芯が露出  %.1f秒',info.openTicks/60),mint,14)
  else
   label(draws,480,65,'左右の杼を壊すと芯が開く',gold,14)
  end
  frame.draws=draws
 end
 return loom
end
