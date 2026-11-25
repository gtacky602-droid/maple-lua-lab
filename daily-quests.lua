return function(C,config,graph)
 local action,frame,checkpoint,restore,onKill=C.action,C.frame,C.checkpoint,C.restore,C.onKill
 local quests,nodes={},{}
 local observedNames={}
 for _,q in ipairs(config.quests) do
  quests[q.id]=q
  if q.observation then
   local names={}
   for _,species in ipairs(q.observation) do names[species.art]=species.name end
   observedNames[q.id]=names
  end
 end
 for _,node in ipairs(graph.nodes) do nodes[node.id]=node end

 local function includes(list,value)
  for _,member in ipairs(list or {}) do if member==value then return true end end
  return false
 end

 local function isStory(s) return s.story and s.story.active end

 local function newLedger(period)
  return {period=period,activeSlots={},carrySlots={},seen={},earnedXp=0,earnedMora=0}
 end

 local function roll(ledger,period)
  if period<=ledger.period then return end
  local carry={}
  if period-ledger.period<=config.period.carryDays then
   for _,row in ipairs(ledger.activeSlots) do
    if not row.claimed and row.count==quests[row.id].goal then carry[#carry+1]=row end
   end
  end
  ledger.period,ledger.activeSlots,ledger.carrySlots=period,{},carry
 end

 function C.dailyBind(s,profile,period,authoritative)
  local daily=s.daily
  if not daily or daily.profile~=profile then
   daily={profile=profile,paidXp=0,paidMora=0,ledger=newLedger(period)}
   s.daily=daily
  end
  if authoritative then daily.ledger=authoritative end
  if period>daily.ledger.period then s.dailyNotice=nil end
  roll(daily.ledger,period)
 end

 function C.dailySettle(s)
  if not s.daily or not isStory(s) then return end
  local daily=s.daily
  local ledger=daily.ledger
  local xp,mora=ledger.earnedXp-daily.paidXp,ledger.earnedMora-daily.paidMora
  if xp>0 then C.grantExp(s,xp,'quest');daily.paidXp=ledger.earnedXp end
  if mora>0 then s.mora=s.mora+mora;daily.paidMora=ledger.earnedMora end
 end

 local function find(rows,id)
  for i,row in ipairs(rows) do if row.id==id then return row,i end end
 end

 local function tally(ledger)
  local slots={main=0,extra=0}
  for _,row in ipairs(ledger.activeSlots) do
   local kind=quests[row.id].kind
   slots[kind]=slots[kind]+1
  end
  return slots
 end

 local function canAccept(s,q,slots)
  if s.story.node~=q.hub then return false,'受注先の拠点へ' end
  if not s.progression or s.progression.level<q.level then return false,'Lv'..q.level..'で解放' end
  local prior=q.requires and s.story.quests[q.requires]
  if q.requires and (not prior or prior.status~='complete') then return false,q.unlockHint or '前の依頼を報告すると解放' end
  if slots[q.kind]>=config.limits[q.kind] then return false,'今日の枠は使用済み' end
  return true
 end

 local function entry(q,row)
  local item={id=q.id,kind=q.kind,name=q.name,giver=q.giver,region=config.regions[q.region].label,hub=nodes[q.hub].name,
              goal=q.goal,xp=q.xp,mora=q.mora,target=q.target,material=q.material,
              targetNodes=(not row or row.count<q.goal) and q.filter.nodes or nil,
              count=row and row.count,claimed=row and row.claimed or false}
  if q.observation then
   item.species={}
   for _,species in ipairs(q.observation) do
    item.species[#item.species+1]={name=species.name,recorded=row and row.recorded[species.art] or false}
   end
  end
  return item
 end

 function C.action(s,key)
  if not key:match('^daily_') then action(s,key);return end
  if not s.daily or not isStory(s) or s.paused then return end
  local command,id=key:match('^daily_(%a+):([%w%-]+)$')
  local q=quests[id]
  if not q then return end
  local ledger=s.daily.ledger
  if command=='accept' then
   if find(ledger.activeSlots,id) or not canAccept(s,q,tally(ledger)) then return end
   ledger.activeSlots[#ledger.activeSlots+1]={id=id,count=0,claimed=false,recorded=q.observation and {} or nil}
   s.dailyNotice=ledger.seen[id] and q.giver..'「今日もよろしく。」' or q.intro
   ledger.seen[id]=true
   return
  end
  if command~='claim' and command~='carry' then return end
  if s.story.node~=q.hub then return end
  local rows=command=='carry' and ledger.carrySlots or ledger.activeSlots
  local row,index=find(rows,id)
  if not row or row.claimed or row.count~=q.goal then return end
  if command=='carry' then table.remove(rows,index) else row.claimed=true end
  ledger.earnedXp=ledger.earnedXp+q.xp
  ledger.earnedMora=ledger.earnedMora+q.mora
  s.dailyNotice=q.giver..'「お疲れさま。今日もありがとう。」'
 end

 local function eligible(q,node,placement)
  local region=config.regions[q.region]
  if not includes(region.includeRegions,node.region) or includes(region.excludeNodes,node.id) then return false end
  local filter=q.filter
  if filter.nodes and not includes(filter.nodes,node.id) then return false end
  if filter.art and not includes(filter.art,placement.art) then return false end
  if filter.kind=='elite' then return placement.dailyElite==true end
  if filter.kind=='species' then return observedNames[q.id][placement.art]~=nil end
  return filter.kind=='region' or filter.kind=='nodes' or filter.kind=='art'
 end

 local function placementIn(node,e)
  if not e.spawnId or e.noRewards or e.fieldBoss or e.weeklyBoss then return end
  for _,p in ipairs(C.enemySpawns[node.id] or {}) do
   if p.id==e.spawnId and not p.dailyExclude then return p end
  end
 end

 local function addProgress(row,placement)
  if row.recorded then
   if row.recorded[placement.art] then return end
   row.recorded[placement.art]=true
  end
  row.count=row.count+1
 end

 local function nearbyObservation(s)
  if not s.daily or not isStory(s) or s.paused then return end
  local player=s.actors[s.active]
  local node=nodes[s.story.node]
  if player.hp<=0 or not node or node.hub or node.peaceful then return end
  local bestRow,bestPlacement,bestName,bestDistance
  for _,row in ipairs(s.daily.ledger.activeSlots) do
   local q=quests[row.id]
   if q.observation and not row.claimed and row.count<q.goal and includes(q.filter.nodes,node.id) then
    for _,enemy in ipairs(s.enemies) do
     local dx,dy=math.abs(player.x-enemy.x),math.abs(player.y-enemy.y)
     if enemy.hp>0 and dx<=96 and dy<=52 then
      local placement=placementIn(node,enemy)
      local distance=dx*dx+dy*dy
      if placement and not row.recorded[placement.art] and eligible(q,node,placement)
       and (not bestDistance or distance<bestDistance) then
       bestRow,bestPlacement,bestName,bestDistance=row,placement,observedNames[row.id][placement.art],distance
      end
     end
    end
   end
  end
  return bestRow,bestPlacement,bestName
 end

 function C.dailyNearbyClue(s)
  local _,placement,name=nearbyObservation(s)
  if placement then return {id=placement.id,name=name,label=name..'を観察する'} end
 end

 function C.dailyObserve(s)
  local row,placement,name=nearbyObservation(s)
  if not row then return end
  addProgress(row,placement)
  s.dailyNotice=name..'を記録しました。'
 end

 function C.onKill(s,e)
  local event=s.events[#s.events]
  if onKill then onKill(s,e) end
  if not s.daily or not isStory(s) then return end
  if not event or event.kind~='kill' or event.target~=e.id or event.seq==s.dailyLastKill
      or not (event.actor==1 or event.actor==2) then return end
  local node=nodes[s.story.node]
  if not node or node.hub or node.peaceful then return end
  local placement=placementIn(node,e)
  if not placement then return end
  s.dailyLastKill=event.seq
  for _,row in ipairs(s.daily.ledger.activeSlots) do
   local q=quests[row.id]
   if not row.claimed and row.count<q.goal and eligible(q,node,placement) then addProgress(row,placement) end
  end
 end

 function C.frame(s,...)
  local f=frame(s,...)
  if not s.daily then return f end
  local ledger=s.daily.ledger
  local visible={profile=s.daily.profile}
  f.daily=visible
  if not isStory(s) then return f end
  visible.period,visible.activeSlots,visible.carrySlots=ledger.period,{},{}
  visible.dailyChoices,visible.limits,visible.usedSlots={},config.limits,tally(ledger)
  visible.notice=s.dailyNotice
  visible.resetHour,visible.offsetMinutes,visible.carryDays=config.period.resetHour,config.period.offsetMinutes,config.period.carryDays
  local function list(rows,out)
   for _,row in ipairs(rows) do
    local q=quests[row.id]
    local item=entry(q,row)
    item.canClaim=not s.paused and s.story.node==q.hub and not row.claimed and row.count==q.goal
    out[#out+1]=item
   end
  end
  list(ledger.activeSlots,visible.activeSlots)
  list(ledger.carrySlots,visible.carrySlots)
  for _,q in ipairs(config.quests) do
   if q.hub==s.story.node and not find(ledger.activeSlots,q.id) then
    local item=entry(q)
    local accept,reason=canAccept(s,q,visible.usedSlots)
    item.accept,item.reason=accept and not s.paused,reason
    item.companion=q.companion and q.companion==(s.companion or 'amber')
    visible.dailyChoices[#visible.dailyChoices+1]=item
   end
  end
  return f
 end

 function C.checkpoint(s)
  local d=checkpoint(s)
  if d and s.daily then d.daily=s.daily end
  return d
 end

 function C.restore(d,density)
  local s=restore(d,density)
  s.daily=d.daily
  return s
 end
end
