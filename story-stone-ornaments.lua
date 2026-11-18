return function(C,canInspect)
 local charms={}

 local function find(options,id)
  for _,option in ipairs(options) do
   if option.id==id then return option end
  end
 end

 function charms.open(s,q,state)
  local spec=q.stoneOrnaments
  if not state.stonePair then
   state.stonePair={color=spec.colors[1].id,pattern=spec.patterns[1].id}
  end
  s.stonePairOpen='craft'
 end

 function charms.read(s,q,state)
  if s.story.node==q.hub and state and state.stonePair and state.count==q.goal and canInspect(s.actors[s.active],q.stoneOrnaments.bench) then
   s.stonePairOpen='read'
   return true
  end
  return false
 end

 function charms.action(s,q,state,command,id)
  if command=='close' then s.stonePairOpen=nil;return end
  if s.stonePairOpen~='craft' or s.paused or not state or state.status~='active' then return end
  local step=q.itinerary[state.count+1]
  if not step or not step.stonePairBoard or step.node~=s.story.node or not canInspect(s.actors[s.active],step) then return end
  local spec=q.stoneOrnaments
  if command=='color' and find(spec.colors,id) then state.stonePair.color=id
  elseif command=='pattern' and find(spec.patterns,id) then state.stonePair.pattern=id
  elseif command=='confirm' then
   s.stonePairOpen=nil
   return step
  end
 end

 local function pair(spec,record,x,y,scale,add)
  local colors=find(spec.colors,record.color)
  local pattern=find(spec.patterns,record.pattern)
  for i,owner in ipairs({'旅人','カチーナ'}) do
   local cx=x+(i==1 and -38 or 38)*scale
   add('pendant',cx,y,68*scale,owner)
   for j,point in ipairs(pattern.points) do
    add(colors.stones[i==1 and j or 4-j],cx+point[1]*scale,y+point[2]*scale,15*scale)
   end
  end
 end

 function charms.observe(f,s,draws,q,state,mode,profile)
  if not state then return end
  local spec,record=q.stoneOrnaments,state.stonePair
  local props=C.stoneOrnamentArt
  local world={draws=draws}
  local count=state.count
  local ready=record and count==q.goal
  local function art(key,x,y,h)
   local sprite=props[key] or C.companionArt[key]
   local half=h*sprite.box[3]/sprite.box[4]/2
   x=x-s.camera
   if x+half>=0 and x-half<=960 then
    C.drawFieldDisplayArt(world,sprite,x,y,h,mode,profile)
   end
  end
  local function label(x,y,message)
   x=x-s.camera
   if x>=-80 and x<=1040 then
    draws[#draws+1]={kind='text',x=x,y=y,text=message,size=14,color='#fff0b9'}
   end
  end
  local function kachina(x,y)
   if s.companion~='kachina' then
    art('kachina',x,y,66)
    label(x,y-74,'カチーナ')
   end
  end

  if s.story.node==q.target then
   local first,outcrop=q.itinerary[2],q.itinerary[5]
   if count<2 then
    art('teal',first.x,first.y,24)
    label(first.x,first.y-33,first.name)
   end
   if count==2 then
    local high=spec.shelf
    kachina(high.x-42,high.y)
    art('purple',high.x+20,high.y,23)
   elseif count==3 then
    local point=spec.handoff
    kachina(point.x,point.y)
    art('purple',point.x+39,point.y-12,25)
   end
   art('outcrop',outcrop.x,outcrop.y,96)
   if count==4 then
    art('amber',outcrop.x+59,outcrop.y,22)
    label(outcrop.x,outcrop.y-107,outcrop.name)
   end
   return
  end

  local bench=spec.bench
  art('table',bench.x,bench.y,79)
  if count==0 or count>=5 then kachina(bench.x-98,bench.y) end
  if count==0 or count==5 then
   label(bench.x,bench.y-93,'石飾りの作業台')
  elseif ready then
   pair(spec,record,bench.x,bench.y-63,.57,art)
   label(bench.x,bench.y-115,'二人分の石飾り')
   if not f.storyNearbyMilestone and not s.paused and canInspect(s.actors[s.active],bench) then
    f.storyNearbyMilestone={label=s.stonePairOpen and '石飾りを閉じる' or '完成した石飾りを見る'}
   end
  end
  if not s.stonePairOpen or not record then return end
  local items={}
  pair(spec,record,210,116,1.65,function(key,x,y,h,owner)
   local sprite=props[key]
   items[#items+1]={source=sprite.source,box=sprite.box,x=x,y=y,h=h,owner=owner}
  end)
  f.storyStonePair={panel=s.stonePairOpen,color=record.color,pattern=record.pattern,colors=spec.colors,
                    patterns=spec.patterns,items=items,paused=s.paused}
 end

 return charms
end
