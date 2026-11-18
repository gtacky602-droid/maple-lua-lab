return function(C,canInspect)
 local games={}
 local labels={'旗集め','訓練的','子どもの応援競走'}
 local tips={'旗に触れると1点。石段と高台はSpaceで上がれます。',
   'Jの通常攻撃や既存技で、まとまった的を壊すと1個につき1点。',
   '子どもが印で止まったら、近くでGを押して応援。三つ目がゴールです。'}
 local canAttack=C.canAttack

 function C.canAttack(s)
  return (not s.ittoVenue or s.ittoRound and s.ittoRound.index==2)
     and (not canAttack or canAttack(s))
 end

 local function nextRound(s,state)
  if not state or state.count<1 then return end
  if state.status=='complete' then return s.ittoReplay and #s.ittoReplay+1 or 1 end
  if state.count<=3 then return state.count end
 end

 local function near(s,spot)
  local a=s.actors[s.active]
  return a.ground and canInspect(a,spot)
 end

 local function atBell(s,spec)
  for i,a in ipairs(s.actors) do
   a.x,a.y,a.vy,a.dir,a.ground=spec.bell.x-((i==s.active) and 0 or 38),spec.bell.y,0,1,true
   a.dash,a.leap,a.walk,a.buffer=0,0,0,0
   a.channel=nil
  end
 end

 local function targets(s,spec)
  local list={}
  s.ittoTargetSeries=(s.ittoTargetSeries or 0)+1
  for i,spot in ipairs(spec.targets) do
   list[i]={id=-671000-s.ittoTargetSeries*12-i,x=spot.x,y=spot.y,home=spot.x,
      hp=spec.targetHp,maxhp=spec.targetHp,hitTop=spot.y-53,hitBottom=spot.y,drawHeight=53,
      custom=true,noRewards=true,respawn=1e9,kind=1,warning=0}
  end
  s.enemies=list
  return list
 end

 function games.enter(s,spec)
  if s.ittoRound then
   s.pending,s.macro={},nil
   for _,a in ipairs(s.actors) do a.channel=nil end
  end
  s.ittoVenue=spec~=nil
  s.ittoRound,s.ittoReplay=nil,nil
 end

 function games.collect(s,spec,state)
  local r=s.ittoRound
  if r then
   if r.index==3 then
    local mark=spec.relay.marks[r.own.points+1]
    if mark and r.own.at and near(s,{x=mark.x,y=spec.relay.playerY}) then
     r.own.points,r.own.at=r.own.points+1,nil
     s.storyNotice='応援が届きました。次の印へ進みます。'
    end
   end
   return true
  end
  local index=nextRound(s,state)
  if not index or not near(s,spec.bell) then return false end
  if state.status=='complete' and not s.ittoReplay then s.ittoReplay={} end
  r={index=index,start=s.t,player=0,rival=0}
  s.auto=false
  s.pending,s.macro={},nil
  atBell(s,spec)
  if index==1 then r.flags={}
  elseif index==2 then r.targets=targets(s,spec)
  else
   r.own={x=spec.relay.startX,points=0}
   r.other={x=spec.relay.startX,points=0}
   s.storyNotice='一斗「見てた子たちも走りたいってさ。最後は一人ずつ応援しようぜ！」'
  end
  if index~=3 then s.storyNotice=tips[index] end
  s.ittoRound=r
  return true
 end

 local function scriptedScore(times,elapsed)
  local score=0
  for _,time in ipairs(times) do if elapsed>=time then score=score+1 end end
  return score
 end

 local function advanceChild(s,child,relay,speed,dt,delay)
  local mark=relay.marks[child.points+1]
  if not mark then return end
  child.x=math.min(mark.x,child.x+speed*dt)
  if child.x>=mark.x then
   child.at=child.at or s.t
   if delay and s.t-child.at>=delay[child.points+1] then
    child.points,child.at=child.points+1,nil
   end
  end
 end

 local function wins(rounds)
  local a,b=0,0
  for _,r in ipairs(rounds) do
   if r.player>r.rival then a=a+1 elseif r.rival>r.player then b=b+1 end
  end
  return a,b
 end

 local function finish(s,record,r)
  local result={player=r.player,rival=r.rival}
  local set=s.ittoReplay or record.last
  set[r.index]=result
  if r.index<3 then
   local verdict=result.player>result.rival and '旅人の勝ち' or result.player<result.rival and '一斗の勝ち' or '引き分け'
   s.storyNotice=labels[r.index]..' '..result.player..'対'..result.rival..'、'..verdict..'。合図台で次の競技を始められます。'
  else
   local a,b=wins(set)
   record.last=set
   record.best=math.max(a,record.best)
   record.series=record.series+1
   local line=a>b and '一斗「今日はお前の勝ちだ！ 次も本気で来いよ！」'
       or a<b and '一斗「俺たちの勝ちだ。でも景品はみんなの分、用意してるぜ！」'
       or '一斗「引き分けか！ どっちの組にも拍手だ！」'
   s.storyNotice='表彰 '..a..'勝'..b..'敗。'..line
   if record.best==3 then s.storyNotice=s.storyNotice..' 称号「荒瀧三番勝負・全勝」' end
  end
 end

 function games.update(s,spec,state,dt)
  local r=s.ittoRound
  if not r or not state or dt<=0 then return end
  local elapsed=s.t-r.start
  local cap
  if r.index==1 then
   local a=s.actors[s.active]
   for i,flag in ipairs(spec.flags) do
    if not r.flags[i] and math.abs(a.x-flag.x)<28 and math.abs(a.y-flag.y)<34 then
     r.flags[i]=true
     r.player=r.player+1
    end
   end
   r.rival=scriptedScore(spec.flagTimes,elapsed)
   cap=#spec.flags
  elseif r.index==2 then
   r.player=0
   for _,target in ipairs(r.targets) do if target.hp<=0 then r.player=r.player+1 end end
   r.rival=scriptedScore(spec.targetTimes,elapsed)
   cap=#r.targets
  else
   local relay=spec.relay
   advanceChild(s,r.own,relay,relay.playerSpeed,dt)
   advanceChild(s,r.other,relay,relay.rivalSpeed,dt,relay.rivalDelays)
   r.player,r.rival=r.own.points,r.other.points
   cap=#relay.marks
  end
  if elapsed<spec.seconds[r.index] and math.max(r.player,r.rival)<cap then return end
  local replay=s.ittoReplay~=nil
  local record=state.ittoContest or {last={},best=0,series=0}
  finish(s,record,r)
  state.ittoContest=record
  if replay and r.index==3 then s.ittoReplay=nil end
  s.ittoRound=nil
  s.pending,s.macro={},nil
  if r.index==2 then s.enemies={} end
  atBell(s,spec)
  return not replay and r.index or nil
 end

 local function rect(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local function text(draws,x,y,caption,px,color)
  draws[#draws+1]={kind='text',x=x,y=y,text=caption,size=px or 14,color=color or '#fff2cc'}
 end

 local function art(draws,key,x,y,height,mode,profile)
  C.drawFieldDisplayArt({draws=draws},C.ittoGameArt[key],x,y,height,mode,profile,false)
 end

 local function child(draws,actor,key,y,color,phase,mode,profile)
  local bob=actor.at and 0 or math.abs(math.sin(phase*18))*4
  art(draws,key,actor.x,y-bob,65,mode,profile)
  text(draws,actor.x,y-82,actor.at and '応援待ち' or (key=='blue' and '旅人組' or '一斗組'),14,color)
 end

 function games.observe(s,f,draws,spec,state,mode,profile)
  local r=s.ittoRound
  local saved=state and state.ittoContest
  local title=saved and saved.best==3 and '荒瀧三番勝負・全勝' or nil
  if not r then
   art(draws,'bell',spec.bell.x,spec.bell.y,53,mode,profile)
   text(draws,spec.bell.x,spec.bell.y-106,'三番勝負の合図台')
   art(draws,'prize',spec.prizeX,spec.bell.y,53,mode,profile)
   local next=nextRound(s,state)
   if next and not s.paused and near(s,spec.bell) and not f.storyNearbyMilestone then
    f.storyNearbyMilestone={label=(state.status=='complete' and '再戦・' or '開始・')..labels[next]}
   end
   local message=next and tips[next] or '城下の広場に戻って報告できます。'
   if saved and saved.series>0 then
    local a,b=wins(saved.last)
    message='前回 '..a..'勝'..b..'敗 ｜ 完走 '..saved.series..'回'..(title and ' ｜ 称号「'..title..'」' or '')
   end
   f.storyIttoGames={message=message,record=saved,title=title,next=next}
   return
  end
  if r.index==1 then
   for i,spot in ipairs(spec.flags) do
    if not r.flags[i] then art(draws,'flag',spot.x,spot.y,54,mode,profile) end
   end
  elseif r.index==2 then
   for _,target in ipairs(r.targets) do
    if target.hp>0 then art(draws,'target',target.x,target.y,53,mode,profile) end
   end
  else
   local relay=spec.relay
   for i,mark in ipairs(relay.marks) do
    local color=i<=r.own.points and '#9de2b3' or '#fff0bc'
    rect(draws,mark.x-15,relay.playerY-6,30,5,color)
    if i==r.own.points+1 then text(draws,mark.x,relay.playerY-108,'応援印',13,color) end
   end
   local width=relay.marks[#relay.marks].x-relay.startX+38
   rect(draws,relay.startX-19,relay.rivalY,width,8,'#715247')
   rect(draws,relay.startX-19,relay.rivalY,width,3,'#e5b685')
   child(draws,r.own,'blue',relay.playerY,'#d5ffec',s.t,mode,profile)
   child(draws,r.other,'orange',relay.rivalY,'#ffe4bd',s.t,mode,profile)
   local mark=relay.marks[r.own.points+1]
   if r.own.at and mark and not s.paused and near(s,{x=mark.x,y=relay.playerY}) then
    f.storyNearbyMilestone={label='止まった子どもを応援する'}
   end
  end
  local remaining=math.max(0,math.ceil(spec.seconds[r.index]-(s.t-r.start)))
  rect(draws,315,20,330,61,'#3b2b49e8')
  text(draws,480,43,labels[r.index]..'　残り'..remaining..'秒',17)
  text(draws,480,66,'旅人組 '..r.player..'　–　'..r.rival..' 一斗組',17)
  f.storyIttoGames={round=r.index,player=r.player,rival=r.rival,remaining=remaining,
     helpReady=r.own and r.own.at~=nil or false,message=tips[r.index],record=saved,title=title}
 end

 return games
end
