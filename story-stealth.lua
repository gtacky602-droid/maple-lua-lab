return function(C,canInspect)
 local stealth={}

 local function current(q,state)
  return state and state.status=='active' and q.itinerary[state.count+1] or nil
 end

 local function canMark(s,step)
  local a=s.actors[s.active]
  return a.ground and canInspect(a,step)
 end

 local function patrol(s,watch)
  local phase=(s.t-s.storyEnteredAt+watch.offset)/watch.period*math.pi*2
  return watch.x+math.sin(phase)*watch.roam,math.cos(phase)>=0 and 1 or -1
 end

 local function concealed(a,cover)
  return a.x>=cover.x and a.x<=cover.x+cover.w and math.abs(a.y-cover.y)<=30
 end

 local function sight(s,step)
  local a,guard=s.actors[s.active],step.stealthGuard
  local x,dir=patrol(s,guard)
  local distance=(a.x-x)*dir
  local hidden=concealed(a,step.cover)
  local seen=not hidden and math.abs(a.y-step.y)<42 and distance>=0 and distance<=guard.range
  return x,dir,hidden,seen
 end

 function stealth.clear(s)
  for i=#(s.solids or {}),1,-1 do
   if s.solids[i].sayuFence then table.remove(s.solids,i) end
  end
  s.sayuHeat,s.sayuHatch=0,nil
 end

 function stealth.enter(s,spec,state)
  stealth.clear(s)
  if not spec or state and state.count>=spec.opensAt then return end
  local fence=spec.fence
  s.solids=s.solids or {}
  s.solids[#s.solids+1]={x=fence.x,y=0,w=18,h=481,sayuFence=true}
 end

 function stealth.collect(s,q,state)
  local step=current(q,state)
  if not step or not canMark(s,step) then return end
  if step.kind=='stealthCheck' then
   if state.stealthEncounter=='engaged' then
    s.storyNotice='見回り役との戦闘が終わってから、確認点を調べましょう。'
    return true
   end
   if not state.stealthEncounter and not concealed(s.actors[s.active],step.cover) then
    s.storyNotice=step.cover.name..'に身を隠してから、印を確かめよう。'
    return true
   end
   if state.stealthEncounter=='cleared' then s.enemies={} end
   state.stealthEncounter=nil
   s.sayuHeat=0
   return true,step
  elseif step.kind=='stealthHatch' then
   if not s.sayuHatch then
    s.sayuHatch={started=s.t}
    s.storyNotice='早柚「ここは私が通る。葉が向こうに抜けたら、柵が上がるよ。」'
   end
   return true
  end
 end

 function stealth.alert(s,step,state,dt,input)
  if not step.stealthGuard or state.stealthEncounter or dt<=0 then return end
  local x,_,_,seen=sight(s,step)
  local actor=s.actors[s.active]
  s.sayuHeat=math.max(0,s.sayuHeat+(seen and dt or -2.1*dt))
  local attacked=input.attack and math.abs(actor.x-x)<110 and math.abs(actor.y-step.y)<42
  if s.sayuHeat<step.stealthGuard.notice and not attacked then return end
  state.stealthEncounter='engaged'
  s.storyNotice='見回り役に気づかれました。退ければ、この場所から巡回を続けられます。'
  return x
 end

 function stealth.defeat(s,q,state,enemy)
  local step=current(q,state)
  if step and state.stealthEncounter=='engaged' and step.stealthGuard
     and step.stealthGuard.id==enemy.spawnId then
   state.stealthEncounter='cleared'
   enemy.respawn=math.huge
   s.storyNotice='見回り役は退きました。確認点を調べて巡回を続けましょう。'
  end
 end

 function stealth.fence(s,spec,state)
  if not state or state.count<spec.opensAt then
   for _,a in ipairs(s.actors) do a.x=math.min(a.x,spec.fence.x-12) end
   s.camera=math.max(0,math.min(s.actors[s.active].x-400,s.worldwidth-960))
  end
 end

 function stealth.finishHatch(s,spec,q,state)
  if s.sayuHatch and s.t>=s.sayuHatch.started+spec.seconds then
   stealth.clear(s)
   return q.itinerary[state.count+1]
  end
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function label(draws,x,y,value)
  local w=14*utf8.len(value)+16
  if x>=w/2 and x<=960-w/2 then
   rect(draws,x-w/2,y-17,w,22,'#243133ed')
   draws[#draws+1]={kind='text',x=x,y=y,text=value,size=14,color='#fff0cc'}
  end
 end

 local function artFrame(draws,f)
  return {draws=draws,rectIndex=f.rectIndex,rectBatches=f.rectBatches}
 end

 local function art(draws,id,x,y,h,mode,profile,f)
  local sprite=C.stealthArt[id]
  local half=h*sprite.box[3]/sprite.box[4]/2
  if x+half>=0 and x-half<=960 then
   C.drawFieldDisplayArt(artFrame(draws,f),sprite,x,y,h,mode,profile,false)
  end
 end

 local function packingFor(s,f,mode)
  if mode~='rect' or not s.packRectArt then return f end
  f.rectBatches=f.rectBatches or {}
  return {rectBatches=f.rectBatches,rectIndex={}}
 end

 function stealth.observe(s,f,draws,q,state,spec,mode,profile)
  local packing=packingFor(s,f,mode)
  local step=current(q,state)
  local open=state and state.count>=spec.opensAt
  local fence=spec.fence
  local progress=s.sayuHatch and math.min(1,(s.t-s.sayuHatch.started)/spec.seconds) or 0
  local lift=open and 125 or math.max(0,progress-.66)*125/.34
  local gateX=fence.x-s.camera
  if gateX>=-75 and gateX<=1035 then
   for _,side in ipairs({-1,1}) do
    rect(draws,gateX+side*56-4,fence.y-249,8,249,'#594b37')
    rect(draws,gateX+side*56-2,fence.y-246,2,243,'#b99861')
   end
   rect(draws,gateX-62,fence.y-250,124,7,'#776042')
  end
  art(draws,'gate',gateX,fence.y-lift,121,mode,profile,packing)
  if not state or state.count==0 then return end
  for _,entry in ipairs(q.itinerary) do
   if entry.cover then
    local cover=entry.cover
    local isHidden=entry==step and concealed(s.actors[s.active],cover)
    local layer=isHidden and cover.front and f.draws or draws
    art(layer,cover.art,cover.x+cover.w/2-s.camera,cover.y,cover.height,mode,profile,packing)
    if entry==step then rect(draws,cover.x-s.camera,cover.y-3,cover.w,3,isHidden and '#b9efd0' or '#68aa9bab') end
   end
  end
  if step and step.stealthGuard then
   local guard=step.stealthGuard
   local worldX,dir,hidden,seen=sight(s,step)
   local x,y=worldX-s.camera,step.y
   local heat=math.min(1,s.sayuHeat/guard.notice)
   local quiet=state.stealthEncounter==nil
   if quiet and x>=-guard.range and x<=960+guard.range then
    local color=seen and '#ffd193' or '#f2dc8c88'
    for i=0,7 do
     local distance=19+guard.range/8*i
     rect(draws,x+dir*distance-5,y-5,10,3,color)
    end
    local artInfo=C.enemyArtLayout[guard.art]
    C.drawFieldDisplayArt(artFrame(draws,packing),C.enemyIdleArt[guard.art],x,y,artInfo.height,mode,profile,dir>0)
    label(draws,x,y-99,dir>0 and '見回り  ›' or '‹  見回り')
    if x>=-29 and x<=989 then
     rect(draws,x-25,y-87,50,5,'#272a44')
     if heat>0 then rect(draws,x-25,y-87,50*heat,5,'#ffe0a3') end
    end
   end
   local near=canMark(s,step)
   local cx=step.x-s.camera
   art(draws,'leaf',cx,step.y-72,23,mode,profile,packing)
   label(draws,cx,step.y-142,step.name)
   if near and not s.paused and (state.stealthEncounter=='cleared' or hidden and not state.stealthEncounter) and not f.storyNearbyMilestone then
    f.storyNearbyMilestone={label=step.action}
   end
   local mode,message
   if state.stealthEncounter=='engaged' then mode,message='combat','見回り役を退けると巡回を再開できます。'
   elseif state.stealthEncounter=='cleared' then mode,message='cleared','見回り役は退きました。Gで確認点を調べます。'
   elseif hidden then mode,message='cover',step.cover.name..'に隠れています。'
   elseif seen then mode,message='watched','見回り役の視線に入っています。足元の点線と隠れ場所を確認します。'
   else mode,message='route',step.approach end
   f.storyStealth={mode=mode,message=message,heat=math.floor(heat*100+.5),watchX=worldX,facing=dir}
  elseif step and step.kind=='stealthHatch' then
   local x=step.x-s.camera
   if s.sayuHatch then
    art(f.draws,'leaf',x+(fence.x-step.x+44)*progress,step.y-8-math.sin(progress*math.pi)*11,22,mode,profile,packing)
    f.storyStealth={mode='hatch',message='早柚が狭い抜け穴をくぐって、裏から柵を開けます。'}
   else
    art(draws,'cave',x,step.y,35,mode,profile,packing)
    label(draws,x,step.y-104,step.name)
    if not s.paused and not f.storyNearbyMilestone and canMark(s,step) then
     f.storyNearbyMilestone={label=step.action}
    end
    f.storyStealth={mode='hatch-ready',message='抜け穴で早柚に声をかけて、柵の裏へ回ってもらいます。'}
   end
  elseif open then
   f.storyStealth={mode='open',message='裏の柵が開き、城下の広場への近道が使えます。'}
  end
 end

 function stealth.nap(s,f,draws,q,state,mode,profile)
  if state and state.count>=q.goal-1 then
   local step=q.itinerary[q.goal]
   local x=step.x-s.camera
   art(draws,'nap',x,step.y,43,mode,profile,packingFor(s,f,mode))
   label(draws,x,step.y-94,'早柚の昼寝場所')
   if state.status=='complete' and not f.storyNearbyMilestone and not s.paused and canMark(s,step) then
    f.storyNearbyMilestone={label='木の実のそばのお礼をもう一度読む'}
   end
  end
 end

 return stealth
end
