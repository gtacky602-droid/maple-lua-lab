return function(C,canInspect)
 local springs={}
 local function clamp(x,lo,hi) return math.max(lo,math.min(x,hi)) end

 local function camera(s)
  s.camera=clamp(s.actors[s.active].x-435,0,math.max(0,s.worldwidth-960))
 end

 local function place(s,x,y)
  local a=s.actors[s.active]
  a.x,a.y,a.vy,a.walk,a.ground=x,y,0,0,true
  a.buffer,a.dash,a.drop,a.glide=0,0,0,0
  camera(s)
 end

 local function stop(s,x,y)
  s.springRun=nil
  place(s,x,y)
  local partner=s.actors[3-s.active]
  partner.x,partner.y,partner.vy,partner.ground=math.max(20,x-36),y,0,true
 end

 function springs.enter(s)
  s.springRun,s.springPanel,s.springResult=nil,nil,nil
 end

 local function completeLayout(spec,layout)
  if not layout then return false end
  for _,section in ipairs(spec.sections) do if not spec.types[layout[section.id]] then return false end end
  return true
 end

 local function layoutKey(spec,layout)
  local key={}
  for _,section in ipairs(spec.sections) do key[#key+1]=layout[section.id] end
  return table.concat(key,'-')
 end

 function springs.interact(s,q,state)
  if not state or state.count==0 then return false end
  local spec,a,run=q.springCourse,s.actors[s.active],s.springRun
  if run then
   local point=run.sample or spec.start
   stop(s,point.x,point.y)
   s.storyNotice=run.sample and '踏み台から降りました。' or '試走を終えてスタート地点に戻りました。'
   return true
  end
  if s.story.node==spec.lab then
   for _,sample in ipairs(spec.samples) do
    if canInspect(a,sample) then
     s.springRun={sample=sample,peak=sample.y,vy=0}
     place(s,sample.x,sample.y)
     s.storyNotice='ジャンプで跳ね上がり方を試します。'
     return true
    end
   end
   if state.count>=2 and canInspect(a,spec.bench) then
    s.springPanel=true
    return true
   end
  elseif s.story.node==spec.course and state.count>=3 and canInspect(a,spec.start) then
   s.springRun={section=1,vy=0,ticks=0,retries=0}
   s.springResult=nil
   place(s,spec.start.x,spec.start.y)
   s.storyNotice='踏み台の上でジャンプし、右の足場に着地します。'
   return true
  end
  return false
 end

 function springs.panelAction(s,q,state,key)
  if key=='story_spring_close' or key=='story_collect' then s.springPanel=nil;return end
  if s.paused or not state or state.count<2 or s.story.node~=q.springCourse.lab
      or not canInspect(s.actors[s.active],q.springCourse.bench) then return end
  local spec,record=q.springCourse,state.springRecord
  local slot,type_=key:match('^story_spring_pick:(%a+):(%a+)$')
  if slot and spec.types[type_] then
   for _,section in ipairs(spec.sections) do
    if section.id==slot then
     if not record.draft then
      record.draft={}
      for _,part in ipairs(spec.sections) do record.draft[part.id]=record.layout and record.layout[part.id] end
     end
     record.draft[slot]=type_
     return
    end
   end
  end
  if key=='story_spring_confirm' then
   local draft=record.draft or record.layout
   if not completeLayout(spec,draft) then return end
   record.layout=draft
   record.draft=nil
   s.springPanel=nil
   if state.count==2 then return q.itinerary[3] end
   s.storyNotice='今の配置を保存しました。'
  end
 end

 function springs.jump(s) s.springRun.hop=true end

 local function sampleStep(s,dt,q,state,run)
  local spec,a,p=q.springCourse,s.actors[s.active],run.sample
  if run.hop and not run.air then run.vy=-spec.types[p.id].speed;run.air=true end
  run.hop=false
  if not run.air then return end
  run.vy=run.vy+spec.gravity*dt
  a.y=math.min(p.y,a.y+run.vy*dt);a.ground=a.y==p.y
  run.peak=math.min(run.peak,a.y)
  if not a.ground then return end
  local rise=math.floor(p.y-run.peak+.5)
  state.springRecord=state.springRecord or {samples={}}
  local samples=state.springRecord.samples
  samples[p.id]=rise
  stop(s,p.x,p.y)
  s.springResult={kind='sample',id=p.id,rise=rise}
  s.storyNotice=spec.types[p.id].label..'の跳ね上がりを測りました。'
  if state.count==1 and samples.high and samples.low then return q.itinerary[2] end
 end

 local function recover(s,run,section,message)
  run.air,run.vy=nil,0
  run.retries=run.retries+1
  place(s,math.max(section.fromX+10,section.launch.x-36),section.launch.y)
  s.storyNotice=message..' 直前の踏み台へ戻りました。'
 end

 local function lapStep(s,dt,input,q,state,run)
  local a,spec=s.actors[s.active],q.springCourse
  local section=spec.sections[run.section]
  local dx=(input.right and 1 or 0)-(input.left and 1 or 0)
  if dx~=0 then a.dir=dx end
  a.walk=not run.air and dx or 0
  run.ticks=math.min(360000,run.ticks+dt*60)
  if not section then
   a.x=clamp(a.x+dx*spec.speed*dt,spec.sections[#spec.sections].left,spec.finish.x)
   if a.x<spec.finish.x then return end
   local record=state.springRecord
   local key=layoutKey(spec,record.layout)
   local ticks=math.max(1,math.floor(run.ticks+.5))
   record.best=record.best or {}
   local previous=record.best[key]
   record.best[key]=previous and math.min(previous,ticks) or ticks
   s.springResult={kind='lap',ticks=ticks,best=record.best[key],retries=run.retries}
   stop(s,spec.finish.x,spec.finish.y)
   if state.count==3 then return q.itinerary[4] end
   s.storyNotice=(not previous or ticks<previous) and '最速記録を更新しました。' or '試走を終えました。'
   return
  end
  if run.hop and not run.air then
   if math.abs(a.x-section.launch.x)<=36 then
    run.vy=-spec.types[state.springRecord.layout[section.id]].speed
    run.air=true
   else s.storyNotice='色のついた踏み台の上でジャンプします。' end
  end
  run.hop=false
  local x=clamp(a.x+dx*spec.speed*dt,section.fromX+8,section.right-6)
  if not run.air then
   if x>section.edgeX then recover(s,run,section,'踏み台の先で足を踏み外しました。')
   else a.x=x end
   return
  end
  local oldY=a.y
  run.vy=run.vy+spec.gravity*dt
  local y=a.y+run.vy*dt
  local roof=section.roof
  if roof and x>=roof.left and x<=roof.right and y-spec.bodyClearance<roof.bottom then
   recover(s,run,section,'高く跳ぶと緩衝材に当たります。低い型なら天井の下を通れます。')
   return
  end
  if run.vy>=0 and x>=section.left and x<=section.right and oldY<=section.landY and y>=section.landY then
   run.section,run.air,run.vy=run.section+1,nil,0
   place(s,x,section.landY)
  elseif y>section.launch.y+32 then
   recover(s,run,section,'次の足場に届きませんでした。')
  else a.x,a.y,a.ground=x,y,false end
 end

 function springs.step(s,dt,input,q,state)
  if s.paused then return end
  dt=clamp(dt,0,1/30)
  s.t=s.t+dt
  local run=s.springRun
  local milestone
  if run.sample then milestone=sampleStep(s,dt,q,state,run)
  else milestone=lapStep(s,dt,input,q,state,run) end
  camera(s)
  return milestone
 end

 function springs.observe(f,s,world,node,q,state,mode,profile)
  if not state then return end
  local spec,props,record=q.springCourse,C.springCourseArt,state.springRecord
  local draws=world.draws
  local function art(id,x,y,height,width)
   local sprite=props[id]
   x=x-s.camera
   local w=height*sprite.box[3]/sprite.box[4]
   if width then height=height*width/w;w=width end
   if x+w/2>=0 and x-w/2<=960 then C.drawFieldDisplayArt(world,sprite,x,y,height,mode,profile) end
  end
  local function text(x,y,label,color)
   x=x-s.camera
   if x>=-70 and x<=1030 then draws[#draws+1]={kind='text',x=x,y=y,text=label,color=color or '#fff0b7',size=14} end
  end
  local function pad(kind,point)
   local t=spec.types[kind]
   art(kind,point.x,point.y,t.height)
  end
  local run,a=s.springRun,s.actors[s.active]
  local function nearby(label)
   if not s.paused and not f.storyNearbyMilestone then f.storyNearbyMilestone={label=label} end
  end
  local view={venue=node.springVenue,phase=run and (run.sample and 'sample' or 'lap') or 'idle',
              message=s.storyNotice,result=s.springResult,paused=s.paused}
  if node.id==spec.lab then
   for _,sample in ipairs(spec.samples) do
    local name=spec.types[sample.id].label
    pad(sample.id,sample)
    text(sample.x,sample.y-spec.types[sample.id].height-16,name)
    if not run and canInspect(a,sample) then nearby(name..'を試す') end
   end
   art('bench',spec.bench.x,spec.bench.y,95)
   text(spec.bench.x,spec.bench.y-106,'配置を決める設計台')
   if state.count>=2 and not run and canInspect(a,spec.bench) then nearby(s.springPanel and '設計台を閉じる' or '三つの踏み台を組み替える') end
   view.samples=record and record.samples
   if s.springPanel then
    local draft=record.draft or record.layout
    view.panel=true
    view.sections,view.layout,view.ready=spec.sections,draft,completeLayout(spec,draft)
   end
  elseif node.id==spec.course and record and record.layout then
   for i,section in ipairs(spec.sections) do
    local point,choice=section.launch,record.layout[section.id]
    pad(choice,point)
    if section.roof then
     local roof=section.roof
     art('roof',(roof.left+roof.right)/2,roof.bottom,32,roof.right-roof.left)
    end
    text(point.x,point.y-spec.types[choice].height-13,section.label,run and run.section==i and '#ffd184' or nil)
   end
   art('timer',spec.start.x-58,spec.start.y,64)
   art('flag',spec.finish.x,spec.finish.y,83)
   view.best=record.best and record.best[layoutKey(spec,record.layout)]
   if run then view.section=run.section;view.retries=run.retries
   elseif canInspect(a,spec.start) then nearby('試走を始める') end
  else
   if state.count==0 then art('timer',q.itinerary[1].x,480,64) end
   return
  end
  if run then nearby(run.sample and '踏み台から降りる' or '試走をやめる') end
  f.storySpringCourse=view
 end
 return springs
end
