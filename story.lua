return function(C,data)
 local action,step,frame,checkpoint,restore,onKill=C.action,C.step,C.frame,C.checkpoint,C.restore,C.onKill
 local function copy(v)
  if type(v)~='table' then return v end
  local out={};for k,item in pairs(v) do out[k]=copy(item) end;return out
 end
 local nodes,quests={},{}
 for _,n in ipairs(data.nodes) do nodes[n.id]=n end
 for _,q in ipairs(data.quests) do quests[q.id]=q end
 local function setup(s)
  if not s.story then s.story={active=false,node='mond-town',visited={['mond-town']=true},quests={}} end
  s.story.discovered=s.story.discovered or {}
 end
 local function completed(s,id)
  local state=s.story.quests[id]
  return state and state.status=='complete'
 end
 local function gateRestriction(s,edge)
  local rule=edge.requires
  if rule then
   local state=s.story.quests[rule.quest]
   local allowed=completed(s,rule.quest) or (rule.count and state and state.count>=rule.count)
   if not allowed then
    return '依頼「'..quests[rule.quest].name..'」'..(rule.count and 'を進めてください。' or 'を報告してください。')
   end
  end
  local passed=s.voyage and s.t-s.voyage.started or -1
  if edge.windowStart and not (passed+1e-8>=edge.windowStart and passed+1e-8<edge.windowEnd) then return '寄港時間外' end
  if edge.requiresArrival and not (s.voyage and s.t>=s.voyage.arrives) then return '到着待ち' end
 end
 local function nearGate(a,edge)
  return math.abs(a.x-edge.x)<90 and math.abs(a.y-(edge.y or 480))<60
 end
 local function nearbyPortal(s)
  if not s.story.active then return nil end
  local a=s.actors[s.active]
  local best,distance=nil,90
  for _,edge in ipairs(nodes[s.story.node].exits) do
   local n=nodes[edge.to];local dx=math.abs(a.x-edge.x)
   if dx<distance and nearGate(a,edge) and (not n.hiddenGroup or s.story.discovered[n.hiddenGroup]) then
    local reason=nil
    if s.paused then reason='一時停止中'
    elseif a.hp<=0 then reason='戦闘不能中'
    elseif not s.progression or s.progression.level<n.level then reason='必要レベル '..n.level
    else reason=gateRestriction(s,edge) end
    best={to=edge.to,name=n.name,level=n.level,available=not reason,reason=reason};distance=dx
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
   if q.cargo and state.recovered and state.status=='active' and state.count==q.goal-1 and q.target==s.story.node then
    return q,state
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
    for _,item in ipairs(trail.clues) do
     if item.node==s.story.node and not state.inspected[item.id] then return item,state end
    end
   end
  end
 end
 local function canInspect(a,item)
  return a.hp>0 and math.abs(a.x-item.x)<54 and math.abs(a.y-item.y)<34
 end
 local function questKillCounts(q,state,enemy)
  if not state.recovered then return true end -- Already accepted under the original four-kill contract.
  if state.count==q.goal-1 then return enemy.spawnId==q.chase.enemy and recoveredAll(q,state) end
  for _,art in ipairs(q.openingArts) do if enemy.art==art then return true end end
  return false
 end
 local function progress(s,kind,target,enemy)
  for id,state in pairs(s.story.quests) do local q=quests[id]
   if state.status=='active' and q.kind==kind and q.target==target and state.count<q.goal
    and (kind~='kill' or questKillCounts(q,state,enemy)) then
    state.count=state.count+1
   end
  end
 end
 local function enter(s,id,spawn,elapsed)
  local n=nodes[id];s.campaign.zone='story:transition';action(s,n.hub and 'town' or 'field')
  s.campaign.zone=n.hub and 'town' or ('story:'..id);s.campaign.message='本編ルートの試作。隣の地点へは門の近くで移動。'
  s.story.active=true;s.story.node=id;s.story.visited[id]=true;s.worldwidth=n.width
  s.platforms={};for _,p in ipairs(n.platforms) do s.platforms[#s.platforms+1]={x=p.x,y=p.y,w=p.w} end
  s.enemies={}
  if not n.hub and not n.peaceful then
   local fresh=C.new(12)
   local placements=assert(C.enemySpawns and C.enemySpawns[id],'Missing story enemy placements: '..id)
   for i,placement in ipairs(placements) do
    local e=fresh.enemies[i];local p=assert(n.platforms[placement.platform+1],'Invalid enemy support')
    e.x=placement.x;e.home=e.x;e.y=p.y;e.kind=placement.kind;e.art=placement.art;e.spawnId=placement.id
    e.patrolMin=p.x+24;e.patrolMax=p.x+p.w-24
    e.level=n.level;e.barrier=n.barrier or 0;if e.barrier>0 then e.hp=60;e.maxhp=60 end;s.enemies[i]=e
   end
  end
  local cargo,state=cargoQuest(s)
  if cargo and recoveredAll(cargo,state) then beginChase(s,cargo) end
  for i,a in ipairs(s.actors) do a.x=(spawn or 160)-(i-1)*40;a.y=480;a.vy=0;a.ground=true end
  s.camera=math.max(0,math.min(s.actors[s.active].x-400,math.max(0,n.width-960)))
  s.macro=nil;s.encounter=nil;s.voyage=n.voyage and {destination=n.voyage.destination,arrives=s.t+n.voyage.seconds-(elapsed or 0),started=s.t-(elapsed or 0),source=n.voyage.source,stopStart=n.voyage.stopStart,stopEnd=n.voyage.stopEnd} or nil;progress(s,'visit',id)
 end
 function C.enterStoryNode(s,id) setup(s);enter(s,id) end
 function C.storyBossDefeated(s,id) setup(s);progress(s,'boss',id) end
 function C.action(s,key)
  setup(s)
  if key=='story_nearby_portal' then local p=nearbyPortal(s);if p then C.action(s,'story_portal:'..p.to) end;return end
  if key=='story_collect' then
   if s.paused or not s.story.active then return end
   local q,state=cargoQuest(s)
   if not q then
    local clue,progress=trailClue(s)
    if not clue then return end
    if not canInspect(s.actors[s.active],clue) then s.storyNotice='手がかりのそばまで移動してください。';return end
    progress.inspected[clue.id]=true
    progress.count=1
    s.storyNotice=clue.line
    return
   end
   local item=nearbyCargo(s,q,state)
   if not item then s.storyNotice='荷物のそばまで移動してください。';return end
   state.recovered[item.id]=true
   if recoveredAll(q,state) then
    beginChase(s,q)
    s.storyNotice='赤い布を引きずるヒルチャールを、街道の奥へ追いましょう。'
   else s.storyNotice=item.name..'を回収しました。' end
   return
  end
  local discovery=key:match('^story_discover:([%w%-]+)$')
  if discovery then
   if s.paused or not s.story.active or s.actors[s.active].hp<=0 then return end
   local a=s.actors[s.active]
   for _,h in ipairs(nodes[s.story.node].hints or {}) do if h.group==discovery and math.abs(a.x-h.x)<75 and math.abs(a.y-h.y)<60 then s.story.discovered[discovery]=true;s.storyNotice='隠し入口を発見しました。';return end end
   s.storyNotice='手がかりの近くで調べてください。';return
  end
  if key=='story_start' then if not s.campaign then action(s,'campaign') end;enter(s,'mond-town');return end
  local dest=key:match('^story_portal:([%w%-]+)$');local fast=key:match('^story_fast:([%w%-]+)$')
  if dest or fast then
   if s.paused or not s.story.active or s.actors[s.active].hp<=0 then return end
   local resume=0;dest=dest or fast;local n=nodes[dest];if not n then return end
   if n.hiddenGroup and not s.story.discovered[n.hiddenGroup] then s.storyNotice='この入口はまだ発見していません。';return end
   if not s.progression or s.progression.level<n.level then s.storyNotice='必要レベル '..n.level..' に達していません。';return end
   if fast then if not n.hub or not s.story.visited[dest] then s.storyNotice='到達済みの拠点だけ移動できます。';return end
   else
    local allowed=false;local a=s.actors[s.active]
    for _,edge in ipairs(nodes[s.story.node].exits) do
     if edge.to==dest and nearGate(a,edge) then
      local reason=gateRestriction(s,edge)
      if reason then s.storyNotice=reason;return end
      allowed=true;resume=edge.resumeSeconds or 0
     end
    end
    if not allowed then s.storyNotice='接続する門の近くまで歩いてください。';return end
   end
   local previous=s.story.node;local spawn=160
   for _,edge in ipairs(n.exits) do if edge.to==previous then spawn=edge.x<720 and 160 or n.width-160 end end
   enter(s,dest,spawn,resume);s.storyNotice=nil;return
  end
  local accept=key:match('^story_accept:([%w%-]+)$');local report=key:match('^story_report:([%w%-]+)$')
  if accept or report then
   if s.paused or not s.story.active then return end
   local id=accept or report;local q=quests[id];if not q or s.story.node~=q.hub then return end
   local state=s.story.quests[id]
   if accept and (not state or (q.repeatable and state.status=='complete')) then
    if q.requires and not completed(s,q.requires) then return end
    s.story.quests[id]={status='active',count=0,cycles=state and state.cycles or 0,
                       recovered=q.cargo and {} or nil,inspected=q.trail and {} or nil}
   elseif report and state and state.status=='active' and state.count==q.goal then
    state.status='complete';state.cycles=(state.cycles or 0)+1;s.mora=s.mora+q.mora;C.grantExp(s,q.xp,'quest');s.storyNotice=q.closing or q.name..'：報酬を受け取りました。'
   end
   return
  end
  if key=='campaign' or key=='town' or key=='field' or key=='arena' or key=='boss_anemo' then s.story.active=false;s.voyage=nil end
  action(s,key)
 end
 function C.onKill(s,e)
  if onKill then onKill(s,e) end
  if s.story and s.story.active then
   progress(s,'kill',s.story.node,e)
   for id,state in pairs(s.story.quests) do
    local q=quests[id]
    if q.trail and state.status=='active' and state.count==1 and q.target==s.story.node and e.spawnId==q.trail.guard then
     state.count=q.goal
     s.storyNotice='見張りを倒して柵が開きました。森への近道から戻れます。'
    end
   end
  end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input)
  if s.story and s.story.active and s.voyage and not s.paused and s.t+1e-8>=s.voyage.arrives then enter(s,s.voyage.destination) end
  if s.story and s.story.active and s.returns~=returns then enter(s,s.story.visited[nodes[s.story.node].checkpoint] and nodes[s.story.node].checkpoint or 'mond-town') end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);setup(s);f.story=s.story;local visible={version=data.version,status=data.status,nodes={},quests={}}
  local function shown(n) return not n.hiddenGroup or s.story.discovered[n.hiddenGroup] end
  for _,n in ipairs(data.nodes) do if shown(n) then local out=copy(n);out.exits={};for _,edge in ipairs(n.exits) do if shown(nodes[edge.to]) then out.exits[#out.exits+1]=copy(edge) end end;visible.nodes[#visible.nodes+1]=out end end
  for _,q in ipairs(data.quests) do if shown(nodes[q.hub]) then visible.quests[#visible.quests+1]=q end end
  f.storyGraph=visible;f.storyNotice=s.storyNotice;f.storyJoined={};f.voyage=s.voyage and {seconds=math.max(0,s.voyage.arrives-s.t),destination=s.voyage.destination,elapsed=s.t-s.voyage.started,stopover=s.voyage.stopStart and s.t-s.voyage.started+1e-8>=s.voyage.stopStart and s.t-s.voyage.started+1e-8<s.voyage.stopEnd or false} or nil
  for id,q in pairs(quests) do if q.join and s.story.quests[id] and s.story.quests[id].status=='complete' then f.storyJoined[q.join]=true end end
  if s.story.active then local n=nodes[s.story.node];f.location=n.name..'（本編試作）'
   f.storyNearbyPortal=nearbyPortal(s)
   local markers={};f.storyPortals={}
   local function marker(x,y,w,h) markers[#markers+1]={kind='rect',x=x,y=y,w=w,h=h,color='#83dbe1'} end
   for _,edge in ipairs(n.exits) do if shown(nodes[edge.to]) then
    local x,y=edge.x-s.camera,edge.y or 480
    marker(x-18,y-90,3,90);marker(x+15,y-90,3,90)
    marker(x-18,y-90,36,3);marker(x-21,y-3,42,3)
    f.storyPortals[#f.storyPortals+1]={to=edge.to,x=x,y=y}
   end
   end
   local q,state=cargoQuest(s)
   if q then
    local nearby=nearbyCargo(s,q,state)
    if nearby and not s.paused then f.storyNearbyCargo={id=nearby.id,name=nearby.name} end
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
   local clue=trailClue(s)
   if clue then
    if not s.paused and canInspect(s.actors[s.active],clue) then f.storyNearbyClue={id=clue.id,name=clue.name} end
    local x,y=clue.x-s.camera,clue.y
    local elevated=y<480
    markers[#markers+1]={kind='rect',x=x-10,y=y-14,w=20,h=4,color=elevated and '#a93634' or '#634936'}
    markers[#markers+1]={kind='rect',x=x-5,y=y-10,w=10,h=7,color=elevated and '#f76859' or '#b69765'}
   end
   -- Navigation and quest objects precede actors, enemies, and effects.
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
  return s
 end
end
