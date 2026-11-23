return function(C, config)
 function C.sharesCoopField(s)
  local room=s.coop
  return room and s.story and s.story.active and s.story.node==room.node and s.enemies==room.enemies
 end
 local function onField(member)
  return member.online and C.sharesCoopField(member.state)
 end

 function C.newCoop(s)
  local room={node=s.story.node,enemies=s.enemies,solids=s.solids,time=s.t,tick=0,members={},nextId=0}
  C.adoptCoopField(room,s)
  C.adoptCoopWeekly(room,s)
  return room
 end
 function C.attachCoop(room,s,member)
  if #room.members==0 then C.rechallengeCoopField(room) end
  if not member then
   room.nextId=room.nextId+1
   member={id=room.nextId,state=s,online=true}
  end
  if room.weeklySpec and room.weeklySpec.innerNode and s.story.node~=room.node then
   local spec=room.weeklySpec
   local spawn=(room.node==spec.innerNode and spec.innerSceneSpawn) or spec.sceneSpawn
   assert(C.switchWeeklyStoryScene(s,room.node,spawn+#room.members*72))
  end
  room.members[#room.members+1]=member
  s.coop,s.coopMember,s.enemies=room,member,room.enemies
  s.paused,s.auto=false,false
  if room.weeklySlot then s.platforms=room.platforms end
  if room.weeklySpec and room.weeklySpec.innerNode then s.solids=room.solids end
  for _,e in ipairs(room.enemies) do
   if e.burning and not e.burning.member and #room.members==1 then e.burning.member=member end
  end
  return member
 end
 function C.detachCoop(member,keepClearedScene)
  local s=member.state
  local room=s.coop
  if not room then return end
  for i,row in ipairs(room.members) do if row==member then table.remove(room.members,i);break end end
  C.leaveCoopWeekly(room,s)
  local stillShared=s.enemies==room.enemies
  s.coop,s.coopMember=nil,nil
  if stillShared then
   if keepClearedScene then
    -- The chapter gate closed on victory. Keep the clear banner and positions.
    s.enemies={}
   else
    C.enterStoryNode(s,C.weeklyCoopSite(s) or s.story.node)
   end
  end
 end

 function C.coopContact(s,e,actor)
  local room,member=s.coop,s.coopMember
  if not onField(member) then return end
  e=e.coopRewardTarget or e.fieldGroup or e.sharedHealth or e
  if e.noRewards then return end
  e.coopHits=e.coopHits or {}
  e.coopHits[member.id]={time=room.time,actor=actor}
 end
 local function inRewardRange(actor,body)
  return math.abs(actor.x-body.x)<=config.rewardRange.x and math.abs(actor.y-body.y)<=config.rewardRange.y
 end
 local function nearEncounter(actor,e)
  if e.fieldMembers then
   for _,body in ipairs(e.fieldMembers) do
    if inRewardRange(actor,body) then return true end
   end
   return false
  end
  return inRewardRange(actor,e) or (e.fieldPartner and inRewardRange(actor,e.fieldPartner))
 end

 function C.coopDefeat(s,e)
  local room=s.coop
  C.finishCoopField(s,e)
  C.finishCoopWeekly(room,e)
  local hits=e.coopHits or {}
  e.coopHits=nil
  for _,member in ipairs(room.members) do
   local hit=hits[member.id]
   if hit and room.time-hit.time<=config.contributionSeconds and onField(member) then
    local party=member.state
    local a=party.actors[party.active]
    if a.hp>0 and nearEncounter(a,e) then
     local credit=C.coopCreditTarget(party,e)
     if credit then C.creditDefeat(party,credit,hit.actor) end
    end
   end
  end
 end

 function C.stepCoop(room,dt)
  local world
  for _,member in ipairs(room.members) do
   if onField(member) then world=member.state;break end
  end
  if not world then return end
  C.advanceEnemyReactions(world,dt)
  room.time=room.time+dt
  if room.weeklySlot then C.prepareCoopWeekly(room,dt) end
  local actors,decoys,owners,parties={},{},{},{}
  for _,member in ipairs(room.members) do
   if onField(member) then
    local s=member.state
    C.step(s,dt,member.input)
    if onField(member) then
     for _,a in ipairs(s.actors) do actors[#actors+1]=a;owners[a]=s end
     for _,d in ipairs(s.decoys or {}) do decoys[#decoys+1]=d;owners[d]=s end
     parties[#parties+1]=s
    end
   end
  end
  C.advanceEnemies({enemies=room.enemies},dt,actors,decoys,owners)
  C.advanceCoopField(room,actors,owners,parties)
  if room.weeklySlot and #parties>0 then C.advanceCoopWeekly(room,actors,owners,parties,dt) end
  room.tick=room.tick+1
 end

 function C.drawCoopPeers(s,f,mode,profile)
  for _,member in ipairs(s.coop.members) do
   if member~=s.coopMember and onField(member) then
    local peer=member.state
    if peer.rockWall then C.drawRockWall(f,s.camera,peer.rockWall) end
    if peer.coralWall then C.drawCoralWall(f,s.camera,peer.coralWall) end
    local camera={camera=s.camera,companion=peer.companion}
    for _,a in ipairs(peer.actors) do
     if a.hp>0 and a.x>=s.camera-55 and a.x<=s.camera+1015 then
      local first=#f.draws+1
      if a.id==1 then
       if a.walk~=0 then C.drawTravelerRunArt(f,camera,a,mode,profile)
       else C.drawTravelerIdleArt(f,camera,a,mode,profile) end
      elseif C.companionArt[peer.companion] then
       C.drawCompanionArt(f,camera,a,mode,profile)
      else
       C.drawAmberArt(f,camera,a,mode,profile,a.lock>0 and C.amberBowArt or C.amberIdleArt)
      end
      for i=first,#f.draws do f.draws[i].opacity=.78 end
      if a.id==peer.active then
       f.draws[#f.draws+1]={kind='text',x=a.x-s.camera+32,y=a.y-106,text='旅人 '..member.id,color='#8ee7ed',size=16}
      end
     end
    end
    C.drawRadiantCocoons(peer,f,s.camera)
   end
  end
 end

 function C.coopFrame(s)
  local room=s.coop
  local party={tick=room.tick,enemies={}}
  local weekly=room.weeklySlot and room.weeklySlot.primary
  for _,e in ipairs(room.enemies) do
   if not e.weeklyPart and e~=weekly then party.enemies[#party.enemies+1]={id=e.id,hp=e.hp,maxhp=e.maxhp} end
  end
  if weekly then
   party.enemies[#party.enemies+1]={id=weekly.id,hp=weekly.hp,maxhp=weekly.maxhp}
  end
  return party
 end

 function C.coopPeer(member,world)
  local s=member.state
  local slot=C.currentWeeklyBoss(s)
  local variant=C.weeklyCoopVariant(s)
  local view={slot=member.id,online=member.online,map=s.story.node,mapName=C.storyNodeName(s),actors={},
   difficulty=slot and slot.mode and slot.mode.name,variant=variant and variant.label}
  if world and s.coop==world and onField(member) then
   for _,a in ipairs(s.actors) do
    view.actors[#view.actors+1]={x=a.x,y=a.y,dir=a.dir,hp=a.hp}
   end
  end
  return view
 end
end
