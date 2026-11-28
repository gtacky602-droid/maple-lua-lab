-- Weekly arenas have their own progress and part ownership, separate from field spawns.
return function(C,configs,controllers)
 local enter=C.enterWeeklyBossNode
 local step,frame,checkpoint,restore,onKill=C.step,C.frame,C.checkpoint,C.restore,C.onKill
 local action,enemyHitDamage=C.action,C.enemyHitDamage
 local byId,byNode={},{}
 for _,spec in ipairs(configs) do
  byId[spec.id]=spec;byNode[spec.node]=spec
  if spec.innerNode then byNode[spec.innerNode]=spec end
 end
 function C.atlasWeeklyTransfer(id)
  local spec=byNode[id]
  if spec and spec.atlasTransfer then return spec end
 end
 local function current(s)
  local id=s.story and s.story.active and s.story.node
  return id and s.campaign and s.campaign.zone=='story:'..id and byNode[id] or nil
 end
 local function sharedRoom(s,spec)
  local room=s.coop
  if room and room.weeklySpec==spec and C.sharesCoopField(s) then return room end
 end
 function C.currentWeeklyBoss(s)
  local spec=current(s)
  local room=spec and sharedRoom(s,spec)
  return room and room.weeklySlot or (spec and s.weeklySlots and s.weeklySlots[spec.id]),spec
 end
 function C.weeklyTargetActor(s,x)
  if not s.parties then
   local a=s.actors[s.active]
   return a.hp>0 and a or s.actors[3-s.active]
  end
  local best,distance
  for _,party in ipairs(s.parties) do
   local a=party.actors[party.active]
   if a.hp<=0 then a=party.actors[3-party.active] end
   local d=math.abs(a.x-x)
   if a.hp>0 and (not distance or d<distance) then best,distance=a,d end
  end
  return best
 end
 function C.enemyHitDamage(s,a,e,mult,element,resist)
  local slot=C.currentWeeklyBoss(s)
  if slot and slot.mode then mult=mult*slot.mode.attackFactor end
  return enemyHitDamage(s,a,e,mult,element,resist)
 end
 function C.moveWeeklyScene(s,id,spawn)
  local room=s.coopWorld
  if room then
   local spec=room.weeklySpec
   if not spec.innerNode or byNode[id]~=spec then return false end
   local moved=0
   for _,member in ipairs(room.members) do
    local party=member.state
    if C.sharesCoopField(party) then
     if not C.switchWeeklyStoryScene(party,id,spawn+moved*72) then return false end
     if moved==0 then room.platforms,room.solids=party.platforms,party.solids end
     moved=moved+1
    end
   end
   if moved==0 then return false end
   room.node,s.story.node=id,id
   s.platforms=room.platforms
   for _,member in ipairs(room.members) do
    local party=member.state
    if C.sharesCoopField(party) then party.platforms,party.solids=room.platforms,room.solids end
   end
   return true
  end
  local slot,spec=C.currentWeeklyBoss(s)
  if not slot or not spec.innerNode or byNode[id]~=spec then return false end
  return C.switchWeeklyStoryScene(s,id,spawn)
 end
 local function spawn(s,spec,slot)
  local hp=slot.mode and slot.mode.draftHp or spec.hp
  slot.primary={id=spec.entity,weeklyBoss=spec.id,boss=true,custom=true,x=spec.center,y=spec.floorY,
   hp=hp,maxhp=hp,level=spec.level,rewardMora=spec.mora,expRole=spec.expRole,
   respawn=math.huge,warning=0}
  slot.phase='available';slot.cast=nil;slot.reward=nil
  controllers[spec.controller].spawn(s,slot,spec)
 end
 local function cleanup(s,spec,slot)
  controllers[spec.controller].cleanup(s,slot,spec)
  slot.cast=nil
 end
 local function rankedReward(s,slot,spec)
  local mode=slot.mode
  if not mode then return end
  local record=s.endgame and s.endgame.weekly and s.endgame.weekly[spec.id..':'..mode.id]
  slot.primary.fixedKillXp=mode.xp+(record and 0 or mode.firstXp)
  slot.primary.rewardMora=mode.mora+(record and 0 or mode.firstMora)
  slot.primary.level=mode.level
 end
 local function attach(s,slot,spec)
  slot.attemptAt=s.t;slot.lastDamage=s.damage
  if not s.parties then rankedReward(s,slot,spec)
  elseif slot.mode then slot.primary.level=slot.mode.level end
  controllers[spec.controller].attach(s,slot,spec);slot.attached=true
 end
 local function roomState(room,actors,owners,parties)
  return {t=room.time,actors=actors,actorOwners=owners,parties=parties,active=parties[1] and parties[1].active,coopWorld=room,
   story={node=room.node},enemies=room.enemies,platforms=room.platforms}
 end
 local function currentRoomState(room)
  local actors,owners,parties={},{},{}
  for _,member in ipairs(room.members) do
   local s=member.state
   if member.online and C.sharesCoopField(s) then
    parties[#parties+1]=s
    for _,a in ipairs(s.actors) do actors[#actors+1]=a;owners[a]=s end
   end
  end
  return roomState(room,actors,owners,parties)
 end
 local function syncPlatforms(room,world)
  room.platforms=world.platforms
  for _,party in ipairs(world.parties) do party.platforms=room.platforms end
 end
 function C.adoptCoopWeekly(room,s)
  local spec=byNode[room.node]
  if not spec or not spec.coop then return end
  local live=s.weeklySlots[spec.id]
  room.weeklySpec,room.weeklySlot,room.platforms=spec,live,s.platforms
  local personal={generation=live.generation,waitUntil=live.waitUntil,mode=live.mode}
  spawn(s,spec,personal)
  if live.waitUntil then personal.primary.hp=0;personal.phase='respawn' end
  s.weeklySlots[spec.id]=personal
  local controller=controllers[spec.controller]
  if controller.share then controller.share(live,s.actors) end
 end
 function C.leaveCoopWeekly(room,s)
  local spec=room.weeklySpec
  if spec then
   local controller=controllers[spec.controller]
   if controller.leaveCoop then controller.leaveCoop(s,room.weeklySlot) end
  end
 end
 function C.prepareCoopWeekly(room,dt)
  local slot,spec=room.weeklySlot,room.weeklySpec
  local world=currentRoomState(room)
  if slot.waitUntil or slot.rechallenge then
   if slot.waitUntil and room.time+1e-8<slot.waitUntil then return end
   if slot.rechallenge then cleanup(world,spec,slot) end
   if spec.innerNode and room.node~=spec.node then
    assert(C.moveWeeklyScene(world,spec.node,spec.sceneSpawn))
   end
   slot.waitUntil,slot.rechallenge=nil,nil;slot.generation=slot.generation+1
   spawn(world,spec,slot);attach(world,slot,spec)
  end
  controllers[spec.controller].prepare(world,slot,spec,{},dt)
  syncPlatforms(room,world)
 end
 function C.advanceCoopWeekly(room,actors,owners,parties,dt)
  local slot,spec=room.weeklySlot,room.weeklySpec
  if slot.waitUntil then return end
  local world=roomState(room,actors,owners,parties)
  controllers[spec.controller].finish(world,slot,spec,dt)
  syncPlatforms(room,world)
 end
 function C.finishCoopWeekly(room,e)
  local slot,spec=room.weeklySlot,room.weeklySpec
  if not slot or e~=slot.primary or slot.waitUntil then return end
  slot.waitUntil=room.time+spec.respawnTicks/60;slot.phase='respawn'
  local world=currentRoomState(room)
  cleanup(world,spec,slot);syncPlatforms(room,world)
 end
 function C.coopCreditTarget(s,e)
  if not e.weeklyBoss then return e end
  local spec=byId[e.weeklyBoss]
  local slot=s.weeklySlots and s.weeklySlots[e.weeklyBoss]
  local room=sharedRoom(s,spec)
  if not slot or slot.waitUntil or not room or room.weeklySlot.primary~=e then return end
  -- Resolve first-clear bonuses from the personal attempt and history.
  rankedReward(s,slot,spec)
  slot.primary.hp=0
  return slot.primary
 end
 function C.weeklyCoopMode(s)
  local spec=current(s)
  local slot=spec and spec.coop and s.weeklySlots and s.weeklySlots[spec.id]
  return slot and slot.mode and slot.mode.id
 end
 function C.weeklyCoopSite(s)
  local spec=current(s)
  return spec and spec.coop and spec.innerNode and spec.node or nil
 end
 function C.weeklyCoopVariant(s)
  local slot,spec=C.currentWeeklyBoss(s)
  local controller=spec and spec.coop and controllers[spec.controller]
  if slot and controller and controller.coopVariant then return controller.coopVariant(slot) end
 end
 function C.enterCoopNode(s,id,rank)
  local spec=byNode[id]
  if rank and spec and spec.coop then
   for _,mode in ipairs(spec.modes or {}) do
    if mode.id==rank and s.progression.level>=mode.level then s.weeklyEntry={node=id,mode=mode};break end
   end
  end
  C.enterStoryNode(s,id)
  s.weeklyEntry=nil
 end
 function C.enterWeeklyBossNode(s,id)
  if enter then enter(s,id) end
  for key,slot in pairs(s.weeklySlots or {}) do
   local spec=byId[key]
   if byNode[id]~=spec then
    cleanup(s,spec,slot)
    slot.mode=nil;slot.reward=nil
    if not slot.waitUntil then spawn(s,spec,slot);slot.attached=false end
   end
  end
  local spec=byNode[id]
  if not spec then return end
  s.weeklySlots=s.weeklySlots or {}
  local slot=s.weeklySlots[spec.id]
  local mode=s.weeklyEntry and s.weeklyEntry.node==id and s.weeklyEntry.mode
  local fresh=not slot
  if fresh then slot={generation=1};s.weeklySlots[spec.id]=slot end
  if mode then slot.mode=mode end
  if fresh or (mode and mode.draftHp and not slot.waitUntil) then spawn(s,spec,slot) end
  if not slot.waitUntil then attach(s,slot,spec) end
 end
 function C.action(s,key)
  local slot,spec=C.currentWeeklyBoss(s)
  local controller=spec and controllers[spec.controller]
  local id,rank=key:match('^weekly_start:([%w%-]+):(%a+)$')
  if id then
   local target=byId[id]
   if not target or not target.modes or not s.story or not s.story.active or not s.progression
      or s.paused or s.lift or s.voyage or slot then return end
   local stored=s.weeklySlots and s.weeklySlots[id]
   if stored and stored.waitUntil then s.storyNotice='週ボスの再出現を待ってください。';return end
   for _,mode in ipairs(target.modes) do
    if mode.id==rank then
     if s.progression.level<mode.level then s.storyNotice='必要レベル '..mode.level..' に達していません。';return end
     s.weeklyEntry={node=target.node,mode=mode}
     action(s,'story_portal:'..target.node)
     s.weeklyEntry=nil
     return
    end
   end
   return
  end
  if key=='encounter_interact' or key=='encounter_confirm' or key=='encounter_cancel' or key:match('^encounter_target:') then
   if slot and not s.paused and not slot.waitUntil and controller.interact then controller.interact(s,slot,spec,key) end
   return
  end
  if slot and not s.paused and not slot.waitUntil and controller.beforeAction then controller.beforeAction(s,slot,key) end
  return action(s,key)
 end
 function C.step(s,dt,input)
  local slot,spec=C.currentWeeklyBoss(s)
  local shared=slot and sharedRoom(s,spec)
  local active=slot and not shared and not slot.waitUntil and not s.paused and dt>0
  if active then controllers[spec.controller].prepare(s,slot,spec,input or {},dt) end
  local before,returns,damage=s.t,s.returns,s.damage
  step(s,dt,input)
  if s.t==before then return end
  for id,stored in pairs(s.weeklySlots or {}) do
   if stored.waitUntil and s.t+1e-8>=stored.waitUntil then
    stored.waitUntil=nil;stored.generation=stored.generation+1;spawn(s,byId[id],stored)
    if current(s)==byId[id] and not sharedRoom(s,byId[id]) then attach(s,stored,byId[id]) end
   end
  end
  if active and returns==s.returns and current(s)==spec and not slot.waitUntil then
   controllers[spec.controller].finish(s,slot,spec,dt)
   if s.damage>slot.lastDamage then
    C.noteGrowth(s,'weekly-participation')
    slot.lastDamage=s.damage
   end
  end
  if shared and s.damage>damage then C.noteGrowth(s,'weekly-participation') end
  if slot and current(s)==spec and controllers[spec.controller].afterStep then
   controllers[spec.controller].afterStep(s,slot,spec)
  end
 end
 function C.onKill(s,e)
  if e.weeklyBoss then
   local spec=byId[e.weeklyBoss];local slot=s.weeklySlots and s.weeklySlots[e.weeklyBoss]
   local room=sharedRoom(s,spec)
   if not slot or e~=slot.primary or e.hp>0 or slot.waitUntil then return end
   slot.waitUntil=s.t+spec.respawnTicks/60;slot.phase='respawn'
   local started=slot.attemptAt
   if room then started=s.t-(room.time-room.weeklySlot.attemptAt)
   else cleanup(s,spec,slot) end
   C.noteGrowth(s,'weekly-participation')
   if slot.mode then
    local mode=slot.mode
    local first=C.recordWeeklyClear(s,spec.id,mode.id,started)
    slot.reward={xp=e.fixedKillXp,mora=e.rewardMora,first=first}
   elseif C.recordChallengeBoss then C.recordChallengeBoss(s,spec.id,started) end
   C.storyBossDefeated(s,spec.storyChallenge)
  end
  if onKill then onKill(s,e) end
 end
 local function wait(now,slot)
  return slot.waitUntil and math.max(1,math.ceil((slot.waitUntil-now)*60-1e-7)) or 0
 end
 function C.checkpoint(s)
  local out=checkpoint(s)
  if out and s.weeklySlots then
   out.weeklyBosses={}
   for id,slot in pairs(s.weeklySlots) do
    -- An unfinished weekly attempt restarts at full HP on re-entry/restore.
    out.weeklyBosses[id]={generation=slot.generation,hp=slot.waitUntil and 0 or byId[id].hp,waitTicks=wait(s.t,slot)}
   end
  end
  return out
 end
 function C.restore(data,density)
  local s=restore(data,density)
  if data.weeklyBosses then
   s.weeklySlots={}
   for id,saved in pairs(data.weeklyBosses) do
    local spec=byId[id];local slot={generation=saved.generation}
    s.weeklySlots[id]=slot;spawn(s,spec,slot);slot.attached=false
    if saved.waitTicks>0 then
     slot.primary.hp=0;slot.waitUntil=s.t+saved.waitTicks/60;slot.phase='respawn'
    end
   end
   local spec=current(s)
   if spec then C.enterWeeklyBossNode(s,spec.node) end
  end
  return s
 end
 function C.captureWeeklyScenery(s,mode,profile)
  local slot,spec=C.currentWeeklyBoss(s)
  local f={draws={},weeklyBoss={}}
  if slot then controllers[spec.controller].observe(f,s,slot,spec,mode,profile) end
  return f
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local slot,spec=C.currentWeeklyBoss(s)
  local portal=f.storyNearbyPortal
  local target=portal and byNode[portal.to]
  if target and target.node==portal.to and not target.modes then
   local stored=s.weeklySlots and s.weeklySlots[target.id]
   if stored and stored.waitUntil then portal.weeklyRespawnSeconds=wait(s.t,stored)/60 end
  end
  if target and target.node==portal.to and target.modes and not slot then
   local stored=s.weeklySlots and s.weeklySlots[target.id]
   local remaining=stored and wait(s.t,stored)/60 or 0
   local history=s.endgame and s.endgame.weekly
   f.weeklyDesk={id=target.id,name=target.name,remaining=remaining,modes={},
    storyRecord=s.endgame and s.endgame.bosses and s.endgame.bosses[target.id],
    resistance=controllers[target.controller].entranceResistance}
   for _,rank in ipairs(target.modes) do
    f.weeklyDesk.modes[#f.weeklyDesk.modes+1]={id=rank.id,name=rank.name,level=rank.level,
     available=portal.available and not s.paused and remaining==0 and s.progression.level>=rank.level,
     attackFactor=rank.attackFactor,hp=rank.draftHp or target.hp,draftHp=rank.draftHp~=nil,
     xp=rank.xp,firstXp=rank.firstXp,mora=rank.mora,firstMora=rank.firstMora,
     record=history and history[target.id..':'..rank.id]}
   end
  end
  if not slot then return f end
  local room=sharedRoom(s,spec)
  local personal=room and s.weeklySlots[spec.id] or slot
  f.weeklyBoss={id=spec.id,name=spec.name,level=slot.mode and slot.mode.level or spec.level,hp=slot.primary.hp,maxhp=slot.primary.maxhp,
   difficulty=slot.mode and slot.mode.name,reward=personal.reward,
   generation=slot.generation,phase=slot.phase,remaining=wait(room and room.time or s.t,slot)/60}
  -- The base frame has finished grouping field sprites. Group weekly sprites in the same response.
  if f.rectBatches then f.rectIndex={} end
  controllers[spec.controller].observe(f,s,slot,spec,mode,profile)
  f.rectIndex=nil
  f.commands=#f.draws
  return f
 end
end
