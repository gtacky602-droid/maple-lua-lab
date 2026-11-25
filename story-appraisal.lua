return function(C,canInspect)
 local appraisal={}

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function caption(draws,x,y,text,color)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,size=14,color=color or '#fff2bc'}
 end

 local function art(layer,id,x,y,height,mode,profile)
  C.drawFieldDisplayArt(layer,C.appraisalArt[id],x,y,height,mode,profile,false)
 end

 local function countCollected(items,gathered)
  local count=0
  for _,item in ipairs(items) do if gathered[item.id] then count=count+1 end end
  return count
 end

 function appraisal.interact(s,q,state,stage)
  local cfg,log=q.appraisal,state.appraisal
  if not log then return false end
  local a=s.actors[s.active]
  if stage=='gather' then
   for _,item in ipairs(cfg.items) do
    if not log.gathered[item.id] and canInspect(a,item) then
     log.gathered[item.id]=true
     s.storyNotice=item.name..'を拾いました。'
     return true,countCollected(cfg.items,log.gathered)==#cfg.items
    end
   end
  elseif stage=='measure' and canInspect(a,cfg.machine) then
   local item=cfg.items[log.measured+1]
   if not item then return false end
   log.measured=log.measured+1
   s.storyNotice=item.name..'。'..item.reading
   return true,log.measured==#cfg.items
  elseif stage=='sort' then
   local item=cfg.items[log.sorted+1]
   if not item then return false end
   for _,tray in ipairs(cfg.trays) do
    if canInspect(a,tray) then
     if tray.id~=item.use then
      s.storyNotice='イネファ「'..item.hint..'」'
      return true,false
     end
     log.sorted=log.sorted+1
     s.storyNotice=item.name..'を'..tray.name..'に置きました。'
     return true,log.sorted==#cfg.items
    end
   end
  end
  return false
 end

 local function nearby(s,f,item,label)
  if not s.paused and not f.storyNearbyMilestone and canInspect(s.actors[s.active],item) then
   f.storyNearbyMilestone={label=label}
  end
 end

 local function renderYard(s,f,layer,cfg,log,mode,profile)
  local draws=layer.draws
  for _,item in ipairs(cfg.items) do
   if not log.gathered[item.id] then
    local x=item.x-s.camera
    if x>=-32 and x<=992 then
     art(layer,item.id,x,item.y,30,mode,profile)
     caption(draws,x,item.y-46,item.name)
    end
    nearby(s,f,item,item.name..'を拾う')
   end
  end
 end

 local function renderWorkshop(s,f,layer,q,state,stage,mode,profile)
  local draws=layer.draws
  local cfg=q.appraisal
  local log=state and state.appraisal
  local machine=cfg.machine
  local mx=machine.x-s.camera
  if mx>=-100 and mx<=1060 then
   art(layer,'machine',mx,machine.y,112,mode,profile)
   caption(draws,mx,machine.y-127,'お宝判定機')
   if log and log.measured>0 and stage=='measure' then
    local tested=cfg.items[log.measured]
    art(layer,tested.id,mx+62,machine.y-3,30,mode,profile)
   end
  end
  if not log then return end
  if stage=='measure' then
   local nextItem=cfg.items[log.measured+1]
   if nextItem then nearby(s,f,machine,nextItem.name..'を測る') end
  elseif stage=='sort' then
   local item=cfg.items[log.sorted+1]
   if item then
    for _,tray in ipairs(cfg.trays) do nearby(s,f,tray,item.name..'を'..tray.name..'へ置く') end
   end
  end
  if log.measured==#cfg.items then
   for _,tray in ipairs(cfg.trays) do
    local x=tray.x-s.camera
    if x>=-52 and x<=1012 then
     rect(draws,x-35,tray.y-16,70,5,'#b89267')
     rect(draws,x-30,tray.y-11,60,11,'#534650')
     caption(draws,x,tray.y-59,tray.name)
     for i=1,log.sorted do
      local item=cfg.items[i]
      if item.use==tray.id and (state.count<q.goal or item.id~=cfg.lamp.part) then
       art(layer,item.id,x,tray.y-16,30,mode,profile)
      end
     end
    end
   end
  end
  if state.count>=q.goal then
   local lamp=cfg.lamp
   local x=lamp.x-s.camera
   if x>=-66 and x<=1026 then
    art(layer,'lamp',x,lamp.y,68,mode,profile)
    caption(draws,x,lamp.y-88,'月形板の小灯り','#ffe8a0')
   end
  end
 end

 function appraisal.observe(s,f,layer,q,state,milestone,mode,profile)
  local cfg=q.appraisal
  local stage=milestone and milestone.appraisalStage
  if s.story.node==q.hub then renderWorkshop(s,f,layer,q,state,stage,mode,profile) end
  if not state or not state.appraisal then return end
  local log=state.appraisal
  local n=#cfg.items
  local collected=countCollected(cfg.items,log.gathered)
  if s.story.node==cfg.yard and stage=='gather' then renderYard(s,f,layer,cfg,log,mode,profile) end
  local current=stage=='sort' and cfg.items[log.sorted+1] or nil
  local measured=log.measured>0 and cfg.items[log.measured] or nil
  local message
  if s.story.node==cfg.yard and stage=='gather' then
   message='拾った部品 '..collected..' / '..n
  elseif s.story.node==q.hub then
   if current then message=current.name..' ｜ '..current.reading
   elseif stage=='measure' then message='測定 '..log.measured..' / '..n..(measured and ' ｜ '..measured.reading or '')
   elseif state.count>=q.goal then message='月形板の小灯り ｜ 持ち主が気に入っています'
   elseif stage=='gather' and collected<n then message='右の回収場で部品を拾う '..collected..' / '..n end
  end
  f.storyAppraisal={stage=stage,collected=collected,measured=log.measured,sorted=log.sorted,
    item=current and current.id,lamp=state.count>=q.goal,message=message}
 end

 return appraisal
end
