return function(C, atlas)
 local action, step, frame = C.action, C.step, C.frame
 local regions, places = {}, {}
 for _,region in ipairs(atlas.regions) do
  regions[region.id] = region
  for _,point in ipairs(region.points) do places[point.id] = region.id end
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
  house(out,x+18,y-3)
  tree(out,x+38,y-3,shade[4])
  rectangle(out,x-47,y+18,5,3,shade[4]);rectangle(out,x+45,y+11,7,3,shade[4])
 end

 local function pin(out,point)
  local color=point.current and '#dc735b' or point.selected and '#ffdf91' or
    point.mode=='draft' and '#f4d8a4' or point.visited and '#397972' or '#526671'
  local size=(point.current or point.selected or point.major) and 7 or 4
  local x,y=point.x,point.y
  polygon(out,{{x,y-size-2},{x+size+2,y},{x,y+size+2},{x-size-2,y}},'#273f4b')
  polygon(out,{{x,y-size},{x+size,y},{x,y+size},{x-size,y}},color)
  if point.visited or point.current then rectangle(out,x-1,y-1,3,3,'#f7e8ae') end
 end

 local function overview(out, options, current)
  sea(out,false)
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
  for i=2,#main do
   local a,b=main[i-1],main[i]
   local voyage=a.id=='region-03' or b.id=='region-03' or b.id=='region-07'
   line(out,a.x,a.y,b.x,b.y,voyage and '#f3f3be' or '#6c7c60',1.7,voyage and {5,6} or nil)
  end
  for _,p in ipairs(main) do
   pin(out,p)
   label(out,p.x,p.y+34,p.name,'#263f4d',19)
  end
  rectangle(out,35,h-57,104,1,'#d4e0cb')
  label(out,87,h-44,'テイワット','#254958',16)
  return main
 end

 local function terrain(out, points, theme, deep)
  sea(out,deep)
  if #points==0 then return end
  local palette=colors[theme]
  local cell=12
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
   if i%9==1 then
    if point.major then house(out,point.x-13,point.y-6)
    elseif theme=='stone' or theme=='snow' or theme=='cavern' then
     mountain(out,point.x+18,point.y-9,palette[4],palette[3])
    else tree(out,point.x-10,point.y-12,palette[4]) end
   end
   if i%11==0 then rectangle(out,point.x+22,point.y+8,5,2,palette[4]) end
  end
 end

 local function route_mode(edge)
  if edge.boatSeconds or edge.windowStart then return 'boat'
  elseif edge.waterwaySeconds then return 'water'
  elseif edge.liftSeconds then return 'lift'
  elseif edge.requiresArrival then return 'arrival'
  elseif edge.wind then return 'wind' end
  return 'walk'
 end
 local route_labels = {boat='舟・寄港',water='水路',lift='昇降機',arrival='乗り物',wind='吹雪待ち',walk='徒歩'}
 local route_colors = {boat='#ebf4db',water='#c2f1ec',lift='#f4ca8a',arrival='#ebf4db',
                       wind='#f5ebcc',walk='#506054'}

 local function visible_options(nodes)
  local out={}
  for _,region in ipairs(atlas.regions) do
   local seen=false
   for _,point in ipairs(region.points) do
    if nodes[point.id] then seen=true;break end
   end
   if seen then out[#out+1]={id=region.id,name=region.name,low=region.low,high=region.high,kind=region.kind} end
  end
  return out
 end

 local function local_map(out, region, nodes, state, map)
  local points, where = {}, {}
  if map.layer=='review' then
   for _,p in ipairs(region.draft) do
    local point={id=p.id,name=p.name,x=p.x,y=p.y,level=p.level,mode='draft',selected=p.id==map.selected,
      review=p.review,anchor=p.anchor,anchorX=p.anchorX,anchorY=p.anchorY}
    points[#points+1]=point
   end
  else
   for _,p in ipairs(region.points) do
    local node=nodes[p.id]
    if node and (map.layer=='all' or p.layer==map.layer) then
     local point={id=p.id,name=node.name,x=p.x,y=p.y,level=node.level,layer=p.layer,
       recommended=p.recommended,current=p.id==state.node,selected=p.id==map.selected,
       major=node.hub or node.waypoint and node.waypoint.kind=='statue',
       visited=state.visited[p.id],mode=node.hub and 'hub' or node.swim and 'water' or 'field'}
     where[p.id]=point
     points[#points+1]=point
    end
   end
  end
  terrain(out,points,region.theme,map.layer=='water' or map.layer=='below')
  if map.layer=='review' then
   for _,p in ipairs(points) do
    if p.anchor and nodes[p.anchor] then
     line(out,p.anchorX,p.anchorY,p.x,p.y,p.selected and '#ffef9c' or '#c1be94',p.selected and 3 or 1.5,{3,6})
     rectangle(out,p.anchorX-2,p.anchorY-2,5,5,'#31555e')
    end
   end
  end
  local linked={}
  for _,point in ipairs(points) do
   local node=nodes[point.id]
   if node then
    for _,edge in ipairs(node.exits) do
     local target=where[edge.to]
     if target and not (linked[edge.to] and linked[edge.to][point.id]) then
      local mode=route_mode(edge)
      line(out,point.x,point.y,target.x,target.y,route_colors[mode],mode=='walk' and 1.5 or 2.5,
        (mode~='walk' or edge.requires) and {4,4} or nil)
      linked[point.id]=linked[point.id] or {}
      linked[point.id][edge.to]=true
     end
    end
   end
  end
  for _,point in ipairs(points) do
   pin(out,point)
   if point.current or point.selected then label(out,point.x,point.y-13,point.name,'#223f4a',14) end
  end
  local selected=where[map.selected] or where[state.node]
  if not selected and map.layer=='review' then
   for _,p in ipairs(points) do if p.id==map.selected then selected=p;break end end
  end
  local routes={}
  if selected and nodes[selected.id] then
   for _,edge in ipairs(nodes[selected.id].exits) do
    if nodes[edge.to] then
     routes[#routes+1]={id=edge.to,name=nodes[edge.to].name,region=places[edge.to],
       level=nodes[edge.to].level,label=route_labels[route_mode(edge)],restricted=edge.requires~=nil}
    end
   end
  elseif selected and nodes[selected.anchor] then
   local anchor=nodes[selected.anchor]
   routes[1]={id=anchor.id,name=anchor.name,region=places[anchor.id],level=anchor.level,label='入口候補',draft=true}
  end
  return points, selected, routes
 end

 local function build(f,map)
  local nodes={}
  for _,node in ipairs(f.storyGraph.nodes) do nodes[node.id]=node end
  local options=visible_options(nodes)
  local region=regions[map.region]
  if region then
   local legal=false
   for _,option in ipairs(options) do if option.id==region.id then legal=true;break end end
   if not legal then region=nil end
  end
  local result={width=w,height=h,region=region and region.id or 'world',layer=map.layer,
    options=options,draws={},revision=map.revision,location=nodes[f.story.node] and nodes[f.story.node].name,
    currentRegion=places[f.story.node]}
  if region then
   result.points,result.selected,result.routes=local_map(result.draws, region, nodes, f.story, map)
  else result.points=overview(result.draws,options,f.story.node) end
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
   elseif layer and (layer=='all' or layer=='surface' or layer=='below' or layer=='water' or layer=='review') then
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
 function C.step(s,...)
  if not s.worldMap then return step(s,...) end
 end
 function C.frame(s,...)
  local f=frame(s,...)
  if s.worldMap then
   s.worldMap.view=s.worldMap.view or build(f,s.worldMap)
   f.worldMap=s.worldMap.view
  end
  return f
 end
end
