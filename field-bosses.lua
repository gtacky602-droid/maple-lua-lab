return function(C,configs,controllers)
 local step,frame,onKill,checkpoint,restore=C.step,C.frame,C.onKill,C.checkpoint,C.restore
 local after=C.afterElementHit
 local damageFactor=C.damageFactor
 local defeatEnemy=C.defeatEnemy
 local byId,byNode={},{}
 for _,spec in ipairs(configs) do byId[spec.id]=spec;byNode[spec.node]=spec end
 local shared={hp=true,invulnerable=true}
 local healthProxy={
  __index=function(body,key) if shared[key] then return body.sharedHealth[key] end end,
  __newindex=function(body,key,value)
   if shared[key] then body.sharedHealth[key]=value else rawset(body,key,value) end
  end
 }
 function C.bindFieldPartner(primary,partner)
  partner.sharedHealth=primary
  primary.fieldPartner=setmetatable(partner,healthProxy)
  return primary.fieldPartner
 end
 function C.removeFieldSummon(state,summon)
  summon.hp=0
  for i,enemy in ipairs(state.enemies) do
   if enemy==summon then table.remove(state.enemies,i);break end
  end
 end
 function C.clearFieldSummon(state,cast)
  local summon=cast and cast.summon
  if not summon then return end
  C.removeFieldSummon(state,summon)
  cast.summon=nil
 end
 function C.damageFactor(s,cast,e,element)
  local factor=damageFactor and damageFactor(s,cast,e,element) or 1
  local spec=byId[e.fieldBoss]
  local behavior=spec and controllers[spec.controller]
  return behavior and behavior.damageFactor and factor*behavior.damageFactor(s,cast,e,spec,element) or factor
 end
 local function current(s)
  local node=s.story and s.story.active and s.story.node
  return node and s.campaign and s.campaign.zone=='story:'..node and node or nil
 end
 local function available(s,spec)
  if not spec.storyWindow then return true end
  if s.storyDuelReplay==spec.id then return true end
  local window=spec.storyWindow
  local state=s.story and s.story.quests[window.quest]
  return state and ((state.status=='active' and state.count>=window.first and state.count<window.after)
    or (window.repeatAfterReport and state.status=='complete'))
 end
 local function sharedRoom(s,id)
  local room=s.coop
  if room and room.fieldSpec and room.fieldSpec.id==id and C.sharesCoopField(s) then return room end
 end
 function C.fieldSlot(s,id)
  local room=sharedRoom(s,id)
  return room and room.fieldSlot or (s.fieldSlots and s.fieldSlots[id]),room and room.time or s.t
 end
 function C.fieldCastStartedSince(party,id,cast,openedAt)
  if not openedAt or not cast.startedAt then return false end
  -- Compare time elapsed on each clock, including for parties that joined late.
  local _,now=C.fieldSlot(party,id)
  return party.t-cast.startedAt<=now-openedAt+1e-8
 end
 function C.captureFieldBacklash(party,boss,actor,hit)
  local cast={id=actor,key=hit.key,atk=hit.atk,x=boss.x,y=boss.y,dir=1,radial=true,range=1,
   limit=1,targetId=boss.id,mult=1,color=hit.color,element=hit.element,reaction=true,critRate=0,gain=0}
  return {party=party,cast=cast,damage=C.enemyHitDamage(party,cast,boss,1,cast.element)}
 end
 function C.resolveFieldBacklash(state,boss,backlash)
  local party,cast=backlash.party,backlash.cast
  if not state.parties or (party.enemies==state.enemies and C.sharesCoopField(party) and party.coopMember.online) then
   if backlash.impactKind then C.combatEvent(party,backlash.impactKind,cast.id,boss.id) end
   C.resolveCast(party,cast)
  else
   -- A hit launched before departure still lands, without credit in the new scene.
   if boss.hp<=backlash.damage then C.defeatEnemy(state.parties[1],boss,nil)
   else boss.hp=boss.hp-backlash.damage end
  end
 end
 function C.fieldGravityFactor(s,a)
  local spec=byNode[current(s)]
  local slot=spec and C.fieldSlot(s,spec.id)
  local zone=slot and slot.cast and slot.cast.gravity
  if zone and a.x>=zone.left and a.x<=zone.right and a.y>=zone.top and a.y<=zone.bottom then
   return zone.factor
  end
  return 1
 end

 local function spawn(slot,spec,hp)
  slot.enemy={id=spec.entity,fieldBoss=spec.id,boss=true,custom=true,x=spec.home,home=spec.home,y=spec.floorY,
   hp=hp,maxhp=spec.hp,respawn=math.huge,warning=0,cd=0,level=spec.level,
   rewardMora=spec.mora,expRole=spec.expRole or 'field_boss',resist=spec.resist,immune=spec.immune,hitTop=spec.floorY-spec.artHeight,
   hitBottom=spec.floorY,drawHeight=spec.artHeight,facing=-1}
  slot.phase='available';slot.index=1;slot.out=0;slot.delay=0;slot.contact={};slot.cast=nil;slot.waitUntil=nil
  slot.entryAt=nil
  local behavior=controllers[spec.controller]
  if behavior.spawn then behavior.spawn(slot.enemy,spec,slot.generation) end
  if spec.provokeOnly then slot.enemy.noAutoTarget=true end
 end

 local function attach(s,spec,slot)
  if slot.enemy.hp==spec.hp and not slot.waitUntil then slot.entryAt=s.t end
  local function place(body)
   for i,e in ipairs(s.enemies) do
    if e.fieldBoss==spec.id and e.id==body.id then s.enemies[i]=body;return end
   end
   s.enemies[#s.enemies+1]=body
  end
  if slot.enemy.fieldMembers then
   for _,member in ipairs(slot.enemy.fieldMembers) do place(member) end
  else
   place(slot.enemy)
   if slot.enemy.fieldPartner then place(slot.enemy.fieldPartner) end
  end
 end

 function C.shareFieldHits(groups,actors)
  for _,seen in ipairs(groups) do
   for _,a in ipairs(actors) do
    seen[a],seen[a.id]=seen[a.id],nil
   end
  end
 end

 function C.adoptCoopField(room,s)
  local spec=byNode[room.node]
  if not spec or not spec.coop then return end
  local live=s.fieldSlots[spec.id]
  room.fieldSpec,room.fieldSlot=spec,live
  -- Keep the running encounter in the room. Solo saves retain an independent slot.
  local personal={generation=live.generation}
  spawn(personal,spec,spec.manualRechallenge and spec.hp or live.enemy.hp)
  local behavior=controllers[spec.controller]
  if not spec.manualRechallenge and behavior.checkpoint and behavior.restore then
   behavior.restore(personal.enemy,spec,behavior.checkpoint(live.enemy,spec,live),personal)
  end
  personal.waitUntil,personal.entryAt=live.waitUntil,live.entryAt
  if personal.waitUntil then personal.phase='respawn' end
  s.fieldSlots[spec.id]=personal
  live.entryAt=live.entryAt or room.time
  C.shareFieldHits({live.contact},s.actors)
  if live.cast and behavior.shareCast then behavior.shareCast(live.cast,s.actors) end
 end

 function C.rechallengeCoopField(room)
  local spec,slot=room.fieldSpec,room.fieldSlot
  if not spec or not spec.manualRechallenge or slot.phase~='cleared' then return end
  slot.generation=slot.generation+1
  spawn(slot,spec,spec.hp)
  attach({enemies=room.enemies,t=room.time},spec,slot)
 end

 local function cancelCast(s,spec,slot)
  local behavior=controllers[spec.controller]
  if slot.cast and behavior.cancel then
   behavior.cancel(slot.enemy,spec,s,slot.cast)
   slot.cast=nil;slot.index=1;slot.delay=spec.restTicks
  end
 end

 function C.enterFieldBossNode(s,id)
  C.clearRadiantCocoons(s)
  for other,slot in pairs(s.fieldSlots or {}) do
   local previous=byId[other]
   if previous.node~=id then
    cancelCast(s,previous,slot)
    if previous.manualRechallenge then s.fieldSlots[other]=nil end
   end
  end
  local spec=byNode[id]
  if not spec or not available(s,spec) then return end
  s.fieldSlots=s.fieldSlots or {}
  local slot=s.fieldSlots[spec.id]
  if not slot then
   slot={generation=1}
   spawn(slot,spec,spec.hp)
   s.fieldSlots[spec.id]=slot
  end
  attach(s,spec,slot)
 end

 function C.resetFieldTrial(s,id)
  if s.fieldSlots then s.fieldSlots[id]=nil end
 end

 local function horizontalDistance(actor,body)
  return math.abs(actor.x-body.x)
 end

 local function nearest(s,spec,boss,behavior)
  local best,distance=nil,math.huge
  local range=behavior.distance or horizontalDistance
  for _,a in ipairs(s.actors) do
   local dx=range(a,boss)
   if boss.fieldPartner then dx=math.min(dx,range(a,boss.fieldPartner)) end
   if boss.fieldMembers then
    dx=math.huge
    for _,member in ipairs(boss.fieldMembers) do
     if member.hp>0 then dx=math.min(dx,range(a,member)) end
    end
   end
   if a.hp>0 and a.x>=spec.arenaMin and a.x<=spec.arenaMax and dx<distance then best,distance=a,dx end
  end
  return best,distance
 end

 local function returnHome(s,spec,slot,here)
  local boss=slot.enemy
  local speed=(spec.returnSpeed or spec.walkSpeed*2.4)/60
  local function walkHome(body)
   local dx=body.home-body.x
   if math.abs(dx)<=speed then body.x=body.home;return true end
   body.facing=dx<0 and -1 or 1
   body.x=body.x+body.facing*speed
  end
  local arrived=walkHome(boss)
  if boss.fieldPartner then arrived=walkHome(boss.fieldPartner) and arrived end
  for _,member in ipairs(boss.fieldMembers or {}) do
   if member.hp>0 then arrived=walkHome(member) and arrived end
  end
  if arrived then
   spawn(slot,spec,spec.hp)
   if here then attach(s,spec,slot) end
  end
 end

 function C.hitFieldArea(s,source,seen,left,right,top,damage,bottom)
  bottom=bottom or source.y
  local owner=source.owner or source
  for _,a in ipairs(s.actors) do
   if owner.hp<=0 then break end
   local key=s.actorOwners and a or a.id
   if a.hp>0 and not seen[key] and a.x+10>left and a.x-10<right and a.y>top and a.y-50<bottom then
    seen[key]=true
    C.damageActor(s.actorOwners and s.actorOwners[a] or s,a,damage,source,false,true)
   end
  end
 end

 function C.hitFieldCapsule(s,source,seen,x0,x1,y,radius,damage,verticalRadius)
  local left,right=math.min(x0,x1),math.max(x0,x1)
  local owner=source.owner or source
  local verticalScale=radius/(verticalRadius or radius)
  for _,a in ipairs(s.actors) do
   if owner.hp<=0 then break end
   local key=s.actorOwners and a or a.id
   if a.hp>0 and not seen[key] then
    local dx=math.max(0,left-a.x-10,a.x-10-right)
    local dy=math.max(0,a.y-50-y,y-a.y)*verticalScale
    if dx*dx+dy*dy<radius*radius then
     seen[key]=true
     C.damageActor(s.actorOwners and s.actorOwners[a] or s,a,damage,source,false,true)
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
  if slot.phase=='cleared' or (spec.presentationOnly and not slot.waitUntil) then return end
  if slot.waitUntil then
   if s.t+1e-8>=slot.waitUntil then
    slot.generation=slot.generation+1
    spawn(slot,spec,spec.hp)
    if here then attach(s,spec,slot) end
   end
   return
  end
  if slot.phase=='leash' then returnHome(s,spec,slot,here);return end
  if not here then
   cancelCast(s,spec,slot)
   if spec.keepHpOnExit then slot.out=0;return end
  end
  local behavior=controllers[spec.controller]
  local target,distance
  if here then target,distance=nearest(s,spec,boss,behavior) end
  if slot.phase=='available' then
   if here and (boss.hp<boss.maxhp or (not spec.provokeOnly and target and distance<=spec.noticeRange)) then
    slot.phase='notice';slot.delay=spec.noticeTicks
    boss.noAutoTarget=nil
    if target then boss.facing=target.x<boss.x and -1 or 1 end
   end
   return
  end
  slot.out=target and 0 or slot.out+1
  if slot.out>=spec.leashTicks then
   if behavior.swimStep or boss.fieldPartner or (slot.cast and (slot.cast.summon or slot.cast.summons)) then cancelCast(s,spec,slot) end
   slot.phase='leash';slot.cast=nil;boss.invulnerable=true
   for _,member in ipairs(boss.fieldMembers or {}) do member.invulnerable=true end
   boss.y=spec.floorY;boss.drawHeight=spec.artHeight;boss.hitTop=boss.y-boss.drawHeight;boss.hitBottom=boss.y
   return
  end
  if not here then return end
  if slot.phase=='notice' then
   slot.delay=slot.delay-1
   if slot.delay<=0 then slot.phase='combat' end
   return
  end
  if behavior.preempt and behavior.preempt(boss,spec,slot) then return end
  if slot.cast then
   if behavior.tick(s,boss,spec,slot.cast,target) then slot.cast=nil;slot.delay=spec.restTicks end
   return
  end
  if not target then return end
  local move=spec.moves[slot.index]
  if not move then return end
  if behavior.selectMove then move=behavior.selectMove(boss,move) end
  local reach=move.reach
  if distance>reach-18 then
   local dir=target.x<boss.x and -1 or 1
   boss.facing=dir
   local speed=spec.walkSpeed*C.enemyRate(boss)/60
   if behavior.pursue then behavior.pursue(boss,spec,target,speed)
   else
    boss.x=math.max(spec.arenaMin+63,math.min(spec.arenaMax-63,boss.x+dir*speed))
    if behavior.walk then behavior.walk(boss,spec,target,speed) end
   end
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
    local key=s.actorOwners and a or a.id
    if a.hp>0 and a.y>=spec.floorY-35 and math.abs(a.x-boss.x)<27 and s.t+1e-8>=(slot.contact[key] or 0) then
     slot.contact[key]=s.t+1
     C.damageActor(s.actorOwners and s.actorOwners[a] or s,a,spec.contactDamage,boss,false,false)
    end
   end
  end
 end

 function C.advanceCoopField(room,actors,owners,parties)
  if not room.fieldSlot or #parties==0 then return end
  local combat={t=room.time,actors=actors,actorOwners=owners,parties=parties,enemies=room.enemies,solids=room.solids}
  advance(combat,room.fieldSpec,room.fieldSlot,true)
 end

 function C.fieldSwimAction(s,key)
  local spec=byNode[current(s)]
  local slot=spec and C.fieldSlot(s,spec.id)
  local behavior=slot and controllers[spec.controller]
  if behavior and behavior.swimAction and s.storySwimming and not s.lift and not s.paused then
   behavior.swimAction(s,slot.enemy,spec,key,slot.cast)
  end
 end

 function C.step(s,dt,input)
  local before=s.t
  step(s,dt,input)
  local ticks=math.floor((s.t-before)*60+.5)
  if ticks<=0 then return end
  local node=current(s)
  local swimSpec=s.storySwimming and not s.lift and byNode[node]
  if swimSpec and available(s,swimSpec) then
   local slot=C.fieldSlot(s,swimSpec.id)
   local behavior=controllers[swimSpec.controller]
   if slot and behavior.swimStep then behavior.swimStep(s,slot.enemy,swimSpec,input or {}) end
  end
  for id,slot in pairs(s.fieldSlots or {}) do
   local spec=byId[id]
   local behavior=controllers[spec.controller]
   local here=node==spec.node
   if sharedRoom(s,id) then
    if slot.waitUntil then advance(s,spec,slot,false) end
   elseif available(s,spec) and not (behavior.swimStep and s.lift) then
    for _=1,ticks do advance(s,spec,slot,here) end
   end
  end
 end

 local function finishField(s,spec,slot,now)
  local e=slot.enemy
  if not spec.manualRechallenge then slot.waitUntil=now+spec.respawnTicks/60 end
  local behavior=controllers[spec.controller]
  if behavior.onDefeat then behavior.onDefeat(s,e,spec,slot.cast) end
  slot.cast=nil;slot.phase=spec.manualRechallenge and 'cleared' or 'respawn'
  e.weakpoint=nil;e.respawn=math.huge
 end
 function C.finishCoopField(s,e)
  local room=sharedRoom(s,e.fieldBoss)
  if room and e==room.fieldSlot.enemy then finishField(s,room.fieldSpec,room.fieldSlot,room.time) end
 end
 function C.onKill(s,e)
  if e.fieldBoss then
   local spec=byId[e.fieldBoss]
   local slot=s.fieldSlots and s.fieldSlots[e.fieldBoss]
   local room=sharedRoom(s,e.fieldBoss)
   local started
   if room then
    if e~=room.fieldSlot.enemy or e.hp>0 then return end
    local entry=room.fieldSlot.entryAt
    if entry then started=s.t-(room.time-entry) end
    if not spec.manualRechallenge then
     spawn(slot,spec,0)
     slot.waitUntil=s.t+spec.respawnTicks/60;slot.phase='respawn'
    end
   else
    if not slot or e~=slot.enemy or e.hp>0 or slot.waitUntil or slot.phase=='cleared' then return end
    started=slot.entryAt
    finishField(s,spec,slot,s.t)
   end
   if not spec.presentationOnly and C.recordChallengeBoss then C.recordChallengeBoss(s,spec.id,started) end
   if spec.storyChallenge then C.storyBossDefeated(s,spec.storyChallenge) end
   if C.finishDuelReplay then C.finishDuelReplay(s,spec.id) end
   if spec.presentationOnly or spec.questRewardsOnly then return end
  end
  if onKill then onKill(s,e) end
 end

 local function updateGroup(s,group,owner)
  local slot=C.fieldSlot(s,group.fieldBoss)
  if not slot or slot.enemy~=group or group.hp<=0 then return end
  local hp=0
  for _,member in ipairs(group.fieldMembers) do hp=hp+member.hp end
  if hp==0 then defeatEnemy(s,group,owner) else group.hp=hp end
 end

 function C.defeatEnemy(s,e,owner)
  local defeated=defeatEnemy(s,e,owner)
  if defeated and e.fieldGroup then updateGroup(s,e.fieldGroup,owner) end
  return defeated
 end

 function C.afterElementHit(s,cast,e,element,damageElement,damage)
  if after then after(s,cast,e,element,damageElement,damage) end
  if e.fieldGroup and e.hp>0 then updateGroup(s,e.fieldGroup,cast.id) end
  local spec=e.fieldBoss and byId[e.fieldBoss]
  if not spec or e.hp<=0 or e.invulnerable then return end
  local behavior=controllers[spec.controller]
  if behavior.onHit then behavior.onHit(cast,e,spec,C.fieldSlot(s,spec.id),damageElement,damage,s) end
 end

 local function waitTicks(now,slot)
  return slot.waitUntil and math.max(1,math.ceil((slot.waitUntil-now)*60-1e-7)) or 0
 end

 function C.checkpoint(s)
  local data=checkpoint(s)
  if data and s.fieldSlots then
   data.fieldBosses={}
   for id,slot in pairs(s.fieldSlots) do
    local spec=byId[id]
    if not spec.manualRechallenge then
     data.fieldBosses[id]={generation=slot.generation,hp=slot.enemy.hp,waitTicks=waitTicks(s.t,slot)}
     local behavior=controllers[spec.controller]
     if behavior.checkpoint then data.fieldBosses[id].flags=behavior.checkpoint(slot.enemy,spec,slot) end
    end
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
    local behavior=controllers[byId[id].controller]
    if behavior.restore then behavior.restore(slot.enemy,byId[id],saved.flags,slot) end
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
  if not spec or not available(s,spec) then return f end
  local slot,now=C.fieldSlot(s,spec.id)
  if not slot then return f end
  local boss=slot.enemy
  local partner=boss.fieldPartner
  local behavior=controllers[spec.controller]
  if s.storySwimming and behavior.swimStatus then f.storySwimCombat=behavior.swimStatus(s,boss,spec,slot.cast) end
  local playerX=s.actors[s.active].x
  if math.abs(playerX-boss.x)>550 and (not partner or math.abs(playerX-partner.x)>550) and slot.phase=='available' then return f end
  local cast=slot.cast
  local label=slot.phase=='cleared' and '討伐完了・入口から再挑戦' or slot.phase=='notice' and '振り向き' or slot.phase=='leash' and '巣へ戻っている' or
   slot.phase=='available' and '警戒前' or cast and cast.move.title or '息継ぎ'
  if slot.phase=='cleared' and sharedRoom(s,spec.id) then label='討伐完了・全員で出口へ' end
  if slot.phase=='available' and spec.provokeOnly then label=spec.provokeLabel or '演奏中・攻撃で挑戦' end
  if slot.phase=='combat' and #spec.moves==0 then label='戦闘テスト' end
  if spec.presentationOnly and boss.hp>0 then label=spec.displayLabel or '見た目と進行を確認する仮の個体' end
  if boss.hp>0 and slot.phase=='combat' and behavior.label then label=behavior.label(boss,cast,spec,s) or label end
  f.fieldBoss={id=spec.id,name=boss.displayName or spec.name,element=boss.element,form=boss.form,level=spec.level,hp=boss.hp,maxhp=spec.hp,phase=slot.phase,
   generation=slot.generation,x=boss.x,y=boss.y,remaining=waitTicks(now,slot)/60,label=label,elementSlots=boss.elementSlots,
   move=cast and cast.move.id,tick=cast and cast.tick,underground=boss.underground,
   weakpoint=boss.hp>0 and boss.weakpoint or nil,gravity=cast and cast.gravity}
  if behavior.frame then behavior.frame(f.fieldBoss,boss,spec,cast,s) end
  local summon=cast and cast.summon
  if summon and summon.hp>0 then
   f.fieldBoss.summon={id=summon.id,x=summon.x,y=summon.y,hp=summon.hp,maxhp=summon.maxhp}
  end
  if cast and cast.summons then
   f.fieldBoss.summons={}
   for _,unit in ipairs(cast.summons) do
    if unit.hp>0 then f.fieldBoss.summons[#f.fieldBoss.summons+1]={id=unit.id,x=unit.x,y=unit.y,hp=unit.hp,
     maxhp=unit.maxhp,element=unit.element} end
   end
  end
  if partner then
   f.fieldBoss.bodies={{id=boss.id,x=boss.x,y=boss.y,element=boss.element,name=boss.memberName},
    {id=partner.id,x=partner.x,y=partner.y,element=partner.element,name=partner.memberName}}
  end
  if boss.fieldMembers then
   f.fieldBoss.bodies={}
   for i,member in ipairs(boss.fieldMembers) do
    f.fieldBoss.bodies[i]={id=member.id,x=member.x,y=member.y,element=member.element,
     name=member.memberName,hp=member.hp,maxhp=member.maxhp}
   end
  end
  local function visible(body) return body.x>=s.camera-180 and body.x<=s.camera+1140 end
  local visibleBody=visible(boss) or (partner and visible(partner))
  for _,member in ipairs(boss.fieldMembers or {}) do visibleBody=visibleBody or (member.hp>0 and visible(member)) end
  if boss.hp>0 and visibleBody then
   local layer={draws={}}
   behavior.draw(layer,s,boss,spec,cast,mode,profile)
   for _,draw in ipairs(f.draws) do layer.draws[#layer.draws+1]=draw end
   f.draws=layer.draws;f.commands=#f.draws
  end
  return f
 end
end
