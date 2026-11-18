return function(C,canInspect)
 local model={}
 local heights={table=125,shelfHigh=131,shelfLow=58,desk=75,windowOut=145,windowIn=145}

 local function setting(spec,field,id)
  for _,option in ipairs(spec.options[field] or {}) do
   if option.id==id then return option end
  end
 end

 local function stationAt(spec,id)
  for _,station in ipairs(spec.stations) do if station.id==id then return station end end
 end

 local function layout(spec,record)
  local shelf=setting(spec,'shelf',record.shelf)
  local seat=setting(spec,'seat',record.seat)
  local window=setting(spec,'window',record.window)
  local view=not shelf.obstructsView
  local clear=not (seat.closeToWindow and window.requiresClearance)
  local visited=0
  for _,station in ipairs(spec.stations) do if record.visited[station.id] then visited=visited+1 end end
  local issues={}
  if visited<#spec.stations then issues[#issues+1]='駒で入口・棚・席・窓を巡りましょう。' end
  if not view then issues[#issues+1]='高い棚が窓を隠しています。' end
  if shelf.capacity<spec.minimumStorage then issues[#issues+1]='低い棚だけでは本をしまう場所が足りません。' end
  if not clear then issues[#issues+1]='開いた戸が机に当たります。席か窓の向きを変えましょう。' end
  local props={}
  if shelf.highX then props[#props+1]={key='shelfHigh',x=shelf.highX,y=480,label='高い本棚'} end
  if shelf.lowX then props[#props+1]={key='shelfLow',x=shelf.lowX,y=480,label='低い本棚'} end
  props[#props+1]={key='desk',x=seat.x,y=480,label='閲覧席',flip=seat.flip==true}
  props[#props+1]={key=window.art,x=1040,y=399,label='森を望む窓'}
  return {storage=shelf.capacity,required=spec.minimumStorage,view=view,clear=clear,visited=visited,total=#spec.stations,
          ready=#issues==0,feedback=#issues==0 and 'この配置なら本を置けて、席から窓も開けられます。' or table.concat(issues,' '),props=props}
 end

 local function board(s,q,state)
  local step=state and state.status=='active' and q.itinerary[state.count+1]
  if step and step.modelBoard and s.story.active and not s.paused and step.node==s.story.node
      and canInspect(s.actors[s.active],step) then return step end
 end

 function model.open(s,q,state)
  if not board(s,q,state) then return end
  if not state.roomLayout then
   local spec=q.readingModel
   state.roomLayout={station=spec.start,visited={[spec.start]=true},shelf=spec.defaults.shelf,
       seat=spec.defaults.seat,window=spec.defaults.window}
  end
  s.kavehModelOpen=true
 end

 function model.action(s,q,state,key)
  if key=='story_model_close' then s.kavehModelOpen=nil;return end
  local step=s.kavehModelOpen and board(s,q,state)
  if not step then return end
  local record,spec=state.roomLayout,q.readingModel
  if key=='story_model_confirm' then
   if layout(spec,record).ready then s.kavehModelOpen=nil;return step end
   return
  end
  local here=stationAt(spec,record.station)
  local dest=key:match('^story_model_move:([%a]+)$')
  if dest then
   for _,id in ipairs(here.links) do
    if dest==id then record.station=id;record.visited[id]=true;return end
   end
  end
  local field,id=key:match('^story_model_set:([%a]+):([%a%-]+)$')
  if field and here.field==field and setting(spec,field,id) then record[field]=id end
 end

 local function display(f,s,prop,mode,profile)
  local h=heights[prop.key]
  local sprite=C.kavehRoomArt[prop.key]
  local x,w=prop.x-s.camera,h*sprite.box[3]/sprite.box[4]
  if x+w/2>=0 and x-w/2<=960 then
   C.drawFieldDisplayArt(f,sprite,x,prop.y,h,mode,profile,prop.flip)
  end
 end

 local function nearby(s,props)
  local actor=s.actors[s.active]
  local candidate,distance=nil,55
  for _,prop in ipairs(props) do
   local dx=math.abs(actor.x-prop.x)
   if dx<distance and canInspect(actor,{x=prop.x,y=480}) then candidate,distance=prop,dx end
  end
  return candidate
 end

 function model.read(s,q,state)
  if not state or state.status~='complete' then return false end
  local result=layout(q.readingModel,state.roomLayout)
  local prop=nearby(s,result.props)
  if not prop then return false end
  if prop.key=='desk' then
   local option=setting(q.readingModel,'seat',state.roomLayout.seat)
   s.storyNotice='閲覧席には「'..option.label..'」という模型の案が使われています。'
  elseif prop.key:match('^window') then
   local option=setting(q.readingModel,'window',state.roomLayout.window)
   s.storyNotice='窓の仕様は「'..option.label..'」。棚越しに森の枝が見えます。'
  else s.storyNotice='壁沿いの棚と低い棚で、収納を'..result.storage..'枠確保しました。' end
  return true
 end

 function model.observe(f,s,node,q,state,mode,profile)
  if not state then return end
  if node.readingRoom then
   if state.status~='complete' then return end
   local result=layout(q.readingModel,state.roomLayout)
   for _,prop in ipairs(result.props) do display(f,s,prop,mode,profile) end
   local prop=not s.paused and nearby(s,result.props)
   if prop and not f.storyNearbyMilestone then f.storyNearbyMilestone={label=prop.label..'を調べる'} end
   f.storyKavehRoom={shelf=state.roomLayout.shelf,seat=state.roomLayout.seat,window=state.roomLayout.window,
       storage=result.storage,message=s.storyNotice or '模型で選んだ棚・席・窓の配置です。'}
   return
  end
  local desk=q.itinerary[1]
  display(f,s,{key='table',x=desk.x,y=desk.y},mode,profile)
  f.storyKavehRoom={message=s.storyNotice}
  if not s.kavehModelOpen or not board(s,q,state) then return end
  local spec,record=q.readingModel,state.roomLayout
  local here=stationAt(spec,record.station)
  local result=layout(spec,record)
  local parts={}
  for _,prop in ipairs(result.props) do
   local sprite=C.kavehRoomArt[prop.key]
   parts[#parts+1]={key=prop.key,x=prop.x,flip=prop.flip,source=sprite.source,box=sprite.box}
  end
  f.storyKavehModel={here=here,stations=spec.stations,seen=record.visited,parts=parts,
      choices=here.field and spec.options[here.field],selected=here.field and record[here.field],result=result}
 end

 return model
end
