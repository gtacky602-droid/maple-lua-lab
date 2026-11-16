return function(C)
 local attack=C.attack
 C.skillDefinitions.SK49={range=180,targets=3,mult=3.5,hits=6,ct=18,lock=.65,interval=.1,color='#f2c6ce',element='fusion',damageElements={'pyro','cryo'},applicationElement='pyro',coldBonus=.2}
 function C.attack(s,a,key)
  if key~='SK45' then return attack(s,a,key) end
  if s.paused or a.id~=1 or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 then return false end
  local candidates={}
  for _,e in ipairs(s.enemies) do if e.hp>0 and e.burning and math.abs(e.x-a.x)<300 and math.abs(e.y-a.y)<100 then candidates[#candidates+1]=e end end
  table.sort(candidates,function(x,y)return math.abs(x.x-a.x)<math.abs(y.x-a.x) end)
  local count=math.min(3,#candidates);if count==0 then return false end
  for i=1,count do candidates[i].burning=nil end
  a.hp=math.min(a.maxhp,a.hp+a.maxhp*.16*count/3);a.cd[key]=20;a.lock=.4
  s.effects[#s.effects+1]={x=a.x,y=a.y-40,w=60,h=80,color='#c9e6a0',life=.3}
  return true
 end
end
