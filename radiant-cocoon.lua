return function(C)
 local damageFactor,healingFactor,step,action,frame=C.damageFactor,C.healingFactor,C.step,C.action,C.frame

 function C.clearRadiantCocoons(state)
  state.radiantCocoonEffects=nil
  state.radiantCocoonSpec=nil
 end
 function C.radiantCocoonEffect(state,id)
  return state.radiantCocoonEffects and state.radiantCocoonEffects[id]
 end
 function C.damageFactor(state,cast,e,element)
  local factor=damageFactor and damageFactor(state,cast,e,element) or 1
  local mark=C.radiantCocoonEffect(state,cast.id)
  if not mark then return factor end
  local spec=state.radiantCocoonSpec.cocoon
  if mark.bound then return factor*spec.damageFactor end
  return state.t<mark.untilTime and factor*spec.escapeFactor or factor
 end
 function C.healingFactor(state,a)
  local factor=healingFactor and healingFactor(state,a) or 1
  local mark=C.radiantCocoonEffect(state,a.id)
  return mark and mark.bound and factor*state.radiantCocoonSpec.cocoon.healFactor or factor
 end
 local function updateEffects(state)
  if not state.radiantCocoonEffects then return end
  local spec=state.radiantCocoonSpec
  if not state.story or state.story.node~=spec.node then C.clearRadiantCocoons(state);return end
  for id,mark in pairs(state.radiantCocoonEffects) do
   local a=state.actors[id]
   if a.hp<=0 or (not mark.bound and state.t>=mark.untilTime) then
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
  state.radiantCocoonEffects=state.radiantCocoonEffects or {}
  state.radiantCocoonSpec={node=spec.node,cocoon=spec.cocoon,onEscape=onEscape}
  for _,a in ipairs(state.actors) do
   if a.hp>0 and a.x>=left and a.x<=right then
    C.damageActor(state,a,spec.cocoon.damage,source,false,true)
    if a.hp>0 then state.radiantCocoonEffects[a.id]={bound=true} end
   end
  end
  if not next(state.radiantCocoonEffects) then C.clearRadiantCocoons(state) end
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
 function C.frame(state,mode,profile)
  local f=frame(state,mode,profile)
  if not state.radiantCocoonEffects then return f end
  f.radiantCocoons={}
  for id,mark in pairs(state.radiantCocoonEffects) do
   local a=state.actors[id]
   local x=a.x-state.camera
   local bound=mark.bound
   local color=bound and (state.radiantCocoonSpec.cocoon.color or '#c9db48') or '#a4eaff'
   rect(f,x-18,a.y-55,3,50,color)
   rect(f,x+15,a.y-55,3,50,color)
   f.draws[#f.draws+1]={kind='text',x=x,y=a.y-65,text=bound and '集光の繭' or '脱出',size=12,color=color}
   f.radiantCocoons[#f.radiantCocoons+1]={actor=id,bound=not not bound,
     remaining=mark.untilTime and math.max(0,mark.untilTime-state.t) or nil}
  end
  f.commands=#f.draws
  return f
 end
end
