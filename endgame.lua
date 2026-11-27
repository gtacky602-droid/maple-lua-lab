return function(C,abyss,weekly,matches,controllers)
 local action,step,frame,checkpoint,restore=C.action,C.step,C.frame,C.checkpoint,C.restore
 local choices={gear=true,discover=true,boss=true}
 local sets={troupe='黄金の劇団',gladiator='剣闘士のフィナーレ'}
 local battleActions={normal=true,skill1=true,skill2=true,skill3=true,skill4=true,light=true,pause=true,
  swap=true,dodge=true,jump=true,drop=true,auto=true,hold_ally_fire=true,cancel_macro=true,cancel_channel=true}
 local finalQuest='growth-next-goal'
 local byNode={}
 for id,spec in pairs(matches) do
  byNode[spec.node]=id
 end

 local function records(s)
  if not s.endgame then s.endgame={abyss={},bosses={}} end
  return s.endgame
 end
 function C.endgameGoalEvent(s,choice)
  local quest=s.story and s.story.quests[finalQuest]
  if quest and quest.status=='active' and s.endgame and s.endgame.goal==choice then
   C.noteGrowth(s,'postgame-progress')
  end
 end
 local function ticks(seconds) return math.max(1,math.floor(seconds*60+.5)) end
 local function personalBest(s,collection,id,elapsed)
  local ticksUsed=math.min(10^9,ticks(elapsed))
  local entry=collection[id]
  if not entry then entry={clears=0};collection[id]=entry end
  entry.clears=math.min(1000000,entry.clears+1)
  if entry.bestTicks and ticksUsed>=entry.bestTicks then return false,entry end
  entry.bestTicks=ticksUsed
  entry.companion=s.companion or 'amber'
  return true,entry
 end
 function C.recordChallengeBoss(s,id,started)
  if not started or not s.story or not (s.story.active or s.endgameRun or s.bossJourney) then return end
  local improved=personalBest(s,records(s).bosses,id,s.t-started)
  if improved then C.endgameGoalEvent(s,'boss') end
 end
 function C.recordWeeklyClear(s,id,mode,started)
  local data=records(s)
  data.weekly=data.weekly or {}
  local key=id..':'..mode
  local first=data.weekly[key]==nil
  local improved=personalBest(s,data.weekly,key,s.t-started)
  if improved then C.endgameGoalEvent(s,'boss') end
  return first
 end

 function C.recordArtifactDomainClear(s,id,rank,elapsed)
  local data=records(s)
  data.artifactDomains=data.artifactDomains or {}
  local _,entry=personalBest(s,data.artifactDomains,id..':'..rank,elapsed)
  return entry
 end

 local function leave(s)
  local trial=s.endgameRun
  s.endgameRun=nil
  s.farka=nil
  local bothDown=s.actors[1].hp<=0 and s.actors[2].hp<=0
  C.enterStoryNode(s,bothDown and trial.match and matches[trial.match].hub or trial.origin)
  s.storyNotice=trial.status=='clear' and '挑戦記録を保存しました。依頼は拠点で報告できます。' or '挑戦入口へ戻りました。'
 end
 local function openRoom(s,run)
  local room=run.rooms[run.room]
  s.platforms={};s.solids={}
  for _,platform in ipairs(room.platforms) do
   s.platforms[#s.platforms+1]={x=platform.x,y=platform.y,w=platform.w}
  end
  s.enemies={}
  C.clearWeeklySceneCasts(s)
  s.camera=0;s.worldwidth=960
  for index,actor in ipairs(s.actors) do
   actor.x=200-(index-1)*50;actor.y=480;actor.vy=0;actor.ground=true
   actor.drop=0;actor.buffer=0;actor.dash=0;actor.leap=0
  end
  for _,group in ipairs(room.groups) do
   local extra=group.elite and 0 or run.spec.extraPerGroup
   for index=1,group.count+extra do
    local x=group.x+(index-1)*group.spacing
    local hp=group.hp*run.spec.healthFactor
    local id=#s.enemies+1
    s.enemies[id]={id=id,x=x,home=x,y=group.y,hp=hp,maxhp=hp,kind=group.kind,art=group.art,noRewards=true,
     cd=1.2+(id%4)*.35,respawn=0,warning=0,contactDamage=group.damage,resist=group.resist,
     armored=group.armored,pursuit=group.elite and {range=320,leash=350,speed=50} or nil}
   end
  end
  run.status='fighting'
  s.campaign.zone='abyss'
  s.campaign.message='三つの区画を時間内に突破してください。'
 end
 local function abyssClear(s,run)
  local spec=run.spec
  local elapsed=s.t-run.start
  local time=ticks(elapsed)
  local stars=time<=spec.threeStars*60 and 3 or time<=spec.twoStars*60 and 2 or 1
  run.status,run.stars,run.elapsed='clear',stars,elapsed
  local improved,record=personalBest(s,records(s).abyss,run.mode,elapsed)
  if improved then record.bestStars=stars end
  if run.mode=='entry' then C.noteGrowth(s,'abyss-entry-clear') end
  local slot=(record.clears-1)%5+1
  local preset={setId=run.set,subpair=slot==3 and 'hp_crit' or 'atk_crit'}
  s.mora=s.mora+spec.mora
  run.rewardInBag=C.giveArtifact(s,slot,spec.itemLevel,spec.rarity,preset)
  if not run.rewardInBag then
   C.dropArtifact(s,slot,spec.itemLevel,spec.rarity,180,480,preset,'town')
  end
  s.campaign.message='三つの区画を突破しました。'
 end

 local function stygianClear(s,run,spec,elapsed)
  local data=records(s)
  data.stygian=data.stygian or {}
  local key=run.match..':'..run.rules.id
  local first=data.stygian[key]==nil
  local improved,record=personalBest(s,data.stygian,key,elapsed)
  if improved then
   local best,amount=run.mechanicContribution and 'support' or 'normal',-1
   for skill,damage in pairs(run.skills) do
    if damage>amount or damage==amount and skill<best then best,amount=skill,damage end
   end
   record.mainSkill=best
   C.endgameGoalEvent(s,'boss')
  end
  local slot=(record.clears-1)%5+1
  local preset={setId=run.set,subpair=slot==3 and 'hp_crit' or 'atk_crit'}
  local mora=run.rules.mora+(first and run.rules.firstMora or 0)
  local xp=run.rules.xp+(first and run.rules.firstXp or 0)
  C.grantExp(s,xp,'kill')
  s.mora=s.mora+mora
  local equipped=C.giveArtifact(s,slot,run.rules.itemLevel,run.rules.rarity,preset)
  if not equipped then C.dropArtifact(s,slot,run.rules.itemLevel,run.rules.rarity,180,480,preset,'town') end
  run.status,run.elapsed,run.reward='clear',elapsed,
   {xp=xp,mora=mora,set=sets[run.set],first=first,bag=equipped,rank=run.rules.rarity}
  C.storyBossDefeated(s,spec.challenge)
  s.campaign.message=run.rules.name..'の模擬戦を突破しました。'
 end

 function C.stygianCoopMode(s)
  local run=s.endgameRun
  if run and run.match and matches[run.match].coop then return run.rules.id end
 end
 function C.adoptCoopStygian(room,s)
  if not C.stygianCoopMode(s) then return end
  local run=s.endgameRun
  room.stygianRun=run
  run.gatherUntil=room.time+matches[run.match].coop.gatherSeconds
  run.elapsed=0
 end
 function C.attachCoopStygian(room,s)
  local shared=room.stygianRun
  if not shared then return end
  local set=s.endgameRun.set
  local personal={shared=shared,set=set,skills={}}
  shared.set,shared.skills=nil,nil
  s.endgameRun=setmetatable(personal,{__index=shared})
  local controller=controllers[shared.match]
  if controller.attachCoop then controller.attachCoop(s.endgameRun) end
  local offset=(#room.members-1)*48
  for _,actor in ipairs(s.actors) do actor.x=actor.x+offset end
 end
 function C.leaveCoopStygian(room,s)
  if s.endgameRun and s.endgameRun.shared==room.stygianRun and room.stygianRun then
   leave(s)
   return true
  end
 end

 local previousWipe=C.handlesPartyWipe
 function C.handlesPartyWipe(s)
  local run=s.endgameRun
  if run and run.shared then
   -- Some fights resolve full-pair defeat with their own return mechanic.
   if controllers[run.match].advanceCoopParties then return true end
   if run.status=='fighting' then
    run.status='spectate'
    C.clearWeeklySceneCasts(s)
    s.campaign.message='味方の挑戦を観戦しています。'
   end
   return true
  end
  return previousWipe and previousWipe(s)
 end

 function C.stepCoopStygian(room,parties,dt)
  local run=room.stygianRun
  local spec,controller=matches[run.match],controllers[run.match]
  if run.status=='clear' then
   if controller.afterClear then controller.afterClear(room.members[1].state,run,spec,dt) end
   return
  end
  if run.status~='fighting' then return end
  local live,target,targetMember,distance={},nil,nil,math.huge
  local waitingForPeer=false
  local waitingForReturn=false
  if controller.advanceCoopParties and run.boss.hp>0 and (run.launched or room.time>=run.gatherUntil) then
   waitingForReturn=controller.advanceCoopParties(parties,dt)
  end
  for _,member in ipairs(room.members) do
   local s=member.state
   if s.endgameRun.status=='fighting' and not member.online then waitingForPeer=true end
  end
  for _,s in ipairs(parties) do
   C.checkPartyDefeat(s)
   if s.endgameRun.status=='fighting' and not s.endgameRun.wipe then
    live[#live+1]=s
    local a=s.actors[s.active]
    local gap=math.abs(a.x-run.boss.x)
    if gap<distance then target,targetMember,distance=a,s.coopMember,gap end
   end
  end
  local result
  if run.boss.hp<=0 and not run.preparingNextAct then result='clear'
  elseif #live==0 then
   if waitingForPeer or waitingForReturn then return end
   result='failed'
  elseif not run.launched and room.time<run.gatherUntil then return
  else
   run.launched=true
   run.elapsed=run.elapsed+dt
   if run.rules.limit and run.elapsed+1e-8>=run.rules.limit then
    result='failed'
   else
    run.parties,run.target,run.targetMember=live,target,targetMember
    controller.finish(live[1],run,spec,dt)
    run.parties,run.target,run.targetMember=nil,nil,nil
    return
   end
  end
  run.status=result
  if result=='failed' and controller.abort then controller.abort(room.members[1].state,run) end
  for _,member in ipairs(room.members) do
   local s=member.state
   local personal=s.endgameRun
   if controller.finishCoopParty then controller.finishCoopParty(personal) end
   if result=='clear' and (next(personal.skills) or personal.mechanicContribution) then
    stygianClear(s,personal,spec,run.elapsed)
   else
    personal.status=result
   end
  end
 end

 local function atHub(s,id)
  return not s.paused and s.story and s.story.active and s.story.node==id and not s.lift and not s.voyage
    and s.actors[s.active].hp>0 and s.campaign.zone=='town'
 end
 function C.action(s,key)
  local run=s.endgameRun
  if run then
   if key=='endgame_exit' and not s.paused then leave(s)
   elseif key=='encounter_interact' and not s.paused and run.match and run.status=='fighting' then
    local controller=controllers[run.match]
    if controller.interact then controller.interact(s,run) end
   elseif (key=='endgame_next' or key=='story_nearby_portal') and not s.paused and run.kind=='abyss' and run.status=='between' then
    run.room=run.room+1;openRoom(s,run)
   elseif (key=='pause' and not run.shared) or ((run.status=='fighting' or run.status=='between')
       and (not run.shared or key~='pause') and (battleActions[key] or key:match('^slot[1-8]$'))) then
    local controller=run.match and controllers[run.match]
    if not (controller and controller.blocksAction and controller.blocksAction(s,run,key)) then action(s,key) end
   end
   return
  end
  local mode,set=key:match('^abyss_start:(%a+):(%a+)$')
  if mode then
   local spec=abyss.modes[mode]
   if spec and sets[set] and atHub(s,'mond-town') then
    if spec.level and s.progression.level<spec.level then
     s.storyNotice='深境螺旋・'..spec.name..'はLv'..spec.level..'から挑戦できます。'
     return
    end
    if spec.draft and s.coop then
     s.storyNotice='比較版の上層はソロで挑戦できます。'
     return
    end
    local origin=s.story.node
    action(s,'field')
    s.endgameRun={kind='abyss',origin=origin,start=s.t,mode=mode,room=1,set=set,
     spec=spec,rooms=spec.rooms or abyss.rooms}
    openRoom(s,s.endgameRun)
   end
   return
  end
  local match,level,chosenSet=key:match('^stygian_start:(%a+):(%a+):(%a+)$')
  if match then
   local spec=matches[match]
   if spec and sets[chosenSet] and not s.paused and s.story and s.story.active and s.story.node==spec.node and
      s.campaign.zone=='story:'..spec.node and s.actors[s.active].hp>0 and not s.lift and not s.voyage then
    for _,rule in ipairs(spec.modes) do
     if rule.id==level and s.progression.level>=rule.level then
      s.endgameRun={kind='stygian',match=match,origin=spec.node,start=s.t,status='fighting',rules=rule,set=chosenSet}
      controllers[match].spawn(s,s.endgameRun,spec)
      break
     end
    end
   end
   return
  end
  if key=='endgame_farka' then
   if atHub(s,'mond-town') then
    local origin=s.story.node
    action(s,'boss_farka')
    s.endgameRun={kind='stygian',origin=origin,start=s.t,status='fighting',lastHp=s.farka.hp}
   end
   return
  end
  local choice=key:match('^endgame_goal:(%a+)$')
  if choice then
   local q=s.story and s.story.quests[finalQuest]
   if choices[choice] and atHub(s,'mond-town') and q and q.status=='active' and q.count<2 then
    records(s).goal=choice;C.noteGrowth(s,'postgame-goal')
   end
   return
  end
  action(s,key)
 end
 function C.step(s,dt,input)
  local run=s.endgameRun
  if not run then return step(s,dt,input) end
  if s.paused then return end
  if run.shared then
   if run.status=='fighting' then step(s,dt,input) end
   return
  end
  if run.status=='clear' and run.match then
   local controller=controllers[run.match]
   if controller.afterClear then controller.afterClear(s,run,matches[run.match],dt) end
   return
  end
  if run.status~='fighting' and run.status~='between' then return end
  local returns,boss=s.returns,s.farka
  step(s,dt,input)
  if run.match then
   local spec=matches[run.match]
   local controller=controllers[run.match]
   local limit=run.rules.limit
   if s.returns~=returns then
    if controller.abort then controller.abort(s,run) end
    run.status='failed';s.campaign.message='挑戦終了。入口から再挑戦できます。'
   elseif run.boss.hp<=0 and not run.preparingNextAct and (not limit or s.t-run.start<=limit+1e-8) then
    stygianClear(s,run,spec,s.t-run.start)
   elseif limit and s.t-run.start>=limit then
    if controller.abort then controller.abort(s,run) end
    run.status='failed';s.campaign.message='時間切れ。入口から再挑戦できます。'
   else controller.finish(s,run,spec,dt) end
   return
  end
  if run.kind=='stygian' and boss then
   if boss.hp<=0 or (boss.hp<run.lastHp and boss.phase=='recover') then C.noteGrowth(s,'stygian-opening') end
   run.lastHp=boss.hp
   if boss.hp<=0 then
    C.recordChallengeBoss(s,'farka',run.start);run.status='clear';run.elapsed=s.t-run.start
    s.campaign.message='通常模擬戦を突破しました。自己記録を保存しました。'
    return
   end
  end
  if s.returns~=returns or (run.kind=='abyss' and s.t-run.start>=run.spec.limit) then
   run.status='failed'
   s.campaign.message='挑戦終了。入口から再挑戦できます。'
   return
  end
  if run.kind=='abyss' and run.status=='fighting' then
   for _,enemy in ipairs(s.enemies) do if enemy.hp>0 then return end end
   if run.room==#run.rooms then abyssClear(s,run)
   else run.status='between';s.campaign.message='区画を突破しました。次へ進めます。' end
  end
 end
 function C.checkpoint(s)
  local d=checkpoint(s)
  if d and s.endgameRun and d.story then
   local story={}
   for k,v in pairs(d.story) do story[k]=v end
   local current=s.endgameRun
   story.active=true;story.node=current.match and matches[current.match].hub or current.origin
   d.story=story
  end
  if d and s.endgame then d.endgame=s.endgame end
  return d
 end
 function C.restore(data,density)
  local s=restore(data,density)
  s.endgame=data.endgame
  return s
 end
 function C.observeStygianMatch(f,s,mode,profile)
  local run=s.endgameRun
  controllers[run.match].observe(f,s,run,matches[run.match],mode,profile)
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  f.endgame=s.endgame
  local run=s.endgameRun
  if run then
   local v={kind=run.kind,status=run.status}
   if run.kind=='abyss' then
    v.room=run.room;v.roomCount=#run.rooms;v.name=run.rooms[run.room].name;v.mode=run.spec.name
    v.remaining=math.max(0,run.spec.limit-(s.t-run.start));v.stars=run.stars
    v.targets=0;v.armored=0
    for _,enemy in ipairs(s.enemies) do
     if enemy.hp>0 then
      v.targets=v.targets+1
      if enemy.armored then v.armored=v.armored+1 end
     end
    end
    if run.stars then
     v.reward=run.spec.mora..'モラ・'..sets[run.set]..' 1個'..(run.rewardInBag and '' or '（拠点で受取）')
    end
    f.location='深境螺旋・'..v.name..'（試作）'
   end
   f.endgameRun=v
   if run.match then
    local spec=matches[run.match]
    v.match,v.name,v.mode,v.elapsed=run.match,spec.name,run.rules.name,run.elapsed
    local elapsed=run.shared and run.shared.elapsed or s.t-run.start
    v.remaining=run.rules.limit and math.max(0,run.rules.limit-elapsed) or nil
    v.matchReward=run.reward
    C.observeStygianMatch(f,s,mode,profile)
    if run.shared and not run.launched and run.status=='fighting' then
     v.gathering=math.max(0,math.ceil(run.gatherUntil-s.coop.time))
    end
   end
  elseif s.story and s.story.active and byNode[s.story.node] then
   local id=byNode[s.story.node];local spec=matches[id]
   f.stygianDesk={id=id,name=spec.name,modes={}}
   for _,r in ipairs(spec.modes) do
    local record=s.endgame and s.endgame.stygian and s.endgame.stygian[id..':'..r.id]
    f.stygianDesk.modes[#f.stygianDesk.modes+1]={id=r.id,name=r.name,level=r.level,available=s.progression.level>=r.level,
     hp=r.hp,secondHp=r.secondHp,draftHp=r.draftHp,xp=r.xp,firstXp=r.firstXp,mora=r.mora,firstMora=r.firstMora,
     itemLevel=r.itemLevel,rarity=r.rarity,record=record}
   end
  elseif s.story and s.story.active and s.story.node=='mond-town' then
   f.endgameDesk={weekly={},abyss={}}
   for id,spec in pairs(abyss.modes) do
    f.endgameDesk.abyss[id]={name=spec.name,level=spec.level,
     available=not spec.level or s.progression.level>=spec.level and not s.coop,
     draft=spec.draft,soloBlock=spec.draft and s.coop~=nil}
   end
   for _,boss in ipairs(weekly) do
    f.endgameDesk.weekly[#f.endgameDesk.weekly+1]={id=boss.id,name=boss.name,level=boss.level,node=boss.node}
   end
  end
  return f
 end
end
