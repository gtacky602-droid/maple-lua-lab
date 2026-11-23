return function(C)
 local duel={}

 function duel.active(s,spec)
  if not spec then return false end
  local state=s.story.quests[spec.quest]
  return s.storyDuelReplay==spec.encounter or state and state.status=='active' and state.count==spec.fightAt
 end

 function duel.enter(s,spec,sameArena)
  if not sameArena then s.storyDuelReplay=nil end
  s.duelRound=duel.active(s,spec) and {start=s.t,contacts={}} or nil
 end

 local function atReplayBell(s,spec)
  local state=spec and s.story.quests[spec.quest]
  local a=s.actors[s.active]
  return state and state.status=='complete' and not s.storyDuelReplay and not s.paused and a.hp>0
      and math.abs(a.x-spec.bellX)<54 and math.abs(a.y-480)<34
 end

 function duel.ring(s,spec)
  if not atReplayBell(s,spec) then return false end
  s.storyDuelReplay=spec.encounter
  s.duelRound={start=s.t,contacts={}}
  for _,a in ipairs(s.actors) do a.hp=a.maxhp end
  C.resetFieldTrial(s,spec.encounter)
  C.enterFieldBossNode(s,s.story.node)
  s.storyNotice='練習の勝負を始めました。章の報酬は受領済みです。'
  return true
 end

 function C.finishDuelReplay(s,id)
  if s.storyDuelReplay~=id then return end
  s.storyDuelReplay,s.duelRound=nil,nil
  s.storyNotice='練習の勝負が終わりました。合図台からもう一度挑戦できます。'
 end

 local function timing(t,spec)
  local waveLength=spec.warning+2*spec.sweep+spec.turn+spec.opening
  local splash=spec.splash
  local splashEnd=splash.warning+splash.interval+splash.active
  local length=waveLength+splashEnd+spec.opening
  local index=math.floor(t/length)
  local localTime=t-index*length
  if localTime>=waveLength then
   localTime=localTime-waveLength
   if localTime<splash.warning then return index,'splashWarning',splash.warning-localTime,localTime end
   if localTime<splashEnd then return index,'splash',splashEnd-localTime,localTime end
   return index,'splashOpening',splashEnd+spec.opening-localTime,localTime
  end
  local lane=spec.lanes[index%#spec.lanes+1]
  local from,to=lane[1],lane[2]
  if localTime<spec.warning then return index,'warning',spec.warning-localTime,from,lane end
  localTime=localTime-spec.warning
  if localTime<spec.sweep then return index,'out',spec.sweep-localTime,from+(to-from)*localTime/spec.sweep,lane end
  localTime=localTime-spec.sweep
  if localTime<spec.turn then return index,'turn',spec.turn-localTime,to,lane end
  localTime=localTime-spec.turn
  if localTime<spec.sweep then return index,'back',spec.sweep-localTime,to+(from-to)*localTime/spec.sweep,lane end
  return index,'opening',spec.opening-(localTime-spec.sweep),from,lane
 end

 local function splashMarks(s,boss,spec)
  local splash=spec.splash
  local target=s.actors[s.active]
  local x=math.max(splash.left,math.min(splash.right,target.x))
  local direction=x<boss.home and 1 or -1
  return {{x=x,hits={}},{x=x+direction*splash.offset,hits={}}}
 end

 function duel.damageFactor(s)
  local round=s.duelRound
  return round and (round.phase=='opening' or round.phase=='splashOpening') and 1 or .65
 end

 function duel.step(s,spec)
  local round=s.duelRound
  if not round or not duel.active(s,spec) then return end
  local slot=C.fieldSlot(s,spec.encounter)
  local boss=slot and slot.enemy
  if not boss or boss.hp<=0 then return end
  local index,phase,_,position,lane=timing(s.t-round.start,spec)
  round.phase=phase
  boss.recovering=duel.damageFactor(s)==1
  if lane then
   boss.x=position
   local direction=lane[1]<lane[2] and 1 or -1
   boss.facing=(phase=='back' or phase=='turn') and -direction or direction
   if phase~='out' and phase~='back' then return end
   local contact=index*2+(phase=='out' and 0 or 1)
   for _,a in ipairs(s.actors) do
    if a.hp>0 and a.y>432 and math.abs(a.x-boss.x)<spec.width and round.contacts[a.id]~=contact then
     round.contacts[a.id]=contact
     C.damageActor(s,a,spec.damage,{id=boss.id,x=boss.x,y=boss.y,damageElement='hydro'},true,true)
    end
   end
   return
  end
  if round.markIndex~=index then
   round.markIndex=index
   round.marks=splashMarks(s,boss,spec)
   boss.facing=round.marks[1].x<boss.x and -1 or 1
  end
  if phase=='splash' then
   local splash=spec.splash
   for i,mark in ipairs(round.marks) do
    local starts=splash.warning+(i-1)*splash.interval
    if position>=starts and position<starts+splash.active then
     local source={id=boss.id,x=mark.x,y=boss.y,owner=boss,damageElement='hydro'}
     C.hitFieldArea(s,source,mark.hits,mark.x-splash.width,mark.x+splash.width,splash.top,splash.damage)
    end
   end
  end
 end

 local function box(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local captions={warning='往復突進の予告',out='往復突進',turn='折り返し',back='戻りの突進',opening='反撃の間',
  splashWarning='時間差の水柱を予告',splash='時間差の水柱',splashOpening='反撃の間'}

 local function drawMarks(draws,f,s,spec,position,round)
  local splash=spec.splash
  f.storyDuel.marks={}
  for i,mark in ipairs(round.marks or {}) do
   local starts=splash.warning+(i-1)*splash.interval
   local result=position<starts and 'warning' or position<starts+splash.active and 'active' or 'spent'
   f.storyDuel.marks[i]={x=mark.x,state=result}
   local x=mark.x-s.camera
   if result=='warning' then
    box(draws,x-splash.width,470,2*splash.width,7,'#235c75')
    box(draws,x-splash.width+3,471,2*splash.width-6,3,'#c8fbf4')
    box(draws,x-12,splash.top-28,24,24,'#235c75')
    box(draws,x-10,splash.top-26,20,20,'#173748')
    draws[#draws+1]={kind='text',text=tostring(i),x=x,y=splash.top-21,size=15,color='#effff8'}
   elseif result=='active' then
    box(draws,x-splash.width,splash.top,2*splash.width,480-splash.top,'#3788a5')
    box(draws,x-9,splash.top+4,18,476-splash.top,'#8fe5df')
    box(draws,x-splash.width+4,472,2*splash.width-8,6,'#c8fbf4')
   end
  end
 end

 function duel.frame(s,f,draws,spec)
  if not spec then return end
  if atReplayBell(s,spec) then f.storyNearbyMilestone={label='模擬戦をもう一度始める'} end
  if not duel.active(s,spec) or not s.duelRound then return end
  local round=s.duelRound
  local _,phase,remaining,position,lane=timing(s.t-round.start,spec)
  f.storyDuel={phase=phase,label=captions[phase],remaining=remaining,replay=s.storyDuelReplay~=nil,
   move=lane and 'SR01' or 'SR02'}
  if not lane then
   if phase~='splashOpening' then drawMarks(draws,f,s,spec,position,round) end
   return
  end
  local x=position-s.camera
  f.storyDuel.x=position
  if phase=='warning' then
   local left,right=math.min(lane[1],lane[2])-s.camera,math.max(lane[1],lane[2])-s.camera
   for dx=math.max(0,left),math.min(960,right),18 do
    box(draws,dx,471,12,6,'#235c75')
    box(draws,dx+1,473,10,2,'#c8fbf4')
   end
  elseif phase~='opening' and x>=-90 and x<=1050 then
   box(draws,x-spec.width,468,2*spec.width,10,'#6ac6dc')
   box(draws,x-spec.width+8,460,2*spec.width-16,5,'#b2eee6')
  end
  if x>=-70 and x<=1030 then
   draws[#draws+1]={kind='text',text=captions[phase],x=x,y=418,size=14,color='#fff3c5'}
  end
 end

 return duel
end
