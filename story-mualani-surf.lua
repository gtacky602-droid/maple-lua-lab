return function(C,canInspect)
 local surf={}
 local function clamp(x,low,high) return math.max(low,math.min(x,high)) end

 local function settle(s,x,y)
  local actor=s.actors[s.active]
  actor.x,actor.y,actor.vy,actor.walk,actor.ground=x,y,0,0,true
  actor.buffer,actor.dash,actor.drop,actor.glide=0,0,0,0
  s.camera=clamp(x-460,0,math.max(0,s.worldwidth-960))
 end

 local function stop(s,x)
  s.surfRound=nil
  settle(s,x,480)
  local other=s.actors[3-s.active]
  other.x,other.y,other.vy,other.ground=math.max(20,x-46),480,0,true
 end

 function surf.enter(s)
  s.surfRound,s.surfChaseAt,s.surfResult=nil,nil,nil
 end

 local function canPlay(s,spec,state)
  return state and state.count>=(spec.kind=='run' and 1 or 3)
     and canInspect(s.actors[s.active],{x=spec.station,y=480})
 end

 function surf.interact(s,node,q,state)
  local spec=node.surfGame
  local round=s.surfRound
  if round then
   stop(s,spec.station)
   s.storyNotice=spec.kind=='run' and 'ボードを降りて浅瀬へ戻りました。' or '返球遊びを終えました。'
   return true
  end
  if spec and canPlay(s,spec,state) then
   s.surfResult=nil
   s.surfRound={kind=spec.kind,elapsed=0,retries=0}
   if spec.kind=='run' then
    local run=s.surfRound
    run.bank,run.vy,run.rings,run.count=spec.start,0,{},0
    settle(s,spec.start,spec.surface)
    if state.count==1 then return true,q.itinerary[2] end
    s.storyNotice='左右で進み、ジャンプで波を越えます。'
   else
    settle(s,spec.landing-32,480)
    s.storyNotice='近くに来たボールを打ち返そう。黄色い「返球！」が見えたら打ち返せます。'
   end
   return true
  end
  if s.story.node==q.hub and state and state.status=='complete'
      and canInspect(s.actors[s.active],q.surfMemento) then
   s.storyNotice='水しぶきの波札。ムアラニとコホラ竜と遊んだ記念です。'
   return true
  end
  return false
 end

 function surf.action(s,key)
  if s.paused then return end
  local round=s.surfRound
  if key=='jump' and round.kind=='run' then round.hop=true end
  if key=='story_surf_hit' and round.kind=='cove' then round.hit=true end
 end

 local function waveX(wave,time)
  return wave.x+math.sin(time*math.pi*2/wave.period)*wave.drift
 end

 local function ballAt(spec,time)
  local p=clamp(time/spec.lobSeconds,0,1)
  local x=spec.animal+(spec.landing-spec.animal)*p
  local y=spec.waterline-42-4*95*p*(1-p)
  return x,y
 end

 local function canReturn(spec,round,actor)
  local x=ballAt(spec,round.elapsed)
  return round.elapsed>=spec.lobSeconds*.74 and round.elapsed<=spec.lobSeconds+.18 and math.abs(x-actor.x)<=52
 end

 local function runStep(s,spec,round,actor,dt,dx)
  local oldX=actor.x
  local x=clamp(oldX+dx*spec.speed*dt,spec.start-47,spec.finish)
  if round.hop and actor.y>=spec.surface and round.vy>=0 then round.vy=-spec.hop end
  round.hop=false
  round.vy=round.vy+spec.gravity*dt
  local y=math.min(spec.surface,actor.y+round.vy*dt)
  if y>=spec.surface then round.vy=0 end
  for _,wave in ipairs(spec.waves) do
   if math.abs(x-waveX(wave,round.elapsed))<wave.width/2 and y>spec.surface-wave.height then
    round.retries=round.retries+1
    round.vy=0
    settle(s,round.bank,spec.surface)
    s.storyNotice='波にさらわれたので、近い浅瀬へ戻りました。ジャンプで越えてみましょう。'
    return false
   end
  end
  actor.x,actor.y,actor.ground=x,y,y==spec.surface
  if x>=spec.early then round.bank=spec.early end
  for i,ring in ipairs(spec.rings) do
   if not round.rings[i] and math.abs(x-ring.x)<34 and math.abs(y-ring.y)<33 then
    round.rings[i],round.count=true,round.count+1
   end
  end
  return x>=spec.finish
 end

 function surf.step(s,dt,input,node,q,state)
  if s.paused then return end
  local spec,round,actor=node.surfGame,s.surfRound,s.actors[s.active]
  dt=clamp(dt,0,1/30)
  s.t=s.t+dt
  round.elapsed=round.elapsed+dt
  local dx=(input.right and 1 or 0)-(input.left and 1 or 0)
  if dx~=0 then actor.dir=dx end
  if round.kind=='run' then
   if runStep(s,spec,round,actor,dt,dx) then
    s.surfResult={kind='run',rings=round.count,retries=round.retries}
    stop(s,spec.finish)
    if state.count==2 then
     s.surfChaseAt=s.t
     return q.itinerary[3]
    end
    s.storyNotice='練習瀬の右の浜に着きました。右の小道から入り江に戻れます。'
   end
  else
   actor.x=clamp(actor.x+dx*225*dt,spec.minX,spec.maxX)
   if round.hit then
    round.hit=false
    if canReturn(spec,round,actor) then
     local x,y=ballAt(spec,round.elapsed)
     s.surfResult={kind='cove',started=s.t,x=x,y=y,retries=round.retries}
     stop(s,actor.x)
     if state.count==3 then return q.itinerary[4] end
     s.storyNotice='コホラ竜がボールを受け取りました。もう一回？'
     return
    end
    s.storyNotice='まだ届きません。落ちてくるボールの近くで返球しましょう。'
   end
   if round.elapsed>=spec.lobSeconds+.18+spec.waitSeconds then
    round.retries=round.retries+1
    round.elapsed=0
    s.storyNotice='コホラ竜が拾って投げ直します。'
   end
  end
  s.camera=clamp(actor.x-460,0,math.max(0,s.worldwidth-960))
 end

 function surf.observe(f,s,window,node,q,state,mode,profile)
  if not state then return end
  local props=C.mualaniSurfArt
  local draws=window.draws
  local function art(id,x,y,h,flip)
   local sprite=props[id]
   local half=h*sprite.box[3]/sprite.box[4]/2
   x=x-s.camera
   if x+half>=0 and x-half<=960 then C.drawFieldDisplayArt(window,sprite,x,y,h,mode,profile,flip) end
  end
  local function label(x,y,text)
   x=x-s.camera
   if x>=-65 and x<=1025 then draws[#draws+1]={kind='text',x=x,y=y,text=text,size=14,color='#fff1c3'} end
  end
  local function nearby(label_)
   if not s.paused and not f.storyNearbyMilestone then f.storyNearbyMilestone={label=label_} end
  end
  local spec,result,round=node.surfGame,s.surfResult,s.surfRound
  if not spec then
   local m=q.surfMemento
   if state.status=='complete' then
    art('charm',m.x+33,m.y,43)
    label(m.x+33,m.y-54,m.name)
    if canInspect(s.actors[s.active],m) then nearby('水しぶきの波札を見る') end
   elseif state.count==0 then
    art('board',m.x,m.y,29)
    label(m.x,m.y-45,'ムアラニとの待ち合わせ')
   end
   return
  end
  local actor=s.actors[s.active]
  local view={course=spec.kind,phase=round and round.kind or 'idle',message=s.storyNotice}
  if spec.kind=='run' then
   art('board',round and actor.x or spec.station,round and actor.y+11 or 480,22,round and actor.dir<0)
   for i,ring in ipairs(spec.rings) do
    local passed=round and round.rings[i]
    if not passed then art('hoop',ring.x,ring.y+10,92) end
   end
   local elapsed=round and round.elapsed or 0
   for _,wave in ipairs(spec.waves) do art('wave',waveX(wave,elapsed),spec.surface+8,wave.height+8) end
   label(spec.finish,421,'練習瀬の終点')
   if s.surfChaseAt then
    local t=s.t-s.surfChaseAt
    local x=spec.finish-12+t*170
    if x<=1573 then
     art('saurian',x,480+math.sin(t*9)*4,62,true)
     art('ball',x+35,446,24)
    end
   end
   if round then
    view.rings,view.ringTotal,view.retries=round.count,#spec.rings,round.retries
    nearby('ボードを降りて浅瀬へ戻る')
   elseif canPlay(s,spec,state) then
    nearby(state.count==1 and '練習ボードに乗る' or '練習ボードをもう一度借りる')
   end
  else
   art('saurian',spec.animal,480+math.sin(s.t*3)*2,76)
   label(spec.animal,388,'友だちのコホラ竜')
   local x,y=spec.animal-38,443
   if round then
    x,y=ballAt(spec,round.elapsed)
    view.ready=canReturn(spec,round,actor)
    view.ball={x=x,y=y}
    if view.ready then label(x,y-29,'返球！') end
    nearby('返球遊びをやめる')
   elseif result then
    local t=clamp((s.t-result.started)/.67,0,1)
    x=result.x+(spec.animal-38-result.x)*t
    y=result.y+(443-result.y)*t-236*t*(1-t)
   end
   art('ball',x,y+15,30)
   if not round and canPlay(s,spec,state) then
    nearby(state.count==3 and 'コホラ竜と返球遊びを始める' or 'もう一回、返球遊びを始める')
   end
  end
  view.result=result and result.kind
  f.storySurf=view
 end
 return surf
end
