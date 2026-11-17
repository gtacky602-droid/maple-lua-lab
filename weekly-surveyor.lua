-- Original encounter. Every telegraph reads the same bounds used by the hit check.
return function(C)
 local surveyor={}
 local previousAvoid=C.aiAvoidTarget
 local mint,amber,plum='#b5ffe9','#ffd083','#d7a6ff'
 local function clamp(value,low,high)
  return math.max(low,math.min(high,value))
 end
 local function controller(state)
  local slot,spec=C.currentWeeklyBoss(state)
  if spec and spec.controller=='surveyor' then return slot,spec end
 end
 local function removeBody(state,slot)
  for i=#state.enemies,1,-1 do
   if state.enemies[i]==slot.primary then table.remove(state.enemies,i) end
  end
 end
 function surveyor.spawn(_,slot,spec)
  slot.stage=1
  slot.sequence=1
  slot.intro=spec.noticeTicks
  slot.transition=0
  slot.marks={}
  slot.primary.dir=-1
  slot.primary.hitTop=spec.floorY-118
  slot.primary.hitBottom=spec.floorY
  slot.primary.underground=true
 end
 function surveyor.attach(state,slot)
  removeBody(state,slot)
  state.enemies[#state.enemies+1]=slot.primary
  state.grappleNodes={}
  state.selectedGrapple=1
  for _,actor in ipairs(state.actors) do actor.grapple=nil end
 end
 function surveyor.cleanup(state,slot)
  removeBody(state,slot)
  slot.cast=nil
  slot.marks={}
 end
 local function getTarget(state)
  local actor=state.actors[state.active]
  if actor.hp>0 then return actor end
  return state.actors[3-state.active]
 end
 local function zone(left,right,top,bottom,at,untilTick)
  return {left=left,right=right,top=top,bottom=bottom,at=at,untilTick=untilTick,seen={}}
 end
 local function makeCast(state,slot,spec,move)
  local boss=slot.primary
  local target=getTarget(state)
  local origin=boss.x
  local dir=target.x>=origin and 1 or -1
  local cross=clamp(target.x,160,800)
  local leftSide=target.x<origin
  local zones={}
  local function add(left,right,top,bottom,at,untilTick)
   zones[#zones+1]=zone(left,right,top,bottom,at,untilTick)
  end
  local function stripe(x,half,at,untilTick)
   add(x-half,x+half,330,480,at,untilTick)
  end
  local function front(reach,top,at,untilTick)
   local endX=origin+reach*dir
   add(math.min(origin,endX)-12,math.max(origin,endX)+12,top,480,at,untilTick)
  end

  if move.id=='TS01' then
   stripe(cross,50,54,66)
  elseif move.id=='TS02' then
   stripe(cross,80,66,78)
  elseif move.id=='TS03' then
   add(75,885,443,480,64,84)
  elseif move.id=='TS04' then
   front(176,400,48,62)
  elseif move.id=='TS05' then
   front(195,405,48,58)
   add(origin-110,origin+110,430,480,108,120)
  elseif move.id=='TS06' then
   stripe(cross-95,42,54,66)
   stripe(cross+95,42,98,110)
  elseif move.id=='TS07' then
   add(52,908,444,480,66,80)
   add(118,842,327,390,146,158)
   add(52,908,444,480,226,240)
  elseif move.id=='TS08' then
   local left,right=leftSide and 60 or 534,leftSide and 426 or 900
   add(left,right,320,480,68,82)
   stripe(leftSide and 680 or 280,63,136,150)
  elseif move.id=='TS09' then
   add(65,325,320,480,60,76)
   add(635,895,320,480,60,76)
   stripe(480,100,134,150)
  end
  boss.dir=dir
  return {move=move,tick=0,zones=zones}
 end
 function surveyor.prepare(state,slot,spec)
  if slot.intro>0 then
   slot.phase='notice'
   slot.intro=slot.intro-1
   if slot.intro==0 then slot.primary.underground=false end
   return
  end
  slot.phase='combat'
  if slot.transition>0 then
   slot.transition=slot.transition-1
   return
  end
  if not slot.cast then
   local threshold=spec.thresholds[slot.stage]
   if threshold and slot.primary.hp<=spec.hp*threshold then
    slot.stage=slot.stage+1
    slot.sequence=1
    slot.transition=spec.transitionTicks
    return
   end
   local rotation=spec.rotations[slot.stage]
   local move=spec.moves[rotation[slot.sequence]]
   slot.sequence=1+slot.sequence%#rotation
   slot.cast=makeCast(state,slot,spec,move)
  end
  slot.cast.tick=slot.cast.tick+1
 end
 local function inPad(actor,spec)
  if not actor.ground or math.abs(actor.y-spec.floorY)>2 then return false end
  for _,x in ipairs(spec.cleansePads) do
   if math.abs(actor.x-x)<spec.padRadius then return true end
  end
  return false
 end
 function surveyor.finish(state,slot,spec)
  for _,actor in ipairs(state.actors) do
   local mark=slot.marks[actor.id]
   if mark and (actor.hp<=0 or mark<=state.t or inPad(actor,spec)) then
    slot.marks[actor.id]=nil
    if actor.hp>0 and mark>state.t then
     C.combatEvent(state,'surveyor_cleanse',actor.id,slot.primary.id)
    end
   end
  end
  local cast=slot.cast
  if not cast then return end
  local tick=cast.tick
  for _,area in ipairs(cast.zones) do
   if tick>=area.at and tick<area.untilTick then
    for _,actor in ipairs(state.actors) do
     local overlap=actor.x+10>area.left and actor.x-10<area.right
         and actor.y>area.top and actor.y-50<area.bottom
     if actor.hp>0 and not area.seen[actor.id] and overlap then
      area.seen[actor.id]=true
      local feedback=cast.move.feedback and slot.marks[actor.id]
      local damage=cast.move.damage+(feedback and spec.feedbackDamage or 0)
      local before=actor.hp
      C.damageActor(state,actor,damage,slot.primary,false,true)
      if actor.hp<before then
       if feedback then
        slot.marks[actor.id]=nil
        C.combatEvent(state,'surveyor_feedback',actor.id,slot.primary.id,spec.feedbackDamage)
       end
       if cast.move.mark and actor.hp>0 and not inPad(actor,spec) then
        slot.marks[actor.id]=state.t+spec.markSeconds
        C.combatEvent(state,'surveyor_mark',actor.id,slot.primary.id)
       end
      end
     end
    end
   end
  end
  if tick>=cast.move.total then slot.cast=nil end
 end
 function C.aiAvoidTarget(state,actor)
  local slot,spec=controller(state)
  if slot and slot.phase=='combat' then
   local cast=slot.cast
   if cast then
    for _,area in ipairs(cast.zones) do
     if area.at-38<=cast.tick and cast.tick<area.untilTick and actor.y>area.top
         and actor.x>area.left-22 and actor.x<area.right+22 then
      if area.right-area.left>700 and area.top>=440 and actor.ground then
       if cast.tick>=area.at-14 then actor.buffer=.1 end
       return actor.x
      end
      local left,right=area.left-28,area.right+28
      if right>930 or (left>=30 and actor.x-left<right-actor.x) then return math.max(24,left) end
      return math.min(936,right)
     end
    end
   end
   if slot.marks[actor.id] then
    local left,right=spec.cleansePads[1],spec.cleansePads[2]
    return actor.x<(left+right)/2 and left or right
   end
  end
  return previousAvoid and previousAvoid(state,actor)
 end
 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 local function text(draws,x,y,label,color,size)
  draws[#draws+1]={kind='text',x=x,y=y,text=label,color=color,size=size or 12}
 end
 function surveyor.observe(frame,state,slot,spec,mode,profile)
  local info=frame.weeklyBoss
  info.stage=slot.stage
  info.stageName=spec.stageNames[slot.stage]
  info.transition=slot.transition
  info.marks={}
  for id,expiry in pairs(slot.marks) do
   info.marks[tostring(id)]=math.max(0,expiry-state.t)
  end
  info.cleansePads=spec.cleansePads
  local cast=slot.cast
  info.move=cast and cast.move.id
  info.tick=cast and cast.tick
  info.label=slot.waitUntil and '点検完了' or slot.intro>0 and '機器を起動中'
      or slot.transition>0 and '機構切り替え' or cast and cast.move.name or info.stageName
  if slot.waitUntil then return end

  local existing=frame.draws
  local draws={}
  local portalPrefix=#(frame.storyPortals or {})*4
  for i=1,portalPrefix do draws[#draws+1]=existing[i] end
  for _,x in ipairs(spec.cleansePads) do
   rect(draws,x-spec.padRadius,474,spec.padRadius*2,5,mint)
   text(draws,x,462,'印を解除',mint)
  end
  if cast then
   info.zones={}
   for _,area in ipairs(cast.zones) do
    if cast.tick>=area.at-cast.move.warning and cast.tick<area.untilTick then
     local live=cast.tick>=area.at
     local color=live and '#ff9e53' or amber
     rect(draws,area.left,area.top,area.right-area.left,area.bottom-area.top,live and '#ff791858' or '#ffc55f26')
     rect(draws,area.left,area.bottom-3,area.right-area.left,3,color)
     rect(draws,area.left,area.top,area.right-area.left,2,color)
     info.zones[#info.zones+1]={left=area.left,right=area.right,top=area.top,bottom=area.bottom,active=live}
    end
   end
  end
  local ready=({'meter','pendulum','stand'})[slot.stage]
  local pose=ready
  if slot.transition>0 then pose='reset'
  elseif cast and cast.tick<cast.move.recover then pose=cast.move.pose end
  local boss=slot.primary
  C.drawSurveyorArt({draws=draws},boss.x,boss.y,pose,mode,profile,boss.dir>0)
  for i=portalPrefix+1,#existing do draws[#draws+1]=existing[i] end
  for _,actor in ipairs(state.actors) do
   if slot.marks[actor.id] then text(draws,actor.x,actor.y-130,'測距印',plum) end
  end
  text(draws,480,65,info.stageName,mint,14)
  if slot.transition>0 then text(draws,480,86,'機構切り替え・攻撃の好機',mint) end
  frame.draws=draws
 end
 return surveyor
end
