return function(C)
 local attack,action,step,frame,prerequisite=C.attack,C.action,C.step,C.frame,C.skillPrerequisite
 function C.skillPrerequisite(s,a,key)
  if key=='SK58' or key=='light' then
   if a.id~=1 then return false,'光界解放は旅人の技です。' end
   if s.gauge<60 then return false,'光界解放には共通ゲージ60が必要です。' end
  end
  return prerequisite(s,a,key)
 end
 function C.attack(s,a,key)
  if key~='SK58' and key~='light' then return attack(s,a,key) end
  local ok,reason=C.skillPrerequisite(s,a,key)
  if not ok then s.skillNotice=reason;return false end
  if s.paused or a.hp<=0 or a.lock>0 or (a.cd.light or 0)>0 then return false end
  s.gauge=s.gauge-60;a.light=12;a.cd.light=60;a.cd.SK58=60;a.lock=.35;s.skillNotice=nil
  if C.noteGrowth then C.noteGrowth(s,'light-release') end
  return true
 end
 function C.action(s,key)
  if key=='light' then C.attack(s,s.actors[s.active],'SK58');return end
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then s.actors[1].light=0 end
 end
 function C.damageBonus(s,cast,element)
  local traveler=s.actors[1]
  if traveler.hp<=0 or traveler.light<=0 then return 0 end
  if cast.id==1 and (element~='physical' or cast.lightNormal) then return .18 end
  if cast.id==2 and (s.active~=2 or s.auto) then return .1 end
  return 0
 end
 function C.step(s,dt,input)
  step(s,dt,input)
  if s.actors[1].hp<=0 then s.actors[1].light=0 end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  local traveler=s.actors[1]
  f.lightForm={seconds=traveler.light,elementBonus=.18,companionAIBonus=.1,cost=60}
  local x=traveler.x-s.camera
  if traveler.light>0 and x>=-50 and x<=1010 then
   for i=0,3 do
    local phase=s.t*5+i*math.pi/2
    local px=math.floor(x+math.cos(phase)*33)
    local py=math.floor(traveler.y-37+math.sin(phase)*21)
    f.draws[#f.draws+1]={kind='rect',x=px-5,y=py-2,w=10,h=4,color='#ffd68cba'}
    f.draws[#f.draws+1]={kind='rect',x=px-2,y=py-5,w=4,h=10,color='#fff4ce'}
   end
   f.commands=#f.draws
  end
  return f
 end
end
