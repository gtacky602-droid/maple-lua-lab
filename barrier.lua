return function(C)
 local action,frame=C.action,C.frame
 function C.damageFactor(s,cast,e)
  if not e.barrier or e.barrier<=0 then return 1 end
  return .1+.9*math.min(1,(s.imprintTrial or 0)/e.barrier)
 end
 function C.action(s,key)
  local value=tonumber(key:match('^barrier_trial:(%d+)$'))
  if value then
   if not s.paused and s.campaign and s.campaign.zone=='town' and value>=0 and value<=50 then s.imprintTrial=value end
   return
  end
  action(s,key)
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);f.imprintTrial=s.imprintTrial or 0
  for _,e in ipairs(s.enemies) do if e.hp>0 and (e.barrier or 0)>0 then
   f.draws[#f.draws+1]={kind='rect',x=e.x-s.camera-25,y=e.y-70,w=50,h=3,color='#ccb6fa'}
  end end
  f.commands=#f.draws;return f
 end
end
