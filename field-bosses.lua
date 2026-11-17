return function(C,configs,controllers)
 local step,frame,onKill,checkpoint,restore=C.step,C.frame,C.onKill,C.checkpoint,C.restore
 local after=C.afterElementHit
 local byId,byNode={},{}
 for _,spec in ipairs(configs) do byId[spec.id]=spec;byNode[spec.node]=spec end
 local function current(s)
  local node=s.story and s.story.active and s.story.node
  return node and s.campaign and s.campaign.zone=='story:'..node and node or nil
 end

 local function spawn(slot,spec,hp)
  slot.enemy={id=spec.entity,fieldBoss=spec.id,boss=true,custom=true,x=spec.home,home=spec.home,y=spec.floorY,
   hp=hp,maxhp=spec.hp,respawn=math.huge,warning=0,cd=0,level=spec.level,
   rewardMora=spec.mora,expRole='field_boss',resist=spec.resist,immune=spec.immune,hitTop=spec.floorY-spec.artHeight,
   hitBottom=spec.floorY,drawHeight=spec.artHeight,facing=-1}
  slot.phase='available';slot.index=1;slot.out=0;slot.delay=0;slot.contact={};slot.cast=nil;slot.waitUntil=nil
  local behavior=controllers[spec.controller]
  if behavior.spawn then behavior.spawn(slot.enemy,spec,slot.generation) end
 end

 local function attach(s,spec,slot)
  for i,e in ipairs(s.enemies) do
   if e.fieldBoss==spec.id then s.enemies[i]=slot.enemy;return end
  end
  s.enemies[#s.enemies+1]=slot.enemy
 end

 local function cancelCast(spec,slot)
  local behavior=controllers[spec.controller]
  if slot.cast and behavior.cancel then
   behavior.cancel(slot.enemy,spec)
   slot.cast=nil;slot.index=1;slot.delay=spec.restTicks
  end
 end

 function C.enterFieldBossNode(s,id)
  for other,slot in pairs(s.fieldSlots or {}) do
   if byId[other].node~=id then cancelCast(byId[other],slot) end
  end
  local spec=byNode[id]
  if not spec then return end
  s.fieldSlots=s.fieldSlots or {}
  local slot=s.fieldSlots[spec.id]
  if not slot then
   slot={generation=1}
   spawn(slot,spec,spec.hp)
   s.fieldSlots[spec.id]=slot
  end
  attach(s,spec,slot)
 end

 local function nearest(s,spec,boss)
  local best,distance=nil,math.huge
  for _,a in ipairs(s.actors) do
   local dx=math.abs(a.x-boss.x)
   if a.hp>0 and a.x>=spec.arenaMin and a.x<=spec.arenaMax and dx<distance then best,distance=a,dx end
  end
  return best,distance
 end

 local function returnHome(s,spec,slot,here)
  local boss=slot.enemy
  local dx=spec.home-boss.x
  local speed=(spec.returnSpeed or spec.walkSpeed*2.4)/60
  if math.abs(dx)<=speed then
   spawn(slot,spec,spec.hp)
   if here then attach(s,spec,slot) end
  else
   boss.facing=dx<0 and -1 or 1
   boss.x=boss.x+boss.facing*speed
  end
 end

 function C.hitFieldArea(s,source,seen,left,right,top,damage,bottom)
  bottom=bottom or source.y
  local owner=source.owner or source
  for _,a in ipairs(s.actors) do
   if owner.hp<=0 then break end
   if a.hp>0 and not seen[a.id] and a.x+10>left and a.x-10<right and a.y>top and a.y-50<bottom then
    seen[a.id]=true
    C.damageActor(s,a,damage,source,false,true)
   end
  end
 end

 function C.hitFieldCapsule(s,source,seen,x0,x1,y,radius,damage,verticalRadius)
  local left,right=math.min(x0,x1),math.max(x0,x1)
  local owner=source.owner or source
  local verticalScale=radius/(verticalRadius or radius)
  for _,a in ipairs(s.actors) do
   if owner.hp<=0 then break end
   if a.hp>0 and not seen[a.id] then
    local dx=math.max(0,left-a.x-10,a.x-10-right)
    local dy=math.max(0,a.y-50-y,y-a.y)*verticalScale
    if dx*dx+dy*dy<radius*radius then
     seen[a.id]=true
     C.damageActor(s,a,damage,source,false,true)
    end
   end
  end
 end

 function C.stepFieldBolt(s,boss,cast,index,x,y,radius,damage,element)
  local p=cast.projectiles[index]
  if not p then
   p={x=x,y=y,source=boss.id,damage=damage,damageElement=element}
   cast.projectiles[index]=p
  end
  cast.shots[index]=C.resolveEnemyProjectileSegment(s,p,x,y,radius,10,68)
  p.x=x;p.y=y
 end

 local function advance(s,spec,slot,here)
  local boss=slot.enemy
  if slot.waitUntil then
   if s.t+1e-8>=slot.waitUntil then
    slot.generation=slot.generation+1
    spawn(slot,spec,spec.hp)
    if here then attach(s,spec,slot) end
   end
   return
  end
  if slot.phase=='leash' then returnHome(s,spec,slot,here);return end
  if not here then cancelCast(spec,slot) end
  local target,distance
  if here then target,distance=nearest(s,spec,boss) end
  if slot.phase=='available' then
   if here and (boss.hp<boss.maxhp or (target and distance<=spec.noticeRange)) then
    slot.phase='notice';slot.delay=spec.noticeTicks
    if target then boss.facing=target.x<boss.x and -1 or 1 end
   end
   return
  end
  slot.out=target and 0 or slot.out+1
  if slot.out>=spec.leashTicks then
   slot.phase='leash';slot.cast=nil;boss.invulnerable=true
   boss.y=spec.floorY;boss.drawHeight=spec.artHeight;boss.hitTop=boss.y-boss.drawHeight;boss.hitBottom=boss.y
   return
  end
  if not here then return end
  if slot.phase=='notice' then
   slot.delay=slot.delay-1
   if slot.delay<=0 then slot.phase='combat' end
   return
  end
  local behavior=controllers[spec.controller]
  if behavior.preempt and behavior.preempt(boss,spec,slot) then return end
  if slot.cast then
   if behavior.tick(s,boss,spec,slot.cast,target) then slot.cast=nil;slot.delay=spec.restTicks end
   return
  end
  if not target then return end
  local move=spec.moves[slot.index]
  local reach=move.reach
  if distance>reach-18 then
   local dir=target.x<boss.x and -1 or 1
   boss.facing=dir
   local speed=spec.walkSpeed*C.enemyRate(boss)/60
   boss.x=math.max(spec.arenaMin+63,math.min(spec.arenaMax-63,boss.x+dir*speed))
  end
  local farShot=slot.delay<=0 and distance>reach and spec.walkSpeed==0 and behavior.farMove
  if farShot then move=behavior.farMove(spec,move);reach=move.reach end
  if slot.delay<=0 and distance<=reach then
   slot.cast=behavior.begin(boss,spec,move,target,s)
   if not farShot then slot.index=slot.index%#spec.moves+1 end
   return
  end
  slot.delay=math.max(0,slot.delay-1)
  if spec.contactDamage>0 then
   for _,a in ipairs(s.actors) do
    if a.hp>0 and a.y>=spec.floorY-35 and math.abs(a.x-boss.x)<27 and s.t+1e-8>=(slot.contact[a.id] or 0) then
     slot.contact[a.id]=s.t+1
     C.damageActor(s,a,spec.contactDamage,boss,false,false)
    end
   end
  end
 end

 function C.step(s,dt,input)
  local before=s.t
  step(s,dt,input)
  local ticks=math.floor((s.t-before)*60+.5)
  if ticks<=0 then return end
  local node=current(s)
  for id,slot in pairs(s.fieldSlots or {}) do
   local spec=byId[id]
   for _=1,ticks do advance(s,spec,slot,node==spec.node) end
  end
 end

 function C.onKill(s,e)
  if e.fieldBoss then
   local spec=byId[e.fieldBoss]
   local slot=s.fieldSlots and s.fieldSlots[e.fieldBoss]
   if not slot or e~=slot.enemy or e.hp>0 or slot.waitUntil then return end
   slot.waitUntil=s.t+spec.respawnTicks/60
   slot.cast=nil;slot.phase='respawn'
   e.respawn=math.huge
   if spec.storyChallenge then C.storyBossDefeated(s,spec.storyChallenge) end
  end
  if onKill then onKill(s,e) end
 end

 function C.afterElementHit(s,cast,e,element)
  if after then after(s,cast,e,element) end
  local spec=e.fieldBoss and byId[e.fieldBoss]
  if not spec or e.hp<=0 or e.invulnerable then return end
  local behavior=controllers[spec.controller]
  if behavior.onHit then behavior.onHit(cast,e,spec) end
 end

 local function waitTicks(s,slot)
  return slot.waitUntil and math.max(1,math.ceil((slot.waitUntil-s.t)*60-1e-7)) or 0
 end

 function C.checkpoint(s)
  local data=checkpoint(s)
  if data and s.fieldSlots then
   data.fieldBosses={}
   for id,slot in pairs(s.fieldSlots) do
    data.fieldBosses[id]={generation=slot.generation,hp=slot.enemy.hp,waitTicks=waitTicks(s,slot)}
   end
  end
  return data
 end

 function C.restore(data,density)
  local s=restore(data,density)
  if data.fieldBosses then
   s.fieldSlots={}
   for id,saved in pairs(data.fieldBosses) do
    local slot={generation=saved.generation}
    spawn(slot,byId[id],saved.hp)
    if saved.waitTicks>0 then
     slot.waitUntil=s.t+saved.waitTicks/60;slot.phase='respawn'
    elseif saved.hp<byId[id].hp then
     slot.phase='notice';slot.delay=byId[id].noticeTicks
    end
    s.fieldSlots[id]=slot
   end
   local node=current(s)
   if byNode[node] then C.enterFieldBossNode(s,node) end
  end
  return s
 end

 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  local spec=byNode[current(s)]
  local slot=spec and s.fieldSlots and s.fieldSlots[spec.id]
  if not slot then return f end
  local boss=slot.enemy
  if math.abs(s.actors[s.active].x-boss.x)>550 and slot.phase=='available' then return f end
  local cast=slot.cast
  local behavior=controllers[spec.controller]
  local label=slot.phase=='notice' and '振り向き' or slot.phase=='leash' and '巣へ戻っている' or
   slot.phase=='available' and '警戒前' or cast and cast.move.title or '息継ぎ'
  if boss.hp>0 and slot.phase=='combat' and behavior.label then label=behavior.label(boss,cast) or label end
  f.fieldBoss={id=spec.id,name=boss.displayName or spec.name,element=boss.element,form=boss.form,level=spec.level,hp=boss.hp,maxhp=spec.hp,phase=slot.phase,
   generation=slot.generation,x=boss.x,y=boss.y,remaining=waitTicks(s,slot)/60,label=label,
   move=cast and cast.move.id,tick=cast and cast.tick}
  if boss.hp>0 and boss.x>=s.camera-180 and boss.x<=s.camera+1140 then
   local layer={draws={}}
   behavior.draw(layer,s,boss,spec,cast,mode,profile)
   for _,draw in ipairs(f.draws) do layer.draws[#layer.draws+1]=draw end
   f.draws=layer.draws;f.commands=#f.draws
  end
  return f
 end
end
