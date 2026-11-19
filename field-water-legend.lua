return function(C)
 local combat={}
 local pulseColor='#9beef4'
 local warningColor='#eebf81'

 local function clamp(value,lo,hi)
  return math.max(lo,math.min(hi,value))
 end

 local function setDepth(boss,spec,y)
  boss.y=y
  boss.hitTop=y-spec.bodyHalfHeight
  boss.hitBottom=y+spec.bodyHalfHeight
 end

 local function guarded(boss)
  return boss.waterGuard==true
 end

 function combat.spawn(boss,spec)
  boss.element=spec.element
  boss.hitHalfWidth=spec.bodyHalfWidth
  boss.drawHeight=spec.bodyHalfHeight
  boss.waterPose='idle'
  setDepth(boss,spec,boss.y)
 end

 function combat.distance(actor,boss)
  local dx,dy=actor.x-boss.x,actor.y-25-boss.y
  return math.sqrt(dx*dx+dy*dy)
 end

 function combat.pursue(boss,spec,target,speed)
  local dx,dy=target.x-boss.x,target.y-25-boss.y
  local span=math.sqrt(dx*dx+dy*dy)
  if span>0 then
   boss.x=clamp(boss.x+dx*speed/span,spec.arenaMin+63,spec.arenaMax-63)
   setDepth(boss,spec,clamp(boss.y+dy*speed/span,spec.depthMin,spec.depthMax))
  end
  if dx~=0 then boss.facing=dx>0 and 1 or -1 end
 end

 function combat.begin(boss,spec,move,target)
  boss.facing=target.x<boss.x and -1 or 1
  boss.waterGuard=move.guardUntil~=nil
  boss.waterPose='brace'
  local strikes={}
  for i,stage in ipairs(move.steps) do
   local x=stage.travel and boss.x or target.x+(stage.offsetX or 0)
   local y=(stage.fromBossDepth and boss.y or target.y-25)+(stage.offsetY or 0)
   local to=stage.travel and clamp(x+boss.facing*stage.travel,spec.arenaMin+22,spec.arenaMax-22) or x
   strikes[i]={
    first=stage.first,after=stage.after,damage=stage.damage,
    origin=x,destination=to,x=x,radius=stage.halfWidth,
    left=math.max(spec.arenaMin,math.min(x,to)-stage.halfWidth),
    right=math.min(spec.arenaMax,math.max(x,to)+stage.halfWidth),
    top=y-stage.halfHeight,bottom=y+stage.halfHeight,seen={},
   }
  end
  return {move=move,tick=0,strikes=strikes}
 end

 function combat.cancel(boss)
  boss.waterGuard=false
  boss.waterPose='idle'
 end

 function combat.tick(s,boss,spec,cast)
  local tick=cast.tick+1
  cast.tick=tick
  boss.waterGuard=cast.move.guardUntil and tick<cast.move.guardUntil or false
  boss.waterPose=tick<cast.strikes[#cast.strikes].after and 'brace' or 'idle'
  local source={id=boss.id,owner=boss,y=boss.y,damageElement=spec.element}
  for _,strike in ipairs(cast.strikes) do
   if tick>=strike.first and tick<strike.after then
    boss.waterPose='strike'
    local prior=strike.x
    strike.x=strike.origin+(strike.destination-strike.origin)*(tick-strike.first+1)/(strike.after-strike.first)
    strike.activeLeft=math.max(strike.left,math.min(prior,strike.x)-strike.radius)
    strike.activeRight=math.min(strike.right,math.max(prior,strike.x)+strike.radius)
    C.hitFieldArea(s,source,strike.seen,strike.activeLeft,strike.activeRight,strike.top,strike.damage,strike.bottom)
   end
  end
  if tick>=cast.move.total then combat.cancel(boss);return true end
 end

 function combat.damageFactor(s,cast,boss,spec)
  if guarded(boss) and (cast.x-boss.x)*boss.facing>=0 then return spec.frontGuardFactor end
  return 1
 end

 function combat.label(boss,cast)
  if guarded(boss) then return '装甲を閉じた・背後へ' end
  if cast and cast.tick>=cast.strikes[#cast.strikes].after then return '装甲が開いた・反撃' end
 end

 function combat.swimAction(s,boss,spec,key)
  local a=s.actors[s.active]
  if a.hp<=0 then return end
  local skill=spec.swimPlayer
  if key=='normal' then
   if boss.hp<=0 or (a.cd.swimPulse or 0)>0 then return end
   a.cd.swimPulse=skill.pulseCooldown
   local x,y=a.x+a.dir*24,a.y-28
   s.effects[#s.effects+1]={x=x+a.dir*skill.range*.46,y=y,w=skill.range*.92,h=22,life=.23,color=pulseColor}
   C.resolveCast(s,{id=a.id,targetId=boss.id,key='swimPulse',x=x,y=y,dir=a.dir,
    range=skill.range,vertical=skill.vertical,limit=1,mult=skill.multiplier,color=pulseColor,
    element='physical',atk=a.atk,gain=0,isNormal=true})
  elseif (key=='jump' or key=='dodge') and (a.cd.swimBurst or 0)<=0 then
   local dx,dy=a.swimDx or 0,a.swimDy or 0
   if dx==0 and dy==0 then dx=a.dir end
   local distance=skill.burstDistance/math.sqrt(dx*dx+dy*dy)
   a.x=clamp(a.x+dx*distance,20,s.worldwidth-20)
   a.y=clamp(a.y+dy*distance,s.storySwimming.top,s.storySwimming.bottom)
   a.inv=math.max(a.inv,skill.burstInvulnerability)
   a.cd.swimBurst=skill.burstCooldown
   s.camera=clamp(a.x-400,0,math.max(0,s.worldwidth-960))
   C.combatEvent(s,'swim_burst',a.id)
  end
 end

 function combat.swimStep(s,boss,spec,input)
  local a=s.actors[s.active]
  a.swimDx=(input.right and 1 or 0)-(input.left and 1 or 0)
  a.swimDy=(input.down and 1 or 0)-(input.up and 1 or 0)
  if input.attack then combat.swimAction(s,boss,spec,'normal') end
 end

 function combat.swimStatus(s,boss)
  local a=s.actors[s.active]
  return {pulseCooldown=a.cd.swimPulse or 0,burstCooldown=a.cd.swimBurst or 0,guard=guarded(boss)}
 end

 function combat.frame(field,boss,spec,cast)
  field.warnings={}
  if not cast then return end
  for _,strike in ipairs(cast.strikes) do
   if cast.tick<strike.after then
    field.warnings[#field.warnings+1]={
     left=strike.left,right=strike.right,top=strike.top,bottom=strike.bottom,
     first=strike.first,after=strike.after,active=cast.tick>=strike.first,
     activeLeft=strike.activeLeft,activeRight=strike.activeRight,
    }
   end
  end
 end

 local function band(f,x,y,w,h,color)
  f.draws[#f.draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 function combat.draw(f,s,boss,spec,cast,mode,profile)
  if cast then
   for i,strike in ipairs(cast.strikes) do
    if cast.tick<strike.after then
     local left,right=strike.left-s.camera,strike.right-s.camera
     local top,bottom=strike.top,strike.bottom
     band(f,left,top,right-left,bottom-top,warningColor..'23')
     if cast.tick>=strike.first then
      band(f,strike.activeLeft-s.camera,top,strike.activeRight-strike.activeLeft,bottom-top,warningColor..'70')
     end
     band(f,left,top,right-left,2,warningColor)
     band(f,left,bottom-2,right-left,2,warningColor)
     band(f,left,top,2,bottom-top,warningColor)
     band(f,right-2,top,2,bottom-top,warningColor)
     if #cast.strikes>1 then
      f.draws[#f.draws+1]={kind='text',text=tostring(i),x=left+15,y=top+17,size=14,color=warningColor}
     end
    end
   end
  end
  local art=C.branchLegendArt[spec.art][boss.waterPose]
  C.drawFieldDisplayArt(f,art,boss.x-s.camera,boss.y+spec.artPivotOffset*spec.artScale,
   art.box[4]*spec.artScale,mode,profile,boss.facing>0)
 end

 return combat
end
