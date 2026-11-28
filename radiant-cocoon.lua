return function(C)
 local damageFactor,healingFactor,step,action,frame=C.damageFactor,C.healingFactor,C.step,C.action,C.frame
 local healActor,damageActor=C.healActor,C.damageActor

 local function now(state)
  return state.coop and C.sharesCoopField(state) and state.coop.time or state.t
 end

 function C.clearRadiantCocoons(state)
  state.radiantCocoonEffects=nil
  state.radiantCocoonSpec=nil
 end
 local function clearParty(state,parent)
  if not parent then C.clearRadiantCocoons(state);return end
  if not state.radiantCocoonEffects then return end
  for id,mark in pairs(state.radiantCocoonEffects) do
   if mark.parent==parent then state.radiantCocoonEffects[id]=nil end
  end
 end
 function C.clearEncounterCocoons(state,parent)
  if state.parties then
   for _,party in ipairs(state.parties) do clearParty(party,parent) end
  elseif state.coop and C.sharesCoopField(state) then
   for _,member in ipairs(state.coop.members) do
    if C.sharesCoopField(member.state) then clearParty(member.state,parent) end
   end
  else
   clearParty(state,parent)
  end
 end
 local function shortActive(state,id,mark,at)
  return state.actors[id]==mark.actor and mark.actor.hp>0 and state.story and
         state.story.node==mark.node and (at or now(state))+1e-8<mark.untilTime
 end
 function C.radiantCocoonRemaining(state,mark)
  return mark.untilTime and math.max(0,mark.untilTime-(mark.parent and now(state) or state.t))
 end
 function C.radiantCocoonEffect(state,id,at)
  local mark=state.radiantCocoonEffects and state.radiantCocoonEffects[id]
  if mark and (not mark.parent or shortActive(state,id,mark,at)) then return mark end
 end
 function C.applyShortRadiantCocoon(state,a,parent,spec)
  if C.radiantCocoonEffect(state,a.id) then return end
  state.radiantCocoonEffects=state.radiantCocoonEffects or {}
  state.radiantCocoonEffects[a.id]={
   bound=true,parent=parent,actor=a,node=spec.node,
   damageFactor=parent.move.cocoonFactor,untilTime=now(state)+parent.move.cocoonTicks/60
  }
 end
 local function releaseShort(state,a)
  local mark=state.radiantCocoonEffects and state.radiantCocoonEffects[a.id]
  if mark and mark.parent and mark.actor==a then state.radiantCocoonEffects[a.id]=nil end
 end
 function C.healActor(state,a,amount)
  local gained=healActor(state,a,amount)
  if gained>0 then releaseShort(state,a) end
  return gained
 end
 function C.damageActor(state,a,...)
  local damage=damageActor(state,a,...)
  if damage>0 and a.hp<=0 then releaseShort(state,a) end
  return damage
 end
 function C.damageFactor(state,cast,e,element)
  local factor=damageFactor and damageFactor(state,cast,e,element) or 1
  local mark=C.radiantCocoonEffect(state,cast.id,cast.resolvedAt)
  if not mark then return factor end
  if mark.parent then return factor*mark.damageFactor end
  local spec=state.radiantCocoonSpec.cocoon
  if mark.bound then return factor*spec.damageFactor end
  return state.t<mark.untilTime and factor*spec.escapeFactor or factor
 end
 function C.healingFactor(state,a)
  local factor=healingFactor and healingFactor(state,a) or 1
  local mark=C.radiantCocoonEffect(state,a.id)
  return mark and mark.bound and not mark.parent and factor*state.radiantCocoonSpec.cocoon.healFactor or factor
 end
 local function updateEffects(state)
  if not state.radiantCocoonEffects then return end
  local spec=state.radiantCocoonSpec
  for id,mark in pairs(state.radiantCocoonEffects) do
   local a=state.actors[id]
   if mark.parent then
    if not shortActive(state,id,mark) then state.radiantCocoonEffects[id]=nil end
   elseif not state.story or state.story.node~=spec.node or a.hp<=0 or (not mark.bound and state.t>=mark.untilTime) then
    state.radiantCocoonEffects[id]=nil
   elseif mark.bound and a.hp>=a.maxhp then
    mark.bound=false
    mark.untilTime=state.t+spec.cocoon.escapeTicks/60
    if spec.onEscape then spec.onEscape(state,a) end
   end
  end
  if not next(state.radiantCocoonEffects) then C.clearRadiantCocoons(state) end
 end
 function C.bindRadiantCocoon(state,spec,source,left,right,onEscape)
  local binding={node=spec.node,cocoon=spec.cocoon,onEscape=onEscape}
  for _,a in ipairs(state.actors) do
   if a.hp>0 and a.x>=left and a.x<=right then
    local party=state.actorOwners and state.actorOwners[a] or state
    local before=a.hp
    C.damageActor(party,a,spec.cocoon.damage,source,false,true)
    if a.hp>0 and a.hp<before then
     party.radiantCocoonEffects=party.radiantCocoonEffects or {}
     party.radiantCocoonEffects[a.id]={bound=true}
     party.radiantCocoonSpec=binding
    end
   end
  end
 end
 function C.step(state,dt,input)
  step(state,dt,input)
  if not state.paused then updateEffects(state) end
 end
 function C.action(state,key)
  action(state,key)
  updateEffects(state)
 end
 local function rect(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end
 function C.drawRadiantCocoons(state,f,camera,localActor)
  if not state.radiantCocoonEffects then return end
  for id in pairs(state.radiantCocoonEffects) do
   local mark=C.radiantCocoonEffect(state,id)
   if mark then
    local a=state.actors[id]
    local x=a.x-camera
    local bound=mark.bound
    local color=mark.parent and '#c9db48' or
                bound and (state.radiantCocoonSpec.cocoon.color or '#c9db48') or '#a4eaff'
    rect(f,x-18,a.y-55,3,50,color)
    rect(f,x+15,a.y-55,3,50,color)
    f.draws[#f.draws+1]={kind='text',x=x,y=a.y-65,text=bound and '集光の繭' or '脱出',size=12,color=color}
    if localActor then
     f.radiantCocoons=f.radiantCocoons or {}
     f.radiantCocoons[#f.radiantCocoons+1]={actor=id,bound=not not bound,
      remaining=C.radiantCocoonRemaining(state,mark)}
    end
   end
  end
 end
 function C.frame(state,mode,profile)
  local f=frame(state,mode,profile)
  if not state.radiantCocoonEffects then return f end
  C.drawRadiantCocoons(state,f,state.camera,true)
  f.commands=#f.draws
  return f
 end
end
