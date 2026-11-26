return function(C, atlas)
 local action, step, frame = C.action, C.step, C.frame
 local regions, places, positions, bosses = {}, {}, {}, {}
 for _,region in ipairs(atlas.regions) do
  regions[region.id] = region
  for _,point in ipairs(region.points) do
   places[point.id], positions[point.id] = region.id, point
   if point.boss then bosses[#bosses+1]=point end
  end
 end

 local colors = {
  grove={'#557251','#b9cf78','#d8df9b','#47765a'},
  stone={'#8b6256','#cba678','#f0cd91','#9d795c'},
  isles={'#526a80','#a5bfa0','#d7d9b3','#686994'},
  desert={'#9b6a50','#dfb46f','#f2d58e','#ad8057'},
  water={'#517879','#a9c8a0','#cbe2c1','#5490a1'},
  ember={'#905849','#d39159','#f2bf80','#ab6b4e'},
  moon={'#536181','#8fa6a6','#c7d5b9','#635d8b'},
  snow={'#5f8191','#b8ccd0','#e9eee1','#86abb9'},
  cavern={'#685e72','#a99b9a','#cfb9a7','#8a7776'},
 }
 local w, h = table.unpack(atlas.size)
 local function rectangle(out,x,y,width,height,color)
  out[#out+1]={kind='rect',x=x,y=y,w=width,h=height,color=color}
 end
 local function polygon(out,points,color)
  out[#out+1]={kind='poly',points=points,color=color}
 end
 local function label(out,x,y,name,color,size)
  out[#out+1]={kind='label',x=x,y=y,text=name,color=color,size=size}
 end
 local function line(out,ax,ay,bx,by,color,width,dash)
  out[#out+1]={kind='line',x=ax,y=ay,toX=bx,toY=by,color=color,width=width,dash=dash}
 end

 local function sea(out, deep)
  rectangle(out,0,0,w,h,deep and '#234651' or '#7baeb3')
  for y=13,h-10,15 do
   local shade=deep and (y%3==0 and '#315964' or '#2e525d') or (y%3==0 and '#85b6b8' or '#80b1b6')
   rectangle(out,0,y,w,1,shade)
  end
  for y=45,h-30,62 do
   for x=36+y%127,w-25,96 do
    rectangle(out,x,y,13,1,deep and '#3c6972' or '#9ac2bf')
    rectangle(out,x+5,y+2,14,1,deep and '#325b66' or '#91bdbd')
   end
  end
 end

 local function compass(out,x,y)
  for _,axis in ipairs({{0,-27,6,0,0,27,-6,0},{-21,0,0,-5,21,0,0,5}}) do
   polygon(out,{{x+axis[1],y+axis[2]},{x+axis[3],y+axis[4]},
                {x+axis[5],y+axis[6]},{x+axis[7],y+axis[8]}},'#577c82')
  end
  polygon(out,{{x,y-25},{x+5,y},{x,y+6},{x-5,y}},'#f0dfa7')
  label(out,x,y-32,'N','#47606a',12)
 end

 local function tree(out,x,y,tone)
  rectangle(out,x-1,y-2,3,5,'#836753')
  polygon(out,{{x,y-14},{x+6,y-4},{x+3,y-3},{x+7,y},{x-7,y},{x-4,y-4},{x-6,y-4}},tone)
  rectangle(out,x-1,y-10,2,4,'#85a372')
 end
 local function mountain(out,x,y,tone,cap)
  polygon(out,{{x-16,y},{x-5,y-16},{x+1,y-22},{x+8,y-13},{x+18,y}},tone)
  polygon(out,{{x-5,y-16},{x+1,y-22},{x+8,y-13},{x+3,y-15},{x,y-12}},cap)
  polygon(out,{{x+1,y-16},{x+8,y-13},{x+18,y},{x+8,y},{x+4,y-8}},'#637979')
 end
 local function house(out,x,y)
  rectangle(out,x-9,y-10,18,11,'#e5c895')
  polygon(out,{{x-11,y-9},{x-5,y-19},{x+6,y-19},{x+12,y-9}},'#a36054')
  rectangle(out,x-3,y-5,5,6,'#79554a')
  rectangle(out,x+4,y-7,3,3,'#f9e8ac')
 end

 local function landmark(out,x,y,theme)
  if theme=='grove' then
   house(out,x,y)
   rectangle(out,x-2,y-30,4,15,'#e7d5a4')
   for _,wing in ipairs({{-12,1},{1,12},{0,-11},{0,1}}) do
    line(out,x,y-24,x+wing[1],y-24+wing[2],'#fbebbd',2)
   end
  elseif theme=='water' then
   polygon(out,{{x-20,y},{x-15,y-10},{x-7,y-10},{x-5,y-28},{x+3,y-33},
                {x+10,y-13},{x+16,y-11},{x+19,y}},'#517f85')
   rectangle(out,x-3,y-25,6,19,'#e6eece')
   rectangle(out,x-12,y-8,26,4,'#bce8d7')
  elseif theme=='desert' then
   for step=0,4 do rectangle(out,x-17+step*3,y-5-step*4,34-step*6,4,'#ad784f') end
   rectangle(out,x-3,y-10,6,7,'#6b564e')
  elseif theme=='isles' then
   polygon(out,{{x-19,y-6},{x-13,y-15},{x+14,y-15},{x+21,y-6}},'#705e85')
   polygon(out,{{x-15,y-17},{x-8,y-25},{x+9,y-25},{x+16,y-17}},'#736493')
   rectangle(out,x-10,y-16,20,11,'#e3c199')
   rectangle(out,x-3,y-11,6,5,'#855a65')
  elseif theme=='ember' then
   polygon(out,{{x-22,y},{x-6,y-20},{x+6,y-21},{x+23,y}},'#825351')
   polygon(out,{{x-6,y-20},{x+6,y-21},{x+11,y-9},{x,y-15},{x-5,y-11},{x-8,y-15}},'#e8a260')
   rectangle(out,x-6,y-27,10,2,'#eed3a7')
  elseif theme=='moon' then
   polygon(out,{{x-7,y},{x-9,y-14},{x-4,y-23},{x+5,y-26},{x+13,y-18},{x+4,y-21},
                {x-1,y-16},{x-1,y-7},{x+7,y}},'#dfddaf')
   rectangle(out,x+11,y-11,2,4,'#edf1d2')
   rectangle(out,x+10,y-10,4,2,'#edf1d2')
  else
   house(out,x,y)
   rectangle(out,x+9,y-22,6,21,theme=='snow' and '#e5ebe0' or '#d6b08c')
   polygon(out,{{x+7,y-22},{x+12,y-28},{x+17,y-22}},theme=='snow' and '#506d82' or '#8a695d')
  end
 end

 local function land(out,x,y,theme,offset)
  local shade=colors[theme]
  local shape={{-70,-8},{-57,-30},{-25,-43},{-3,-40},{19,-51},{44,-41},
               {57,-28},{68,-15},{67,10},{57,26},{33,37},{10,36},{-12,46},
               {-37,34},{-61,29},{-72,10}}
  local function ring(scale,down)
   local points={}
   for i,p in ipairs(shape) do
    points[i]={x+p[1]*scale+(i%4-2)*offset,y+p[2]*scale+down+i%3*offset}
   end
   return points
  end
  polygon(out,ring(1.09,8),'#5d949e')
  polygon(out,ring(1.04,5),shade[1])
  polygon(out,ring(1,0),'#e5cca0')
  polygon(out,ring(.92,-1),shade[2])
  polygon(out,ring(.8,-4),shade[3])
  polygon(out,ring(.64,-8),shade[2])
  local relief=theme=='snow' or theme=='stone' or theme=='ember' or theme=='desert'
  if relief then
   mountain(out,x-23,y-2,shade[4],shade[3])
   mountain(out,x-41,y+5,shade[1],shade[3])
  else
   tree(out,x-38,y-1,shade[4]);tree(out,x-22,y+2,shade[1]);tree(out,x-31,y+11,shade[4])
  end
  landmark(out,x+18,y-3,theme)
  tree(out,x+44,y-3,shade[4])
  rectangle(out,x-47,y+18,5,3,shade[4]);rectangle(out,x+45,y+11,7,3,shade[4])
 end

 local function pin(out,point)
  local color=point.current and '#dc735b' or point.selected and '#ffdf91' or
    point.mode=='draft' and '#f4d8a4' or point.boss and '#8b4167' or point.pocketRole=='rare_pocket' and '#7872b7' or point.huntKind and '#996045' or point.visited and '#397972' or '#526671'
  local size=(point.current or point.selected or point.major or point.boss) and 7 or point.huntKind and 5 or 4
  local x,y=point.x,point.y
  polygon(out,{{x,y-size-2},{x+size+2,y},{x,y+size+2},{x-size-2,y}},'#273f4b')
  polygon(out,{{x,y-size},{x+size,y},{x,y+size},{x-size,y}},color)
  if point.visited or point.current or point.huntKind=='elite' then rectangle(out,x-1,y-1,3,3,'#f7e8ae') end
 end

 local function route_mode(edge,from,to)
  if edge.windowStart and from.voyage and from.voyage.kind=='trolley' then return 'rail'
  elseif edge.boatSeconds or edge.windowStart then return 'boat'
  elseif from.voyage and from.voyage.kind=='ferry' and from.voyage.source==edge.to then return 'cancel'
  elseif edge.nightTotem then return 'night'
  elseif edge.phaseSeconds then return 'phase'
  elseif edge.waterwaySeconds then return 'water'
  elseif edge.spiritwayTrack then return 'spiritway'
  elseif edge.wallTrack then return 'wall'
  elseif edge.windLift then return 'air'
  elseif edge.liftSeconds then return 'lift'
  elseif from.voyage and from.voyage.destination==edge.to or to.voyage then
   local vehicle=from.voyage or to.voyage
   if vehicle.kind=='train' or vehicle.kind=='trolley' then return 'rail' end
   return vehicle.kind=='ferry' and 'boat' or 'arrival'
  elseif edge.requiresArrival then return 'arrival'
  elseif edge.wind then return 'wind'
  elseif from.swim and to.swim then return 'swim' end
  return 'walk'
 end
 local route_labels = {boat='舟・寄港',water='水路',swim='遊泳',lift='昇降機',air='風の流れ',wall='壁伝い',spiritway='スピリットウェイ',phase='位相門',night='黒曜石の柱',rail='鉄道',arrival='乗り物',wind='吹雪待ち',cancel='航海を中止',walk='徒歩'}
 local route_colors = {boat='#ebf4db',water='#c2f1ec',lift='#f4ca8a',air='#a6e3cf',wall='#eabb75',spiritway='#f0d3ff',phase='#eebcfa',night='#d5a0f5',arrival='#ebf4db',
                       rail='#f2d293',wind='#f5ebcc',cancel='#b9b5a2',walk='#506054',swim='#c2f1ec'}

 local function direct_motion(mode)
  return mode=='walk' or mode=='swim'
 end

 local function automatic_arrival(node,edge)
  return node.voyage and node.voyage.destination==edge.to or nil
 end

 local function connections(node)
  if not node.voyage then return node.exits end
  local to=node.voyage.destination
  for _,edge in ipairs(node.exits) do if edge.to==to then return node.exits end end
  local exits={table.unpack(node.exits)}
  exits[#exits+1]={to=to}
  return exits
 end

 local function parallel_gate_hint(edge,node)
  if not edge.x then return end
  local left,right=edge.x,edge.x
  for _,other in ipairs(node.exits) do
   if other.to==edge.to and other.x then
    left,right=math.min(left,other.x),math.max(right,other.x)
   end
  end
  if left==right then return end
  local side=edge.x==left and '左側の門' or edge.x==right and '右側の門' or '中央の門'
  return edge.rideLabel and side..'・'..edge.rideLabel or side
 end

 local function route_hint(edge,node,destination)
  local voyage=node.voyage
  local instruction=edge.darkOnly and '灯りを消して足場を出す'
    or edge.wind and '風が止むまで待つ'
    or edge.windowStart and (('出発から%s〜%s秒の間に%s'):format(edge.windowStart,edge.windowEnd,
      voyage.kind=='trolley' and '途中下車' or '途中下船'))
    or edge.resumeSeconds and ('乗り直してから%g秒で到着'):format(destination.voyage.seconds-edge.resumeSeconds)
    or voyage and voyage.destination==edge.to and (
      voyage.kind=='ferry' and ('出航から'..voyage.seconds..'秒で着岸')
      or ('発車から'..voyage.seconds..'秒で到着')) or nil
  local parts={}
  if edge.y and (node.swim or node.toyDive) then parts[#parts+1]='門と同じ深さまで泳ぐ'
  elseif edge.y and edge.y<480 then parts[#parts+1]='上段の入口' end
  local gate=not automatic_arrival(node,edge) and (parallel_gate_hint(edge,node) or (not edge.windowStart and edge.rideLabel))
  if gate then parts[#parts+1]=gate end
  if instruction then parts[#parts+1]=instruction end
  local seconds=edge.liftSeconds or edge.waterwaySeconds or edge.boatSeconds or edge.phaseSeconds
  if seconds then parts[#parts+1]=('移動に%g秒'):format(seconds) end
  if #parts>0 then return table.concat(parts,'・') end
 end

 local function overview(out, options, current, nodes)
  sea(out,false)
  for x=45,w-30,45 do line(out,x,19,x,h-19,'#6ca4ad',1) end
  for y=30,h-20,45 do line(out,19,y,w-19,y,'#6ca4ad',1) end
  local coast={{105,286},{128,266},{164,253},{181,229},{230,245},{266,224},{276,203},
    {279,178},{312,170},{332,142},{365,144},{402,128},{441,110},{439,70},{468,43},
    {513,32},{560,43},{582,58},{598,98},{555,127},{559,153},{604,147},{636,177},
    {643,206},{623,236},{599,246},{562,245},{547,278},{525,310},{492,313},{484,344},
    {458,380},{437,393},{399,379},{369,380},{340,362},{303,370},{277,393},{240,377},
    {221,350},{169,363},{152,351},{109,355},{80,326},{92,304}}
  local lower={}
  for i,p in ipairs(coast) do lower[i]={p[1]+5,p[2]+9} end
  polygon(out,lower,'#649fa3')
  polygon(out,coast,'#dee1af')
  local rim={}
  for i,p in ipairs(coast) do rim[i]={p[1]*.978+8,p[2]*.968+8} end
  polygon(out,rim,'#a6c697')
  polygon(out,{{114,310},{178,268},{214,278},{223,304},{273,297},{326,311},{344,351},
                {291,361},{269,374},{224,358},{172,346},{135,341}},'#d9b27d')
  polygon(out,{{450,89},{484,53},{534,46},{569,71},{550,104},{517,121},{473,132}},'#cedee0')
  for x=192,580,32 do
   local y=244+29*math.sin(x*.021)
   tree(out,x,y,'#74936e')
  end
  for x=338,525,27 do mountain(out,x,290+(x%43),'#a19a86','#dbc3a0') end
  for x=462,548,22 do mountain(out,x,95+(x%21),'#93afb0','#eff2e0') end
  local main={}
  for _,option in ipairs(options) do
   local xy=regions[option.id].overview
   if xy[1] then
    main[#main+1]={id=option.id,name=option.name,x=xy[1],y=xy[2],
                  current=places[current]==option.id,major=true}
   end
  end
  for i,p in ipairs(main) do
   land(out,p.x,p.y,regions[p.id].theme,(i%3)*2)
   p.y=p.y+11
  end
  local regionLinks={}
  for id,node in pairs(nodes) do
   local origin=places[id]
   if regions[origin] and regions[origin].overview[1] then
    for _,edge in ipairs(connections(node)) do
     local target=places[edge.to]
     if target and target~=origin and nodes[edge.to] and regions[target].overview[1] then
      local mode=route_mode(edge,node,nodes[edge.to])
      local a,b=origin,target
      if a>b then a,b=b,a end
      regionLinks[a]=regionLinks[a] or {}
      if mode~='cancel' then
       local crossesSea=(a=='region-03' or b=='region-03')
       regionLinks[a][b]=regionLinks[a][b] or mode=='boat' or crossesSea
      end
     end
    end
   end
  end
  for i,a in ipairs(main) do
   local links=regionLinks[a.id] or {}
   for j=i+1,#main do
    local b=main[j]
    if links[b.id]~=nil then
     local ship=links[b.id]
     line(out,a.x,a.y,b.x,b.y,ship and '#f3f3be' or '#6c7c60',1.7,ship and {5,6} or nil)
    end
   end
  end
  for _,p in ipairs(main) do
   pin(out,p)
   local y=p.y+19
   local half=utf8.len(p.name)*9+9
   polygon(out,{{p.x-half-4,y-2},{p.x+half+4,y-2},{p.x+half,y+7},{p.x+half+4,y+19},
    {p.x-half-4,y+19},{p.x-half,y+7}},'#826f54')
   rectangle(out,p.x-half,y,2*half,17,p.current and '#f3c994' or '#e8d8ad')
   label(out,p.x,y+14,p.name,'#263f4d',17)
  end
  compass(out,w-73,83)
  line(out,36,h-45,137,h-45,'#d4e0cb',1)
  label(out,85,h-54,'テイワット','#254958',17)
  return main
 end

 local function terrain(out, points, theme, deep)
  sea(out,deep)
  if #points==0 then return end
  local palette=colors[theme]
  local cell=10
  for y=12,h-12,cell do
   for x=12,w-12,cell do
    local nearest=95^2
    for _,point in ipairs(points) do
     local d=(point.x-x)^2+(point.y-y)^2
     if d<nearest then nearest=d end
    end
    local wave=math.sin(x*.081+y*.018)+math.cos(y*.104-x*.047)
    local rim=60+9*wave
    if nearest<=rim^2 then
     local shade=nearest>(rim-7)^2 and palette[1] or nearest>(rim-15)^2 and '#d8c497'
      or wave>.24 and palette[3] or palette[2]
     if deep then shade=nearest>(rim-8)^2 and palette[1] or wave>.1 and '#73939b' or '#60828f' end
     rectangle(out,x-6,y-6,cell,cell,shade)
    end
   end
  end
  for i,point in ipairs(points) do
   if point.major and point.mode=='hub' then
    landmark(out,point.x-10,point.y-10,theme)
   elseif i%9==1 then
    if deep then
     polygon(out,{{point.x-17,point.y+6},{point.x-23,point.y-5},{point.x-13,point.y-2},
                  {point.x-9,point.y-17},{point.x-7,point.y+6}},palette[4])
    elseif theme=='stone' or theme=='snow' or theme=='cavern' or theme=='ember' then
     mountain(out,point.x+18,point.y-9,palette[4],palette[3])
    else tree(out,point.x-10,point.y-12,palette[4]) end
   end
   if i%11==0 then rectangle(out,point.x+22,point.y+8,5,2,palette[4]) end
  end
 end

 local function visible_options(nodes,visited)
  local out={}
  for _,region in ipairs(atlas.regions) do
   local count,total=0,0
   for _,point in ipairs(region.points) do
    if nodes[point.id] then
     total=total+1
     if visited[point.id] then count=count+1 end
    end
   end
   if total>0 then out[#out+1]={id=region.id,name=region.name,low=region.low,high=region.high,kind=region.kind,visited=count,total=total} end
  end
  return out
 end

 local function starting_gates(s,node,routeLevel)
  local gates={}
  if s.lift or s.story.node~=node.id then return gates end
  local actor=s.actors[s.active]
  for _,edge in ipairs(node.exits) do
   if edge.x and not edge.loopOnce then
    local distance=math.abs(actor.x-edge.x)+math.abs(actor.y-(edge.y or 480))
    local blocked=C.atlasGateRestriction(s,node.id,edge,routeLevel)~=nil
    local current=gates[edge.to]
    if not current or (current.blocked and not blocked) or (current.blocked==blocked and distance<current.distance) then
     gates[edge.to]={edge=edge,blocked=blocked,distance=distance}
    end
   end
  end
  return gates
 end

 local function travel_itinerary(s,nodes,origin,target)
  if origin==target then return {status='here',stops={}} end

  local function find(routeLevel,allowBlocked)
   local gates=starting_gates(s,nodes[origin],routeLevel)
   local queue, previous={origin},{[origin]=false}
   local head=1
   while head<=#queue and previous[target]==nil do
    local id=queue[head];head=head+1
    local node=nodes[id]
    for _,candidate in ipairs(connections(node)) do
     local edge=id==origin and gates[candidate.to] and gates[candidate.to].edge or candidate
     local nextNode=nodes[edge.to]
     if nextNode and previous[edge.to]==nil and not edge.loopOnce
       and (id==origin or not node.voyage or edge.to~=node.voyage.source) then
      local reason=C.atlasGateRestriction(s,id,edge,routeLevel)
      if allowBlocked or not reason then
       local mode=route_mode(edge,node,nextNode)
       local automatic=automatic_arrival(node,edge)
       local parallel=not automatic and parallel_gate_hint(edge,node)
       previous[edge.to]={from=id,id=edge.to,name=nextNode.name,region=places[edge.to],edge=edge,
        label=route_labels[mode],mode=mode,hint=route_hint(edge,node,nextNode),
        gateX=parallel and edge.x or nil,automaticArrival=automatic}
       queue[#queue+1]=edge.to
      end
     end
    end
   end
   if not previous[target] then return end
   local reverse,stops={},{}
   local id=target
   while id~=origin do
    local leg=previous[id]
    reverse[#reverse+1]=leg
    id=leg.from
   end
   local blocked
   for index=#reverse,1,-1 do
    local leg=reverse[index]
    leg.reason=C.atlasGateRestriction(s,leg.from,leg.edge)
    if not s.coop and leg.automaticArrival and leg.from==s.story.node and s.voyage and s.voyage.destination==leg.id then
     leg.secondsRemaining=math.max(0,s.voyage.arrives-s.t)
    end
    if leg.edge.x and not leg.automaticArrival then
     leg.previewX=leg.edge.x;leg.previewY=leg.edge.y
    end
    leg.level=nodes[leg.id].level
    leg.edge=nil
    stops[#stops+1]=leg
    blocked=blocked or leg.reason
   end
   return {status=blocked and 'blocked' or 'ready',stops=stops,reason=blocked,afterTransfer=s.lift~=nil}
  end
  local currentLevel=s.progression.level
  local ready=find(currentLevel)
  if ready then return ready end

  -- Find the first level where a route opens under the current quest conditions.
  local highest=currentLevel
  for _,node in pairs(nodes) do highest=math.max(highest,node.level) end
  if highest>currentLevel then
   local guide=find(highest)
   if guide then
    local low,high=currentLevel+1,highest
    while low<high do
     local level=math.floor((low+high)/2)
     local route=find(level)
     if route then
      high,guide=level,route
     else
      low=level+1
     end
    end
    guide.requiredLevel=high
    return guide
   end
  end
  return find(currentLevel,true)
 end

 local function battle_stop(nodes,from,to,returning,hint)
  return {from=from,id=to,name=nodes[to].name,region=places[to],mode='battle',hint=hint,
   label=returning and '戦闘中に帰還' or '戦闘中に移動'}
 end
 local function itinerary(s,nodes,target)
  local origin=s.lift and s.lift.destination or s.story.node
  if not nodes[origin] or not nodes[target] then return end
  if s.lift and origin==target then return {status='arriving',stops={},paused=not s.coop} end
  if origin==target then return {status='here',stops={}} end

  local source=C.atlasWeeklyTransfer(origin)
  local destination=C.atlasWeeklyTransfer(target)
  local fromBattle=source and source.innerNode==origin and nodes[source.node]
  local intoBattle=destination and destination.innerNode==target and nodes[destination.node]
  local entrance=intoBattle and destination.node or target
  local guide

  if not (fromBattle and entrance==source.node) then
   guide=travel_itinerary(s,nodes,origin,entrance)
  end
  -- Keep an actual retreat door if the destination can be reached that way.
  if not guide and fromBattle then
   guide=travel_itinerary(s,nodes,source.node,entrance)
   if guide then
    table.insert(guide.stops,1,battle_stop(nodes,origin,source.node,true,source.atlasTransfer.leave))
    guide.battle=true
   end
  end
  if not guide then return {status='unknown',stops={}} end
  if intoBattle then
   guide.stops[#guide.stops+1]=battle_stop(nodes,entrance,target,false,destination.atlasTransfer.enter)
   guide.battle=true
  end
  if guide.battle and guide.status~='blocked' then guide.status='battle' end
  return guide
 end

 local function local_map(out, region, nodes, s, map)
  local state=s.story
  local points, where = {}, {}
  if map.layer=='review' then
   for _,p in ipairs(region.draft) do
    local point={id=p.id,name=p.name,x=p.x,y=p.y,level=p.level,mode='draft',selected=p.id==map.selected,
      review=p.review,anchor=p.anchor,anchorX=p.anchorX,anchorY=p.anchorY}
    points[#points+1]=point
   end
  end
  for _,p in ipairs(region.points) do
   local node=nodes[p.id]
   if node and (map.layer=='all' or p.layer==map.layer or map.layer=='review' and p.entrancePending
      or map.layer=='boss' and (p.boss or p.id==state.node)
      or map.layer=='hunt' and (p.huntKind or p.huntLevels or p.id==state.node)) then
    local point={id=p.id,name=node.name,x=p.x,y=p.y,level=node.level,layer=p.layer,
      recommended=p.recommended,provisional=p.provisional,entrancePending=p.entrancePending,
      huntLevels=p.huntLevels,huntKind=p.huntKind,pocketRole=p.pocketRole,boss=p.boss,
      current=p.id==state.node,selected=p.id==map.selected,
      waypoint=node.waypoint~=nil,
      major=node.hub or node.waypoint and node.waypoint.kind=='statue',
      visited=state.visited[p.id],mode=node.hub and 'hub' or node.swim and 'water' or 'field'}
    where[p.id]=point
    points[#points+1]=point
   end
  end
  local terrain_points = points
  local approaches = {}
  if map.layer=='boss' then
   terrain_points={}
   for _,p in ipairs(region.points) do
    local node=nodes[p.id]
    if node then terrain_points[#terrain_points+1]={x=p.x,y=p.y,major=node.hub,mode=node.hub and 'hub'} end
   end
  elseif map.layer=='review' then
   terrain_points = {table.unpack(points)}
   for _,p in ipairs(points) do
    local anchor
    if p.anchor and nodes[p.anchor] then
     anchor={x=p.anchorX,y=p.anchorY}
    elseif p.entrancePending then
     local edge=nodes[p.id].exits[1]
     if edge and nodes[edge.to] and places[edge.to]==region.id then anchor=positions[edge.to] end
    end
    if anchor then
     terrain_points[#terrain_points+1]=anchor
     approaches[#approaches+1]={p,anchor}
    end
   end
  end
  local deep=map.layer=='water' or map.layer=='below' or map.layer=='hunt' and region.theme=='water'
  terrain(out,terrain_points,region.theme,deep)
  for _,pair in ipairs(approaches) do
   local point,anchor=table.unpack(pair)
   line(out,anchor.x,anchor.y,point.x,point.y,point.selected and '#ffef9c' or '#56664e',point.selected and 3 or 1.5,
     point.mode=='draft' and {3,6} or nil)
   rectangle(out,anchor.x-2,anchor.y-2,5,5,'#31555e')
  end
  local linked={}
  for _,point in ipairs(points) do
   local node=nodes[point.id]
   if node then
    for _,edge in ipairs(connections(node)) do
     local target=where[edge.to]
     if target and not (linked[edge.to] and linked[edge.to][point.id]) then
      local mode=route_mode(edge,node,nodes[edge.to])
      line(out,point.x,point.y,target.x,target.y,route_colors[mode],direct_motion(mode) and 1.5 or 2.5,
        (not direct_motion(mode) or edge.requires) and {4,4} or nil)
      linked[point.id]=linked[point.id] or {}
      linked[point.id][edge.to]=true
     end
    end
   end
  end
  local selected=where[map.selected] or where[state.node]
  if not selected and map.layer=='review' then
   for _,p in ipairs(points) do if p.id==map.selected then selected=p;break end end
  end
  local routes={}
  if selected and nodes[selected.id] then
   for _,edge in ipairs(connections(nodes[selected.id])) do
    if nodes[edge.to] then
     local pocketRole=positions[edge.to] and positions[edge.to].pocketRole
     routes[#routes+1]={previewX=not automatic_arrival(nodes[selected.id],edge) and edge.x or nil,previewY=edge.y,pocketRole=pocketRole,entryHeight=pocketRole and (edge.y or 480),id=edge.to,name=nodes[edge.to].name,region=places[edge.to],
       level=nodes[edge.to].level,label=route_labels[route_mode(edge,nodes[selected.id],nodes[edge.to])],
       visited=state.visited[edge.to] or false,
       huntKind=positions[edge.to] and positions[edge.to].huntKind,restricted=edge.requires~=nil,
       reason=C.atlasGateRestriction(s,selected.id,edge),hint=parallel_gate_hint(edge,nodes[selected.id]),
       automaticArrival=automatic_arrival(nodes[selected.id],edge)}
    end
   end
   local spec=C.atlasWeeklyTransfer(selected.id)
   if spec then
    local returning=selected.id==spec.innerNode
    local target=returning and spec.node or spec.innerNode
    selected.battleScene=returning
    if nodes[target] then
     routes[#routes+1]={id=target,name=nodes[target].name,region=places[target],level=nodes[target].level,
      visited=state.visited[target] or false,label=returning and '戦闘中に帰還' or '戦闘中に移動'}
    end
   end
  elseif selected and nodes[selected.anchor] then
   local anchor=nodes[selected.anchor]
   routes[1]={id=anchor.id,name=anchor.name,region=places[anchor.id],level=anchor.level,label='入口候補',draft=true}
  end
  local guide=selected and itinerary(s,nodes,selected.id)
  local stops=guide and guide.stops or {}
  local inaccessible=false
  for _,leg in ipairs(stops) do
   inaccessible=inaccessible or leg.reason~=nil
   local a,b=where[leg.from],where[leg.id]
   if (map.layer=='boss' or map.layer=='hunt') and places[leg.from]==region.id and places[leg.id]==region.id then
    a,b=positions[leg.from],positions[leg.id]
   end
   if a and b then
    local dash=(inaccessible or not direct_motion(leg.mode)) and {5,4} or nil
    line(out,a.x,a.y,b.x,b.y,'#33474a',5,dash)
    line(out,a.x,a.y,b.x,b.y,inaccessible and '#e6b4a1' or '#ffe196',2.6,dash)
   end
  end
  for _,point in ipairs(points) do
   if not point.current and not point.selected then pin(out,point) end
  end
  for _,point in ipairs(points) do
   if point.current or point.selected then
    pin(out,point)
    local x=math.max(115,math.min(w-115,point.x))
    if point.current and selected and selected.id~=point.id and math.abs(selected.y-point.y)<24
      and math.abs(selected.x-point.x)<180 then
     label(out,x,point.y+25,'現在地','#263f4d',14)
    else
     label(out,x,point.y-13,point.boss and point.boss.name or point.name,'#263f4d',14)
    end
   end
  end
  return points, selected, routes, guide
 end

 local function build(f,s,map)
  local nodes={}
  for _,node in ipairs(f.storyGraph.nodes) do nodes[node.id]=node end
  local options=visible_options(nodes,s.story.visited)
  local region=regions[map.region]
  if region then
   local legal=false
   for _,option in ipairs(options) do if option.id==region.id then legal=true;break end end
   if not legal then region=nil end
  end
  local result={width=w,height=h,region=region and region.id or 'world',layer=map.layer,
    options=options,draws={},revision=map.revision,location=nodes[f.story.node] and nodes[f.story.node].name,
    currentRegion=places[f.story.node],
    hasHunts=region and region.hasHunts or false}
  if region then
   result.points,result.selected,result.routes,result.guide=local_map(result.draws, region, nodes, s, map)
  else
   result.points=overview(result.draws,options,f.story.node,nodes)
   if map.layer=='boss' then
    result.bosses={}
    for _,p in ipairs(bosses) do
     local node=nodes[p.id]
     local area=regions[places[p.id]]
     if node then
      result.bosses[#result.bosses+1]={id=p.id,name=node.name,level=node.level,boss=p.boss,area=area.name}
     end
    end
   end
  end
  local phase=result.selected and nodes[result.selected.id] and nodes[result.selected.id].locationAfterReport
  if phase and s.story.quests[phase.quest] and s.story.quests[phase.quest].status=='complete' then
   result.selected.afterReport=true
  end
  for _,p in ipairs(bosses) do
   if nodes[p.id] and (not region or places[p.id]==region.id) then result.hasBosses=true;break end
  end
  return result
 end

 function C.action(s,key)
  if key=='world_map_toggle' then
   if s.worldMap then s.worldMap=nil
   elseif s.story and s.story.active and not s.growthTrial then
    s.worldMap={region=places[s.story.node] or 'world',layer='all',selected=s.story.node,revision=1}
   end
   return
  end
  local boss=key:match('^world_map_boss:([%w:_%-]+)$')
  if boss then
   if s.story and s.story.active and not s.growthTrial and positions[boss] and positions[boss].boss
      and C.atlasNodeVisible(s,boss) then
    local revision=s.worldMap and s.worldMap.revision+1 or 1
    s.worldMap={region=places[boss],layer='boss',selected=boss,revision=revision}
   end
   return
  end
  local focus=key:match('^world_map_focus:([%w:_%-]+)$')
  if focus then
   if s.story and s.story.active and not s.growthTrial and places[focus]
      and C.atlasNodeVisible(s,focus) then
    local revision=s.worldMap and s.worldMap.revision+1 or 1
    s.worldMap={region=places[focus],layer='all',selected=focus,revision=revision}
   end
   return
  end
  local map=s.worldMap
  if map then
   if key=='world_map_close' then s.worldMap=nil;return end
   local region=key:match('^world_map_region:([%w%-]+)$')
   local layer=key:match('^world_map_layer:([%a]+)$')
   local selected=key:match('^world_map_select:([%w:_%-]+)$')
   if key=='world_map_here' then
    map.region,map.layer,map.selected=places[s.story.node] or 'world','all',s.story.node
   elseif region and (region=='world' or regions[region]) then
    map.region,map.layer,map.selected=region,'all',nil
   elseif layer and (layer=='all' or layer=='surface' or layer=='below' or layer=='water' or layer=='review' or layer=='hunt' or layer=='boss') then
    map.layer,map.selected=layer,nil
   elseif selected then
    map.selected=selected
   else return end
   map.revision=map.revision+1
   map.view=nil
   return
  end
  return action(s,key)
 end
 function C.step(s,dt,input)
  if not s.worldMap or s.coop then return step(s,dt,s.worldMap and {} or input) end
 end
 function C.frame(s,...)
  local f=frame(s,...)
  local map=s.worldMap
  if map then
   local node,transfer=s.story.node,s.lift and s.lift.destination
   if map.view and (map.node~=node or map.transfer~=transfer or map.graphRevision~=f.storyGraphRevision) then
    map.revision=map.revision+1
    map.view=nil
   end
   if not map.view then
    map.view=build(f,s,map)
    map.node,map.transfer,map.graphRevision=node,transfer,f.storyGraphRevision
   end
   f.worldMap=map.view
  end
  return f
 end
end
