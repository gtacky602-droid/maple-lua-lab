return function(C)
 local roof={}
 local objectives={
  [0]='まず低い屋根へ跳び、赤い目印を調べよう。',
  [1]='ひとつ上の屋根で青い目印を調べよう。',
  [2]='風の輪のそばまで行き、Gで風車へ上がろう。',
  [3]='黄色い目印が飛んだ。アンバー「次の風の輪なら安全に上がれるよ！」',
  [4]='城門広場でアンバーに報告しよう。展望台への近道も開いた。'
 }

 local function course(q,node)
  return node==q.target or node==q.roof.lookout
 end

 local function attempt(s,state)
  return s.roofTrial or state
 end

 local function near(s,item)
  local a=s.actors[s.active]
  return a.hp>0 and a.ground and math.abs(a.x-item.x)<52 and math.abs(a.y-item.y)<25
 end

 function roof.enter(s,q,node)
  s.roofFlight=nil
  s.roofNotice=nil
  s.roofSafe={}
  if not course(q,node) then s.roofTrial=nil end
 end

 local function site(s,q,state)
  if not state or not state.roof or s.paused or s.roofFlight then return end
  local spec=q.roof
  local run=attempt(s,state)
  if s.story.node==q.target then
   local mark=spec.marks[run.count+1]
   if mark and near(s,mark) then return mark,'mark' end
   for _,draft in ipairs(spec.drafts) do
    if run.count>=draft.requires and near(s,draft) then return draft,'draft' end
   end
   if state.count==q.goal and not s.roofTrial and near(s,spec.retry) then return spec.retry,'retry' end
  elseif s.story.node==spec.lookout and run.count==q.goal-1 and near(s,spec.finish) then
   return spec.finish,'finish'
  end
 end

 function roof.interact(s,q,state)
  local item,kind=site(s,q,state)
  if not item then return false end
  local run=attempt(s,state)
  if kind=='draft' then
   local a=s.actors[s.active]
   s.roofFlight={fromX=a.x,fromY=a.y,toX=item.toX,toY=item.toY,elapsed=0}
   a.ground=false;a.vy=0;a.walk=0
   s.roofNotice='風の輪がゆっくり体を持ち上げてくれる。'
  elseif kind=='retry' then
   s.roofTrial={count=0,roof={ticks=0,falls=0}}
   s.roofNotice=objectives[0]
  elseif kind=='mark' then
   run.count=run.count+1
   s.roofNotice=objectives[run.count]
  else
   local ticks=math.max(1,run.roof.ticks)
   state.roof.bestTicks=math.min(state.roof.bestTicks or ticks,ticks)
   if s.roofTrial then s.roofTrial=nil
   else state.count=q.goal;state.roof.ticks=ticks end
   s.roofNotice='アンバー「あそこも、その向こうも、もう君が通ってきた場所だよ！」'
  end
  return true
 end

 local function camera(s)
  s.camera=math.max(0,math.min(s.actors[s.active].x-400,s.worldwidth-960))
 end

 local function countTicks(s,state,dt)
  if not state or not state.roof then return end
  local run=attempt(s,state)
  if run.count<4 then
   run.roof.ticks=math.min(10^9,run.roof.ticks+math.floor(dt*60+.5))
  end
 end

 function roof.travel(s,q,state,dt)
  if s.paused then return end
  local ride,a=s.roofFlight,s.actors[s.active]
  local duration=q.roof.flightSeconds
  ride.elapsed=math.min(duration,ride.elapsed+dt)
  local p=ride.elapsed/duration
  local t=p*p*(3-2*p)
  a.x=ride.fromX+(ride.toX-ride.fromX)*t
  a.y=ride.fromY+(ride.toY-ride.fromY)*t-28*math.sin(math.pi*p)
  s.t=s.t+dt
  countTicks(s,state,dt)
  if p>=1 then
   a.x=ride.toX;a.y=ride.toY;a.ground=true;a.vy=0;a.drop=0;a.coyote=0;a.buffer=0
   s.roofSafe[a.id]={x=a.x,y=a.y}
   s.roofFlight=nil
   s.roofNotice=objectives[attempt(s,state).count]
  end
  camera(s)
 end

 function roof.update(s,q,state,dt)
  if not state or not state.roof or s.paused or not course(q,s.story.node) then return end
  countTicks(s,state,dt)
  if s.story.node~=q.target then return end
  for _,a in ipairs(s.actors) do
   if a.ground and a.hp>0 then
    local check=s.roofSafe[a.id]
    if check and a.y==480 and a.x>113 then
     a.x=check.x;a.y=check.y;a.vy=0;a.drop=0;a.buffer=0;a.walk=0
     if a.id==s.active then
      local run=attempt(s,state)
      if run.count<q.goal then run.roof.falls=math.min(10^9,run.roof.falls+1) end
      s.roofNotice='落下したので、直前の足場に戻った。'
      camera(s)
     end
    elseif a.y<480 then
     for _,p in ipairs(s.platforms) do
      if not p.temporary and a.y==p.y and a.x>=p.x and a.x<=p.x+p.w then
       s.roofSafe[a.id]={x=math.max(p.x+20,math.min(p.x+p.w-20,a.x)),y=p.y}
       break
      end
     end
    else
     s.roofSafe[a.id]=nil
    end
   end
  end
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=math.floor(x),y=math.floor(y),w=w,h=h,color=color}
 end

 local function label(draws,x,y,text)
  draws[#draws+1]={kind='text',x=x,y=y,text=text,size=14,color='#fff1c5'}
 end

 local function pennant(draws,x,y,color)
  rect(draws,x-2,y-28,4,28,'#745447')
  rect(draws,x+2,y-28,20,9,color)
  rect(draws,x+2,y-19,13,5,color)
 end

 local function wind(draws,item,s)
  local x=item.x-s.camera
  for i=0,5 do
   local rise=(i*13+s.t*43)%76
   local width=24+i*6
   rect(draws,x-width/2,item.y-6-rise,width,3,i%2==0 and '#a4eedc' or '#e5fff0')
  end
  label(draws,x,item.y-92,'上昇気流')
 end

 function roof.observe(s,f,draws,q,state)
  if not state or not state.roof or not course(q,s.story.node) then return end
  local run=attempt(s,state)
  local spec=q.roof
  local mark,markerX,markerY
  if s.story.node==q.target then
   local colors={'#ed6870','#5fa8e5','#edc35f'}
   for i,item in ipairs(spec.marks) do
    if i==run.count+1 then
     mark=item
     pennant(draws,item.x-s.camera,item.y,colors[i])
    elseif i<=run.count and i<3 then
     pennant(draws,item.x-s.camera,item.y,'#96ae81')
    end
   end
   for _,item in ipairs(spec.drafts) do if run.count>=item.requires then wind(draws,item,s) end end
   if run.count==3 then
    local t=s.t*2%1
    local x=spec.marks[3].x+(spec.drafts[2].toX-spec.marks[3].x)*t
    rect(draws,x-s.camera,102-42*math.sin(math.pi*t),12,5,'#f3c653')
   end
  else
   local item=spec.finish
   if run.count==3 then
    mark=item
    pennant(draws,item.x-s.camera,item.y,'#edc35f')
   end
  end
  if mark then
   markerX,markerY=mark.x-s.camera,mark.y-43
   label(draws,markerX,markerY,s.story.node==q.target and '巡回の目印' or '飛ばされた目印')
  end
  local item=site(s,q,state)
  if item then f.storyNearbyRoof={label=item.label} end
  local message=s.roofNotice or (state.status=='complete' and not s.roofTrial and '城門・草地・丘が見える。') or objectives[run.count]
  if run.count<q.goal then
   message=message..' ｜ '..math.floor(run.roof.ticks/60)..'秒'
  end
  f.storyRoof={stage=run.count,message=message,flight=s.roofFlight~=nil,falls=run.roof.falls,retry=s.roofTrial~=nil}
 end
 return roof
end
