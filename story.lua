return function(C,data,delivery,rail,cooking,book,stone,construction,lantern,forest,contest,sights,rest,cave,roof,reflection,localLight,airflow,resonanceModule,rockViewsModule,paperModule,theater,flagCourse,movingPlatforms,duel,moonInlet,coastDetour,appraisalModule,rumorModule,bloomModule,patrolModule,surveyModule,snowMatchModule,returnBoxModule,nightBannerModule,fireworksModule,stealthModule,ittoModule,teaCaseModule,wandererSurveyModule,visitorsModule,colleiGuideModule,kavehModelModule,nahidaMapModule,emilieScentModule,furinaCuesModule,naviaPhotoModule,lyneyMagicModule,freminetDiveModule,stoneOrnamentsModule,mualaniSurfModule,kinichAmbushModule,xilonenSpringsModule,iansanTrainingModule)
 local action,step,frame,checkpoint,restore,onKill=C.action,C.step,C.frame,C.checkpoint,C.restore,C.onKill
 local function identifyQuestProp(s,draws,first,id)
  -- Only the preview exporter needs per-mark IDs in its frame.
  if not s.captureQuestProps then return end
  for i=first,#draws do draws[i].questProp=id end
 end
 local function copy(v)
  if type(v)~='table' then return v end
  local out={};for k,item in pairs(v) do out[k]=copy(item) end;return out
 end
 do
  local lastPlatformNode,lastPlatformRows
  function data.basePlatforms(node)
   if node.platforms then return node.platforms end
   if lastPlatformNode~=node then
    lastPlatformRows=assert(data.readPlatforms(node.id),'Missing platforms: '..node.id)
    lastPlatformNode=node
   end
   return lastPlatformRows
  end
 end
 local nodes,quests,starterQuests,itineraries={},{},{},{}
 local graphNodes,graphEdges,graphQuests,phaseNodes={},{},{},{}
 local currentQuestTotal=0
 local growthQuests,growthEvidence={},{}
 local advancedGrowth={
  SK54={level=127,region='nod-port',alternate='nod-town',mark='lunar-orb'},
  SK55={level=133,region='nod-port',alternate='nod-town',mark='lunar-ring'},
  SK56={level=149,region='snezhnaya-entry',alternate='snezhnaya-hub',mark='star-wind'},
  SK57={level=155,region='snezhnaya-entry',alternate='snezhnaya-hub',mark='star-electro'},
  SK58={level=160,elements=true},
  SK59={level=170,elements=true},
  SK60={level=180,elements=true},
 }
 local elementalRegions={
  {'モンド','風',1},{'璃月','岩',20},{'稲妻','雷',40},{'スメール','草',60},
  {'フォンテーヌ','水',80},{'ナタ','炎',100},{'スネージナヤ','氷',140},
 }
 local elementByRegion,elements={},{}
 for _,entry in ipairs(elementalRegions) do
  local region,name,level=table.unpack(entry)
  local element={level=level,hubs={},places={}}
  elementByRegion[region]=element
  elements[name]=element
 end
 local regionalSkills=data.regionalSkills or {}
 local skillAliases={skill1='SK01',skill2='SK02'}
 local moonReactions={['reaction:moon-electro']=true,['reaction:moon-dendro']=true,['reaction:moon-geo']=true}
 local barrierTargets={}
 local lunarJoin={'columbina-join','columbina-coast-detour'}
 local pathJoins={}
 local forestQuest,lanternQuest,contestQuest,sightQuest,restQuest,caveQuest,roofQuest
 for _,n in ipairs(data.nodes) do
  nodes[n.id]=n
  local element=elementByRegion[n.region]
  if element and not n.branch and not n.hiddenGroup then
   local places=n.hub and element.hubs or element.places
   places[#places+1]=n.id
  end
  if n.locationAfterReport then phaseNodes[#phaseNodes+1]=n end
  if n.hiddenGroup or n.revealAfter then graphNodes[#graphNodes+1]=n end
  for _,edge in ipairs(n.exits) do
   if edge.visitedOnly or edge.hideUntilAllowed then graphEdges[#graphEdges+1]={from=n,edge=edge} end
  end
  if (n.barrier or 0)>0 then barrierTargets[#barrierTargets+1]={id=n.id,name=n.name,barrier=n.barrier} end
 end
 table.sort(barrierTargets,function(a,b) return a.barrier<b.barrier end)
 function C.growthBarrierTargets() return barrierTargets end
 for _,q in ipairs(data.quests) do
  quests[q.id]=q
  if not q.regionUnavailable then
   if q.legacyOnly then graphQuests[#graphQuests+1]=q else currentQuestTotal=currentQuestTotal+1 end
  end
  if q.lesson then
   growthQuests[#growthQuests+1]=q
   for _,objective in ipairs(q.lesson) do growthEvidence[objective.id]=true end
   for _,objective in ipairs(q.bonusLesson or {}) do growthEvidence[objective.id]=true end
  end
  if q.itinerary and not q.regionUnavailable then itineraries[#itineraries+1]=q end
  if q.anyPath then
   for i,step in ipairs(q.itinerary) do if step.kind=='paths' then pathJoins[q.id]=i;break end end
  end
  if q.forest then forestQuest=q end
  if q.lantern then lanternQuest=q end
  if q.contest then contestQuest=q end
  if q.sights then sightQuest=q end
  if q.rest then restQuest=q end
  if q.cave then caveQuest=q end
  if q.roof then roofQuest=q end
  if q.join and q.starter then starterQuests[q.join]=q end
 end
 local ayakaRevisit=contest.revisits(quests,nodes)
 local function setup(s)
  if not s.story then s.story={active=false,node='mond-town',visited={['mond-town']=true},quests={}} end
  s.story.discovered=s.story.discovered or {}
 end
 local function completed(s,id)
  local state=s.story.quests[id]
  return state and state.status=='complete'
 end
 local function lunarJoined(s)
  for _,id in ipairs(lunarJoin) do if completed(s,id) then return true end end
  return false
 end
 local function learnedElement(s,name)
  local element=elements[name]
  if not element or not s.progression or s.progression.level<element.level then return false end
  local visited=s.story.visited
  for _,id in ipairs(element.hubs) do if visited[id] then return true end end
  for _,id in ipairs(element.places) do if visited[id] then return true end end
  return false
 end
 local function learnedElements(s)
  local missing={}
  for _,entry in ipairs(elementalRegions) do
   if not learnedElement(s,entry[2]) then missing[#missing+1]=entry[2] end
  end
  return missing
 end
 local growthRequirements={
  imprintLesson=function(s)
   return not not ((s.story.growth and s.story.growth['first-imprint']) or completed(s,'growth-first-imprint') or C.hasImprintedArtifact(s))
  end,
  lunarJoin=lunarJoined,
  lightElements=function(s) return #learnedElements(s)==0 end,
  weeklyAccess=function(s)
   return not not (s.progression and s.progression.level>=20 and s.story.visited['mond-road'])
  end,
 }
 local function milestoneReached(s,milestone)
  if milestone.elements then
   return s.progression and s.progression.level>=milestone.level and growthRequirements.lightElements(s)
  end
  return s.progression and s.progression.level>=milestone.level
    and (s.story.visited[milestone.region] or s.story.visited[milestone.alternate])
 end
 function C.growthSkillCondition(s,key)
  if not s.story or not (s.story.active or s.endgameRun) then return true end
  local skill=regionalSkills[skillAliases[key] or key]
  if skill then
   if not s.progression or s.progression.level<skill.level then
    return false,'Lv'..skill.level..'になると使えます。'
   end
   local missing={}
   for _,element in ipairs(skill.elements) do
    if not learnedElement(s,element) then missing[#missing+1]=element end
   end
   if #missing>0 then
    return false,'未習得の元素：'..table.concat(missing,'・')..'。各地域で旅を始めると習得できます。'
   end
   return true
  end
  local milestone=advancedGrowth[key]
  if not milestone or milestoneReached(s,milestone) then return true end
  if milestone.elements then
   local missing=learnedElements(s)
   if #missing>0 then return false,'未習得の元素：'..table.concat(missing,'・')..'。各地域で旅を始めると習得できます。' end
   return false,'Lv'..milestone.level..'になると使えます。'
  end
  local name=nodes[milestone.region].region
  return false,name..'に到達し、Lv'..milestone.level..'になると使えます。'
 end
 local function growthCount(s,q)
  local count=0
  for _,objective in ipairs(q.lesson) do
   if s.story.growth and s.story.growth[objective.id] then count=count+1 end
  end
  return count
 end
 function C.noteGrowth(s,id)
  if s.growthPracticeMarks then
   s.growthPracticeMarks[id]=true
   return
  end
  if not growthEvidence[id] or not s.story or not (s.story.active or s.endgameRun) or s.paused then return end
  local records=s.story.growth or {}
  if records[id] then return end
  records[id]=true;s.story.growth=records
  for _,q in ipairs(growthQuests) do
   local state=s.story.quests[q.id]
   if state and state.status=='active' then state.count=growthCount(s,q) end
  end
 end
 function C.noteGrowthHit(s,cast)
  if not (s.growthPracticeMarks or s.story and s.story.active) then return end
  if cast.lightNormal then C.noteGrowth(s,'light-normal') end
  if cast.key=='SK59' and cast.echoOf then C.noteGrowth(s,'light-echo') end
  if s.growthPracticeMarks then return end
  if moonReactions[cast.key] and lunarJoined(s) then C.noteGrowth(s,'lunar-reaction') end
  local milestone=advancedGrowth[cast.key]
  if not milestone or milestone.elements or cast.id~=1 or not milestoneReached(s,milestone) then return end
  local mark=milestone.mark
  if mark=='lunar-orb' or mark=='lunar-ring' then
   if lunarJoined(s) then C.noteGrowth(s,mark);C.noteGrowth(s,'lunar-reaction') end
  else C.noteGrowth(s,mark);C.noteGrowth(s,'star-strike') end
 end
 function C.canStartGrowthTrial(s,id)
  local quest=quests[id]
  if not quest or not quest.practice or s.paused or not s.story or not s.story.active
   or s.story.node~=quest.hub or s.lift or s.voyage or not s.story.quests[id] then return end
  if not milestoneReached(s,advancedGrowth[quest.practice]) then return end
  return quest.practice
 end
 C.frameGrowthBattle=frame
 function C.starterEquipment(s,companion)
  local q=starterQuests[companion or 'amber']
  if q and s.story and completed(s,q.id) then return q.starter end
 end
 local function meetsGateRule(s,rule)
  local state=s.story.quests[rule.quest]
  if rule.unreported then return not completed(s,rule.quest) end
  if rule.path then state=state and state.pathProgress and state.pathProgress[rule.path] end
  if rule.before and state and state.count>=rule.before then return false end
  if rule.construction then
   return completed(s,rule.quest) and state.construction and state.construction.plan==rule.construction
  end
  return (not (rule.path and quests[rule.quest].anyPath) and completed(s,rule.quest)) or
   (rule.count and state and state.count>=rule.count and (not rule.recovery or state.recovered))
 end
 local function spiritwayPoint(x,y,endX,track,p)
  return x+(endX-x)*p,y+(track.y-y)*p-4*track.arc*p*(1-p)
 end
 local function windWindow(s,wind)
  local t=(s.t-s.storyEnteredAt)%wind.period
  local calm=t>=wind.calmStart and t<wind.calmEnd
  local nextChange=calm and wind.calmEnd or (t<wind.calmStart and wind.calmStart or wind.period+wind.calmStart)
  return calm,nextChange-t
 end
 function C.storyGateWind(s,from,edge)
  if not edge.wind or from~=s.story.node or s.coop then return end
  local calm,seconds=windWindow(s,edge.wind)
  return {calm=calm,seconds=math.ceil(seconds)}
 end
 local function voyageElapsed(s)
  -- Treat a tick that lands on the scheduled boundary as exact.
  return s.voyage and s.t-s.voyage.started+1e-8 or -1
 end
 function C.boardingSchedule(edge)
  local vehicle=nodes[edge.to]
  local ride=vehicle and vehicle.voyage
  if not ride then return end
  local resumed=edge.resumeSeconds or 0
  local details={}
  for _,stop in ipairs(vehicle.exits) do
   if stop.windowStart and stop.windowEnd>resumed then
    details[#details+1]=('%g〜%g秒に%sで%s'):format(math.max(0,stop.windowStart-resumed),stop.windowEnd-resumed,
     nodes[stop.to].name,ride.kind=='ferry' and '途中下船可' or '途中下車可')
   end
  end
  details[#details+1]=('%s%g秒で%sに到着'):format(edge.resumeSeconds and '乗り直してから' or '出発から',
   ride.seconds-resumed,nodes[ride.destination].name)
  return table.concat(details,'、')
 end
 function C.storyStopWindow(s,from,edge)
  if not edge.windowStart or not s.voyage or from~=s.story.node or s.coop then return end
  local elapsed=voyageElapsed(s)
  if elapsed>=edge.windowEnd then return {phase='passed',kind=s.voyage.kind} end
  local waiting=elapsed<edge.windowStart
  return {phase=waiting and 'waiting' or 'open',kind=s.voyage.kind,
   seconds=math.ceil((waiting and edge.windowStart or edge.windowEnd)-elapsed)}
 end
 local function questGateHint(rule,state)
  local q=quests[rule.quest]
  local title='依頼「'..q.name..'」'
  if not state then return nodes[q.hub].name..'で'..title..'を受注してください。' end
  if not rule.count and state.count>=q.goal then return nodes[q.hub].name..'で'..title..'を報告してください。' end
  local progress,steps=state,q.itinerary
  if rule.path then
   for _,path in ipairs(q.paths) do
    if path.id==rule.path then
     title=title..'・'..path.label
     progress=state.pathProgress and state.pathProgress[path.id]
     steps=path.steps
     break
    end
   end
  end
  local count=progress and progress.count or 0
  local needed=rule.count or q.goal
  local nextStep=steps and steps[count+1]
  local hint=title..'（'..(rule.count and '開通まで ' or '報告まで ')..count..'/'..needed..'）'
  if nextStep and nextStep.objective then
   local place=nextStep.node and nodes[nextStep.node]
   hint=hint..'　'..(place and place.name..'：' or '')..nextStep.objective
   if nextStep.enemies and progress and progress.sweep then
    local remaining=0
    for _,id in ipairs(nextStep.enemies) do
     if not progress.sweep[id] then remaining=remaining+1 end
    end
    hint=hint..'（残り'..remaining..'体）'
   end
   return hint
  end
  return hint
 end
 local function gateRestriction(s,edge,planning)
  if not planning and edge.darkOnly and s.storyLightMode~='dark' then return '消灯すると出口が見えます。' end
  if edge.roofTrialStage and s.roofTrial and s.roofTrial.count<edge.roofTrialStage then return '屋根の目印を先に調べてください。' end
  local rule=edge.requires
  if rule then
   local state=s.story.quests[rule.quest]
   if planning and edge.loopOnce and state and state.status=='active' and state.count==0 then
    if forest.canLoop(state) then return '右の鳥居を一度くぐり、戻った道で足跡を調べてください。' end
    return '木の実のそばの足跡を調べると、次の鳥居へ進めます。'
   end
   local allowed=meetsGateRule(s,rule) or (rule.alternative and meetsGateRule(s,rule.alternative))
    or (edge.loopOnce and forest.canLoop(state))
   if not allowed then
    if not state and rule.unstartedNotice then return rule.unstartedNotice end
    if rule.unreported then return rule.closedNotice or '報告後は内側の水路へ。' end
    if rule.before and state and state.count>=rule.before then return rule.closedNotice or '足場を中継位置へ移しました。' end
    if rule.construction and completed(s,rule.quest) then return '今回はもう一方の道を整備しました。' end
    if rule.recovery and state and not state.recovered then return '受注済みの旧依頼は岩間の狩場で進められます。' end
    if rule.alternative then
     return '「'..quests[rule.quest].name..'」か「'..quests[rule.alternative.quest].name..'」を受注してください。'
    end
    return rule.unavailableNotice or questGateHint(rule,state)
   end
  end
  if planning then return end
  if edge.wind and not windWindow(s,edge.wind) then return edge.wind.notice or '吹雪のため通れません。風が止むまで待つか、下の風よけ道へ。' end
  local passed=voyageElapsed(s)
  if edge.windowStart and not (passed>=edge.windowStart and passed<edge.windowEnd) then
   if s.voyage and s.voyage.kind=='trolley' then
    return passed<edge.windowStart and '停留所に近づいています。' or '停留所を通過しました。終点から戻れます。'
   end
   return '寄港時間外'
  end
  if edge.requiresArrival and not (s.voyage and s.t>=s.voyage.arrives) then return '到着待ち' end
 end
 local function travelerGateMessage(n)
  if n.travelerTrial then return '旅人が戦闘可能な状態で挑戦してください。' end
  if n.toyDive then return '旅人が泳げる状態で潜りましょう。' end
 end
 local function travelerGateRestriction(s,n)
  if s.actors[1].hp<=0 then return travelerGateMessage(n) end
 end
 function C.atlasGateRestriction(s,from,edge,routeLevel,futureBoarding)
  local destination=nodes[edge.to]
  if (routeLevel or s.progression.level)<destination.level then return '必要Lv'..destination.level end
  local reason=travelerGateRestriction(s,destination)
  if reason then return reason end
  if not futureBoarding and edge.windowStart and from==s.story.node and voyageElapsed(s)>=edge.windowEnd then
   return '乗降時間を過ぎました。'
  end
  return gateRestriction(s,edge,true)
 end
 function C.gateHasRubble(s,edge)
  local rule=edge.requires
  local progress=edge.rubbleOnClosed and s.story.quests[rule.quest]
  return progress and progress.count>=rule.before
 end
 function C.gateFixtureState(s,from,edge)
  if edge.rubbleOnClosed then return C.gateHasRubble(s,edge) and 'closed' or 'open' end
  if edge.routeFixture then return C.atlasGateRestriction(s,from,edge) and 'closed' or 'open' end
  if edge.ironGate or edge.rockSeal then
   return C.atlasGateRestriction(s,from,edge,math.huge) and 'closed' or 'open'
  end
 end

 function C.gateOffset(a,edge)
  local dx,dy=edge.x-a.x,(edge.y or 480)-a.y
  return math.abs(dx)<90 and 0 or dx,math.abs(dy)<60 and 0 or dy
 end
 local function nearGate(a,edge)
  local dx,dy=C.gateOffset(a,edge)
  return dx==0 and dy==0
 end
 local function shownNode(s,n)
  return not n.resumeAt and (not n.hiddenGroup or s.story.discovered[n.hiddenGroup])
     and (not n.revealAfter or meetsGateRule(s,n.revealAfter))
 end
 function C.atlasNodeVisible(s,id)
  return nodes[id] and shownNode(s,nodes[id])
 end
 local function shownEdge(s,edge)
  return shownNode(s,nodes[edge.to]) and (not edge.visitedOnly or s.story.visited[edge.to])
      and (not edge.hideUntilAllowed or not gateRestriction(s,edge))
 end
 local function learnedForestRooms(s)
  local progress=forestQuest and s.story.quests[forestQuest.id]
  return progress and math.min(progress.count,#forestQuest.forest.rooms) or 0
 end
 local function fieldName(s,node)
  for i=1,learnedForestRooms(s) do
   local room=forestQuest.forest.rooms[i]
   if room.node==node.id then return node.name..'（'..room.name..'）' end
  end
  return node.name
 end
 local function visibleStoryGraph(s)
  -- Edges with ordinary requirements stay in the graph and are evaluated at the gate.
  -- Only these predicates can change which definitions are present in a published graph.
  local visibility={tostring(learnedForestRooms(s)),':'}
  for _,node in ipairs(graphNodes) do
   visibility[#visibility+1]=shownNode(s,node) and '1' or '0'
  end
  for _,node in ipairs(phaseNodes) do
   visibility[#visibility+1]=completed(s,node.locationAfterReport.quest) and '1' or '0'
  end
  for _,rule in ipairs(graphEdges) do
   visibility[#visibility+1]=shownNode(s,rule.from) and shownEdge(s,rule.edge) and '1' or '0'
  end
  for _,quest in ipairs(graphQuests) do
   visibility[#visibility+1]=shownNode(s,nodes[quest.hub]) and s.story.quests[quest.id] and '1' or '0'
  end
  local key=table.concat(visibility)
  local cached=s.storyGraphCache
  if cached and cached.key==key then return cached.graph,cached.revision end

  local graph={version=data.version,status=data.status,nodes={},quests={},bossNodes={},
   currentQuestTotal=currentQuestTotal,legacyQuestTotal=#graphQuests}
  for _,node in ipairs(data.nodes) do
   if shownNode(s,node) then
    local visible=copy(node)
    visible.travelerGateMessage=travelerGateMessage(node)
    visible.name=fieldName(s,node)
    local phase=node.locationAfterReport
    if phase and completed(s,phase.quest) then visible.name=phase.name end
    visible.exits={}
    for _,edge in ipairs(node.exits) do
     if shownEdge(s,edge) then
      local exit=copy(edge)
      exit.boarding=C.boardingSchedule(edge)
      visible.exits[#visible.exits+1]=exit
     end
    end
    graph.nodes[#graph.nodes+1]=visible
   end
  end
  for boss,id in pairs(data.bossNodes) do
   if shownNode(s,nodes[id]) then graph.bossNodes[boss]=id end
  end
  for _,quest in ipairs(data.quests) do
   if not quest.regionUnavailable and shownNode(s,nodes[quest.hub]) and (not quest.legacyOnly or s.story.quests[quest.id]) then
    graph.quests[#graph.quests+1]=quest
   end
  end
  local revision=(cached and cached.revision or 0)+1
  s.storyGraphCache={key=key,revision=revision,graph=graph}
  return graph,revision
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
    local automatic=edge.requiresArrival and s.voyage and s.voyage.destination==edge.to or nil
    local reason=nil
    if s.roofFlight then reason='移動中'
    elseif s.caveFall then reason='崩落中'
    elseif s.paused then reason='一時停止中'
    elseif a.hp<=0 then reason='戦闘不能中'
    elseif not s.progression or s.progression.level<n.level then reason='必要レベル '..n.level
    else reason=travelerGateRestriction(s,n) or gateRestriction(s,edge) end
    best={to=edge.to,name=automatic and fieldName(s,n) or edge.rideLabel or fieldName(s,n),level=n.level,available=not reason,reason=reason,
          automaticArrival=automatic,
          liftSeconds=edge.liftSeconds,waterwaySeconds=edge.waterwaySeconds,boatSeconds=edge.boatSeconds,phaseSeconds=edge.phaseSeconds,
          floatingStone=edge.floatingStone,
          ferryBoard=n.voyage and n.voyage.kind=='ferry' or nil,
          ferryReboard=n.voyage and n.voyage.kind=='ferry' and edge.resumeSeconds~=nil or nil,
          ferryStop=s.voyage and s.voyage.kind=='ferry' and edge.windowStart~=nil or nil,
          trainBoard=n.voyage and n.voyage.kind=='train' or nil,
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
 local function growthViewpoint(s)
  local node=nodes[s.story.node]
  local quest=s.story.quests['growth-branch-visit']
  if quest and quest.status=='active' and quest.count==0 and not s.lift and (node.barrier or 0)>0 then
   return {x=math.min(node.width-65,540),y=480}
  end
 end
 local function observeGrowthBranch(s)
  local point=growthViewpoint(s)
  if point and canInspect(s.actors[s.active],point) then
   C.noteGrowth(s,'branch-practice')
   s.storyNotice='観測地点で地形を記録しました。モンドのアンバーに報告できます。'
   return true
  end
 end
 local function nearbyChoice(s,step)
  for _,option in ipairs(step.choices) do
   if canInspect(s.actors[s.active],option) then return option end
  end
 end
 local resonance=resonanceModule(canInspect)
 local rockViews=rockViewsModule(canInspect)
 local paper=paperModule(canInspect)
 local appraisal=appraisalModule(C,canInspect)
 local rumor=rumorModule(C,canInspect)
 local bloom=bloomModule(C,canInspect)
 local patrol=patrolModule(C,canInspect)
 local survey=surveyModule(C,canInspect)
 local snowMatch=snowMatchModule(C,canInspect)
 local returnBox=returnBoxModule(C,canInspect)
 local nightBanner=nightBannerModule(C,canInspect)
 local fireworks=fireworksModule(C,canInspect)
 local stealth=stealthModule(C,canInspect)
 local itto=ittoModule(C,canInspect)
 local teaCase=teaCaseModule(C,canInspect)
 for _,quest in ipairs(data.quests) do
  if quest.teaCase then
   for _,step in ipairs(quest.itinerary) do
    local clue=step.teaClue
    if clue then
     local art=(C.teaCluePictures or C.teaCaseArt)[clue.art]
     clue.source,clue.box=art.source,art.box
    end
   end
  end
 end
 local wandererSurvey=wandererSurveyModule(C)
 local visitors=visitorsModule(C,canInspect)
 local colleiGuide=colleiGuideModule(C,canInspect)
 local kavehModel=kavehModelModule(C,canInspect)
 local nahidaMap=nahidaMapModule(C,canInspect)
 local emilieScent=emilieScentModule(C,canInspect)
 local furinaCues=furinaCuesModule(C,canInspect)
 local naviaPhoto=naviaPhotoModule(C,canInspect)
 local lyneyMagic=lyneyMagicModule(C,canInspect)
 local freminetDive=freminetDiveModule(C,canInspect)
 local stoneOrnaments=stoneOrnamentsModule(C,canInspect)
 local mualaniSurf=mualaniSurfModule(C,canInspect)
 local kinichAmbush=kinichAmbushModule(C,canInspect)
 local xilonenSprings=xilonenSpringsModule(C,canInspect)
 local iansanTraining=iansanTrainingModule(C,canInspect)
 local function emitCue(s,channel,notes,pattern)
  s.storyCueId=(s.storyCueId or 0)+1
  s.storyCue={channel=channel,id=s.storyCueId,notes=notes,pattern=pattern,untilTime=s.t+1.5}
 end
 local function milestoneAt(milestone,node)
  if not milestone or milestone.node==node then return milestone end
  for _,place in ipairs(milestone.alternatives or {}) do
   if place.node==node then
    local step=copy(milestone)
    step.node,step.x,step.y=place.node,place.x,place.y
    return step
   end
  end
  return milestone
 end
 local function nextMilestone(s,q,arrivalFrom)
  local state=s.story.quests[q.id]
  if not state then return end
  local step=state.status=='active' and q.itinerary[state.count+1] or nil
  if (step and step.kind=='paths') or (q.anyPath and state.count+1>=pathJoins[q.id]) then
   if not state.pathProgress then return end
   for _,path in ipairs(q.paths) do
    local progress=state.pathProgress[path.id]
    local nextStep=milestoneAt(path.steps[progress.count+1],s.story.node)
    if nextStep and nextStep.node==s.story.node and
        (not arrivalFrom or (nextStep.kind=='arrive' and nextStep.from==arrivalFrom)) then
     return nextStep,progress,state,q
    end
   end
   if step and step.kind=='paths' then return end
  end
  return milestoneAt(step,s.story.node),state
 end
 local function completedSteps(q,state)
  local steps={}
  for i=1,state.count do steps[#steps+1]=q.itinerary[i] end
  if q.anyPath and state.pathProgress then
   for _,path in ipairs(q.paths) do
    local progress=state.pathProgress[path.id]
    for i=1,progress and progress.count or 0 do steps[#steps+1]=path.steps[i] end
   end
  end
  return steps
 end
 local function installBridge(s,bridge)
  local platform=copy(bridge)
  if bridge.track then
   for i,existing in ipairs(s.platforms) do
    if existing.track==bridge.track then s.platforms[i]=platform;return platform end
   end
  end
  s.platforms[#s.platforms+1]=platform
  if platform.moonDeck then s.storyMoonDeck=platform end
  return platform
 end
 local function completeMilestone(s,state,milestone,parent,quest)
  state.count=state.count+1
  s.storyNotice=milestone.notice
  if milestone.ore then C.grantUpgradeOre(s,milestone.ore) end
  if milestone.mora then s.mora=s.mora+milestone.mora end
  if milestone.bridge then
   local bridge=installBridge(s,milestone.bridge)
   if bridge.moonDeck then bridge.deployedAt=s.t end
  end
  for _,bridge in ipairs(milestone.bridges or {}) do installBridge(s,bridge) end
  local stage=nodes[s.story.node].theater
  if stage and s.story.quests[stage.quest]==state then theater.sync(s,stage,true) end
  if milestone.reflect then s.reflection=nil;state.reflectAngle=nil end
  if milestone.riverTurn then s.riverTurnAt=s.t end
  if milestone.boxGlimpse then s.storyBoxGlimpseStart=s.t end
  if parent then
   local join=quest.itinerary[parent.count+1]
   if not join or join.kind~='paths' then return end
   local finished=0
   for _,path in ipairs(quest.paths) do
    if parent.pathProgress[path.id].count==#path.steps then finished=finished+1 end
   end
   if finished<(quest.anyPath and 1 or #quest.paths) then return end
   s.storyNotice=join.notice
   parent.count=parent.count+1
  end
 end
 local function matchesKillStep(state,milestone,enemy)
  if not enemy then return false end
  if milestone.enemy==enemy then return true end
  if state.sweep and state.sweep[enemy] then return false end
  for _,id in ipairs(milestone.enemies or {}) do if id==enemy then return true end end
  return false
 end
 local function recordKill(s,state,milestone,enemy,parent,quest)
  if not matchesKillStep(state,milestone,enemy) then return end
  if milestone.enemy==enemy then completeMilestone(s,state,milestone,parent,quest);return true end
  local group=milestone.enemies
  local defeated=state.sweep or {}
  defeated[enemy]=true;state.sweep=defeated
  local count=0
  for _,member in ipairs(group) do if defeated[member] then count=count+1 end end
  if count==#group then
   state.sweep=nil;completeMilestone(s,state,milestone,parent,quest)
  else s.storyNotice=(milestone.sweepLabel or '通路の群れを整理中')..' '..count..' / '..#group end
  return true
 end
 local function spawnBreakTargets(s,node)
  local quest=node.breakQuest and quests[node.breakQuest]
  if not quest then return end
  local milestone,state=nextMilestone(s,quest)
  if not milestone or milestone.kind~='break' or milestone.node~=node.id then return end
  for _,point in ipairs(node.breakTargets) do
   if not (state.sweep and state.sweep[point.id]) then
    local object={id=point.entity,breakTarget=true,breakName=point.name,custom=true,boss=true,noRewards=true,noAutoTarget=true,
     hp=1,maxhp=1,x=point.x,home=point.x,y=point.y,hitTop=point.y-62,hitBottom=point.y,warning=0,respawn=math.huge}
    object.onCastContact=function(runtime,cast,hit,_,_,element)
     if milestone.element and element~=milestone.element then
      runtime.storyNotice=milestone.elementHint
      return false
     end
     local step,current=nextMilestone(runtime,quest)
     if step~=milestone or current~=state then return false end
     if not C.defeatEnemy(runtime,hit,cast.id) then return false end
     runtime.effects[#runtime.effects+1]={x=point.x,y=point.y-32,w=49,h=60,life=.35,color='#edb6ff'}
     return recordKill(runtime,state,milestone,point.id)
    end
    s.enemies[#s.enemies+1]=object
   end
  end
 end
 local function inspectMilestone(s,command)
  for _,q in ipairs(itineraries) do
   local milestone,state,parent,quest=nextMilestone(s,q)
   if milestone and milestone.kind=='guideChoice' and milestone.node==s.story.node and command=='rotate' then
    local option=nearbyChoice(s,milestone)
    if option then
     if option.correct then completeMilestone(s,state,milestone,parent,quest) end
     local recovery=option.restStop and colleiGuide.rest(s,q)
     s.storyNotice=option.notice..(recovery and (' '..recovery) or '')
     return true
    end
   end
   if milestone and milestone.appraisalStage and milestone.node==s.story.node and command=='rotate' then
    local handled,finished=appraisal.interact(s,q,state,milestone.appraisalStage)
    if finished then completeMilestone(s,state,milestone,parent,quest) end
    if handled then return true end
   end
   if milestone and milestone.kind=='choice' and milestone.node==s.story.node and command=='rotate' then
    local option=nearbyChoice(s,milestone)
    if option then
     local reward=option.artifact
     if reward and not C.giveArtifact(s,reward.slot,reward.level,reward.rarity,reward) then
      s.storyNotice='バッグ満杯。町で空きを作ると、小箱の報酬を受け取れます。'
      return true
     end
     state.storyChoice=option.id
     if option.diveChoice then freminetDive.route(s) end
     completeMilestone(s,state,milestone,parent,quest)
     s.storyNotice=option.notice
     return true
    end
   end
   if milestone and milestone.paperFold and milestone.node==s.story.node
       and (command=='rotate' or command=='paper_confirm') then
    local board=nodes[s.story.node].paperBoard
    local handled,complete=paper.adjust(s,board,command)
     if complete then paper.install(s,board);completeMilestone(s,state,milestone,parent,quest) end
    if handled then return true end
   end
   if milestone and (milestone.resonanceOrder or milestone.shadowChoice) and milestone.node==s.story.node and command=='rotate' then
    local node=nodes[s.story.node]
    local handled,complete
    if milestone.shadowChoice then handled,complete=rockViews.choose(s,node.rockViews)
    else handled,complete=resonance.light(s,node.resonance,emitCue) end
     if complete then completeMilestone(s,state,milestone,parent,quest) end
    if handled then return true end
   end
   if milestone and milestone.kind=='inspect' and milestone.node==s.story.node
       and not milestone.resonanceOrder and not milestone.shadowChoice and not milestone.paperFold
       and (not milestone.roomLight or milestone.roomLight==s.storyLightMode)
       and canInspect(s.actors[s.active],milestone) then
    if milestone.paperSouvenir then
     local selected=paper.gift(s,milestone,command)
     if selected then
      state.paperSouvenir=selected
      completeMilestone(s,state,milestone,parent,quest)
     end
     return true
    elseif milestone.airflow then
     local confirmed,plan=airflow.interact(s,milestone,command,emitCue)
     if confirmed then
      if plan then state.stagePlan=plan end
      completeMilestone(s,state,milestone,parent,quest)
     end
     return true
    elseif milestone.followCart then
     if command=='rotate' then theater.start(s,milestone,state) end
     return true
    elseif milestone.flagLowerSeconds then
     if command=='rotate' then flagCourse.lower(s,milestone,state) end
     return true
    elseif milestone.stonePairBoard then
     if command=='rotate' then stoneOrnaments.open(s,q,state) end
     return true
    elseif milestone.photoPanel then
     if command=='rotate' then naviaPhoto.open(s,q,state,milestone.photoPanel) end
     return true
    elseif milestone.photoTimer then
     if command=='rotate' then naviaPhoto.start(s,q) end
     return true
    elseif milestone.diveDock and not freminetDive.arrived(s,q,state) then
     if command=='rotate' then s.storyNotice='玩具が帰るまで、もう少し待ちましょう。' end
     return true
    elseif milestone.magicCue then
     if command=='rotate' then lyneyMagic.start(s,q,state,milestone) end
     return true
    elseif milestone.rehearsalCue then
     if command=='rotate' then furinaCues.open(s,milestone) end
     return true
    elseif milestone.performance then
     if command=='rotate' and theater.performance(s,milestone.performance) then completeMilestone(s,state,milestone,parent,quest) end
     return true
    elseif milestone.surveyRig then
     if survey.adjust(s,milestone,state,command) then completeMilestone(s,state,milestone,parent,quest) end
     return true
    elseif milestone.teaCup then
     if command=='rotate' and teaCase.allowed(s,q,state) then
      completeMilestone(s,state,milestone,parent,quest)
      teaCase.firstCup(s,q)
     end
     return true
    elseif milestone.assistLever then
     if command=='rotate' then wandererSurvey.start(s) end
     return true
    elseif milestone.discoveryBoard then
     if command=='rotate' then nahidaMap.open(s) end
     return true
    elseif milestone.modelBoard then
     if command=='rotate' then kavehModel.open(s,q,state) end
     return true
    elseif milestone.observationTone then
     if command=='rotate' then
      if not milestone.compareAfterStorage or visitors.quiet(s,q) then
       completeMilestone(s,state,milestone,parent,quest)
       visitors.emit(s,q,emitCue)
      else s.storyNotice='キノコンが棚から離れるまで、少し待ちます。' end
     end
     return true
    elseif milestone.reflect then
      if reflection.interact(s,milestone,command,state) then completeMilestone(s,state,milestone,parent,quest) end
     return true
    elseif command=='rotate' then
     if milestone.resonanceStone then resonance.record(s,milestone,emitCue) end
      completeMilestone(s,state,milestone,parent,quest)
      if milestone.storeSpecimen then visitors.store(s,q) end
      if milestone.guideWelcome then s.colleiWelcomeAt=s.t end
      if milestone.detourRest then coastDetour.rest(s,q,state,emitCue) end
     return true
    end
   end
  end
  local rumorQuest=quests[nodes[s.story.node].rumorQuest]
  if rumorQuest and s.story.node~=rumorQuest.hub then
   local state=s.story.quests[rumorQuest.id]
   local mirror=rumorQuest.itinerary[rumorQuest.goal-1]
   if state and state.count>=rumorQuest.goal-1 and mirror.node==s.story.node and canInspect(s.actors[s.active],mirror) then
    if reflection.interact(s,mirror,command,state,true) then s.storyNotice='照射を再現しました。石の縁が月明かりを返しています。' end
    return true
   end
  end
  if command=='rotate' then
   if rumorQuest and s.story.node==rumorQuest.hub and rumor.read(s,rumorQuest,s.story.quests[rumorQuest.id]) then return true end
   local bloomQuest=quests[nodes[s.story.node].bloomQuest]
   if bloomQuest and bloom.rest(s,bloomQuest,s.story.quests[bloomQuest.id]) then return true end
   local config=nodes[s.story.node].patrol
   if config and patrol.rest(s,config,quests[config.quest],s.story.quests[config.quest]) then return true end
   local surveyScene=nodes[s.story.node].survey
   if surveyScene and survey.read(s,quests[surveyScene.quest],s.story.quests[surveyScene.quest]) then return true end
   for _,q in ipairs(itineraries) do
    if completed(s,q.id) then
     local state=s.story.quests[q.id]
     for _,item in ipairs(completedSteps(q,state)) do
      local done=milestoneAt(item,s.story.node)
      if done.stealthNap and done.node==s.story.node and s.actors[s.active].ground and canInspect(s.actors[s.active],done)
       and not (sightQuest and sights.nearby(s,sightQuest,s.story.quests[sightQuest.id])) then
       s.storyNotice=q.closing
       return true
      end
      if (done.readback or done.resonancePages or done.paperDisplay) and done.node==s.story.node and canInspect(s.actors[s.active],done) then
       if done.resonancePages then resonance.turnPage(s,done,emitCue)
       elseif done.paperDisplay then s.storyNotice=paper.giftLabel(q,s.story.quests[q.id])..'を広場の飾り棚に置きました。'
       else s.storyNotice=done.readback end
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
 -- Resolve only the next actionable object in the current room. Puzzle answers stay hidden.
 local function fieldTask(s,q,state)
  local node,count=s.story.node,state.count
  if node~=q.target and node~=q.hub and not q.trail and not q.recovery and not q.book then return end
  if not (q.delivery or q.rail or q.trail or q.book or q.rest or q.forest or q.cargo) then return end
  local actor=s.actors[s.active]
  local target,distance,wait
  local function offer(x,y,id,name,action,enemy)
   local d=(actor.x-x)^2+(actor.y-y)^2
   if distance and distance<=d then return end
   distance=d
   target={x=x,y=y,point=id,name=name,action=action}
   if enemy then target.spawn=enemy.spawnId;target.art=enemy.art end
  end
  local function point(item,action)
   if item then offer(item.x,item.y,item.id,item.name or item.label,action or 'Gで調べる') end
  end
  local function guard(id)
   for _,e in ipairs(s.enemies) do
    if e.spawnId==id then
     if e.hp>0 then offer(e.x,e.y,nil,e.storyName,nil,e);return true end
     if e.respawn and e.respawn<1e9 then wait=math.min(wait or e.respawn,e.respawn) end
     break
    end
   end
  end
  if q.cargo and state.recovered then
   local room=q.recovery and q.recovery.node or q.target
   if room==node and (q.recovery or count==q.goal-1) then
    for _,item in ipairs(q.cargo) do
     if not state.recovered[item.id] and not (item.guard and guard(item.guard)) then point(item,'Gで回収') end
    end
   end
  elseif q.delivery then
   local spec,progress=q.delivery,state.delivery
   if node==q.target and not progress.recovered then
    if progress.guardCleared then point(spec.cache,'Gで回収') else guard(spec.cache.guard) end

   end
  elseif q.trail then
   if count==0 then
    for _,clue in ipairs(q.trail.clues) do if clue.node==node then point(clue) end end
   elseif node==q.target then
    if q.trail.meeting and count==1 then point(q.trail.meeting,'Gで話す') else guard(q.trail.guard) end
   end
  elseif q.book and count==0 and node==q.book.proof.node then point(q.book.proof)
  elseif node==q.target then
   if q.rail and not s.railTrip then
    if count==1 then guard(q.rail.guard) else point(count==0 and q.rail.release or q.rail.dispatch,'Gで操作') end
   elseif q.rest or q.book or q.forest then
    local spec=q.rest or q.book or q.forest
    local group=state.rest or state.book or state.forest
    local battle=q.rest and count==0 or q.book and count==2 or q.forest and count==3
    if battle then
     for _,id in ipairs(spec.guards) do if not group.defeated[id] then guard(id) end end
    elseif q.rest then point(({spec.planks,spec.leaves,spec.bench,spec.chair})[count],'Gで進める')
    elseif q.book and count==3 then point(spec.cache,'Gで回収')
    elseif q.forest and count==4 then offer(spec.guest.x,spec.guest.y,nil,'化け狸','Gで話す') end
   end
  end
  return target or (wait and {wait=math.ceil(math.max(0,wait))})
 end
 local function worksiteGuide(s,f,q,state)
  local sites,done,action
  if q.delivery and s.story.node==q.hub then
   sites,done,action=q.delivery.packages,state.delivery.delivered,'店先で荷札を選ぶ'
  elseif q.cooking then
   sites,done,action=q.cooking.ingredients,state.cooking.gathered,'Gで採集'
  elseif q.stone then
   sites,done,action=q.stone.marks,state.stone.marked,'Gで調べる'
  elseif q.construction then
   sites,done,action=q.construction.surveys,state.construction.surveyed,'Gで調査'
  elseif q.sights and state.sights then
   sites,done,action=q.sights.places,state.sights.seen,'Gで景色を見る'
   if state.count==#sites then
    sites,done,action={q.sights.bridge},{},'Gで橋から港を眺める'
   end
  else return end
  local actor=s.actors[s.active]
  if state.count<#sites or q.sights then
   local pending,nearest,distance={}
   for _,item in ipairs(sites) do
    if not done[item.id] and (not q.delivery or delivery.carried(q,state.delivery,item)) then
     local node=item.node or (q.delivery and q.hub) or q.target
     local point={node=node,x=item.x,y=item.y,point=item.id,name=item.stall or item.name,action=action}
     pending[#pending+1]=point
     if node==s.story.node then
      local d=(actor.x-item.x)^2+(actor.y-item.y)^2
      if not distance or d<distance then nearest,distance=point,d end
     end
    end
   end
   if #pending>0 then
    f.storyWorksites=f.storyWorksites or {}
    f.storyWorksites[q.id]=pending
   end
   return nearest
  end
  local item,name
  if q.cooking and s.story.node==q.hub then
   item,name,action=cooking.stall(s,q),'香菱の屋台','味を選んで試作'
  elseif q.stone and s.story.node==q.target then
   if state.count==#sites then item,action=q.stone.mural,'壁画を見て石板を押す'
   else item,action=q.stone.model,'Gで模型を拾う' end
  elseif q.construction then
   item=construction.sites(s,q,state)[1]
   if state.count==#sites then action='施工案を選ぶ'
   else name='工事現場';action=state.count==4 and 'Gで片付ける' or 'Gで資材を渡す' end
  end
  if item then return {x=item.x,y=item.y,point=item.id,name=name or item.name,action=action} end
 end
 local function huntGuides(s,f)
  local actor=s.actors[s.active]
  for id,state in pairs(s.story.quests) do
   local q=quests[id]
   if state.status=='active' and state.count<q.goal then
    local step,progress
    if q.itinerary then step,progress=nextMilestone(s,q) end
    local atStep=step and step.kind=='kill' and step.node==s.story.node
    local ordinary=(q.kind=='kill' and q.target==s.story.node) or
                   (q.sights and not state.sights and q.sights.legacyTarget==s.story.node)
    local guard=q.recovery and state.recovered and state.count==q.goal-1 and q.recovery.node==s.story.node and q.recovery.guard
    local task=worksiteGuide(s,f,q,state) or fieldTask(s,q,state)
    if step and (step.kind=='choice' or step.kind=='guideChoice') and step.node==s.story.node and not s.lift then
     local points,nearest,distance={}
     local interactable=nearbyChoice(s,step)
     local node=nodes[s.story.node]
     for index,option in ipairs(step.choices) do
      local point={node=step.node,x=option.x,y=option.y,name=option.name,action=option.action,
       point=('choice-%s-%d-%d'):format(step.node,state.count,index),choice=index,inspection=true,
       underwater=(node.swim or node.toyDive) and true or nil}
      points[#points+1]=point
      local d=(actor.x-point.x)^2+(actor.y-point.y)^2
      if option==interactable then d=-1 end
      if not distance or d<distance then nearest,distance=point,d end
     end
     f.storyWorksites=f.storyWorksites or {}
     f.storyWorksites[id]=points
     task=nearest
    elseif step and step.followCart and step.node==s.story.node then
     task=theater.cartGuide(s,step)
    elseif not task and step and step.kind=='inspect' and step.node==s.story.node and step.x and step.y
        and not s.lift and not step.resonanceOrder and not step.shadowChoice and not step.paperFold
        and (not step.roomLight or step.roomLight==s.storyLightMode)
        and (not step.teaCup or teaCase.allowed(s,q,state)) then
     local node=nodes[s.story.node]
     task={x=step.x,y=step.y,name=step.name or '調査地点',action=step.action or '調べる',
      inspection=true,underwater=(node.swim or node.toyDive) and true or nil}
    end
    if task then
     f.storyHunts=f.storyHunts or {}
     f.storyHunts[id]=task
    elseif atStep or ordinary or guard then
     local nearest,distance,wait
     for _,e in ipairs(s.enemies) do
      if e.spawnId and not e.boss and not e.noRewards and
         ((atStep and matchesKillStep(progress,step,e.spawnId)) or
          (ordinary and questKillCounts(q,state,e)) or guard==e.spawnId) then
       if e.hp>0 then
        local d=(e.x-actor.x)^2+(e.y-actor.y)^2
        if not distance or d<distance then nearest,distance=e,d end
       elseif e.respawn and e.respawn<1e9 then
        wait=math.min(wait or e.respawn,e.respawn)
       end
      end
     end
     if nearest or wait then
      f.storyHunts=f.storyHunts or {}
      f.storyHunts[id]=nearest and {spawn=nearest.spawnId,name=nearest.storyName,art=nearest.art,
       x=nearest.x,y=nearest.y} or {wait=math.max(0,math.ceil(wait))}
     end
    end
   end
  end
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
 local function clearState(s,n)
  local state=n.clearedBy and s.story.quests[n.clearedBy]
  if n.practiceAfterReport and state and state.status=='complete' then
   local branch=n.clearPath and state.pathProgress and state.pathProgress[n.clearPath]
   if not branch or branch.count>=(n.clearCount or quests[n.clearedBy].goal) then return end
  end
  if n.clearPath then return state and state.pathProgress and state.pathProgress[n.clearPath] end
  return state
 end
 local function cleared(s,n)
  -- Some routes remove their quest targets while the surrounding patrols stay active.
  if n.keepOtherEnemies then return false end
  local state=clearState(s,n)
  return state and state.count>=(n.clearCount or quests[n.clearedBy].goal)
 end
 local function railQuest(s,n)
  local q=quests[n.clearedBy]
  if q and q.rail then return q,s.story.quests[q.id] end
 end
 local function defeatedMilestones(itinerary,state,node)
  local defeated=copy(state.sweep or {})
  for i=1,state.count do
   local step=itinerary[i]
   if step.kind=='kill' and step.node==node then
    if step.enemy then defeated[step.enemy]=true end
    for _,id in ipairs(step.enemies or {}) do defeated[id]=true end
   end
  end
  return defeated
 end
 local function entryPopulation(s,n,railState,routeState)
  local stageQuest=quests[n.clearedBy]
  local stageState=clearState(s,n)
  local phase=railState and railState.count or 0
  if routeState and routeState.stealthEncounter=='engaged' then phase=routeState.count end
  if n.returnBox and stageState and stageState.count==n.returnBox.chaseAt+1 then phase=1 end
  if n.spawnAt and stageState and stageState.count==n.spawnAt then phase=1 end
  if stageQuest and stageQuest.recovery and stageState and stageState.recovered and stageState.count==stageQuest.goal-1 then phase=1 end
  local group=stageState and (stageState.book or stageState.forest or stageState.rest)
  local defeated=group and group.defeated
  if stageState and stageQuest.itinerary then
   local itinerary=stageQuest.itinerary
   if n.clearPath then
    for _,path in ipairs(stageQuest.paths) do if path.id==n.clearPath then itinerary=path.steps;break end end
   end
   defeated=defeatedMilestones(itinerary,stageState,n.id)
  end
  return phase,stageState and stageState.recovered,defeated
 end
 local function placementActive(p,phase,recovered,defeated)
  return not (defeated and defeated[p.id]) and (not p.questPhase or p.questPhase==phase)
     and not (p.cargo and recovered and recovered[p.cargo])
 end
 local function entryFilter(s,id)
  local n=nodes[id]
  if not n or n.hub or n.peaceful or cleared(s,n) then return nil end
  local _,railState=railQuest(s,n)
  local route=n.stealthRoute
  local phase,recovered,defeated=entryPopulation(s,n,railState,route and s.story.quests[route.quest])
  return function(p) return placementActive(p,phase,recovered,defeated) end
 end
 C.storyEntryFilter=entryFilter
 function C.hasStoryTargetOnEntry(s,id,candidates)
  local active=entryFilter(s,id)
  if active then
   for _,p in ipairs(candidates) do if active(p) then return true end end
  end
  return false
 end
 function C.storyEntryCounts(s,id,placements)
  local active=entryFilter(s,id)
  local total,counts,absent=0,{},{}
  for _,p in ipairs(placements) do
   local count=active and active(p) and 1 or 0
   if count==0 then absent[#absent+1]=p.id end
   counts[p.art]=(counts[p.art] or 0)+count
   total=total+count
  end
  local n=nodes[id]
  local quest=quests[n.clearedBy or (n.stealthRoute and n.stealthRoute.quest)]
  return total,counts,quest and quest.name,#absent>0 and absent or nil
 end
 local function spawnEnemies(s,n,phase,recovered,defeated)
  s.enemies={}
  if not n.hub and not n.peaceful and not cleared(s,n) then
   local placements=assert(C.enemySpawns and C.enemySpawns[n.id],'Missing story enemy placements: '..n.id)
   local fresh=C.new(math.max(12,math.ceil(#placements/3)))
   for i,placement in ipairs(placements) do
    if placementActive(placement,phase,recovered,defeated) then
     local e=fresh.enemies[i];local p=assert(data.basePlatforms(n)[placement.platform+1],'Invalid enemy support')
     e.x=placement.x;e.home=e.x;e.y=p.y;e.kind=placement.kind;e.art=placement.art;e.spawnId=placement.id
     e.storyName=placement.name
     e.dailyElite=placement.dailyElite;e.expRole=placement.expRole
     -- Imported ordinary mobs have species names, which are also used by legacy named elites.
     if not e.expRole and placement.designSpawn and placement.designSpawn:match('^PLAN8%-.+%-ordinary$') then
      e.expRole='normal'
     end
     e.pursuit=placement.pursuit
     if placement.flight then
      e.flight=placement.flight;e.flightHome=p.y
      e.flightTime=placement.flight.offset or 0
      C.moveOrdinaryFlier(e,0)
     end
     if placement.hp then e.hp=placement.hp;e.maxhp=placement.hp end
     e.patrolMin=math.max(p.x+24,placement.patrolMin or p.x)
     e.patrolMax=math.min(p.x+p.w-24,placement.patrolMax or p.x+p.w)
     if n.enemySafeFraction then
      local margin=n.width*n.enemySafeFraction
      e.patrolMin=math.max(e.patrolMin,margin)
      e.patrolMax=math.min(e.patrolMax,n.width-margin)
     end
     e.level=placement.level or n.level;e.respawnSeconds=placement.respawnSeconds
     e.contactDamage=placement.contactDamage;e.contactCooldown=placement.contactCooldown
     e.barrier=n.barrier or 0;if e.barrier>0 then e.hp=60;e.maxhp=60 end
     if C.applyOrdinaryFieldHp then C.applyOrdinaryFieldHp(e,n,placement) end
     s.enemies[#s.enemies+1]=e
    end
   end
  end
 end
 local function finishTravelerTrial(s)
  local trial=s.travelerTrial
  if not trial then return end
  local ally=s.actors[2]
  ally.hp=math.min(trial.allyHp,ally.maxhp)
  s.active=ally.hp>0 and trial.previousActive or 1
  s.travelerTrial=nil
 end
 local function enter(s,id,spawn,elapsed,arrivalY)
  finishTravelerTrial(s)
  local previous=s.story.node
  local sameArena=previous==id
  local n=nodes[id]
  s.storyCheckpointEntry=n.checkpointAtEntry and previous~=id and s.story.visited[previous] and previous or nil
  iansanTraining.enter(s,n.iansanQuest and not n.hub)
  s.campaign.zone='story:transition';action(s,n.hub and 'town' or 'field')
  s.campaign.zone=n.hub and 'town' or ('story:'..id);s.campaign.message='本編ルートの試作。隣の地点へは門の近くで移動。'
  local firstVisit=not s.story.visited[id]
  s.story.active=true;s.story.node=id;s.story.visited[id]=true;s.worldwidth=n.width
  C.setGrappleNodes(s,n.grappleNodes)
  if firstVisit and (n.branch or n.hiddenGroup) and C.endgameGoalEvent then C.endgameGoalEvent(s,'discover') end
  s.storyEnteredAt=s.t
  s.storyBoxGlimpseStart=nil
  s.storyPatrolShot=nil
  s.snowballRound=nil
  s.snowMatchVenue=n.snowMatch~=nil
  s.returnBox=nil
  s.fireworkShow=nil
  itto.enter(s,n.ittoGames)
  teaCase.enter(s)
  s.wandererAssistAt=nil
  s.visitorDeparture=nil
  s.colleiWelcomeAt,s.colleiLetterNotice=nil,nil
  s.kavehModelOpen=nil
  s.nahidaMapOpen=nil
  s.furinaRun=nil
  s.photoPanel,s.photoTimer,s.stonePairOpen=nil,nil,nil
  s.lyneyRun=nil
  mualaniSurf.enter(s)
  xilonenSprings.enter(s)
  s.storyLightMode=n.localLight and 'bright' or nil
  s.airflowTrial,s.storyCue=nil,nil
  s.resonanceOrder,s.resonancePage=nil,nil
  paper.reset(s)
  s.storyMoonDeck=nil
  s.platforms={};for _,p in ipairs(data.basePlatforms(n)) do s.platforms[#s.platforms+1]=copy(p) end
  for _,q in ipairs(itineraries) do
   local state=s.story.quests[q.id]
   if state then
    local steps=q.anyPath and completedSteps(q,state) or q.itinerary
    for i=1,q.anyPath and #steps or state.count do
     local step=steps[i]
     if step.node==id and step.bridge then installBridge(s,step.bridge) end
     if step.node==id then for _,bridge in ipairs(step.bridges or {}) do installBridge(s,bridge) end end
     if step.node==id and step.paperFold then paper.install(s,n.paperBoard) end
    end
   end
  end
  theater.enter(s,n.theater)
  flagCourse.enter(s,n.flagCourse)
  movingPlatforms.enter(s,n.riverCrossing)
  duel.enter(s,n.duel,sameArena)
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
  s.contestVista=nil
  s.chiefGreetingAt=nil
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
  local route=n.stealthRoute
  local routeState=route and s.story.quests[route.quest]
  stealth.enter(s,route,routeState)
  spawnEnemies(s,n,entryPopulation(s,n,railState,routeState))
  spawnBreakTargets(s,n)
  local huntQuest=n.kinichQuest and quests[n.kinichQuest]
  kinichAmbush.enter(s,huntQuest,huntQuest and s.story.quests[huntQuest.id])
  local cargo,state=cargoQuest(s)
  if cargo and cargo.chase and recoveredAll(cargo,state) then beginChase(s,cargo) end
  s.storySwimming=n.swim
  s.storyWildlife=nil
  if n.swim then
   for species,layout in pairs(C.enemyArtLayout) do
    local site=layout.habitats and layout.habitats[n.id]
    if site then
     s.storyWildlife=s.storyWildlife or {}
     table.insert(s.storyWildlife,{art=species,x=site.x,y=site.y,flip=site.flip})
    end
   end
  end
  for i,a in ipairs(s.actors) do
   local anchor=spawn or 160
   local spacing=(i-1)*40
   local startX=anchor-spacing
   if i>1 and arrivalY and arrivalY<480 and not n.swim then
    local alternate
    for _,platform in ipairs(s.platforms) do
     if platform.y==arrivalY then
      local right=platform.x+platform.w
      if startX>=platform.x and startX<=right then alternate=nil;break end
      if anchor>=platform.x and anchor<=right then
       alternate=math.max(alternate or anchor,math.min(anchor+spacing,right))
      end
     end
    end
    startX=alternate or startX
   end
   a.x=n.swim and math.max(20,startX) or startX
   a.y=arrivalY or (n.swim and n.swim.entryY) or 480
   a.vy=0;a.ground=not n.swim
   if arrivalY or n.swim then a.drop=0 end
   a.swimDx,a.swimDy=nil,nil
   a.swimGuardUntil,a.swimCounterUntil,a.cd.swimGuard,a.cd.swimSonar,a.cd.swimReflect=nil,nil,nil,nil,nil
   if n.swim then a.lock=0;a.channel=nil end
  end
  s.camera=math.max(0,math.min(s.actors[s.active].x-400,math.max(0,n.width-960)))
  local diveQuest=n.toyDive and quests[n.toyDive.quest]
  freminetDive.enter(s,n.toyDive,diveQuest and s.story.quests[diveQuest.id],diveQuest and diveQuest.goal)
  if n.travelerTrial then
   s.travelerTrial={previousActive=s.active,allyHp=s.actors[2].hp}
   s.active=1;s.actors[2].hp=0
  end
  if contestQuest and id==contestQuest.target then contest.populate(s,contestQuest,s.story.quests[contestQuest.id]) end
  if C.enterFieldBossNode then C.enterFieldBossNode(s,id) end
  if C.enterWeeklyBossNode then C.enterWeeklyBossNode(s,id) end
  if C.enterArtifactDomainNode then C.enterArtifactDomainNode(s) end
  s.macro=nil;s.encounter=nil
  local v=n.voyage
  s.voyage=v and {destination=v.destination,arrives=s.t+v.seconds-(elapsed or 0),total=v.seconds,
   started=s.t-(elapsed or 0),source=v.source,stopStart=v.stopStart,stopEnd=v.stopEnd,kind=v.kind,reverse=v.reverse,
   arrivalX=v.arrivalX,arrivalY=v.arrivalY} or nil
  progress(s,'visit',id)
 end
 local function recordArrival(s,from,dest)
  for _,q in ipairs(itineraries) do
   local step,state,parent,quest=nextMilestone(s,q,from)
   if step and step.kind=='arrive' and step.node==dest and step.from==from then
    completeMilestone(s,state,step,parent,quest)
   end
  end
 end
 local function arrive(s)
  local voyage=s.voyage
  local from,dest=s.story.node,voyage.destination
  enter(s,dest,voyage.arrivalX,nil,voyage.arrivalY)
  recordArrival(s,from,dest)
 end
 local function checkpointHub(s,node)
  local visited=s.story.visited
  if visited[node.checkpoint] then return node.checkpoint end
  for _,fallback in ipairs(node.checkpointFallbacks or {}) do
   if visited[fallback] then return fallback end
  end
 end
 local function checkpointNode(s)
  local departure=s.storyCheckpointEntry and nodes[s.storyCheckpointEntry]
  if departure and checkpointHub(s,departure) then return departure end
  return nodes[s.story.node]
 end
 function C.enterStoryNode(s,id) setup(s);enter(s,id) end
 function C.storyNodeName(s)
  local node=s.story and s.story.active and nodes[s.story.node]
  return node and node.name
 end
 function C.clearWeeklySceneCasts(s)
  s.pending={};s.effects={};s.numbers={};s.decoys={}
  s.rockWall=nil;s.healingField=nil;s.echoSource=nil;s.ultimate=nil;s.starSeed=nil;s.macro=nil
  s.coralWall=nil
  s.blizzard=nil;s.stellarField=nil;s.drillTop=nil;s.perfume=nil
  s.moonDomain=nil;s.moonMark=nil;s.lastMoonReaction=nil
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil;a.channel=nil end
 end
 function C.switchWeeklyStoryScene(s,id,spawn)
  local n=nodes[id]
  if not n or not s.story or not s.story.active or n.hub or not n.peaceful then return false end
  local before=nodes[s.story.node]
  if (before.weeklySceneOf or s.story.node)~=(n.weeklySceneOf or id) then return false end
  s.story.node=id;s.story.visited[id]=true;s.campaign.zone='story:'..id
  s.storyEnteredAt=s.t;s.worldwidth=n.width;s.camera=0
  s.platforms={};s.solids={}
  for _,p in ipairs(data.basePlatforms(n)) do s.platforms[#s.platforms+1]=copy(p) end
  C.clearWeeklySceneCasts(s)
  for i,a in ipairs(s.actors) do
   if a.hp>0 then
    a.x=spawn-(i-1)*44;a.y=480;a.vy=0;a.drop=0;a.ground=true
   end
  end
  return true
 end
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
  if s.iansanPanel then
   if key=='pause' then action(s,key)
   else
    local q=quests[nodes[s.story.node].iansanQuest]
    local state=s.story.quests[q.id]
    local milestone=iansanTraining.panelAction(s,q,state,key)
    if milestone then completeMilestone(s,state,milestone) end
   end
   return
  end
  if key:match('^story_iansan_') or (s.iansanRound and key=='auto') then return end
  if s.springRun or s.springPanel then
   local n=nodes[s.story.node]
   local q=quests[n.springQuest]
   local state=s.story.quests[q.id]
   if key=='pause' then action(s,key)
   elseif s.springRun and not s.paused then
    if key=='jump' then xilonenSprings.jump(s)
    elseif key=='story_collect' then xilonenSprings.interact(s,q,state) end
   elseif s.springPanel then
    local milestone=xilonenSprings.panelAction(s,q,state,key)
    if milestone then completeMilestone(s,state,milestone) end
   end
   return
  end
  if key:match('^story_spring_') then return end
  if s.surfRound then
   if key=='pause' then action(s,key)
   elseif key=='story_collect' and not s.paused then
    local n=nodes[s.story.node]
    local q=quests[n.surfQuest]
    mualaniSurf.interact(s,n,q,s.story.quests[q.id])
   else mualaniSurf.action(s,key) end
   return
  end
  if key=='story_surf_hit' then return end
  if s.snowballRound then
   if key=='normal' then snowMatch.throw(s);return end
   if key~='pause' and key~='jump' and key~='drop' and key~='story_nearby_portal'
       and not key:match('^story_portal:') and not key:match('^story_fast:') then return end
  end
  if s.storySwimming and (key=='normal' or key=='jump' or key=='drop' or key=='dodge' or key=='light'
      or key=='macro' or key:match('^skill%d') or key:match('^slot%d')) then
   if C.fieldSwimAction and (key=='normal' or key=='jump' or key=='dodge' or key=='skill1') then C.fieldSwimAction(s,key) end
   return
  end
  if s.lift or s.caveFall or s.roofFlight then
   if key=='pause' then action(s,key) end
   return
  end
  if s.voyage and s.voyage.kind=='trolley' and key~='pause' and key~='story_nearby_portal'
      and not key:match('^story_portal:') and not key:match('^story_fast:') then return end
  if s.lyneyRun and key~='pause' and key~='story_collect' then return end
  local charmCommand,charmId=key:match('^story_charm_(%a+):(%a+)$')
  charmCommand=charmCommand or key:match('^story_charm_(%a+)$')
  if charmCommand then
   local id=s.story.active and nodes[s.story.node].stoneCharmQuest
   if id then
    local state=s.story.quests[id]
    local milestone=stoneOrnaments.action(s,quests[id],state,charmCommand,charmId)
    if milestone then completeMilestone(s,state,milestone) end
   end
   return
  end
  if s.stonePairOpen and key~='pause' then
   if key=='story_collect' then s.stonePairOpen=nil end
   return
  end
  local photoCommand,photoId=key:match('^story_photo_(%a+):(%a+)$')
  photoCommand=photoCommand or key:match('^story_photo_(%a+)$')
  if photoCommand then
   local node=s.story.active and nodes[s.story.node]
   if node and theater.atProgramme(s,node,canInspect) then
    local record=s.story.quests['fon-navia-photo']
    if photoCommand=='close' then s.photoPanel=nil
    elseif photoCommand=='print' and not s.paused and record and record.status=='complete'
       and record.groupPhoto and record.groupPhoto.posted then s.photoPanel='read' end
    return
   end
   local id=node and node.groupPhotoQuest
   if id then
    local state=s.story.quests[id]
    local milestone=naviaPhoto.action(s,quests[id],state,photoCommand,photoId)
    if milestone then completeMilestone(s,state,milestone) end
   end
   return
  end
  if s.photoPanel and key~='pause' then
   if key=='story_collect' then s.photoPanel=nil end
   return
  end
  local cue=key:match('^story_rehearsal:(%a+)$')
  if cue or (s.furinaRun and key=='story_collect') then
   local id=s.story.active and nodes[s.story.node].furinaRehearsal
   if id then
    local state=s.story.quests[id]
    local milestone=furinaCues.action(s,quests[id],state,cue or 'next')
    if milestone then completeMilestone(s,state,milestone) end
   end
   return
  end
  if s.furinaRun and key~='pause' then return end
  if key:match('^story_discovery_') then
   local id=s.story.active and nodes[s.story.node].nahidaMapQuest
   if id then
    local state=s.story.quests[id]
    local milestone=nahidaMap.action(s,quests[id],state,key)
    if milestone then completeMilestone(s,state,milestone) end
   end
   return
  end
  if s.nahidaMapOpen and key~='pause' then
   if key=='story_collect' then s.nahidaMapOpen=nil end
   return
  end
  if key=='story_nearby_portal' then local p=nearbyPortal(s);if p then C.action(s,'story_portal:'..p.to) end;return end
  if key:match('^story_model_') then
   local id=s.story.active and nodes[s.story.node].kavehQuest
   if id then
    local q,state=quests[id],s.story.quests[id]
    local milestone=kavehModel.action(s,q,state,key)
    if milestone then completeMilestone(s,state,milestone) end
   end
   return
  end
  if s.kavehModelOpen and key=='story_collect' then s.kavehModelOpen=nil;return end
  if s.kavehModelOpen and key~='pause' and not key:match('^story_') then return end
  if key=='story_expedition_trial' then
   local desk=s.story.active and nodes[s.story.node].expeditionDesk
   if desk and not s.paused and canInspect(s.actors[s.active],desk) then s.expeditionPractice=true end
   return
  end
  if key=='story_airflow_commit' then
   if s.story.active and not s.paused then inspectMilestone(s,'airflow_commit') end
   return
  end
  if key=='story_paper_confirm' then
   if s.story.active and not s.paused then inspectMilestone(s,'paper_confirm') end
   return
  end
  if key=='story_survey_confirm' then
   if s.story.active and not s.paused then inspectMilestone(s,'survey_confirm') end
   return
  end
  local fireworkField,fireworkId=key:match('^story_firework_select:([%a]+):([%w%-]+)$')
  if fireworkField then
   local scene=s.story.active and nodes[s.story.node].fireworkBeach
   if scene then fireworks.select(s,quests[scene],s.story.quests[scene],fireworkField,fireworkId) end
   return
  end
  if (s.fireworkShow or s.sayuHatch) and key~='pause' and not key:match('^story_') then return end
  if key=='story_reflection_light' or key=='story_reflection_confirm' then
   if s.story.active and not s.paused then
    inspectMilestone(s,key=='story_reflection_light' and 'light' or 'confirm')
   end
   return
  end
  local teaCard=key:match('^story_tea_card:([%w%-]+)$')
  if teaCard or key=='story_tea_confirm' then
   local id=s.story.active and nodes[s.story.node].teaQuest
   if id then
    local q,state=quests[id],s.story.quests[id]
    if teaCard then teaCase.select(s,q,state,teaCard)
    else
     local milestone=teaCase.confirm(s,q,state)
     if milestone then completeMilestone(s,state,milestone) end
    end
   end
   return
  end
  if key=='growth_branch_observe' then
   if s.story.active and not s.paused then observeGrowthBranch(s) end
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
   if node.iansanQuest then
    local q=quests[node.iansanQuest]
    if iansanTraining.interact(s,q,s.story.quests[q.id]) then return end
   end
   if node.springQuest then
    local q=quests[node.springQuest]
    if xilonenSprings.interact(s,q,s.story.quests[q.id]) then return end
   end
   if node.kinichQuest then
    local q=quests[node.kinichQuest]
    if kinichAmbush.interact(s,q,s.story.quests[q.id]) then return end
   end
   if node.surfQuest then
    local q=quests[node.surfQuest]
    local state=s.story.quests[q.id]
    local handled,milestone=mualaniSurf.interact(s,node,q,state)
    if milestone then completeMilestone(s,state,milestone) end
    if handled then return end
   end
   if duel.ring(s,node.duel) then return end
   if node.ittoGames and itto.collect(s,node.ittoGames,s.story.quests[node.ittoGames.quest]) then return end
   if node.fireworkBeach and fireworks.start(s,quests[node.fireworkBeach],s.story.quests[node.fireworkBeach]) then return end
   if node.stealthRoute then
    local q=quests[node.stealthRoute.quest]
    local state=s.story.quests[q.id]
    local handled,milestone=stealth.collect(s,q,state)
    if milestone then completeMilestone(s,state,milestone) end
    if handled then return end
   end
   if node.snowMatch and snowMatch.start(s,node.snowMatch,s.story.quests[node.snowMatch.quest]) then return end
   if flagCourse.interact(s,node.flagCourse) then return end
   local spawnState=node.spawnAt and clearState(s,node)
   local wasSpawnPhase=spawnState and spawnState.count==node.spawnAt
   if node.magicScene then
    local id=node.magicScene.quest
    if lyneyMagic.replay(s,node.magicScene,quests[id],s.story.quests[id]) then return end
   end
   if theater.encore(s,node.theater,canInspect) then return end
   if inspectMilestone(s,'rotate') then
    if spawnState and not wasSpawnPhase and spawnState.count==node.spawnAt then
     local retained
     if node.keepOtherEnemies then
      retained={}
      for _,enemy in ipairs(s.enemies) do
       if enemy.spawnId then retained[enemy.spawnId]=enemy end
      end
     end
     spawnEnemies(s,node,1)
     if retained then
      for i,enemy in ipairs(s.enemies) do s.enemies[i]=retained[enemy.spawnId] or enemy end
     end
    end
    return
   end
   if node.nightBanner and nightBanner.read(s,node,quests[node.clearedBy],spawnState) then return end
   if node.teaQuest and teaCase.read(s,quests[node.teaQuest],s.story.quests[node.teaQuest]) then return end
   if node.visitorSite and visitors.reread(s,quests[node.clearedBy],s.story.quests[node.clearedBy],emitCue) then return end
   if node.colleiGuideQuest and colleiGuide.revisit(s,quests[node.colleiGuideQuest],s.story.quests[node.colleiGuideQuest]) then return end
   if node.colleiLetterQuest and colleiGuide.letter(s,quests[node.colleiLetterQuest],s.story.quests[node.colleiLetterQuest]) then return end
   if node.nahidaMapQuest and nahidaMap.collect(s,quests[node.nahidaMapQuest],s.story.quests[node.nahidaMapQuest]) then return end
   if node.scentQuest and emilieScent.read(s,quests[node.scentQuest],s.story.quests[node.scentQuest]) then return end
   if node.groupPhotoQuest and naviaPhoto.read(s,quests[node.groupPhotoQuest],s.story.quests[node.groupPhotoQuest]) then return end
   if node.stoneCharmQuest and stoneOrnaments.read(s,quests[node.stoneCharmQuest],s.story.quests[node.stoneCharmQuest]) then return end
   if node.toyDive and freminetDive.look(s,node,s.story.quests[node.toyDive.quest]) then return end
   if node.toyDisplay and freminetDive.readDisplay(s,node.toyDisplay,s.story.quests[node.toyDisplay.quest]) then return end
   if node.readingRoom and kavehModel.read(s,quests[node.kavehQuest],s.story.quests[node.kavehQuest]) then return end
   local archive=node.returnBoxArchive
   if archive and returnBox.read(s,archive,s.story.quests[archive.quest]) then return end
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
    if not clue then
     if observeGrowthBranch(s) then return end
     if C.dailyObserve then C.dailyObserve(s) end
     return
    end
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
   for _,h in ipairs(nodes[s.story.node].hints or {}) do
    if h.group==discovery and nearHint(a,h) then
     local newlyFound=not s.story.discovered[discovery]
     s.story.discovered[discovery]=true;s.storyNotice='隠し入口を発見しました。'
     if newlyFound and C.endgameGoalEvent then C.endgameGoalEvent(s,'discover') end
     return
    end
   end
   s.storyNotice='手がかりの近くで調べてください。';return
  end
  if key=='story_start' then if not s.campaign then action(s,'campaign') end;enter(s,'mond-town');return end
  local dest=key:match('^story_portal:([%w%-]+)$');local fast=key:match('^story_fast:([%w%-]+)$')
  if dest or fast then
   if s.paused or not s.story.active or s.actors[s.active].hp<=0 then return end
   local resume,departure=0,nil;dest=dest or fast;local n=nodes[dest];if not n then return end
   if not shownNode(s,n) then s.storyNotice='この入口はまだ発見していません。';return end
   if not s.progression or s.progression.level<n.level then s.storyNotice='必要レベル '..n.level..' に達していません。';return end
   local reason=travelerGateRestriction(s,n)
   if reason then s.storyNotice=reason;return end
   if fast then
    if s.voyage and s.voyage.kind=='ferry' then
     s.storyNotice='船が着岸してからワープできます。'
     return
    end
    local restPoint=n.restWaypoint and completed(s,n.restWaypoint.quest)
    if not (n.hub or restPoint or n.waypoint) or not s.story.visited[dest] then
     s.storyNotice='到達済みの拠点・ワープ地点か、登録済みの休憩場所を選んでください。';return
    end
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
   local cancelledTrial=fast and s.flagTrial~=nil
   if cancelledTrial then s.flagTrial=nil end
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
   if fast and n.restWaypoint then spawn=n.restWaypoint.arrivalX or spawn
   elseif fast and n.waypoint and not n.hub then spawn=n.waypoint.x end
   local arrivalY=departure and departure.arrivalY or (fast and n.waypoint and not n.hub and n.waypoint.y) or nil
   local seconds=departure and (departure.liftSeconds or departure.waterwaySeconds or departure.boatSeconds or departure.phaseSeconds)
   if seconds then
    s.lift={destination=dest,name=departure.rideLabel or n.name,seconds=seconds,remaining=seconds,
            waterway=departure.waterwaySeconds~=nil,boat=departure.boatSeconds~=nil,phase=departure.phaseSeconds~=nil,
            wallTrack=departure.wallTrack,spiritwayTrack=departure.spiritwayTrack,windLift=departure.windLift,
            floatingStone=departure.floatingStone,
            x=departure.arrivalX or (arrival and arrival.x or spawn),y=departure.arrivalY or (arrival and arrival.y or 480)}
     if not s.lift.waterway and not s.lift.boat and not s.lift.phase and (dest==previous or departure.animatedLift)
         and departure.arrivalY then s.lift.riders={} end
    for i,actor in ipairs(s.actors) do
     actor.walk=0
     if s.lift.riders then s.lift.riders[i]={x=actor.x,y=actor.y} end
    end
    s.storyNotice=nil
    return
   end
   enter(s,dest,departure and departure.arrivalX or spawn,resume,arrivalY)
   s.storyNotice=cancelledTrial and '拠点移動でタイムの計測を終了しました。' or nil
   if departure then recordArrival(s,previous,dest) end
   return
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
   local id=accept or report;local q=quests[id];if not q or q.regionUnavailable or s.story.node~=q.hub then return end
   local state=s.story.quests[id]
   if accept and not q.legacyOnly and (not state or (q.repeatable and state.status=='complete')) then
    if q.growthRequirement and not growthRequirements[q.growthRequirement](s) then return end
    if q.requires and not completed(s,q.requires) then return end
    if q.opensAfter and not s.story.quests[q.opensAfter] then return end
    if q.opensAfterCount and s.story.quests[q.opensAfter].count<q.opensAfterCount then return end
    if q.opensAfterAnyPath then
     local progress=s.story.quests[q.opensAfter].pathProgress or {}
     local unlocked=false
     for path,required in pairs(q.opensAfterAnyPath) do
      if progress[path] and progress[path].count>=required then unlocked=true;break end
     end
     if not unlocked then return end
    end
    if q.level and (not s.progression or s.progression.level<q.level) then return end
    s.story.quests[id]={status='active',count=q.lesson and growthCount(s,q) or 0,cycles=state and state.cycles or 0,
                       recovered=q.cargo and {} or nil,inspected=q.trail and {} or nil,delivery=q.delivery and delivery.new() or nil,
                       cooking=q.cooking and cooking.new() or nil,book=q.book and {defeated={}} or nil,
                       stone=q.stone and {marked={},sequence=0} or nil,construction=q.construction and {surveyed={}} or nil,
                       lantern=q.lantern and {inspected={}} or nil,
                       forest=q.forest and {looped=false,defeated={}} or nil,
                       sights=q.sights and {seen={}} or nil,rest=q.rest and {defeated={}} or nil,
                        roof=q.roof and {ticks=0,falls=0} or nil,
                        appraisal=q.appraisal and {gathered={},measured=0,sorted=0} or nil}
    if q.paths then
     local record={}
     for _,path in ipairs(q.paths) do record[path.id]={count=0} end
     s.story.quests[id].pathProgress=record
    end
   elseif report and state and state.status=='active' and state.count==q.goal then
    if q.cooking then state.cooking.meals=1 end
    if state.sights then sights.report(s,q) end
    state.status='complete';state.cycles=(state.cycles or 0)+1;s.mora=s.mora+q.mora;C.grantExp(s,q.xp,'quest')
    if q.ore then C.grantUpgradeOre(s,q.ore) end
    if not state.sights then s.storyNotice=(not q.sights and q.closing) or (q.sights and q.sights.legacyName or q.name)..'：報酬を受け取りました。' end
    if q.kinichHunt then s.storyNotice=kinichAmbush.report(q,state) end
    if q.starter and (s.companion or 'amber')==q.join then C.refreshArtifactStats(s,true) end
    if q.weaponReward and state.cycles==1 and C.noteWeaponReward then C.noteWeaponReward(s,id) end
   end
   return
  end
  if key=='campaign' or key=='town' or key=='field' or key=='arena' or key=='boss_anemo' then
   finishTravelerTrial(s)
   iansanTraining.enter(s)
   s.story.active=false;s.voyage=nil;s.railTrip=nil;s.wandererAssistAt=nil;s.visitorDeparture=nil
   s.colleiWelcomeAt,s.colleiLetterNotice=nil,nil
   paper.reset(s);stealth.clear(s);itto.enter(s,nil)
  end
  action(s,key)
  local route=s.story.active and nodes[s.story.node].stealthRoute
  if route then stealth.fence(s,route,s.story.quests[route.quest]) end
 end
 function C.onKill(s,e)
  if onKill then onKill(s,e) end
  if s.story and s.story.active then
   if nodes[s.story.node].branch and not nodes[s.story.node].hub and e.spawnId and not e.boss then
    C.noteGrowth(s,'branch-practice')
   end
   local route=nodes[s.story.node].stealthRoute
   if route then stealth.defeat(s,quests[route.quest],s.story.quests[route.quest],e) end
   progress(s,'kill',s.story.node,e)
   for _,q in ipairs(itineraries) do
    local milestone,state,parent,quest=nextMilestone(s,q)
    if milestone and milestone.kind=='kill' and milestone.node==s.story.node and e.spawnId then
     if recordKill(s,state,milestone,e.spawnId,parent,quest) and nodes[s.story.node].clearedBy==q.id then
      e.respawn=math.huge
      if q.kinichHunt then kinichAmbush.defeat(s,q,state) end
     end
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
 local function returnFromDefeat(s)
   s.flagTrial=nil
   local node=nodes[s.story.node]
   for _,edge in ipairs(node.exits) do
    if edge.nightTotem=='return' then
     C.markNightTrialWipe(s)
     enter(s,edge.to,edge.arrivalX,nil,edge.arrivalY)
     s.storyNotice='夜魂の試練を中断し、黒曜石の柱へ戻りました。'
     return
    end
   end
   if duel.active(s,node.duel) then
    C.resetFieldTrial(s,node.duel.encounter)
    enter(s,node.id,node.duel.bellX)
    s.storyNotice='同じ会場で仕切り直します。水路の予告を見てください。'
   else
    enter(s,checkpointHub(s,checkpointNode(s)) or 'mond-town')
   end
 end

 local function swim(s,dt,input)
  if s.paused then return end
  dt=math.max(0,math.min(dt,1/30))
  s.t=s.t+dt
  local returns=s.returns
  C.checkPartyDefeat(s)
  if s.returns~=returns then returnFromDefeat(s);return end
  C.advanceCombatVisuals(s,dt)
  local spec=s.storySwimming
  local a=s.actors[s.active]
  local x,y,dx=freminetDive.motion(a,dt,input or {},spec.speed)
  a.x=math.max(20,math.min(s.worldwidth-20,x))
  a.y=math.max(spec.top,math.min(spec.bottom,y))
  if dx~=0 then a.dir=dx end
  local ally=s.actors[3-s.active]
  local targetX=math.max(20,math.min(s.worldwidth-20,a.x-56*a.dir))
  local follow=math.min(1,dt*5)
  ally.x=ally.x+(targetX-ally.x)*follow
  ally.y=ally.y+(a.y-ally.y)*follow
  ally.dir=a.dir
  for _,actor in ipairs(s.actors) do
   C.advanceActorTimers(actor,dt)
   actor.ground=false;actor.vy=0;actor.walk=0
   actor.buffer=0;actor.coyote=0;actor.runDistance=nil
  end
  s.camera=math.max(0,math.min(a.x-400,math.max(0,s.worldwidth-960)))
 end
 function C.step(s,dt,input)
  if s.springRun then
   local node=nodes[s.story.node]
   local q=quests[node.springQuest]
   local state=s.story.quests[q.id]
   local milestone=xilonenSprings.step(s,dt,input or {},q,state)
   if milestone then completeMilestone(s,state,milestone) end
   return
  end
  if s.surfRound then
   local n=nodes[s.story.node]
   local q=quests[n.surfQuest]
   local state=s.story.quests[q.id]
   local milestone=mualaniSurf.step(s,dt,input or {},n,q,state)
   if milestone then completeMilestone(s,state,milestone) end
   return
  end
  if s.toyDive then
   local spec=nodes[s.story.node].toyDive
   local q=quests[spec.quest]
   freminetDive.step(s,dt,input,spec,s.story.quests[q.id],q.goal)
   return
  end
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
     local track=ride.spiritwayTrack or ride.wallTrack or ride
     for i,start in ipairs(ride.riders) do
      local actor=s.actors[i]
      local endX=track.x-(i-1)*40
      if ride.spiritwayTrack then
       actor.x,actor.y=spiritwayPoint(start.x,start.y,endX,track,p)
      else
       actor.x=start.x+(endX-start.x)*p
       actor.y=start.y+(track.y-start.y)*p
      end
      actor.ground=false
     end
     if ride.wallTrack or ride.spiritwayTrack then
      s.camera=math.max(0,math.min(s.actors[s.active].x-400,s.worldwidth-960))
     end
    end
    if ride.remaining<=1e-8 then
     local from=s.story.node
     enter(s,ride.destination,ride.x,nil,ride.y)
     recordArrival(s,from,ride.destination)
    end
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
  if s.storySwimming then swim(s,dt,input);return end
  if s.story and s.story.active then movingPlatforms.move(s,dt) end
  if s.story and s.story.active and not s.paused and nodes[s.story.node].bloomQuest then bloom.follow(s) end
  local deck=s.story and s.story.active and s.storyMoonDeck
  if deck and not s.paused then
   local leader,companion=s.actors[s.active],s.actors[3-s.active]
   local far=deck.x+deck.w
   if companion.hp>0 and companion.ground and companion.y>deck.y and math.abs(leader.x-companion.x)>75
       and ((leader.x>deck.x+24 and companion.x>deck.x-58 and companion.x<deck.x+30)
        or (leader.x<far-24 and companion.x>far-30 and companion.x<far+58)) then
    companion.buffer=.1
   end
  end
  local returns,previous=s.returns,s.t;step(s,dt,(s.fireworkShow or s.sayuHatch or s.kavehModelOpen or s.nahidaMapOpen or s.furinaRun or s.photoPanel or s.stonePairOpen or s.springPanel or s.iansanPanel or s.lyneyRun) and {} or input)
  if s.story and s.story.active and s.returns==returns and not s.paused then
   local node=nodes[s.story.node]
   if s.iansanRound then
    local q=quests[node.iansanQuest]
    local state=s.story.quests[q.id]
    local milestone=iansanTraining.step(s,q,state,s.t-previous)
    if milestone then completeMilestone(s,state,milestone) end
   end
   if s.kinichHunt then
    local q=quests[node.kinichQuest]
    kinichAmbush.step(s,s.t-previous,q,s.story.quests[q.id])
   end
   duel.step(s,node.duel)
   patrol.update(s,node.patrol)
   if node.teaQuest and s.teaArrival then teaCase.step(s,quests[node.teaQuest]) end
   if node.wandererSurveyQuest and s.wandererAssistAt then
    local q=quests[node.wandererSurveyQuest]
    local state=s.story.quests[q.id]
    local milestone=wandererSurvey.update(s,q,state)
    if milestone then completeMilestone(s,state,milestone) end
   end
   if node.ittoGames then
    local quest=quests[node.ittoGames.quest]
    local state=s.story.quests[quest.id]
    local round=itto.update(s,node.ittoGames,state,s.t-previous)
    if round then
     local result=s.storyNotice
     completeMilestone(s,state,quest.itinerary[round+1])
     s.storyNotice=result
    end
   end
   local route=node.stealthRoute
   if route then
    local quest=quests[route.quest]
    local state=s.story.quests[quest.id]
    stealth.fence(s,route,state)
    local checkpoint=state and state.status=='active' and quest.itinerary[state.count+1]
    if checkpoint then
     local spotted=stealth.alert(s,checkpoint,state,s.t-previous,input)
     if spotted then
      spawnEnemies(s,node,state.count)
      local sentry=s.enemies[1]
      if sentry then sentry.x,sentry.home=spotted,spotted end
     end
     local opened=stealth.finishHatch(s,route,quest,state)
     if opened then completeMilestone(s,state,opened) end
    end
   end
   if node.fireworkBeach and fireworks.finished(s,quests[node.fireworkBeach]) then
    local quest=quests[node.fireworkBeach]
    local state=s.story.quests[quest.id]
    if state.count==quest.goal-1 then completeMilestone(s,state,quest.itinerary[quest.goal])
    else s.storyNotice='窓辺から見た、あの日の一発。打ち上げ台からもう一度観賞できます。' end
   end
   local boxSpec=node.returnBox
   if boxSpec then
    local q=quests[boxSpec.quest]
    local state=s.story.quests[q.id]
    if state and state.status=='active' and state.count==boxSpec.chaseAt and s.t>previous
       and returnBox.step(s,boxSpec,s.t-previous) then
     completeMilestone(s,state,q.itinerary[state.count+1])
     spawnEnemies(s,node,1)
    end
   end
   if node.snowMatch then
    local score=snowMatch.update(s,node.snowMatch,s.t-previous,input.attack)
    if score then
     local q=quests[node.snowMatch.quest]
     local state=s.story.quests[q.id]
     if state.status=='active' then completeMilestone(s,state,q.itinerary[q.goal]) end
     s.storyNotice=snowMatch.record(state,score)
    end
   end
   if node.groupPhotoQuest then
    local q=quests[node.groupPhotoQuest]
    local state=s.story.quests[q.id]
    local milestone=naviaPhoto.step(s,q,state)
    if milestone then completeMilestone(s,state,milestone) end
   end
   if node.magicScene then
    local id=node.magicScene.quest
    local state=s.story.quests[id]
    local milestone=lyneyMagic.step(s,quests[id],state)
    if milestone then completeMilestone(s,state,milestone) end
   end
   local milestone,state=theater.step(s,s.t-previous,node.theater)
   if milestone then completeMilestone(s,state,milestone) end
   milestone,state=flagCourse.step(s)
   if milestone then completeMilestone(s,state,milestone) end
  end
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
  if s.story and s.story.active and s.returns~=returns then returnFromDefeat(s) end
  if s.story and s.story.active and not s.paused then
   local node=nodes[s.story.node]
   local anchor=node.fallReturn or node.paperRescue
   if anchor then paper.rescue(s,anchor) end
   movingPlatforms.rescue(s,node.riverCrossing)
  end
 end
 local drawOutcrop=rockViews.drawOutcrop
 local function drawSpiritEcho(draws,x,y,t)
  y=y+math.sin(t*5+x*.026)*4
  draws[#draws+1]={kind='rect',x=x-9,y=y-8,w=18,h=16,color='#6ce7b7',opacity=.36}
  draws[#draws+1]={kind='rect',x=x-3,y=y-6,w=6,h=12,color='#bcfddb'}
  draws[#draws+1]={kind='rect',x=x-6,y=y-2,w=12,h=4,color='#dcffeb'}
 end
 local function drawRockSeal(draws,x,y,label)
  draws[#draws+1]={kind='rect',x=x-39,y=y-39,w=78,h=39,color='#393749'}
  draws[#draws+1]={kind='rect',x=x-31,y=y-58,w=61,h=41,color='#565067'}
  draws[#draws+1]={kind='rect',x=x-23,y=y-66,w=42,h=12,color='#756887'}
  draws[#draws+1]={kind='rect',x=x-12,y=y-40,w=28,h=3,color='#9286ab'}
  draws[#draws+1]={kind='text',x=x,y=y-83,text=label,color='#e9dbf9',size=14}
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
 local function drawRouteBeacon(draws,x,y,lit)
  local function rect(dx,dy,w,h,color)
   draws[#draws+1]={kind='rect',x=x+dx,y=y+dy,w=w,h=h,color=color}
  end
  rect(-17,-7,34,7,'#354960')
  rect(-10,-30,20,23,'#536983')
  rect(-17,-38,34,8,'#7e92a7')
  rect(-15,-47,30,9,lit and '#805239' or '#354960')
  rect(-7,-45,14,6,lit and '#ffd27c' or '#61788e')
  if lit then
   rect(-5,-53,10,8,'#ffad56')
   rect(-2,-58,4,11,'#fff2ba')
  end
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

 local function paintFixture(draws,x,y,rows)
  for _,r in ipairs(rows) do
   draws[#draws+1]={kind='rect',x=x+r[1],y=y+r[2],w=r[3],h=r[4],color=r[5]}
  end
 end
 local function drawRouteFixture(draws,x,y,kind,open)
  if x < -70 or x > 1030 then return end
  local art=data.routeFixtures[kind]
  paintFixture(draws,x,y,art.base)
  paintFixture(draws,x,y,open and art.open or art.closed)
  if art.cap then paintFixture(draws,x,y,art.cap) end
 end

 local function drawWindLift(draws,x,y,t)
  for i=1,5 do
   local rise=(i*19+t*65)%92
   draws[#draws+1]={kind='rect',x=x-27+(i*17)%48,y=y-rise,w=21-i*2,h=2,color='#beece4'}
  end
 end

 local function markerLayer(s,f,markers,mode)
  local layer={draws=markers}
  if s.packRectArt and mode=='rect' then
   layer.rectIndex,layer.rectBatches={},f.rectBatches or {}
  end
  return layer
 end

 local function drawTravelMarker(s,f,markers,art,x,y,h,mode,profile,flip)
  local layer=markerLayer(s,f,markers,mode)
  C.drawFieldDisplayArt(layer,art,x,y,h,mode,profile,flip)
  if layer.rectBatches then f.rectBatches=layer.rectBatches end
 end

 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);setup(s);f.story=s.story
  f.growthEligibility={}
  for id,eligible in pairs(growthRequirements) do f.growthEligibility[id]=eligible(s) end
  f.storyGraph,f.storyGraphRevision=visibleStoryGraph(s)
  local elapsed=voyageElapsed(s)
  f.storyNotice=s.storyNotice;f.storyJoined={};f.voyage=s.voyage and {seconds=math.max(0,s.voyage.arrives-s.t),destination=s.voyage.destination,elapsed=s.t-s.voyage.started,kind=s.voyage.kind,stopover=s.voyage.stopStart and elapsed>=s.voyage.stopStart and elapsed<s.voyage.stopEnd or false} or nil
  if f.voyage then
   f.voyage.destinationName=nodes[s.voyage.destination].name
   f.voyage.total=s.voyage.total
  end
  if f.voyage and (f.voyage.kind=='trolley' or f.voyage.kind=='ferry') then
   local v=s.voyage
   local stopStart,stopEnd=v.stopStart or 0,v.stopEnd or 0
   local wait=math.max(0,math.min(f.voyage.elapsed,stopEnd)-stopStart)
   local fraction=math.max(0,math.min(1,(f.voyage.elapsed-wait)/(v.total-stopEnd+stopStart)))
   f.voyage.scroll=v.reverse and 1-fraction or fraction
  end
  for id,q in pairs(quests) do if q.join and s.story.quests[id] and s.story.quests[id].status=='complete' then f.storyJoined[q.join]=true end end
  if s.story.active then local n=nodes[s.story.node];f.location=n.name..'（本編試作）'
   huntGuides(s,f)
   if contestQuest and completed(s,contestQuest.id) then f.storyAyakaMemory=ayakaRevisit(s) end
   local phase=n.locationAfterReport
   if phase and completed(s,phase.quest) then
    f.location=phase.name..'（本編試作）'
    f.storyScenery=phase.scenery
   end
   f.storyCleared=cleared(s,n) and true or nil
   if n.expeditionDesk and canInspect(s.actors[s.active],n.expeditionDesk) then
    local barrier=n.expeditionDesk.barrier
    f.storyExpeditionDesk={barrier=barrier,
     practice=s.expeditionPractice and math.floor(100*C.barrierMultiplier(C.partyImprint(s),barrier)+.5) or nil}
   end
   local reward=s.storyFirstClear
   if reward and s.t<reward.untilTime then f.storyFirstClear={quest=reward.quest,xp=reward.xp} end
   if s.storyWildlife and not s.lift then
    local player=s.actors[s.active]
    local nearest=145*145
    for _,animal in ipairs(s.storyWildlife) do
     local layout=C.enemyArtLayout[animal.art]
     local dx,dy=player.x-animal.x,(player.y-32)-(animal.y-layout.height/2)
     local distance=dx*dx+dy*dy
     if player.hp>0 and distance<nearest then
      nearest=distance
      f.wildlifeSighting={art=animal.art,name=layout.observationName or layout.name:match('^(.-)（') or layout.name}
     end
    end
   end
   if not f.storyCleared then
    local player=s.actors[s.active]
    for _,e in ipairs(s.enemies) do
     if e.storyName and e.hp>0 and (n.clearedBy or e.dailyElite and math.abs(e.x-player.x)<=360) then
      f.storyElite={name=e.storyName,hp=e.hp,maxhp=e.maxhp}
      break
     end
    end
   end
   if s.lift then
    local ride=s.lift
    f.storyLift={destination=ride.name,remaining=ride.remaining,seconds=ride.seconds,phase=ride.phase,
                 waterway=ride.waterway or nil,boat=ride.boat or nil,wall=ride.wallTrack and true or nil,
                 spiritway=ride.spiritwayTrack and true or nil,windLift=ride.windLift,floatingStone=ride.floatingStone}
   else f.storyNearbyPortal=nearbyPortal(s) end
   local markers={};f.storyPortals={}
   if n.waterSurvey then
    local q=quests[n.waterSurvey.quest]
    local progress=s.story.quests[q.id]
    for _,index in ipairs(n.waterSurvey.steps) do
     local step=q.itinerary[index]
     local x=step.x-s.camera
     if x>=-30 and x<=990 then
      local art=data.waterInstruments[step.waterInstrument]
      paintFixture(markers,x,step.y,art.base)
      paintFixture(markers,x,step.y,progress and progress.count>=index and art.after or art.before)
      if art.pending then paintFixture(markers,x,step.y,progress and progress.status=='complete' and art.reported or art.pending) end
     end
    end
   end
   if s.travelerTrial then f.storyTravelerTrial=true end
   if n.domainEntrance then
    local door=n.domainEntrance
    local x,y=door.x-s.camera,door.y
    if x>=-120 and x<=1080 then
     markers[#markers+1]={kind='rect',x=x-26,y=y-78,w=52,h=78,color='#70767b'}
     markers[#markers+1]={kind='rect',x=x-19,y=y-67,w=38,h=67,color='#293d4a'}
     markers[#markers+1]={kind='rect',x=x-31,y=y-83,w=62,h=8,color='#a6a8a5'}
     markers[#markers+1]={kind='text',x=x,y=y-96,text=door.name,color='#e5f7ef',size=14}
    end
   end
   if n.swim then
    f.storySwim=true
    for i,a in ipairs(s.actors) do
     if a.hp>0 then
      local x=a.x-s.camera-a.dir*22
      local y=a.y-30-14*((s.t+i*.29)%1)
      markers[#markers+1]={kind='rect',x=x,y=y,w=4,h=4,color='#bcece9'}
     end
    end
   end
   if n.waypoint then
    local point=n.waypoint
    local x,y=point.x-s.camera,point.y
    local statue=point.kind=='statue'
    local color=statue and '#f6d583' or '#8de8e5'
    local height=statue and 56 or 38
    local function shape(dx,dy,w,h,paint)
     markers[#markers+1]={kind='rect',x=x+dx,y=y+dy,w=w,h=h,color=paint}
    end
    shape(-15,-5,30,5,'#374e60')
    shape(-8,-height+10,16,height-15,'#3d526e')
    shape(-9,-height+4,18,8,color)
    shape(-5,-height,10,8,color)
    shape(-2,-height+15,4,height-23,color)
    f.storyWaypoint={id=n.mapPoint,kind=point.kind,name=n.name}
   end
   local growthPoint=growthViewpoint(s)
   if growthPoint then
    local x,y=growthPoint.x-s.camera,growthPoint.y
    markers[#markers+1]={kind='rect',x=x-1,y=y-45,w=3,h=45,color='#f3cb78'}
    markers[#markers+1]={kind='text',x=x,y=y-58,text='観測地点',size=15,color='#ffe2a0'}
    if not s.paused and canInspect(s.actors[s.active],growthPoint) then f.growthBranchObserve=true end
   end
   local cue=s.storyCue
   if cue and s.t<cue.untilTime then
    if cue.channel=='airflow' then f.storyAirflowCue=cue else f.storyResonanceCue=cue end
   end
   local function marker(x,y,w,h) markers[#markers+1]={kind='rect',x=x,y=y,w=w,h=h,color='#83dbe1'} end
   if n.breakQuest then
    for _,object in ipairs(s.enemies) do
     local x,y=object.x-s.camera,object.y
     if object.breakTarget and object.hp>0 and x>=-30 and x<=990 then
      local first=#markers+1
      markers[#markers+1]={kind='rect',x=x-24,y=y-14,w=48,h=14,color='#352049'}
      markers[#markers+1]={kind='rect',x=x-16,y=y-44,w=32,h=34,color='#6d3a98'}
      markers[#markers+1]={kind='rect',x=x-9,y=y-58,w=18,h=28,color='#a469d7'}
      markers[#markers+1]={kind='rect',x=x-5,y=y-54,w=6,h=23,color='#efd1ff'}
      markers[#markers+1]={kind='text',x=x,y=y-68,text=object.breakName or '電気水晶',color='#f8dbff',size=13}
      identifyQuestProp(s,markers,first,object.id)
     end
    end
   end
   for _,edge in ipairs(n.exits) do if shownEdge(s,edge) and (not edge.darkOnly or s.storyLightMode=='dark') then
    local x,y=edge.x-s.camera,edge.y or 480
    local fixture=C.gateFixtureState(s,n.id,edge)
    if edge.rubbleOnClosed and fixture=='closed' then
     markers[#markers+1]={kind='rect',x=x-26,y=y-44,w=50,h=44,color='#6a4b51'}
     markers[#markers+1]={kind='rect',x=x-17,y=y-59,w=32,h=17,color='#a4785f'}
    elseif edge.ironGate and fixture=='closed' then
     local first=#markers+1
     markers[#markers+1]={kind='rect',x=x-30,y=y-88,w=60,h=87,color='#332337'}
     for offset=-25,25,10 do
      markers[#markers+1]={kind='rect',x=x+offset,y=y-86,w=4,h=85,color='#93849b'}
     end
     markers[#markers+1]={kind='rect',x=x-29,y=y-54,w=58,h=6,color='#66556a'}
     markers[#markers+1]={kind='rect',x=x-6,y=y-50,w=12,h=10,color='#e1b968'}
     identifyQuestProp(s,markers,first,edge.to)
    elseif edge.routeFixture then
     drawRouteFixture(markers,x,y,edge.routeFixture,fixture=='open')
    elseif edge.spiritwayTrack then
     local track=edge.spiritwayTrack
     if gateRestriction(s,edge) then
      markers[#markers+1]={kind='effect',x=x,y=y-25,w=28,h=40,color='#746783',alpha=.85}
     else
      for i=0,12 do
       local wx,wy=spiritwayPoint(edge.x,edge.y or 480,track.x,track,i/12)
       markers[#markers+1]={kind='effect',x=wx-s.camera,y=wy-20,w=15,h=12,
                            color=i%2==0 and '#efd2ff' or '#ffc676',alpha=.9}
      end
     end
    elseif edge.windLift then
     drawWindLift(markers,x,y,s.t)
    elseif edge.wallTrack then
     local endX,endY=edge.wallTrack.x-s.camera,edge.wallTrack.y
     for i=0,7 do
      local step=i/7
      markers[#markers+1]={kind='rect',x=x+(endX-x)*step-4,y=y+(endY-y)*step-31,w=8,h=8,color='#edc47b'}
     end
    elseif edge.rockSeal and fixture=='closed' then
     if x>=-100 and x<=1060 then drawRockSeal(markers,x,y,edge.rockSeal) end
    elseif edge.nightTotem then
     if x>=-100 and x<=1060 then
      drawTravelMarker(s,f,markers,C.nightTrialTotemArt.idle,x,y,136,mode,profile,false)
      local title=edge.nightTotem=='return' and '出口' or '夜魂の試練'
      markers[#markers+1]={kind='text',x=x,y=y-152,text=title,color='#ead6ff',size=14}
     end
    elseif edge.phaseSeconds then
     local glow=gateRestriction(s,edge) and '#746783' or '#d6a1ef'
     markers[#markers+1]={kind='effect',x=x,y=y-40,w=45,h=65,color=glow,alpha=1}
     markers[#markers+1]={kind='effect',x=x,y=y-40,w=27,h=49,color='#655590',alpha=.9}
     markers[#markers+1]={kind='rect',x=x-3,y=y-42,w=6,h=16,color=glow}
    else
     marker(x-18,y-90,3,90);marker(x+15,y-90,3,90)
     marker(x-18,y-90,36,3);marker(x-21,y-3,42,3)
    end
    local wind=C.storyGateWind(s,n.id,edge)
    if wind and x>=0 and x<=960 then
     local signX=math.max(55,math.min(905,x))
     local color=wind.calm and '#a6eee7' or '#ffda9c'
     markers[#markers+1]={kind='rect',x=signX-50,y=y-118,w=100,h=20,color='#212632'}
     markers[#markers+1]={kind='rect',x=signX-50,y=y-100,w=100,h=2,color=color}
     markers[#markers+1]={kind='text',x=signX,y=y-105,size=13,color=color,
                          text=(wind.calm and '弱風 残り' or '風待ち ')..wind.seconds..'秒'}
    end
    f.storyPortals[#f.storyPortals+1]={to=edge.to,x=x,y=y,sealState=fixture,gateX=(fixture or edge.wind or edge.windowStart) and edge.x,wind=wind,stopWindow=C.storyStopWindow(s,n.id,edge)}
   end
   end
   theater.frame(s,f,markers,n.theater,mode,profile,canInspect,quests)
   local stageProps
   if n.furinaRehearsal or n.groupPhotoQuest or n.magicScene or n.toyDive or n.toyDisplay then
    stageProps=markerLayer(s,f,markers,mode)
    if stageProps.rectBatches then f.rectBatches=stageProps.rectBatches end
   end
   if n.furinaRehearsal then
    local q=quests[n.furinaRehearsal]
    furinaCues.observe(f,s,stageProps,q,s.story.quests[q.id],mode,profile)
   end
   if f.storyTheaterProgramme and s.photoPanel=='read' then
    local id='fon-navia-photo'
    f.storyNaviaPhoto=naviaPhoto.postedView(quests[id],s.story.quests[id])
   end
   if n.groupPhotoQuest then
    local q=quests[n.groupPhotoQuest]
    naviaPhoto.observe(f,s,stageProps,q,s.story.quests[q.id],mode,profile)
   end
   if n.magicScene then
    local id=n.magicScene.quest
    lyneyMagic.observe(f,s,stageProps,n.magicScene,quests[id],s.story.quests[id],mode,profile)
   end
   if n.toyDive then
    local q=quests[n.toyDive.quest]
    freminetDive.observe(f,s,stageProps,n,q,s.story.quests[q.id],mode,profile)
   end
   if n.toyDisplay then
    freminetDive.display(f,s,stageProps,n.toyDisplay,s.story.quests[n.toyDisplay.quest],mode,profile)
   end
   if n.stoneCharmQuest or n.iansanQuest or n.springQuest or n.kinichQuest or n.surfQuest
       or n.flagCourse or n.riverCrossing or n.id=='natlan-sunset-rostrum' then
    local props=markerLayer(s,f,markers,mode)
    if n.stoneCharmQuest then
     local q=quests[n.stoneCharmQuest]
     stoneOrnaments.observe(f,s,props,q,s.story.quests[q.id],mode,profile)
    end
    if n.iansanQuest then
     local q=quests[n.iansanQuest]
     iansanTraining.observe(f,s,props,n,q,s.story.quests[q.id],mode,profile)
    end
    if n.springQuest then
     local q=quests[n.springQuest]
     xilonenSprings.observe(f,s,props,n,q,s.story.quests[q.id],mode,profile)
    end
    if n.kinichQuest then
     local q=quests[n.kinichQuest]
     kinichAmbush.observe(f,s,props,n,q,s.story.quests[q.id],mode,profile)
    end
    if n.surfQuest then
     local q=quests[n.surfQuest]
     mualaniSurf.observe(f,s,props,n,q,s.story.quests[q.id],mode,profile)
    end
    if n.id=='natlan-sunset-rostrum' then flagCourse.memorial(s,f,props,quests,mode,profile) end
    flagCourse.observe(s,f,props,n.flagCourse,mode,profile)
    movingPlatforms.observe(s,f,props,n.riverCrossing,mode,profile)
    if props.rectBatches and #props.rectBatches>0 then f.rectBatches=props.rectBatches end
   end
   flagCourse.signals(s,markers,n.signalFlags)
   duel.frame(s,f,markers,n.duel)
   if n.snowMatch or n.returnBox or n.returnBoxArchive or n.nightBanner then
    local layer=markerLayer(s,f,markers,mode)
    if n.snowMatch then snowMatch.observe(s,f,layer,n.snowMatch,s.story.quests[n.snowMatch.quest],mode,profile) end
    if n.returnBox then
     local q=quests[n.returnBox.quest]
     returnBox.observe(s,f,layer,n.returnBox,q,s.story.quests[q.id],mode,profile)
    end
    if n.returnBoxArchive then
     returnBox.archive(s,f,layer,n.returnBoxArchive,s.story.quests[n.returnBoxArchive.quest],mode,profile)
    end
    if n.nightBanner then
     local q=quests[n.clearedBy]
     nightBanner.observe(s,f,layer,n,q,s.story.quests[q.id],mode,profile)
    end
    if layer.rectBatches and #layer.rectBatches>0 then f.rectBatches=layer.rectBatches end
   end
   if n.fireworkLookouts then
    local q=quests[n.fireworkLookouts]
    fireworks.survey(s,f,markers,q,s.story.quests[q.id],mode,profile)
   end
   if n.fireworkBeach then
    local q=quests[n.fireworkBeach]
    fireworks.beach(s,f,markers,q,s.story.quests[q.id],mode,profile)
   end
   if n.stealthRoute then
    local q=quests[n.stealthRoute.quest]
    stealth.observe(s,f,markers,q,s.story.quests[q.id],n.stealthRoute,mode,profile)
   end
   if n.stealthNap then
    local q=quests[n.stealthNap]
    local activeSight=sightQuest and sights.nearby(s,sightQuest,s.story.quests[sightQuest.id])
    stealth.nap(s,f,markers,q,s.story.quests[q.id],mode,profile,activeSight)
   end
   if n.ittoGames then itto.observe(s,f,markers,n.ittoGames,s.story.quests[n.ittoGames.quest],mode,profile) end
   if n.teaQuest then teaCase.observe(s,f,markers,quests[n.teaQuest],s.story.quests[n.teaQuest],mode,profile) end
   -- These quest observers append artwork to the same draw list.
   if s.packRectArt and mode=='rect' and (n.wandererSurveyQuest or n.visitorSite or n.colleiGuideQuest
       or n.colleiLetterQuest or n.kavehQuest or n.nahidaMapQuest or n.scentQuest) then
    f.rectIndex,f.rectBatches={},f.rectBatches or {}
   end
   if n.wandererSurveyQuest then
    local q=quests[n.wandererSurveyQuest]
    wandererSurvey.observe(f,s,q,s.story.quests[q.id],mode,profile)
   end
   if n.visitorSite then visitors.observe(f,s,n.visitorSite,quests[n.clearedBy],s.story.quests[n.clearedBy],mode,profile) end
   if n.colleiGuideQuest then
    local q=quests[n.colleiGuideQuest]
    colleiGuide.observe(f,s,n.guideScene,q,s.story.quests[q.id],mode,profile)
   end
   if n.colleiLetterQuest then
    local q=quests[n.colleiLetterQuest]
    colleiGuide.observeLetter(f,s,q,s.story.quests[q.id],mode,profile)
   end
   if n.kavehQuest then
    local q=quests[n.kavehQuest]
    kavehModel.observe(f,s,n,q,s.story.quests[q.id],mode,profile)
   end
   if n.nahidaMapQuest then
    local q=quests[n.nahidaMapQuest]
    nahidaMap.observe(f,s,q,s.story.quests[q.id],mode,profile)
   end
   if n.scentQuest then
    local q=quests[n.scentQuest]
    emilieScent.observe(f,s,q,s.story.quests[q.id],mode,profile)
   end
   if f.rectIndex then
    f.rectIndex=nil
    if #f.rectBatches==0 then f.rectBatches=nil end
   end
    if n.moonInlet then moonInlet.observe(s,f,markers,n.moonInlet,s.story.quests[n.moonInlet.quest]) end
    if n.shoreLights then moonInlet.lights(s,markers,n.shoreLights) end
    if n.coastDetour or n.appraisalQuest or n.rumorQuest or n.bloomQuest or n.patrol or n.id=='nod-port' then
     local layer=markerLayer(s,f,markers,mode)
     if n.coastDetour then coastDetour.observe(s,f,layer,n.coastDetour,quests[n.coastDetour.quest],mode,profile) end
     if n.appraisalQuest then
      local q=quests[n.appraisalQuest]
      appraisal.observe(s,f,layer,q,s.story.quests[q.id],nextMilestone(s,q),mode,profile)
     end
     if n.rumorQuest then
      local q=quests[n.rumorQuest]
      local state=s.story.quests[q.id]
      if n.id==q.hub then rumor.observe(s,f,layer,q,state,mode,profile)
      elseif state and state.count>=q.goal-1 then
       local mirror=q.itinerary[q.goal-1]
       if mirror.node==n.id then
        reflection.draw(s,f,layer,mirror,not s.paused and canInspect(s.actors[s.active],mirror),state,mode,profile,true)
       end
      end
     end
     if n.bloomQuest then
      local q=quests[n.bloomQuest]
      bloom.observe(s,f,layer,q,s.story.quests[q.id],mode,profile)
     end
     if n.patrol then
      local q=quests[n.patrol.quest]
      patrol.observe(s,f,layer,n.patrol,q,s.story.quests[q.id],mode,profile)
     end
     if n.id=='nod-port' then rumor.harbor(s,f,layer,quests,mode,profile) end
     if layer.rectBatches and #layer.rectBatches>0 then f.rectBatches=layer.rectBatches end
    end
    if n.survey then
     local q=quests[n.survey.quest]
     local layer=markerLayer(s,f,markers,mode)
     survey.observe(s,f,layer,n.survey,q,s.story.quests[q.id],mode,profile)
     if layer.rectBatches and #layer.rectBatches>0 then f.rectBatches=layer.rectBatches end
    end
   local pathQuest=n.pathsQuest and quests[n.pathsQuest]
   local pathState=pathQuest and s.story.quests[pathQuest.id]
   if pathState and pathState.pathProgress and pathState.count>0 then
    local carried=n.spiritEscort and pathState.pathProgress[n.spiritEscort]
    if carried and carried.count==1 then
     local a=s.actors[s.active]
     drawSpiritEcho(markers,a.x-s.camera-a.dir*40,a.y-85,s.t)
    end
    for _,point in ipairs(n.spiritReturns or {}) do
     if pathState.pathProgress[point.path].count==2 then
      local x=point.x-s.camera
      if x>=-25 and x<=985 then drawSpiritEcho(markers,x,point.y-36,s.t) end
     end
    end
    local notes={}
    for _,path in ipairs(pathQuest.paths) do
     local count=pathState.pathProgress[path.id].count
      local optional=pathQuest.anyPath and pathState.count+1>pathJoins[pathQuest.id] and count<#path.steps
      notes[#notes+1]=path.label..' '..(count==#path.steps and '通過' or (optional and '任意 ' or '')..count..' / '..#path.steps)
    end
    f.storyPathStatus=table.concat(notes,'　｜　')
   end
   if n.localLight then localLight.observe(s,f,markers,n.localLight) end
   if n.paperBoard then
    local board=n.paperBoard
    local q=quests[board.quest];local state=s.story.quests[q.id]
    paper.observe(s,f,markers,board,nextMilestone(s,q),state and state.count>=board.lockedAt)
   end
   if n.paperLantern then
    local p=n.paperLantern
    local x=p.x-s.camera
    if x>=-130 and x<=1090 then drawTravelMarker(s,f,markers,C.paperLanternArt,x,p.y,96,mode,profile,false) end
   end
   if f.voyage and f.voyage.kind=='trolley' then
    local a=s.actors[1]
    drawTravelMarker(s,f,markers,C.trolleyArt,a.x-s.camera-20,a.y+36,62,mode,profile,s.voyage.reverse)
   end
   if n.resonance then
    local quest=quests[n.resonance.quest]
    resonance.observe(s,f,markers,n.resonance,s.story.quests[quest.id],nextMilestone(s,quest))
   end
   if n.id=='spine-shelter' then
    local layer=markerLayer(s,f,markers,mode)
    rockViews.shelter(C,s,f,layer,quests['spine-noon-pattern'],quests['spine-ridge-record'],mode,profile)
    if layer.rectBatches and #layer.rectBatches>0 then f.rectBatches=layer.rectBatches end
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
   if s.lift and s.lift.floatingStone then
    local rider=s.actors[1]
    local x,y=rider.x-s.camera,rider.y
    markers[#markers+1]={kind='rect',x=x-68,y=y+1,w=108,h=6,color='#b6d4d6'}
    markers[#markers+1]={kind='rect',x=x-62,y=y+7,w=96,h=8,color='#617c86'}
    markers[#markers+1]={kind='rect',x=x-54,y=y+15,w=77,h=5,color='#3c5563'}
    markers[#markers+1]={kind='rect',x=x-39,y=y+20,w=48,h=4,color='#263c4b'}
    for i=0,2 do
     markers[#markers+1]={kind='rect',x=x-54+i*31,y=y+8,w=10,h=2,color='#80f0df'}
    end
   elseif s.lift and s.lift.riders and not (s.lift.wallTrack or s.lift.spiritwayTrack) then
    local rider=s.actors[1]
    local x,y=rider.x-s.camera,rider.y
    if s.lift.windLift then
     drawWindLift(markers,x,y+24,s.t+(s.lift.seconds-s.lift.remaining))
    else
     markers[#markers+1]={kind='rect',x=x-63,y=y,w=101,h=10,color='#5e5b48'}
     markers[#markers+1]={kind='rect',x=x-63,y=y,w=101,h=3,color='#f0d18b'}
    end
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
      f.storyCargo[item.id]={x=item.x,y=item.y,guarded=item.guard and (guarding(s,item) or false)}
      local x,y=item.x-s.camera,item.y
      if x>=-20 and x<=980 then
       for _,r in ipairs(item.rects) do
        markers[#markers+1]={kind='rect',x=x+r[1],y=y+r[2],w=r[3],h=r[4],color=r[5]}
       end
      end
     end
    end
   end
   if q and q.chase and recoveredAll(q,state) then
    for _,enemy in ipairs(s.enemies) do
     if enemy.spawnId==q.chase.enemy and enemy.hp>0 then
      for _,r in ipairs(q.chase.cloth) do
       local offset=(enemy.dir or 1)<0 and -r.x-r.w or r.x
       f.draws[#f.draws+1]={kind='rect',x=enemy.x-s.camera+offset,y=enemy.y+r.y,w=r.w,h=r.h,color=r.color}
      end
      break
     end
    end
   end
   local clue,_,nextCount=trailClue(s)
   if clue then
    if not s.paused and canInspect(s.actors[s.active],clue) then
     f.storyNearbyClue={id=clue.id,name=clue.name,label=nextCount==2 and clue.name..'と話す' or nil}
    end
    local x,y=clue.x-s.camera,clue.y
    for _,r in ipairs(clue.rects) do
     markers[#markers+1]={kind='rect',x=x+r[1],y=y+r[2],w=r[3],h=r[4],color=r[5]}
    end
   elseif C.dailyNearbyClue then
    f.storyNearbyClue=C.dailyNearbyClue(s)
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
   if (restQuest and n.id==restQuest.target) or
       (caveQuest and (n.id==caveQuest.target or n.id==caveQuest.cave.depth)) then
    local layer=markerLayer(s,f,markers,mode)
    if restQuest and n.id==restQuest.target then
     rest.observe(s,f,layer,restQuest,s.story.quests[restQuest.id],mode,profile)
    else
     cave.observe(s,f,layer,caveQuest,s.story.quests[caveQuest.id],mode,profile)
    end
    if layer.rectBatches and #layer.rectBatches>0 then f.rectBatches=layer.rectBatches end
   end
   if roofQuest then roof.observe(s,f,markers,roofQuest,s.story.quests[roofQuest.id]) end
   local recoveryQuest=quests[n.clearedBy]
   local recoveryState=recoveryQuest and recoveryQuest.recovery and s.story.quests[recoveryQuest.id]
   if recoveryState and recoveryState.recovered and recoveryState.count==recoveryQuest.goal-1 and s.companion~='beidou' then
    local guide=recoveryQuest.recovery.guide
    if math.abs(guide.x-s.camera-480)<540 then
     local layer=markerLayer(s,f,markers,mode)
     C.drawCompanionArt(layer,s,{x=guide.x,y=guide.y,dir=-1},mode,profile,guide.id)
     if layer.rectBatches and #layer.rectBatches>0 then f.rectBatches=layer.rectBatches end
     markers[#markers+1]={kind='text',x=guide.x-s.camera,y=guide.y-94,size=15,color='#ffe7a2',text=guide.name}
    end
   end
   local questProps=markerLayer(s,f,markers,mode)
   for _,q in ipairs(itineraries) do
    local state=s.story.quests[q.id]
    local milestone=nextMilestone(s,q)
     if milestone and milestone.kind=='choice' and milestone.node==s.story.node then
      if milestone.treasure then
       local x=milestone.treasure.x-s.camera
       if x>=-32 and x<=992 then drawIslandChest(markers,x,milestone.treasure.y,false) end
       local actor=s.actors[s.active]
       if actor.hp>0 and math.abs(actor.x-milestone.treasure.x)<180 and math.abs(actor.y-milestone.treasure.y)<34 then
        f.storyArtifactChoices=C.artifactChoicePreview(s,milestone.choices)
       end
      end
      for _,option in ipairs(milestone.choices) do
       local x,y=option.x-s.camera,option.y
       if x>=-25 and x<=985 then
        if option.detourGift then coastDetour.drawGift(questProps,x,y,option.id,mode,profile)
        elseif option.scentArt then emilieScent.choice(questProps,s,option,mode,profile)
        elseif option.magicChoice then lyneyMagic.choice(questProps,s,option,mode,profile)
        elseif option.diveChoice then freminetDive.choice(questProps,s,option,mode,profile)
        else
         markers[#markers+1]={kind='rect',x=x-12,y=y-25,w=24,h=25,color='#423951'}
         markers[#markers+1]={kind='rect',x=x-8,y=y-21,w=16,h=12,color='#d3dbf5'}
        end
        markers[#markers+1]={kind='text',x=x,y=y-(option.detourGift and 79 or (option.scentArt or option.magicChoice or option.diveChoice) and 82 or 43),text=option.name,color='#fff0b9',size=14}
       end
      end
      local option=not s.paused and nearbyChoice(s,milestone)
      if option and not f.storyNearbyMilestone then f.storyNearbyMilestone={label=option.action} end
     elseif milestone and milestone.kind=='guideChoice' and milestone.node==s.story.node then
      local option=not s.paused and nearbyChoice(s,milestone)
      if option and not f.storyNearbyMilestone then f.storyNearbyMilestone={label=option.action} end
     elseif milestone and milestone.airflow and milestone.node==s.story.node then
     airflow.observe(s,f,markers,milestone,not s.paused and canInspect(s.actors[s.active],milestone))
    elseif milestone and milestone.reflect and milestone.node==s.story.node then
      reflection.draw(s,f,questProps,milestone,not s.paused and canInspect(s.actors[s.active],milestone),state,mode,profile)
    elseif milestone and milestone.kind=='inspect' and milestone.node==s.story.node
        and not milestone.resonanceOrder and not milestone.shadowChoice and not milestone.paperFold
        and not (milestone.followCart and s.theaterCart)
        and (not milestone.roomLight or milestone.roomLight==s.storyLightMode) then
     local x,y=milestone.x-s.camera,milestone.y
     if milestone.scentProp then emilieScent.prop(questProps,s,milestone,mode,profile) end
     if milestone.surveyGuide then wandererSurvey.guide(questProps,s,milestone.surveyGuide,mode,profile) end
     if not milestone.rumorBoard and not milestone.bloomProp and not milestone.patrolLamp and not milestone.patrolTable
        and not milestone.surveySample and not milestone.surveyPad and not milestone.surveyRig and not milestone.surveySeat
        and not milestone.flagProp and not milestone.shadowView and not milestone.returnClue and not milestone.returnPickup
        and not milestone.nightClue and not milestone.fireworkSight and not milestone.stealthNap
        and not milestone.teaClue and not milestone.teaCup and not milestone.surveyProp and not milestone.visitorProp
        and not milestone.kavehProp and not milestone.discoveryProp and not milestone.scentProp and not milestone.rehearsalProp and not milestone.photoProp and not milestone.magicProp and not milestone.diveProp and not milestone.charmProp and not milestone.surfProp and not milestone.huntProp and not milestone.springProp and not milestone.iansanProp
        and (not milestone.resonanceStone or milestone.resonanceControl) and x>=-25 and x<=985 then
      if milestone.ironKey then
       local first=#markers+1
       if milestone.ironKey=='cage' then
        markers[#markers+1]={kind='rect',x=x-22,y=y-29,w=44,h=29,color='#4e3d53'}
        for offset=-18,18,9 do
         markers[#markers+1]={kind='rect',x=x+offset,y=y-27,w=3,h=25,color='#86808d'}
        end
       end
       markers[#markers+1]={kind='rect',x=x-8,y=y-23,w=12,h=9,color='#dab26f'}
       markers[#markers+1]={kind='rect',x=x+3,y=y-19,w=13,h=3,color='#fcecb0'}
       markers[#markers+1]={kind='rect',x=x+12,y=y-18,w=3,h=5,color='#fcecb0'}
       identifyQuestProp(s,markers,first,milestone.ironKey)
      elseif milestone.routeBeacon then drawRouteBeacon(markers,x,y,false)
      elseif milestone.outcrop then drawOutcrop(markers,x,y,milestone.outcrop)
      elseif milestone.teaCups then drawTeaSetting(markers,x,y,milestone.teaCups)
      elseif milestone.islandTreasure then drawIslandChest(markers,x,y,false)
      elseif milestone.shoreMark then drawShoreMark(markers,x,y,milestone.shoreMark)
      elseif milestone.patternBottle then drawPatternBottle(markers,x,y,false)
      elseif milestone.pageBook then paper.drawBook(markers,x,y,false)
      elseif not milestone.waterInstrument then
       markers[#markers+1]={kind='rect',x=x-13,y=y-28,w=26,h=28,color='#5a3648'}
       markers[#markers+1]={kind='rect',x=x-10,y=y-24,w=20,h=16,color='#eed5a8'}
       markers[#markers+1]={kind='rect',x=x-6,y=y-20,w=12,h=4,color='#767462'}
      end
      local caption=milestone.name or milestone.label or milestone.objective
      if caption then
       local captionY=milestone.name and y-(milestone.routeBeacon and 61 or milestone.patternBottle and 66 or milestone.outcrop and 48 or 41) or y+19
       markers[#markers+1]={kind='text',x=x,y=captionY,text=caption,color='#fff0b9',size=14}
      end
     end
     if not f.storyNearbyMilestone and not s.paused
         and not (milestone.flagLowerSeconds and s.flagLowering)
         and (not milestone.teaCup or teaCase.allowed(s,q,state))
         and not (milestone.assistLever and s.wandererAssistAt)
         and (not milestone.compareAfterStorage or visitors.quiet(s,q))
         and canInspect(s.actors[s.active],milestone) then
      f.storyNearbyMilestone={label=milestone.performance and theater.performanceLabel(s,milestone.performance)
         or milestone.diveDock and not freminetDive.arrived(s,q,state) and '玩具の到着を待つ'
         or milestone.magicCue and s.lyneyRun and '演目の進行中'
         or milestone.photoTimer and s.photoTimer and '撮影タイマー作動中'
         or milestone.stonePairBoard and s.stonePairOpen and '石飾りを閉じる'
         or milestone.photoPanel and s.photoPanel and '写真を閉じる'
         or milestone.discoveryBoard and s.nahidaMapOpen and '絵地図を閉じる'
         or milestone.modelBoard and s.kavehModelOpen and '模型を閉じる' or milestone.action}
      if milestone.paperSouvenir then paper.observeGift(s,f,milestone) end
      if milestone.surveyMap then f.storySurveyMap=milestone.surveyMap end
     end
    end
    if state then
      local steps=q.anyPath and completedSteps(q,state) or q.itinerary
      for index=1,q.anyPath and #steps or state.count do
       local done=milestoneAt(steps[index],s.story.node)
       if done.treasure and done.node==s.story.node then
        local x,y=done.treasure.x-s.camera,done.treasure.y
        if x>=-32 and x<=992 then
         drawIslandChest(markers,x,y,true)
         markers[#markers+1]={kind='text',x=x,y=y-55,text='☾ 月模様の札・受取済み',color='#b9ffce',size=14}
        end
       end
      if done.completedLabel and done.node==s.story.node and not done.resonanceOrder
          and (not done.roomLight or done.roomLight==s.storyLightMode) then
       local x,y=done.x-s.camera,done.y
        if not q.appraisal and not done.flagProp and not done.surveyProp
            and (not done.resonanceStone or done.resonanceControl) and x>=-25 and x<=985 then
        if done.routeBeacon then drawRouteBeacon(markers,x,y,true)
        elseif done.outcrop then drawOutcrop(markers,x,y,done.outcrop)
        elseif done.teaCups then drawTeaSetting(markers,x,y,done.teaCups)
        elseif done.islandTreasure then drawIslandChest(markers,x,y,true)
        elseif done.shoreMark then drawShoreMark(markers,x,y,done.shoreMark)
        elseif done.patternBottle then drawPatternBottle(markers,x,y,true)
        elseif done.pageBook then paper.drawBook(markers,x,y,true)
        elseif done.paperDisplay then paper.drawSouvenir(markers,x,y,state.paperSouvenir)
        else
         markers[#markers+1]={kind='rect',x=x-11,y=y-28,w=22,h=28,color='#5a3648'}
         markers[#markers+1]={kind='rect',x=x-7,y=y-25,w=14,h=12,color='#b9ffce'}
        end
        local label=done.paperDisplay and paper.giftLabel(q,state) or done.completedLabel
        markers[#markers+1]={kind='text',x=x,y=y-(done.routeBeacon and 70 or done.patternBottle and 66 or done.outcrop and 48 or 41),text=label,color='#b9ffce',size=14}
       end
       if (done.readback or done.resonancePages or done.paperDisplay) and state.status=='complete' and not f.storyNearbyMilestone and not s.paused
           and canInspect(s.actors[s.active],done) then
        if done.resonancePages then resonance.book(s,f,done) else f.storyNearbyMilestone={label=done.readLabel} end
       end
       if done.surveyMap and canInspect(s.actors[s.active],done) then f.storySurveyMap=done.surveyMap end
      end
     end
    end
   end
   if questProps.rectBatches and #questProps.rectBatches>0 then f.rectBatches=questProps.rectBatches end
   -- Navigation and quest objects precede actors, enemies, and effects.
   for _,hint in ipairs(n.hints or {}) do
    if not f.storyNearbyMilestone and not s.paused and not s.lift and not s.story.discovered[hint.group]
        and nearHint(s.actors[s.active],hint) then
     f.storyNearbyMilestone={label=hint.label..'を調べる'}
    end
   end
   for _,draw in ipairs(f.draws) do markers[#markers+1]=draw end;f.draws=markers
   if f.growthBranchObserve and not f.storyNearbyMilestone and not f.storyNearbyCargo and not f.storyNearbyClue then
    f.storyNearbyMilestone={label='高難度地域の観測地点を調べる'}
   end
   for _,h in ipairs(n.hints or {}) do f.draws[#f.draws+1]={kind='rect',x=h.x-s.camera-8,y=h.y-48,w=16,h=16,color='#ffe4a0'} end
   f.commands=#f.draws
  end
  return f
 end
 function C.checkpoint(s)
  local d=checkpoint(s)
  setup(s)
  if d then
   d.story=s.story
   if s.story.active then
    local entry=checkpointNode(s)
    if entry.id~=s.story.node then
     -- Save the boarding side while keeping discovery and quest state.
     d.story=copy(s.story)
     d.story.node=entry.id
    end
   end
   iansanTraining.checkpoint(s,d)
   if s.toyDive then d.active=s.toyDive.previousActive end
   if s.travelerTrial then d.active=s.travelerTrial.previousActive end
  end
  return d
 end
 function C.restore(d,density)
  local s=restore(d,density);setup(s)
  if d.story then
   s.story=copy(d.story);setup(s)
   if s.story.active then
    local node=nodes[s.story.node]
    enter(s,node.resumeAt or checkpointHub(s,node) or 'mond-town')
   end
  end
  if C.starterEquipment(s,s.companion) then C.refreshArtifactStats(s,true) end
  return s
 end
end
