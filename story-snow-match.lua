return function(C,canInspect)
 local match={}
 local cream='#faf6dc'
 local oldCanAttack=C.canAttack

 function C.canAttack(s)
  return not (s.story and s.story.active and s.snowMatchVenue)
     and (not oldCanAttack or oldCanAttack(s))
 end

 local function atBell(s,spec)
  return spec and not s.snowballRound and not s.paused and canInspect(s.actors[s.active],{x=spec.bell,y=spec.y})
 end

 function match.start(s,spec,state)
  if not state or state.count<2 or (state.count>2 and state.status~='complete') or not atBell(s,spec) then return false end
  s.snowballRound={started=s.t,nextWarn=s.t+2.1,nextThrow=s.t,turn=0,score={0,0},balls={},flags={},
    blocked=0,ownHits=0,flagHits=0,feints=0,hostX=spec.hostX}
  s.auto=false
  s.storyNotice='雪合戦を始めました。Jで投げ、雪壁と岩棚を使って立ち回りましょう。'
  local a=s.actors[s.active]
  a.x,a.y,a.vy,a.dir,a.ground=spec.playerX,spec.y,0,1,true
  return true
 end

 local function launch(round,owner,x,y,vx,vy)
  round.balls[#round.balls+1]={owner=owner,x=x,y=y,vx=vx,vy=vy,remaining=2.6}
 end

 function match.throw(s)
  local r=s.snowballRound
  if s.paused or not r or s.t<r.nextThrow then return end
  local a=s.actors[s.active]
  launch(r,1,a.x+a.dir*20,a.y-36,a.dir*448,0)
  r.nextThrow=s.t+.54
 end

 local function span(x,dx,low,high)
  if math.abs(dx)<1e-9 then
   if x>=low and x<=high then return -math.huge,math.huge end
   return math.huge,-math.huge
  end
  local a,b=(low-x)/dx,(high-x)/dx
  return math.min(a,b),math.max(a,b)
 end

 local function segment(ball,dx,dy,box)
  local a,b=span(ball.x,dx,box.x-4,box.x+box.w+4)
  local c,d=span(ball.y,dy,box.y-4,box.y+box.h+4)
  local start=math.max(0,a,c)
  if start<=math.min(1,b,d) then return start end
 end

 local function contact(s,spec,r,ball,dx,dy)
  local first,kind,id=math.huge
  local function test(box,candidate,index)
   local t=segment(ball,dx,dy,box)
   if t and t<first then first,kind,id=t,candidate,index end
  end
  if not r.collapsed then
   for _,wall in ipairs(spec.walls) do test(wall,'wall') end
  end
  for i,flag in ipairs(spec.flags) do
   if not r.flags[i] then test({x=flag.x-7,y=flag.y-56,w=35,h=29},'flag',i) end
  end
  local a=ball.owner==1 and {x=r.hostX,y=spec.hostY} or s.actors[s.active]
  test({x=a.x-19,y=a.y-73,w=38,h=66},'person')
  return kind,id
 end

 local function balls(s,spec,r,dt)
  for i=#r.balls,1,-1 do
   local ball=r.balls[i]
   local dx,dy=ball.vx*dt,ball.vy*dt
   local kind,id=contact(s,spec,r,ball,dx,dy)
   ball.x,ball.y,ball.remaining=ball.x+dx,ball.y+dy,ball.remaining-dt
   if kind=='wall' then
    r.blocked=r.blocked+1
    r.note='雪壁が投球を防いだ'
   elseif kind then
    r.score[ball.owner]=math.min(spec.score,r.score[ball.owner]+1)
    r.lastPoint={owner=ball.owner,x=ball.x,y=ball.y,at=s.t}
    if kind=='flag' then
     r.flags[id]=ball.owner
     if ball.owner==1 then r.flagHits=r.flagHits+1 end
     r.note='旗に命中、1点'
    else
     if ball.owner==1 then r.ownHits=r.ownHits+1 end
     r.snowed={owner=3-ball.owner,untilTime=s.t+1}
     r.note='相手に命中、1点'
    end
   end
   if kind or ball.remaining<=0 or ball.x<0 or ball.x>s.worldwidth then table.remove(r.balls,i) end
  end
 end

 local function warning(s,spec,r)
  local a=s.actors[s.active]
  local wind=r.wind
  if wind and s.t>=wind.untilTime then
   if wind.fake then
    r.feints=r.feints+1
    r.wind={x=a.x,y=a.y-36,untilTime=s.t+.74}
   else
    local x,y=r.hostX,spec.hostY-51
    local dx,dy=wind.x-x,wind.y-y
    local length=math.max(1,math.sqrt(dx*dx+dy*dy))
    launch(r,2,x,y,dx*365/length,dy*365/length)
    r.wind=nil
    r.nextWarn=s.t+(r.collapsed and 1.42 or 1.95)
   end
  elseif not wind and s.t>=r.nextWarn then
   r.turn=r.turn+1
   local candidate=spec.flags[1]
   local towardFlag=r.turn%4==2 and not r.flags[1] and not r.collapsed
   r.wind={x=towardFlag and candidate.x+12 or a.x,y=towardFlag and candidate.y-40 or a.y-36,
     fake=r.turn%3==0,untilTime=s.t+.82}
  end
 end

 function match.update(s,spec,dt,wantsThrow)
  local r=s.snowballRound
  if not r or dt<=0 then return end
  if wantsThrow then match.throw(s) end
  if not r.wind then
   local target=spec.hostX+math.sin((s.t-r.started)*1.43)*34
   r.hostX=r.hostX+math.max(-dt*104,math.min(dt*104,target-r.hostX))
  end
  warning(s,spec,r)
  balls(s,spec,r,dt)
  if not r.collapsed and (s.t-r.started>=spec.collapseAfter or math.max(r.score[1],r.score[2])>=spec.collapseScore) then
   r.collapsed=true
   r.note='雪壁が崩れた。ここからは正面勝負'
  end
  if s.t-r.started>=spec.seconds or math.max(r.score[1],r.score[2])>=spec.score then
   s.snowballRound=nil
   return r.score
  end
 end

 function match.record(state,score)
  local result=score[1]>score[2] and 'wins' or score[1]<score[2] and 'losses' or 'draws'
  local log=state.snowMatchRecord or {wins=0,losses=0,draws=0,best=0}
  log[result]=log[result]+1
  log.best=math.max(log.best,score[1])
  log.player,log.opponent=score[1],score[2]
  state.snowMatchRecord=log
  if result=='wins' then return 'タルタリヤ「やるね！ 二人とも雪まみれだ。次も勝負しよう。」' end
  if result=='losses' then return 'タルタリヤ「雪だらけだね。次は高い旗を先に狙うか、投げる直前に横へ動いてみて。」' end
  return 'タルタリヤ「引き分けだ。二人とも同じくらい雪まみれだね。」'
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function text(draws,x,y,content,color,pixels)
  draws[#draws+1]={kind='text',x=x,y=y,text=content,color=color or cream,size=pixels or 14}
 end

 local function snow(draws,x,y,color)
  rect(draws,x-5,y-3,11,7,'#5988aa')
  rect(draws,x-3,y-5,7,9,color or '#f6ffff')
  rect(draws,x-5,y-2,11,5,color or '#f6ffff')
 end

 function match.observe(s,f,layer,spec,state,mode,profile)
  local draws=layer.draws
  local r=s.snowballRound
  local x=r and r.hostX or spec.hostX
  C.drawFieldDisplayArt(layer,C.snowMatchHost,x,spec.hostY,88,mode,profile,false)
  text(draws,x,spec.hostY-101,'タルタリヤ')
  for _,wall in ipairs(spec.walls) do
   C.drawFieldDisplayArt(layer,C.snowMatchArt[r and r.collapsed and 'rubble' or 'wall'],
     wall.x+wall.w/2,wall.y+wall.h,r and r.collapsed and 21 or wall.h,mode,profile,false)
  end
  for i,flag in ipairs(spec.flags) do
   C.drawFieldDisplayArt(layer,C.snowMatchArt.flag,flag.x,flag.y,65,mode,profile,false)
   local used=r and r.flags[i]
   text(draws,flag.x,flag.y-77,used and '得点済み' or '旗 ＋1',used and '#f4ddbd' or '#e8ffef')
  end
  if not r then
   rect(draws,spec.bell-26,spec.y-32,52,26,'#523d58')
   rect(draws,spec.bell-22,spec.y-32,44,5,'#d2a879')
   text(draws,spec.bell,spec.y-48,'雪合戦の合図台')
   if state and (state.count==2 or state.status=='complete') and atBell(s,spec) then
    f.storyNearbyMilestone={label=state.status=='complete' and '雪合戦をもう一度始める' or '雪合戦を始める'}
   end
   local log=state and state.snowMatchRecord
   local message=log and string.format('前回 %d–%d ｜ %d勝 %d敗 %d分 ｜ 最高%d点',log.player,log.opponent,log.wins,log.losses,log.draws,log.best)
        or 'Jで投げる・Spaceで雪壁の上を狙う ｜ 相手か旗に当てると1点'
   f.storySnowball={message=message,record=log}
   return
  end
  local remaining=math.max(0,math.ceil(spec.seconds-(s.t-r.started)))
  rect(draws,315,19,330,39,'#24374be8')
  text(draws,480,43,string.format('旅人 %d  –  %d タルタリヤ   ／   残り%d秒',r.score[1],r.score[2],remaining),cream,18)
  if r.wind then
   local w=r.wind
   local color=w.fake and '#ffd184' or '#effbff'
   snow(draws,x+(w.x>x and 22 or -22),spec.hostY-65,color)
   text(draws,x,spec.hostY-124,w.fake and '視線・フェイント' or '腕を上げた・投球',color)
   for i=1,10 do
    local t=i/11
    rect(draws,x+(w.x-x)*t-3,spec.hostY-51+(w.y-(spec.hostY-51))*t-2,6,3,color)
   end
  end
  for _,ball in ipairs(r.balls) do
   local color=ball.owner==1 and '#c4f4ffa8' or '#ffddaea8'
   local age=2.6-ball.remaining
   for i=1,2 do
    local delay=i*.022
    if age>=delay then rect(draws,ball.x-ball.vx*delay-2,ball.y-ball.vy*delay-1,5-i,3,color) end
   end
   snow(draws,ball.x,ball.y)
  end
  local point=r.lastPoint
  if point and s.t-point.at<.65 then
   text(draws,point.x,point.y-16-math.floor((s.t-point.at)*22),'+1',
     point.owner==1 and '#bff5ff' or '#ffd5a2',17)
  end
  if r.snowed and r.snowed.untilTime>s.t then
   local a=s.actors[s.active]
   local hx,hy=r.snowed.owner==1 and a.x or x,r.snowed.owner==1 and a.y or spec.hostY
   for i=1,3 do rect(draws,hx-17+i*8,hy-80+(i%2)*8,5,5,'#effbfc') end
  end
  f.storySnowball={running=true,score=r.score,remaining=remaining,collapsed=not not r.collapsed,
    blocked=r.blocked,ownHits=r.ownHits,flagHits=r.flagHits,feints=r.feints,
    warning=r.wind and (r.wind.fake and 'feint' or 'throw') or nil,
    message=(r.note and r.note..' ｜ ' or '')..'Jで投げる・Spaceで上を狙う ｜ 通常技は休み'}
 end

 return match
end
