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
 local function current(s)
  local id=s.story and s.story.active and s.story.node
  return id and s.campaign and s.campaign.zone=='story:'..id and byNode[id] or nil
 end
 function C.currentWeeklyBoss(s)
  local spec=current(s)
  return spec and s.weeklySlots and s.weeklySlots[spec.id],spec
 end
 function C.enemyHitDamage(s,a,e,mult,element,resist)
  local slot=C.currentWeeklyBoss(s)
  if slot and slot.mode then mult=mult*slot.mode.attackFactor end
  return enemyHitDamage(s,a,e,mult,element,resist)
 end
 function C.moveWeeklyScene(s,id,spawn)
  local slot,spec=C.currentWeeklyBoss(s)
  if not slot or not spec.innerNode or byNode[id]~=spec then return false end
  return C.switchWeeklyStoryScene(s,id,spawn)
 end
 local function spawn(s,spec,slot)
  slot.primary={id=spec.entity,weeklyBoss=spec.id,boss=true,custom=true,x=spec.center,y=spec.floorY,
   hp=spec.hp,maxhp=spec.hp,level=spec.level,rewardMora=spec.mora,expRole=spec.expRole,
   respawn=math.huge,warning=0}
  slot.phase='available';slot.cast=nil;slot.reward=nil
  controllers[spec.controller].spawn(s,slot,spec)
 end
 local function cleanup(s,spec,slot)
  controllers[spec.controller].cleanup(s,slot,spec)
  slot.cast=nil
 end
 local function attach(s,slot,spec)
  slot.attemptAt=s.t;slot.lastDamage=s.damage
  local mode=slot.mode
  if mode then
   local record=s.endgame and s.endgame.weekly and s.endgame.weekly[spec.id..':'..mode.id]
   slot.primary.fixedKillXp=mode.xp+(record and 0 or mode.firstXp)
   slot.primary.rewardMora=mode.mora+(record and 0 or mode.firstMora)
   slot.primary.level=mode.level
  end
  controllers[spec.controller].attach(s,slot,spec);slot.attached=true
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
  if not slot then slot={generation=1};s.weeklySlots[spec.id]=slot;spawn(s,spec,slot) end
  if s.weeklyEntry and s.weeklyEntry.node==id then slot.mode=s.weeklyEntry.mode end
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
  local active=slot and not slot.waitUntil and not s.paused and dt>0
  if active then controllers[spec.controller].prepare(s,slot,spec,input or {},dt) end
  local before,returns=s.t,s.returns
  step(s,dt,input)
  if s.t==before then return end
  for id,stored in pairs(s.weeklySlots or {}) do
   if stored.waitUntil and s.t+1e-8>=stored.waitUntil then
    stored.waitUntil=nil;stored.generation=stored.generation+1;spawn(s,byId[id],stored)
    if current(s)==byId[id] then attach(s,stored,byId[id]) end
   end
  end
  if active and returns==s.returns and current(s)==spec and not slot.waitUntil then
   controllers[spec.controller].finish(s,slot,spec,dt)
   if s.damage>slot.lastDamage then
    C.noteGrowth(s,'weekly-participation')
    slot.lastDamage=s.damage
   end
  end
  if slot and current(s)==spec and controllers[spec.controller].afterStep then
   controllers[spec.controller].afterStep(s,slot,spec)
  end
 end
 function C.onKill(s,e)
  if e.weeklyBoss then
   local spec=byId[e.weeklyBoss];local slot=s.weeklySlots and s.weeklySlots[e.weeklyBoss]
   if not slot or e~=slot.primary or e.hp>0 or slot.waitUntil then return end
   slot.waitUntil=s.t+spec.respawnTicks/60;slot.phase='respawn'
   cleanup(s,spec,slot)
   C.noteGrowth(s,'weekly-participation')
   if slot.mode then
    local mode=slot.mode
    local first=C.recordWeeklyClear(s,spec.id,mode.id,slot.attemptAt)
    slot.reward={xp=e.fixedKillXp,mora=e.rewardMora,first=first}
   elseif C.recordChallengeBoss then C.recordChallengeBoss(s,spec.id,slot.attemptAt) end
   C.storyBossDefeated(s,spec.storyChallenge)
  end
  if onKill then onKill(s,e) end
 end
 local function wait(s,slot)
  return slot.waitUntil and math.max(1,math.ceil((slot.waitUntil-s.t)*60-1e-7)) or 0
 end
 function C.checkpoint(s)
  local out=checkpoint(s)
  if out and s.weeklySlots then
   out.weeklyBosses={}
   for id,slot in pairs(s.weeklySlots) do
    -- An unfinished weekly attempt restarts at full HP on re-entry/restore.
    out.weeklyBosses[id]={generation=slot.generation,hp=slot.waitUntil and 0 or byId[id].hp,waitTicks=wait(s,slot)}
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
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local slot,spec=C.currentWeeklyBoss(s)
  local portal=f.storyNearbyPortal
  local target=portal and byNode[portal.to]
  if target and target.node==portal.to and target.modes and not slot then
   local stored=s.weeklySlots and s.weeklySlots[target.id]
   local remaining=stored and wait(s,stored)/60 or 0
   local history=s.endgame and s.endgame.weekly
   f.weeklyDesk={id=target.id,name=target.name,remaining=remaining,modes={}}
   for _,rank in ipairs(target.modes) do
    f.weeklyDesk.modes[#f.weeklyDesk.modes+1]={id=rank.id,name=rank.name,level=rank.level,
     available=portal.available and not s.paused and remaining==0 and s.progression.level>=rank.level,
     attackFactor=rank.attackFactor,xp=rank.xp,firstXp=rank.firstXp,mora=rank.mora,firstMora=rank.firstMora,
     record=history and history[target.id..':'..rank.id]}
   end
  end
  if not slot then return f end
  f.weeklyBoss={id=spec.id,name=spec.name,level=slot.mode and slot.mode.level or spec.level,hp=slot.primary.hp,maxhp=spec.hp,
   difficulty=slot.mode and slot.mode.name,reward=slot.reward,
   generation=slot.generation,phase=slot.phase,remaining=wait(s,slot)/60}
  controllers[spec.controller].observe(f,s,slot,spec,mode,profile)
  f.commands=#f.draws
  return f
 end
end
