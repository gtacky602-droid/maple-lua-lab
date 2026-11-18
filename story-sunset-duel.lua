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
  local length=spec.warning+2*spec.sweep+spec.turn+spec.opening
  local index=math.floor(t/length)
  local localTime=t-index*length
  local lane=spec.lanes[index%#spec.lanes+1]
  local from,to=lane[1],lane[2]
  if localTime<spec.warning then return index,'warning',from,spec.warning-localTime,lane end
  localTime=localTime-spec.warning
  if localTime<spec.sweep then return index,'out',from+(to-from)*localTime/spec.sweep,spec.sweep-localTime,lane end
  localTime=localTime-spec.sweep
  if localTime<spec.turn then return index,'turn',to,spec.turn-localTime,lane end
  localTime=localTime-spec.turn
  if localTime<spec.sweep then return index,'back',to+(from-to)*localTime/spec.sweep,spec.sweep-localTime,lane end
  return index,'opening',to,spec.opening-(localTime-spec.sweep),lane
 end

 function duel.step(s,spec)
  local round=s.duelRound
  if not round or not duel.active(s,spec) then return end
  local index,phase,x=timing(s.t-round.start,spec)
  round.phase=phase
  if phase~='out' and phase~='back' then return end
  local contact=index*2+(phase=='out' and 0 or 1)
  for _,a in ipairs(s.actors) do
   if a.hp>0 and a.y>432 and math.abs(a.x-x)<spec.width and round.contacts[a.id]~=contact then
    round.contacts[a.id]=contact
    C.damageActor(s,a,spec.damage,{x=x,y=480,damageElement='hydro'},true,true)
   end
  end
 end

 local function box(draws,x,y,w,h,color)
  draws[#draws+1]={kind='rect',x=x,y=y,w=w,h=h,color=color}
 end

 local captions={warning='水路の予告',out='水が通過中',turn='折り返し',back='水が戻る',opening='反撃の間'}

 function duel.frame(s,f,draws,spec)
  if not spec then return end
  if atReplayBell(s,spec) then f.storyNearbyMilestone={label='模擬戦をもう一度始める'} end
  if not duel.active(s,spec) or not s.duelRound then return end
  local _,phase,x,remaining,lane=timing(s.t-s.duelRound.start,spec)
  f.storyDuel={phase=phase,label=captions[phase],remaining=remaining,replay=s.storyDuelReplay~=nil}
  x=x-s.camera
  if phase=='warning' then
   local left,right=math.min(lane[1],lane[2])-s.camera,math.max(lane[1],lane[2])-s.camera
   for dx=math.max(0,left),math.min(960,right),18 do box(draws,dx,473,10,3,'#a6eded') end
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
