return function(C,data,delivery,rail,cooking,book,stone,construction,lantern,forest,contest,sights,rest,cave,roof,reflection,localLight,airflow,resonanceModule,rockViewsModule)
 local action,step,frame,checkpoint,restore,onKill=C.action,C.step,C.frame,C.checkpoint,C.restore,C.onKill
 local function copy(v)
  if type(v)~='table' then return v end
  local out={};for k,item in pairs(v) do out[k]=copy(item) end;return out
 end
 local nodes,quests,starterQuests,itineraries={},{},{},{}
 local lanternQuest,contestQuest,sightQuest,restQuest,caveQuest,roofQuest
 for _,n in ipairs(data.nodes) do nodes[n.id]=n end
 for _,q in ipairs(data.quests) do
  quests[q.id]=q
  if q.itinerary then itineraries[#itineraries+1]=q end
  if q.lantern then lanternQuest=q end
  if q.contest then contestQuest=q end
  if q.sights then sightQuest=q end
  if q.rest then restQuest=q end
  if q.cave then caveQuest=q end
  if q.roof then roofQuest=q end
  if q.join and q.starter then starterQuests[q.join]=q end
 end
 local function setup(s)
  if not s.story then s.story={active=false,node='mond-town',visited={['mond-town']=true},quests={}} end
  s.story.discovered=s.story.discovered or {}
 end
 local function completed(s,id)
  local state=s.story.quests[id]
  return state and state.status=='complete'
 end
 function C.starterEquipment(s,companion)
  local q=starterQuests[companion]
  if q and s.story and completed(s,q.id) then return q.starter end
 end
 local function meetsGateRule(s,rule)
  local state=s.story.quests[rule.quest]
  if rule.before and state and state.count>=rule.before then return false end
  if rule.construction then
   return completed(s,rule.quest) and state.construction and state.construction.plan==rule.construction
  end
  return completed(s,rule.quest) or
   (rule.count and state and state.count>=rule.count and (not rule.recovery or state.recovered))
 end
 local function windWindow(s,wind)
  local t=(s.t-s.storyEnteredAt)%wind.period
  local calm=t>=wind.calmStart and t<wind.calmEnd
  local nextChange=calm and wind.calmEnd or (t<wind.calmStart and wind.calmStart or wind.period+wind.calmStart)
  return calm,nextChange-t
 end
 local function gateRestriction(s,edge)
  if edge.darkOnly and s.storyLightMode~='dark' then return '消灯すると出口が見えます。' end
  if edge.roofTrialStage and s.roofTrial and s.roofTrial.count<edge.roofTrialStage then return '屋根の目印を先に調べてください。' end
  local rule=edge.requires
  if rule then
   local state=s.story.quests[rule.quest]
   local allowed=meetsGateRule(s,rule) or (rule.alternative and meetsGateRule(s,rule.alternative))
    or (edge.loopOnce and forest.canLoop(state))
   if not allowed then
    if rule.before and state and state.count>=rule.before then return rule.closedNotice or '足場を中継位置へ移しました。' end
    if rule.construction and completed(s,rule.quest) then return '今回はもう一方の道を整備しました。' end
    if rule.recovery and state and not state.recovered then return '受注済みの旧依頼は岩間の狩場で進められます。' end
    if rule.alternative then
     return '「'..quests[rule.quest].name..'」か「'..quests[rule.alternative.quest].name..'」を受注してください。'
    end
    return '依頼「'..quests[rule.quest].name..'」'..(rule.count and 'を進めてください。' or 'を報告してください。')
   end
  end
  if edge.wind and not windWindow(s,edge.wind) then return edge.wind.notice or '吹雪のため通れません。風が止むまで待つか、下の風よけ道へ。' end
  local passed=s.voyage and s.t-s.voyage.started or -1
  if edge.windowStart and not (passed+1e-8>=edge.windowStart and passed+1e-8<edge.windowEnd) then
   if s.voyage and s.voyage.kind=='trolley' then
    return passed<edge.windowStart and '停留所に近づいています。' or '停留所を通過しました。終点から戻れます。'
   end
   return '寄港時間外'
  end
  if edge.requiresArrival and not (s.voyage and s.t>=s.voyage.arrives) then return '到着待ち' end
 end
 local function nearGate(a,edge)
  return math.abs(a.x-edge.x)<90 and math.abs(a.y-(edge.y or 480))<60
 end
 local function shownNode(s,n)
  return not n.hiddenGroup or s.story.discovered[n.hiddenGroup]
 end
 local function shownEdge(s,edge)
  return shownNode(s,nodes[edge.to]) and (not edge.visitedOnly or s.story.visited[edge.to])
      and (not edge.hideUntilAllowed or not gateRestriction(s,edge))
 end
 local function nearHint(a,h)
  return a.hp>0 and math.abs(a.x-h.x)<75 and math.abs(a.y-h.y)<60
 end
 local function nearbyPortal(s)
  if not s.story.active then return nil end
  local a=s.actors[s.active]
  local best,distance=nil,90
  for _,edge in ipairs(nodes[s.story.node].exits) do
   local n=nodes[edge.to];local dx=math.abs(a.x-edge.x)
   if dx<distance and nearGate(a,edge) and shownEdge(s,edge) then
    local reason=nil
    if s.roofFlight then reason='移動中'
    elseif s.caveFall then reason='崩落中'
    elseif s.paused then reason='一時停止中'
    elseif a.hp<=0 then reason='戦闘不能中'
    elseif not s.progression or s.progression.level<n.level then reason='必要レベル '..n.level
    else reason=gateRestriction(s,edge) end
    best={to=edge.to,name=edge.rideLabel or n.name,level=n.level,available=not reason,reason=reason,
          liftSeconds=edge.liftSeconds,waterwaySeconds=edge.waterwaySeconds,boatSeconds=edge.boatSeconds,
          trolleyBoard=n.voyage and n.voyage.kind=='trolley' or nil,
          trolleyStop=s.voyage and s.voyage.kind=='trolley' and edge.windowStart~=nil or nil};distance=dx
    if edge.wind then
     local calm,seconds=windWindow(s,edge.wind)
     best.wind={calm=calm,seconds=seconds}
    end
   end
  end
  return best
 end
 local function recoveredAll(q,state)
  for _,item in ipairs(q.cargo) do if not state.recovered[item.id] then return false end end
  return true
 end
 local function beginChase(s,q)
  for _,e in ipairs(s.enemies) do
   if e.spawnId==q.chase.enemy then
    e.x=q.chase.x;e.home=q.chase.x;e.patrolMin=q.chase.min;e.patrolMax=q.chase.max
    return
   end
  end
 end
 local function cargoQuest(s)
  for id,state in pairs(s.story.quests) do
   local q=quests[id]
   if q.cargo and state.recovered and state.status=='active' then
    if q.recovery then
     if q.recovery.node==s.story.node and state.count<q.goal-1 then return q,state end
    elseif state.count==q.goal-1 and q.target==s.story.node then return q,state end
   end
  end
 end
 local function nearbyCargo(s,q,state)
  local a=s.actors[s.active]
  if a.hp<=0 then return nil end
  local best,distance=nil,54
  for _,item in ipairs(q.cargo) do
   local dx=math.abs(a.x-item.x)
   if not state.recovered[item.id] and math.abs(a.y-item.y)<34 and dx<distance then best,distance=item,dx end
  end
  return best
 end
 local function trailClue(s)
  for id,state in pairs(s.story.quests) do
   local trail=quests[id].trail
   if trail and state.status=='active' and state.count<quests[id].goal then
    if trail.meeting and state.count==1 and s.story.node==quests[id].target then return trail.meeting,state,2 end
    if state.count<=1 then
     for _,item in ipairs(trail.clues) do
      if item.node==s.story.node and not state.inspected[item.id] then return item,state,1 end
     end
    end
   end
  end
 end
 local function canInspect(a,item)
  return a.hp>0 and math.abs(a.x-item.x)<54 and math.abs(a.y-item.y)<34
 end
 local resonance=resonanceModule(canInspect)
 local rockViews=rockViewsModule(canInspect)
 local function emitCue(s,channel,notes,pattern)
  s.storyCueId=(s.storyCueId or 0)+1
  s.storyCue={channel=channel,id=s.storyCueId,notes=notes,pattern=pattern,untilTime=s.t+1.5}
 end
 local function nextMilestone(s,q)
  local state=s.story.quests[q.id]
  if state and state.status=='active' then return q.itinerary[state.count+1],state end
 end
 local function installBridge(s,bridge)
  if bridge.track then
   for i,platform in ipairs(s.platforms) do
    if platform.track==bridge.track then s.platforms[i]=copy(bridge);return end
   end
  end
  s.platforms[#s.platforms+1]=copy(bridge)
 end
 local function completeMilestone(s,state,milestone)
  state.count=state.count+1
  s.storyNotice=milestone.notice
  if milestone.bridge then installBridge(s,milestone.bridge) end
  if milestone.reflect then s.reflection=nil end
 end
 local function recordKill(s,state,milestone,enemy)
  if milestone.enemy==enemy then completeMilestone(s,state,milestone);return end
  local group=milestone.enemies
  if not group then return end
  for _,id in ipairs(group) do if id==enemy then
   local defeated=state.sweep or {}
   if defeated[enemy] then return end
   defeated[enemy]=true;state.sweep=defeated
   local count=0
   for _,member in ipairs(group) do if defeated[member] then count=count+1 end end
   if count==#group then
    state.sweep=nil;completeMilestone(s,state,milestone)
   else s.storyNotice='通路の群れを整理中 '..count..' / '..#group end
   return
  end end
 end
 local function inspectMilestone(s,command)
  for _,q in ipairs(itineraries) do
   local milestone,state=nextMilestone(s,q)
   if milestone and (milestone.resonanceOrder or milestone.shadowChoice) and milestone.node==s.story.node and command=='rotate' then
    local node=nodes[s.story.node]
    local handled,complete
    if milestone.shadowChoice then handled,complete=rockViews.choose(s,node.rockViews)
    else handled,complete=resonance.light(s,node.resonance,emitCue) end
    if complete then completeMilestone(s,state,milestone) end
    if handled then return true end
   end
   if milestone and milestone.kind=='inspect' and milestone.node==s.story.node
       and not milestone.resonanceOrder and not milestone.shadowChoice
       and (not milestone.roomLight or milestone.roomLight==s.storyLightMode)
       and canInspect(s.actors[s.active],milestone) then
    if milestone.airflow then
     if airflow.interact(s,milestone,command,emitCue) then completeMilestone(s,state,milestone) end
     return true
    elseif milestone.reflect then
     if reflection.interact(s,milestone,command) then completeMilestone(s,state,milestone) end
     return true
    elseif command=='rotate' then
     if milestone.resonanceStone then resonance.record(s,milestone,emitCue) end
     completeMilestone(s,state,milestone)
     return true
    end
   end
  end
  if command=='rotate' then
   for _,q in ipairs(itineraries) do
    if completed(s,q.id) then
     for _,done in ipairs(q.itinerary) do
      if (done.readback or done.resonancePages) and done.node==s.story.node and canInspect(s.actors[s.active],done) then
       if done.resonancePages then resonance.turnPage(s,done,emitCue) else s.storyNotice=done.readback end
       return true
      end
     end
    end
   end
  end
  return false
 end
 local function guarding(s,item)
  if item.guard then
   for _,e in ipairs(s.enemies) do
    if e.spawnId==item.guard and e.hp>0 then return true end
   end
  end
 end
 local function questKillCounts(q,state,enemy)
  if q.enemy then return enemy.spawnId==q.enemy end
  if not state.recovered then return true end -- Already accepted under the original four-kill contract.
  if q.recovery then return false end
  if state.count==q.goal-1 then return enemy.spawnId==q.chase.enemy and recoveredAll(q,state) end
  for _,art in ipairs(q.openingArts) do if enemy.art==art then return true end end
  return false
 end
 -- Count is the saved record of the battle milestone. Award only when a battle crosses it.
 local function chapterVictory(s,q,state)
  if not q.chapterClearXp or state.count~=q.chapterClearCount then return end
  C.grantExp(s,q.chapterClearXp,'quest')
  s.storyFirstClear={quest=q.id,xp=q.chapterClearXp,untilTime=s.t+7}
 end
 local function progress(s,kind,target,enemy)
  for id,state in pairs(s.story.quests) do local q=quests[id]
   local legacySights=kind=='kill' and q.sights and not state.sights and target==q.sights.legacyTarget
   local matches=(q.kind==kind and q.target==target) or legacySights
   if state.status=='active' and matches and state.count<q.goal
    and (kind~='kill' or questKillCounts(q,state,enemy)) then
    state.count=state.count+1
    if kind=='kill' then chapterVictory(s,q,state) end
    if state.count==q.goal and q.clearedNotice then s.storyNotice=q.clearedNotice end
   end
  end
 end
 local function cleared(s,n)
  local state=n.clearedBy and s.story.quests[n.clearedBy]
  return state and state.count>=(n.clearCount or quests[n.clearedBy].goal)
 end
 local function railQuest(s,n)
  local q=quests[n.clearedBy]
  if q and q.rail then return q,s.story.quests[q.id] end
 end
 local function defeatedMilestones(q,state,node)
  local defeated=copy(state.sweep or {})
  for i=1,state.count do
   local step=q.itinerary[i]
   if step.kind=='kill' and step.node==node then
    if step.enemy then defeated[step.enemy]=true end
    for _,id in ipairs(step.enemies or {}) do defeated[id]=true end
   end
  end
  return defeated
 end
 local function spawnEnemies(s,n,phase,recovered,defeated)
  s.enemies={}
  if not n.hub and not n.peaceful and not cleared(s,n) then
   local fresh=C.new(12)
   local placements=assert(C.enemySpawns and C.enemySpawns[n.id],'Missing story enemy placements: '..n.id)
   for i,placement in ipairs(placements) do
    if not (defeated and defeated[placement.id]) and (not placement.questPhase or placement.questPhase==phase) and
       not (placement.cargo and recovered and recovered[placement.cargo]) then
     local e=fresh.enemies[i];local p=assert(n.platforms[placement.platform+1],'Invalid enemy support')
     e.x=placement.x;e.home=e.x;e.y=p.y;e.kind=placement.kind;e.art=placement.art;e.spawnId=placement.id
     e.storyName=placement.name
     if placement.hp then e.hp=placement.hp;e.maxhp=placement.hp end
     e.patrolMin=p.x+24;e.patrolMax=p.x+p.w-24
     e.level=n.level;e.barrier=n.barrier or 0;if e.barrier>0 then e.hp=60;e.maxhp=60 end
     s.enemies[#s.enemies+1]=e
    end
   end
  end
 end
 local function enter(s,id,spawn,elapsed,arrivalY)
  local n=nodes[id];s.campaign.zone='story:transition';action(s,n.hub and 'town' or 'field')
  s.campaign.zone=n.hub and 'town' or ('story:'..id);s.campaign.message='本編ルートの試作。隣の地点へは門の近くで移動。'
  s.story.active=true;s.story.node=id;s.story.visited[id]=true;s.worldwidth=n.width
  s.storyEnteredAt=s.t
  s.storyLightMode=n.localLight and 'bright' or nil
  s.airflowTrial,s.storyCue=nil,nil
  s.resonanceOrder,s.resonancePage=nil,nil
  s.platforms={};for _,p in ipairs(n.platforms) do s.platforms[#s.platforms+1]=copy(p) end
  for _,q in ipairs(itineraries) do
   local state=s.story.quests[q.id]
   for i=1,state and state.count or 0 do
    local step=q.itinerary[i]
    if step.node==id and step.bridge then installBridge(s,step.bridge) end
   end
  end
  s.reflection=nil
  s.expeditionPractice=false
  s.lift=nil
  s.railTrip=nil
  s.readingQuest=nil
  s.stoneNotice=nil
  s.portLanternX=nil
  s.danukiDanceAt=nil
  s.forestFeedback=nil
  s.contestReplay=nil
  s.contestFlash=nil
  s.storyFirstClear=nil
  s.sightNotice=nil
  s.restNotice=nil
  if roofQuest then roof.enter(s,roofQuest,id) end
  s.caveNotice=nil
  s.caveRockHit=nil
  s.caveFall=nil
  local caveState=caveQuest and s.story.quests[caveQuest.id]
  if caveState and id==caveQuest.target and caveState.count>=3 then cave.removeBrittle(s,caveQuest.cave) end
  s.sightMenu=nil
  s.storyDeliveryNotice=nil
  local railConfig,railState=railQuest(s,n)
  if railState and railState.count>=1 then s.platforms[#s.platforms+1]=copy(railConfig.rail.bridge) end
  local stageQuest=quests[n.clearedBy]
  local stageState=stageQuest and s.story.quests[stageQuest.id]
  local phase=railState and railState.count or 0
  if stageQuest and stageQuest.recovery and stageState and stageState.recovered and stageState.count==stageQuest.goal-1 then phase=1 end
  local group=stageState and (stageState.book or stageState.forest or stageState.rest)
  local defeated=group and group.defeated
  if stageState and stageQuest.itinerary then defeated=defeatedMilestones(stageQuest,stageState,id) end
  spawnEnemies(s,n,phase,stageState and stageState.recovered,defeated)
  local cargo,state=cargoQuest(s)
  if cargo and cargo.chase and recoveredAll(cargo,state) then beginChase(s,cargo) end
  for i,a in ipairs(s.actors) do a.x=(spawn or 160)-(i-1)*40;a.y=arrivalY or 480;a.vy=0;a.ground=true;if arrivalY then a.drop=0 end end
  s.camera=math.max(0,math.min(s.actors[s.active].x-400,math.max(0,n.width-960)))
  if contestQuest and id==contestQuest.target then contest.populate(s,contestQuest,s.story.quests[contestQuest.id]) end
  if C.enterFieldBossNode then C.enterFieldBossNode(s,id) end
  if C.enterWeeklyBossNode then C.enterWeeklyBossNode(s,id) end
  s.macro=nil;s.encounter=nil
  local v=n.voyage
  s.voyage=v and {destination=v.destination,arrives=s.t+v.seconds-(elapsed or 0),total=v.seconds,
   started=s.t-(elapsed or 0),source=v.source,stopStart=v.stopStart,stopEnd=v.stopEnd,kind=v.kind,reverse=v.reverse} or nil
  progress(s,'visit',id)
 end
 local function arrive(s)
  local from,dest=s.story.node,s.voyage.destination
  enter(s,dest)
  for _,q in ipairs(itineraries) do
   local step,state=nextMilestone(s,q)
   if step and step.kind=='arrive' and step.node==dest and step.from==from then completeMilestone(s,state,step) end
  end
 end
 function C.enterStoryNode(s,id) setup(s);enter(s,id) end
 function C.storyBossDefeated(s,id)
  setup(s)
  progress(s,'boss',id)
  if not s.story.active then return end
  for _,q in ipairs(itineraries) do
   local milestone,state=nextMilestone(s,q)
   if milestone and milestone.kind=='boss' and milestone.boss==id and milestone.node==s.story.node then
    completeMilestone(s,state,milestone)
    chapterVictory(s,q,state)
   end
  end
 end
 function C.action(s,key)
  setup(s)
  if s.lift or s.caveFall or s.roofFlight then
   if key=='pause' then action(s,key) end
   return
  end
  if s.voyage and s.voyage.kind=='trolley' and key~='pause' and key~='story_nearby_portal'
      and not key:match('^story_portal:') and not key:match('^story_fast:') then return end
  if key=='story_nearby_portal' then local p=nearbyPortal(s);if p then C.action(s,'story_portal:'..p.to) end;return end
  if key=='story_expedition_trial' then
   local desk=s.story.active and nodes[s.story.node].expeditionDesk
   if desk and not s.paused and canInspect(s.actors[s.active],desk) then s.expeditionPractice=true end
   return
  end
  if key=='story_airflow_commit' then
   if s.story.active and not s.paused then inspectMilestone(s,'airflow_commit') end
   return
  end
  if key=='story_reflection_light' or key=='story_reflection_confirm' then
   if s.story.active and not s.paused then
    inspectMilestone(s,key=='story_reflection_light' and 'light' or 'confirm')
   end
   return
  end
  if key=='story_collect' then
   if s.paused or not s.story.active then return end
   local node=nodes[s.story.node]
   for _,hint in ipairs(node.hints or {}) do
    if not s.story.discovered[hint.group] and nearHint(s.actors[s.active],hint) then
     C.action(s,'story_discover:'..hint.group);return
    end
   end
   local lamp=node.localLight
   if lamp and localLight.interact(s,lamp) then return end
   if inspectMilestone(s,'rotate') then return end
   local railConfig,railState=railQuest(s,nodes[s.story.node])
   if railConfig then rail.start(s,railConfig,railState);return end
   if contestQuest and contest.interact(s,contestQuest,s.story.quests[contestQuest.id]) then return end
   if sightQuest and sights.inspect(s,sightQuest,s.story.quests[sightQuest.id]) then return end
   if restQuest and rest.interact(s,restQuest,s.story.quests[restQuest.id]) then return end
   if caveQuest and cave.interact(s,caveQuest,s.story.quests[caveQuest.id]) then return end
   if roofQuest and roof.interact(s,roofQuest,s.story.quests[roofQuest.id]) then return end
   for id,state in pairs(s.story.quests) do
    local q=quests[id]
    if q.cooking then
     local item=cooking.nearbyIngredient(s,q,state)
     if item then cooking.gather(s,q,state,item);return end
    end
    if q.book then
     local item=book.nearby(s,q,state)
     if item then book.interact(s,q,state,item);return end
    end
    if q.stone then
     local item=stone.nearby(s,q,state)
     if item then stone.inspect(s,q,state,item);return end
    end
    if q.construction then
     local item=construction.nearby(s,q,state)
     if item then construction.interact(s,q,state,item);return end
    end
    if q.lantern then
     local item=lantern.nearby(s,q,state)
     if item then lantern.inspect(s,q,state,item);return end
    end
    if q.forest then
     local item=forest.nearby(s,q,state)
     if item then forest.inspect(s,q,state,item);return end
    end
    if q.delivery and state.status=='active' and q.target==s.story.node then
     delivery.recover(s,q,state.delivery)
     return
    end
   end
   local q,state=cargoQuest(s)
   if not q then
    local clue,progress,nextCount=trailClue(s)
    if not clue then return end
    if not canInspect(s.actors[s.active],clue) then s.storyNotice='手がかりのそばまで移動してください。';return end
    progress.inspected[clue.id]=true
    progress.count=nextCount
    s.storyNotice=clue.line
    return
   end
   local item=nearbyCargo(s,q,state)
   if not item then s.storyNotice='荷物のそばまで移動してください。';return end
   if guarding(s,item) then s.storyNotice='荷物のそばにいる魔物を退けてください。';return end
   state.recovered[item.id]=true
   if q.recovery then
    state.count=state.count+1
    if state.count==q.goal-1 then
     spawnEnemies(s,nodes[s.story.node],1)
     s.storyNotice=q.recovery.allRecovered
    else s.storyNotice=item.name..'を回収しました。' end
    return
   end
   if recoveredAll(q,state) then
    beginChase(s,q)
    s.storyNotice='赤い布を引きずるヒルチャールを、街道の奥へ追いましょう。'
   else s.storyNotice=item.name..'を回収しました。' end
   return
  end
  local favorite=key:match('^story_sight_mark:([%w%-]+)$')
  if favorite then
   if sightQuest then sights.mark(s,sightQuest,s.story.quests[sightQuest.id],favorite) end
   return
  end
  local puzzleId,tile=key:match('^story_stone_tile:([%w%-]+):([%w%-]+)$')
  if puzzleId then
   local q,state=quests[puzzleId],s.story.quests[puzzleId]
   if s.story.active and not s.paused and q and q.stone and state then stone.press(s,q,state,tile) end
   return
  end
  local workId,plan=key:match('^story_construction_plan:([%w%-]+):([%w%-]+)$')
  if workId then
   local q,state=quests[workId],s.story.quests[workId]
   if s.story.active and not s.paused and q and q.construction and state then construction.choose(s,q,state,plan) end
   return
  end
  local command,mealQuest,flavor=key:match('^story_([%a_]+):([%w%-]+):?([%w%-]*)$')
  if command=='cook' or command=='buy_meal' or command=='eat_meal' then
   local q,state=quests[mealQuest],s.story.quests[mealQuest]
   if s.story.active and not s.paused and q and q.cooking and state then cooking.action(s,q,state,command,flavor,C.healActor) end
   return
  end
  local deliveryId,packageId=key:match('^story_deliver:([%w%-]+):([%w%-]+)$')
  if deliveryId then
   if s.paused or not s.story.active then return end
   local q,state=quests[deliveryId],s.story.quests[deliveryId]
   if q and q.delivery and state and state.status=='active' then delivery.deliver(s,q,state.delivery,packageId) end
   return
  end
  local discovery=key:match('^story_discover:([%w%-]+)$')
  if discovery then
   if s.paused or not s.story.active or s.actors[s.active].hp<=0 then return end
   local a=s.actors[s.active]
   for _,h in ipairs(nodes[s.story.node].hints or {}) do if h.group==discovery and nearHint(a,h) then s.story.discovered[discovery]=true;s.storyNotice='隠し入口を発見しました。';return end end
   s.storyNotice='手がかりの近くで調べてください。';return
  end
  if key=='story_start' then if not s.campaign then action(s,'campaign') end;enter(s,'mond-town');return end
  local dest=key:match('^story_portal:([%w%-]+)$');local fast=key:match('^story_fast:([%w%-]+)$')
  if dest or fast then
   if s.paused or not s.story.active or s.actors[s.active].hp<=0 then return end
   local resume,departure=0,nil;dest=dest or fast;local n=nodes[dest];if not n then return end
   if n.hiddenGroup and not s.story.discovered[n.hiddenGroup] then s.storyNotice='この入口はまだ発見していません。';return end
   if not s.progression or s.progression.level<n.level then s.storyNotice='必要レベル '..n.level..' に達していません。';return end
   if fast then if not n.hub or not s.story.visited[dest] then s.storyNotice='到達済みの拠点だけ移動できます。';return end
   else
    local allowed=false;local a=s.actors[s.active]
    for _,edge in ipairs(nodes[s.story.node].exits) do
     if edge.to==dest and nearGate(a,edge) and shownEdge(s,edge) then
      local reason=gateRestriction(s,edge)
      if reason then s.storyNotice=reason;return end
      allowed=true;departure=edge;resume=edge.resumeSeconds or 0
     end
    end
    if not allowed then s.storyNotice='接続する門の近くまで歩いてください。';return end
   end
   local previous=s.story.node;local spawn,arrival=160,nil
   if departure and departure.loopOnce then
    local state=s.story.quests[departure.requires.quest]
    if forest.canLoop(state) then
     state.forest.looped=true
     enter(s,previous)
     s.storyNotice='入口に戻ったように見えます。灯籠が一つ増え、木の実のそばに足跡があります。'
     s.forestFeedback=s.storyNotice
     return
    end
   end
   for _,edge in ipairs(n.exits) do
    if edge.to==previous and not edge.returnOnly then spawn=edge.x<720 and 160 or n.width-160;arrival=edge end
   end
   local seconds=departure and (departure.liftSeconds or departure.waterwaySeconds or departure.boatSeconds)
   if seconds then
    s.lift={destination=dest,name=departure.rideLabel or n.name,seconds=seconds,remaining=seconds,
            waterway=departure.waterwaySeconds~=nil,boat=departure.boatSeconds~=nil,
            x=departure.arrivalX or (arrival and arrival.x or spawn),y=departure.arrivalY or (arrival and arrival.y or 480)}
    if not s.lift.waterway and not s.lift.boat and dest==previous and departure.arrivalY then s.lift.riders={} end
    for i,actor in ipairs(s.actors) do
     actor.walk=0
     if s.lift.riders then s.lift.riders[i]={x=actor.x,y=actor.y} end
    end
    s.storyNotice=nil
    return
   end
   enter(s,dest,spawn,resume);s.storyNotice=nil;return
  end
  local accept=key:match('^story_accept:([%w%-]+)$');local report=key:match('^story_report:([%w%-]+)$')
  local selectJoined=key:match('^story_select_joined:([%w%-]+)$')
  if selectJoined then
   local q=quests[selectJoined]
   if s.story.active and not s.paused and nodes[s.story.node].hub and q and q.join and completed(s,q.id) then
    action(s,'companion:'..q.join)
   end
   return
  end
  if accept or report then
   if s.paused or not s.story.active then return end
   local id=accept or report;local q=quests[id];if not q or s.story.node~=q.hub then return end
   local state=s.story.quests[id]
   if accept and (not state or (q.repeatable and state.status=='complete')) then
    if q.requires and not completed(s,q.requires) then return end
    if q.opensAfter and not s.story.quests[q.opensAfter] then return end
    if q.level and (not s.progression or s.progression.level<q.level) then return end
    s.story.quests[id]={status='active',count=0,cycles=state and state.cycles or 0,
                       recovered=q.cargo and {} or nil,inspected=q.trail and {} or nil,delivery=q.delivery and delivery.new() or nil,
                       cooking=q.cooking and cooking.new() or nil,book=q.book and {defeated={}} or nil,
                       stone=q.stone and {marked={},sequence=0} or nil,construction=q.construction and {surveyed={}} or nil,
                       lantern=q.lantern and {inspected={}} or nil,
                       forest=q.forest and {looped=false,defeated={}} or nil,
                       sights=q.sights and {seen={}} or nil,rest=q.rest and {defeated={}} or nil,
                       roof=q.roof and {ticks=0,falls=0} or nil}
   elseif report and state and state.status=='active' and state.count==q.goal then
    if q.cooking then state.cooking.meals=1 end
    if state.sights then sights.report(s,q) end
    state.status='complete';state.cycles=(state.cycles or 0)+1;s.mora=s.mora+q.mora;C.grantExp(s,q.xp,'quest')
    if q.ore then C.grantUpgradeOre(s,q.ore) end
    if not state.sights then s.storyNotice=(not q.sights and q.closing) or (q.sights and q.sights.legacyName or q.name)..'：報酬を受け取りました。' end
    if q.starter and s.companion==q.join then C.refreshArtifactStats(s,true) end
   end
   return
  end
  if key=='campaign' or key=='town' or key=='field' or key=='arena' or key=='boss_anemo' then s.story.active=false;s.voyage=nil;s.railTrip=nil end
  action(s,key)
 end
 function C.onKill(s,e)
  if onKill then onKill(s,e) end
  if s.story and s.story.active then
   progress(s,'kill',s.story.node,e)
   for _,q in ipairs(itineraries) do
    local milestone,state=nextMilestone(s,q)
    if milestone and milestone.kind=='kill' and milestone.node==s.story.node and e.spawnId then
     recordKill(s,state,milestone,e.spawnId)
    end
   end
   for id,state in pairs(s.story.quests) do
    local q=quests[id]
    if q.book and s.story.node==q.target then book.defeat(s,q,state,e) end
    if q.forest and s.story.node==q.target then forest.defeat(s,q,state,e) end
    if q.rest and s.story.node==q.target then rest.defeat(s,q,state,e) end
    if q.delivery and state.status=='active' and q.target==s.story.node and e.spawnId==q.delivery.cache.guard then
     if not state.delivery.guardCleared then s.storyNotice='見張りを倒しました。足場の荷箱を回収できます。' end
     state.delivery.guardCleared=true
    end
    if q.trail and state.status=='active' and state.count==(q.trail.meeting and 2 or 1) and q.target==s.story.node and e.spawnId==q.trail.guard then
     state.count=q.goal
     s.storyNotice=q.clearedNotice or '見張りを倒して柵が開きました。森への近道から戻れます。'
    end
    if q.rail and state.status=='active' and state.count==1 and q.target==s.story.node and e.spawnId==q.rail.guard then
     state.count=2
     chapterVictory(s,q,state)
     s.storyNotice='石切り場の番人を倒しました。分岐に止まった荷車を港へ送り出しましょう。'
    end
    if q.recovery and state.recovered and state.status=='active' and q.recovery.node==s.story.node then
     if state.count==q.goal-1 and e.spawnId==q.recovery.guard then
      state.count=q.goal
      s.storyNotice=q.clearedNotice
     else
      for _,item in ipairs(q.cargo) do
       if item.guard==e.spawnId then e.respawn=math.huge;break end
      end
     end
    end
   end
  end
 end
 function C.step(s,dt,input)
  if s.voyage and s.voyage.kind=='trolley' then
   if not s.paused then
    s.t=s.t+dt
    if s.t+1e-8>=s.voyage.arrives then arrive(s) end
   end
   return
  end
  if s.lift then
   if not s.paused then
    local ride=s.lift
    ride.remaining=math.max(0,ride.remaining-dt)
    if ride.riders then
     local p=1-ride.remaining/ride.seconds
     p=p*p*(3-2*p)
     for i,start in ipairs(ride.riders) do
      local actor=s.actors[i]
      actor.x=start.x+(ride.x-(i-1)*40-start.x)*p
      actor.y=start.y+(ride.y-start.y)*p
      actor.ground=false
     end
    end
    if ride.remaining<=1e-8 then enter(s,ride.destination,ride.x,nil,ride.y) end
   end
   return
  end
  if s.roofFlight then
   roof.travel(s,roofQuest,s.story.quests[roofQuest.id],dt)
   return
  end
  if s.caveFall then
   if cave.stepFall(s,dt) then
    local spec=caveQuest.cave
    enter(s,spec.depth,spec.landing.x,nil,spec.landing.y)
    s.caveNotice='ベネット「大丈夫か？ ほら、奥に鉱石が光ってる。風も吹き込んでるぞ！」'
   end
   return
  end
  local returns,previous=s.returns,s.t;step(s,dt,input)
  if roofQuest and s.story and s.story.active and s.returns==returns then
   roof.update(s,roofQuest,s.story.quests[roofQuest.id],s.t-previous)
  end
  if caveQuest and s.story and s.story.active and s.returns==returns then
   cave.update(s,caveQuest,s.story.quests[caveQuest.id])
  end
  if lanternQuest and s.story and s.story.active then
   local state=s.story.quests[lanternQuest.id]
   if state then lantern.step(s,lanternQuest,state,dt) end
  end
  if contestQuest and s.story and s.story.active and s.returns==returns then
   local state=s.story.quests[contestQuest.id]
   if contest.step(s,contestQuest,state) then chapterVictory(s,contestQuest,state) end
  end
  if s.railTrip and s.story.active and s.returns==returns then
   local n=nodes[s.story.node];local q,state=railQuest(s,n)
   if rail.step(s,dt,state) then
    s.platforms[#s.platforms+1]=copy(q.rail.bridge)
    spawnEnemies(s,n,state.count)
   end
  end
  if s.story and s.story.active and s.voyage and not s.paused and s.t+1e-8>=s.voyage.arrives then arrive(s) end
  if s.story and s.story.active and #s.enemies>0 and cleared(s,nodes[s.story.node]) then s.enemies={} end
  if s.story and s.story.active and s.returns~=returns then enter(s,s.story.visited[nodes[s.story.node].checkpoint] and nodes[s.story.node].checkpoint or 'mond-town') end
 end
 local function drawOutcrop(draws,x,y,angle)
  local shade=({faint='#8199af',partial='#536e91',clear='#24456c'})[angle]
  draws[#draws+1]={kind='rect',x=x-23,y=y-30,w=46,h=30,color='#68869b'}
  draws[#draws+1]={kind='rect',x=x-17,y=y-39,w=34,h=27,color='#b9d8e3'}
  for i=-1,1 do
   for z=0,3 do
    draws[#draws+1]={kind='rect',x=x+i*9+z,y=y-30-z*2,w=4,h=2,color=shade}
   end
  end
 end

 local function drawTeaSetting(draws,x,y,cups)
  draws[#draws+1]={kind='rect',x=x-24,y=y-16,w=48,h=8,color='#77553e'}
  draws[#draws+1]={kind='rect',x=x-20,y=y-8,w=6,h=8,color='#594232'}
  draws[#draws+1]={kind='rect',x=x+14,y=y-8,w=6,h=8,color='#594232'}
  for i=1,cups do
   local dx=x-19+(i-1)*13
   draws[#draws+1]={kind='rect',x=dx,y=y-25,w=9,h=9,color='#e3e9cc'}
   draws[#draws+1]={kind='rect',x=dx,y=y-25,w=9,h=3,color='#b18752'}
  end
 end
 local function drawIslandChest(draws,x,y,open)
  local lidY=open and y-37 or y-24
  draws[#draws+1]={kind='rect',x=x-20,y=y-19,w=40,h=19,color='#855c4a'}
  draws[#draws+1]={kind='rect',x=x-21,y=lidY,w=42,h=9,color='#ba9063'}
  draws[#draws+1]={kind='rect',x=x-16,y=y-17,w=4,h=17,color='#cfa468'}
  draws[#draws+1]={kind='rect',x=x+12,y=y-17,w=4,h=17,color='#cfa468'}
  draws[#draws+1]={kind='rect',x=x-3,y=y-19,w=6,h=9,color='#eed39a'}
 end
 local function drawShoreMark(draws,x,y,mark)
  local function rect(dx,dy,w,h,color)
   draws[#draws+1]={kind='rect',x=x+dx,y=y+dy,w=w,h=h,color=color}
  end
  if mark=='flag' then
   rect(-3,-38,5,38,'#705240')
   rect(2,-36,26,10,'#c65f51');rect(7,-26,13,5,'#df8760')
  else
   rect(-22,-32,10,32,'#775744');rect(8,-43,10,43,'#775744')
   rect(-23,-27,12,4,'#dbaf7d');rect(7,-35,12,4,'#dbaf7d')
   rect(-13,-25,21,3,'#ba9270')
  end
 end
 local function drawPatternBottle(draws,x,y,opened)
  draws[#draws+1]={kind='rect',x=x-20,y=y-46,w=40,h=46,color='#39656a'}
  draws[#draws+1]={kind='rect',x=x-15,y=y-43,w=30,h=35,color=opened and '#b38be0' or '#66a99c'}
  draws[#draws+1]={kind='rect',x=x-9,y=y-59,w=18,h=13,color='#ac7d5e'}
  draws[#draws+1]={kind='rect',x=x-13,y=y-39,w=3,h=23,color='#c1ece2'}
  draws[#draws+1]={kind='text',x=x+1,y=y-20,text='✧',color='#fff5d9',size=21}
 end

 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);setup(s);f.story=s.story;local visible={version=data.version,status=data.status,nodes={},quests={}}
  for _,n in ipairs(data.nodes) do if shownNode(s,n) then local out=copy(n);out.exits={};for _,edge in ipairs(n.exits) do if shownEdge(s,edge) then out.exits[#out.exits+1]=copy(edge) end end;visible.nodes[#visible.nodes+1]=out end end
  for _,q in ipairs(data.quests) do if shownNode(s,nodes[q.hub]) then visible.quests[#visible.quests+1]=q end end
  f.storyGraph=visible;f.storyNotice=s.storyNotice;f.storyJoined={};f.voyage=s.voyage and {seconds=math.max(0,s.voyage.arrives-s.t),destination=s.voyage.destination,elapsed=s.t-s.voyage.started,kind=s.voyage.kind,stopover=s.voyage.stopStart and s.t-s.voyage.started+1e-8>=s.voyage.stopStart and s.t-s.voyage.started+1e-8<s.voyage.stopEnd or false} or nil
  if f.voyage and f.voyage.kind=='trolley' then
   local v=s.voyage
   local wait=math.max(0,math.min(f.voyage.elapsed,v.stopEnd)-v.stopStart)
   local fraction=math.max(0,math.min(1,(f.voyage.elapsed-wait)/(v.total-v.stopEnd+v.stopStart)))
   f.voyage.scroll=v.reverse and 1-fraction or fraction
  end
  for id,q in pairs(quests) do if q.join and s.story.quests[id] and s.story.quests[id].status=='complete' then f.storyJoined[q.join]=true end end
  if s.story.active then local n=nodes[s.story.node];f.location=n.name..'（本編試作）'
   f.storyCleared=cleared(s,n) and true or nil
   if n.expeditionDesk and canInspect(s.actors[s.active],n.expeditionDesk) then
    local barrier=n.expeditionDesk.barrier
    f.storyExpeditionDesk={barrier=barrier,
     practice=s.expeditionPractice and math.floor(100*C.barrierMultiplier(C.partyImprint(s),barrier)+.5) or nil}
   end
   local reward=s.storyFirstClear
   if reward and s.t<reward.untilTime then f.storyFirstClear={quest=reward.quest,xp=reward.xp} end
   if n.clearedBy and not f.storyCleared then
    for _,e in ipairs(s.enemies) do
     if e.storyName and e.hp>0 then
      f.storyElite={name=e.storyName,hp=e.hp,maxhp=e.maxhp}
      break
     end
    end
   end
   if s.lift then
    local ride=s.lift
    f.storyLift={destination=ride.name,remaining=ride.remaining,seconds=ride.seconds,
                 waterway=ride.waterway or nil,boat=ride.boat or nil}
   else f.storyNearbyPortal=nearbyPortal(s) end
   local markers={};f.storyPortals={}
   local cue=s.storyCue
   if cue and s.t<cue.untilTime then
    if cue.channel=='airflow' then f.storyAirflowCue=cue else f.storyResonanceCue=cue end
   end
   local function marker(x,y,w,h) markers[#markers+1]={kind='rect',x=x,y=y,w=w,h=h,color='#83dbe1'} end
   for _,edge in ipairs(n.exits) do if shownEdge(s,edge) and (not edge.darkOnly or s.storyLightMode=='dark') then
    local x,y=edge.x-s.camera,edge.y or 480
    local rule=edge.requires
    local state=rule and s.story.quests[rule.quest]
    local rubble=edge.rubbleOnClosed and state and state.count>=rule.before
    if rubble then
     markers[#markers+1]={kind='rect',x=x-26,y=y-44,w=50,h=44,color='#6a4b51'}
     markers[#markers+1]={kind='rect',x=x-17,y=y-59,w=32,h=17,color='#a4785f'}
    else
     marker(x-18,y-90,3,90);marker(x+15,y-90,3,90)
     marker(x-18,y-90,36,3);marker(x-21,y-3,42,3)
    end
    f.storyPortals[#f.storyPortals+1]={to=edge.to,x=x,y=y}
   end
   end
   if n.localLight then localLight.observe(s,f,markers,n.localLight) end
   if f.voyage and f.voyage.kind=='trolley' then
    local a=s.actors[1]
    C.drawFieldDisplayArt({draws=markers},C.trolleyArt,a.x-s.camera-20,a.y+36,62,mode,profile,s.voyage.reverse)
   end
   if n.resonance then
    local quest=quests[n.resonance.quest]
    resonance.observe(s,f,markers,n.resonance,s.story.quests[quest.id],nextMilestone(s,quest))
   end
   if n.rockViews then
    rockViews.observe(s,f,markers,n.rockViews,nextMilestone(s,quests[n.rockViews.quest]))
   end
   for _,edge in ipairs(n.exits) do
    if edge.wind and not windWindow(s,edge.wind) then
     local x,y=edge.x-s.camera,edge.y or 480
     for i=1,11 do
      local drift=(i*53+s.t*236)%320
      markers[#markers+1]={kind='rect',x=x-144+drift,y=y-100+(i*29)%87,w=29+(i%5)*12,h=2,color='#e1f7ffd4'}
     end
    end
   end
   if s.lift and s.lift.riders then
    local rider=s.actors[1]
    local x,y=rider.x-s.camera,rider.y
    markers[#markers+1]={kind='rect',x=x-63,y=y,w=101,h=10,color='#5e5b48'}
    markers[#markers+1]={kind='rect',x=x-63,y=y,w=101,h=3,color='#f0d18b'}
   end
   local q,state=cargoQuest(s)
   if q then
    local nearby=nearbyCargo(s,q,state)
    if nearby and not s.paused then
     f.storyNearbyCargo={id=nearby.id,name=nearby.name,guarded=guarding(s,nearby) or nil}
    end
    f.storyCargo={}
    for _,item in ipairs(q.cargo) do
     if not state.recovered[item.id] then
      f.storyCargo[item.id]={x=item.x,y=item.y}
      local x,y=item.x-s.camera,item.y
      if x>=-20 and x<=980 then
       markers[#markers+1]={kind='rect',x=x-15,y=y-24,w=30,h=24,color='#453020'}
       markers[#markers+1]={kind='rect',x=x-13,y=y-22,w=26,h=19,color='#bb7950'}
       markers[#markers+1]={kind='rect',x=x-13,y=y-16,w=26,h=4,color='#f2cc7a'}
       markers[#markers+1]={kind='rect',x=x-3,y=y-22,w=6,h=19,color='#79502f'}
      end
     end
    end
   end
   local clue,_,nextCount=trailClue(s)
   if clue then
    if not s.paused and canInspect(s.actors[s.active],clue) then
     f.storyNearbyClue={id=clue.id,name=clue.name,label=nextCount==2 and clue.name..'と話す' or nil}
    end
    local x,y=clue.x-s.camera,clue.y
    local elevated=y<480
    markers[#markers+1]={kind='rect',x=x-10,y=y-14,w=20,h=4,color=elevated and '#a93634' or '#634936'}
    markers[#markers+1]={kind='rect',x=x-5,y=y-10,w=10,h=7,color=elevated and '#f76859' or '#b69765'}
   end
   for _,q in ipairs(data.quests) do
    if q.delivery or q.rail or q.cooking or q.book or q.stone or q.construction or q.lantern or q.forest then
     local state=s.story.quests[q.id]
     if q.delivery then delivery.observe(s,f,markers,q,state and state.delivery)
     elseif q.rail then rail.observe(s,f,markers,q,state)
     elseif q.cooking and state then cooking.observe(s,f,markers,q,state)
     elseif q.book and state then book.observe(s,f,markers,q,state)
     elseif q.stone and state then stone.observe(s,f,markers,q,state)
     elseif q.construction and state then construction.observe(s,f,markers,q,state)
     elseif q.lantern and state then lantern.observe(s,f,markers,q,state,mode,profile)
     elseif q.forest and state then forest.observe(s,f,markers,q,state,mode,profile) end
    end
   end
   if contestQuest then contest.observe(s,f,markers,n,contestQuest,s.story.quests[contestQuest.id],mode,profile) end
   if sightQuest then sights.observe(s,f,markers,sightQuest,s.story.quests[sightQuest.id],mode,profile) end
   if restQuest then rest.observe(s,f,markers,restQuest,s.story.quests[restQuest.id],mode,profile) end
   if caveQuest then cave.observe(s,f,markers,caveQuest,s.story.quests[caveQuest.id],mode,profile) end
   if roofQuest then roof.observe(s,f,markers,roofQuest,s.story.quests[roofQuest.id]) end
   local recoveryQuest=quests[n.clearedBy]
   local recoveryState=recoveryQuest and recoveryQuest.recovery and s.story.quests[recoveryQuest.id]
   if recoveryState and recoveryState.recovered and recoveryState.count==recoveryQuest.goal-1 and s.companion~='beidou' then
    local guide=recoveryQuest.recovery.guide
    if math.abs(guide.x-s.camera-480)<540 then
     C.drawCompanionArt({draws=markers},s,{x=guide.x,y=guide.y,dir=-1},mode,profile,guide.id)
     markers[#markers+1]={kind='text',x=guide.x-s.camera,y=guide.y-94,size=15,color='#ffe7a2',text=guide.name}
    end
   end
   for _,q in ipairs(itineraries) do
    local state=s.story.quests[q.id]
    local milestone=nextMilestone(s,q)
    if milestone and milestone.airflow and milestone.node==s.story.node then
     airflow.observe(s,f,markers,milestone,not s.paused and canInspect(s.actors[s.active],milestone))
    elseif milestone and milestone.reflect and milestone.node==s.story.node then
     reflection.draw(s,f,markers,milestone,not s.paused and canInspect(s.actors[s.active],milestone))
    elseif milestone and milestone.kind=='inspect' and milestone.node==s.story.node
        and not milestone.resonanceOrder and not milestone.shadowChoice
        and (not milestone.roomLight or milestone.roomLight==s.storyLightMode) then
     local x,y=milestone.x-s.camera,milestone.y
     if not milestone.shadowView and (not milestone.resonanceStone or milestone.resonanceControl) and x>=-25 and x<=985 then
      if milestone.outcrop then drawOutcrop(markers,x,y,milestone.outcrop)
      elseif milestone.teaCups then drawTeaSetting(markers,x,y,milestone.teaCups)
      elseif milestone.islandTreasure then drawIslandChest(markers,x,y,false)
      elseif milestone.shoreMark then drawShoreMark(markers,x,y,milestone.shoreMark)
      elseif milestone.patternBottle then drawPatternBottle(markers,x,y,false)
      else
       markers[#markers+1]={kind='rect',x=x-13,y=y-28,w=26,h=28,color='#5a3648'}
       markers[#markers+1]={kind='rect',x=x-10,y=y-24,w=20,h=16,color='#eed5a8'}
       markers[#markers+1]={kind='rect',x=x-6,y=y-20,w=12,h=4,color='#767462'}
      end
      markers[#markers+1]={kind='text',x=x,y=y-(milestone.patternBottle and 66 or milestone.outcrop and 48 or 41),text=milestone.name,color='#fff0b9',size=14}
     end
     if not f.storyNearbyMilestone and not s.paused and canInspect(s.actors[s.active],milestone) then
      f.storyNearbyMilestone={label=milestone.action}
     end
    end
    if state then
     for index=1,state.count do
      local done=q.itinerary[index]
      if done.completedLabel and done.node==s.story.node and not done.resonanceOrder
          and (not done.roomLight or done.roomLight==s.storyLightMode) then
       local x,y=done.x-s.camera,done.y
       if (not done.resonanceStone or done.resonanceControl) and x>=-25 and x<=985 then
        if done.outcrop then drawOutcrop(markers,x,y,done.outcrop)
        elseif done.teaCups then drawTeaSetting(markers,x,y,done.teaCups)
        elseif done.islandTreasure then drawIslandChest(markers,x,y,true)
        elseif done.shoreMark then drawShoreMark(markers,x,y,done.shoreMark)
        elseif done.patternBottle then drawPatternBottle(markers,x,y,true)
        else
         markers[#markers+1]={kind='rect',x=x-11,y=y-28,w=22,h=28,color='#5a3648'}
         markers[#markers+1]={kind='rect',x=x-7,y=y-25,w=14,h=12,color='#b9ffce'}
        end
        markers[#markers+1]={kind='text',x=x,y=y-(done.patternBottle and 66 or done.outcrop and 48 or 41),text=done.completedLabel,color='#b9ffce',size=14}
       end
       if (done.readback or done.resonancePages) and state.status=='complete' and not f.storyNearbyMilestone and not s.paused
           and canInspect(s.actors[s.active],done) then
        if done.resonancePages then resonance.book(s,f,done) else f.storyNearbyMilestone={label=done.readLabel} end
       end
      end
     end
    end
   end
   -- Navigation and quest objects precede actors, enemies, and effects.
   for _,hint in ipairs(n.hints or {}) do
    if not f.storyNearbyMilestone and not s.paused and not s.lift and not s.story.discovered[hint.group]
        and nearHint(s.actors[s.active],hint) then
     f.storyNearbyMilestone={label=hint.label..'を調べる'}
    end
   end
   for _,draw in ipairs(f.draws) do markers[#markers+1]=draw end;f.draws=markers
   for _,h in ipairs(n.hints or {}) do f.draws[#f.draws+1]={kind='rect',x=h.x-s.camera-8,y=h.y-48,w=16,h=16,color='#ffe4a0'} end
   f.commands=#f.draws
  end
  return f
 end
 function C.checkpoint(s)
  local d=checkpoint(s);setup(s);if d then d.story=s.story end;return d
 end
 function C.restore(d,density)
  local s=restore(d,density);setup(s)
  if d.story then
   s.story=copy(d.story);setup(s)
   if s.story.active then
    local hub=s.story.visited[nodes[s.story.node].checkpoint] and nodes[s.story.node].checkpoint or 'mond-town'
    enter(s,hub)
   end
  end
  if C.starterEquipment(s,s.companion) then C.refreshArtifactStats(s,true) end
  return s
 end
end
