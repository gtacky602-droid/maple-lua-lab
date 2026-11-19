return function(C, config)
 function C.sharesCoopField(s)
  local room=s.coop
  return room and s.story and s.story.active and s.story.node==room.node and s.enemies==room.enemies
 end
 local function onField(member)
  return member.online and C.sharesCoopField(member.state)
 end

 function C.newCoop(s)
  return {node=s.story.node,enemies=s.enemies,time=s.t,tick=0,members={},nextId=0}
 end
 function C.attachCoop(room,s)
  room.nextId=room.nextId+1
  local member={id=room.nextId,state=s,online=true}
  room.members[#room.members+1]=member
  s.coop,s.coopMember,s.enemies=room,member,room.enemies
  s.paused,s.auto=false,false
  for _,e in ipairs(room.enemies) do
   if e.burning and not e.burning.member and #room.members==1 then e.burning.member=member end
  end
  return member
 end
 function C.detachCoop(member)
  local s=member.state
  local room=s.coop
  for i,row in ipairs(room.members) do if row==member then table.remove(room.members,i);break end end
  local stillShared=s.enemies==room.enemies
  s.coop,s.coopMember=nil,nil
  if stillShared then C.enterStoryNode(s,s.story.node) end
 end

 function C.coopContact(s,e,actor)
  local room,member=s.coop,s.coopMember
  if not onField(member) then return end
  e=e.sharedHealth or e
  e.coopHits=e.coopHits or {}
  e.coopHits[member.id]={time=room.time,actor=actor}
 end
 function C.coopDefeat(s,e)
  local room=s.coop
  local hits=e.coopHits or {}
  e.coopHits=nil
  for _,member in ipairs(room.members) do
   local hit=hits[member.id]
   if hit and room.time-hit.time<=config.contributionSeconds and onField(member) then
    local party=member.state
    local a=party.actors[party.active]
    if a.hp>0 and math.abs(a.x-e.x)<=config.rewardRange.x and math.abs(a.y-e.y)<=config.rewardRange.y then
     C.creditDefeat(party,e,hit.actor)
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
  local actors,decoys,owners={},{},{}
  for _,member in ipairs(room.members) do
   if onField(member) then
    local s=member.state
    C.step(s,dt,member.input)
    if onField(member) then
     for _,a in ipairs(s.actors) do actors[#actors+1]=a;owners[a]=s end
     for _,d in ipairs(s.decoys or {}) do decoys[#decoys+1]=d;owners[d]=s end
    end
   end
  end
  C.advanceEnemies({enemies=room.enemies},dt,actors,decoys,owners)
  room.time=room.time+dt
  room.tick=room.tick+1
 end

 function C.drawCoopPeers(s,f,mode,profile)
  for _,member in ipairs(s.coop.members) do
   if member~=s.coopMember and onField(member) then
    local peer=member.state
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
   end
  end
 end

 function C.coopFrame(s)
  local room=s.coop
  local party={tick=room.tick,slot=s.coopMember.id,peers={},enemies={}}
  for _,e in ipairs(room.enemies) do
   party.enemies[#party.enemies+1]={id=e.id,hp=e.hp,maxhp=e.maxhp}
  end
  for _,member in ipairs(room.members) do
   if member~=s.coopMember then
    local view={slot=member.id,online=not not onField(member),actors={}}
    party.peers[#party.peers+1]=view
    if view.online then
     for _,a in ipairs(member.state.actors) do
      view.actors[#view.actors+1]={x=a.x,y=a.y,dir=a.dir,hp=a.hp}
     end
    end
   end
  end
  return party
 end
end
