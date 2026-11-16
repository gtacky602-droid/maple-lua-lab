return function(C)
 local attack,step,action,frame=C.attack,C.step,C.action,C.frame
 C.skillDefinitions.SK38={range=65,targets=5,mult=.65,hits=10,ct=25,lock=.4,interval=1,delay=1,color='#ef9871',element='fusion',damageElements={'geo','pyro'},applicationElement='pyro',follow=true,radial=true,contactBudget=10,placed=true}
 C.skillDefinitions.SK39={range=180,targets=3,mult=3.5,hits=6,ct=18,lock=.8,interval=.15,color='#cde3db',element='fusion',damageElements={'geo','cryo'},applicationElement='cryo',coldBonus=.2}
 C.skillDefinitions.SK40={range=300,targets=5,mult=1.25,hits=10,ct=20,lock=.4,interval=1,delay=1,color='#bdd695',element='fusion',damageElements={'electro','dendro'},applicationElement='electro',placed=true,offset=120}
 local function clear(s) s.coralWall=nil;for _,a in ipairs(s.actors) do a.lavaArmor=0 end end
 function C.attack(s,a,key)
  if key=='SK37' then
   if a.id~=1 or a.hp<=0 or s.paused or a.lock>0 or (a.cd[key] or 0)>0 then return false end
   a.cd[key]=24;a.lock=.3
   s.coralWall={x=math.max(20,math.min((s.worldwidth or 2880)-20,a.x+a.dir*60)),y=a.y,dir=a.dir,owner=a.id,elapsed=0,pulses=0}
   return true
  end
  local ok=attack(s,a,key);if ok and key=='SK38' then a.lavaArmor=10 end;return ok
 end
 function C.mitigateDamage(s,a,damage,source,blockable)
  local w=s.coralWall
  if w and w.elapsed<8 and blockable and source and source.x~=a.x then
   local t=(w.x-source.x)/(a.x-source.x)
   local y=source.y-30+t*((a.y-40)-(source.y-30))
   if t>=0 and t<=1 and y>=w.y-120 and y<=w.y then return 0 end
  end
  if (a.lavaArmor or 0)>0 then return math.floor(damage*.8+1e-9) end
  return damage
 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then clear(s) end
 end
 function C.step(s,dt,input)
  if s.paused then return step(s,dt,input) end
  dt=math.max(0,math.min(dt,1/30))
  for _,a in ipairs(s.actors) do a.lavaArmor=a.hp>0 and math.max(0,(a.lavaArmor or 0)-dt) or 0 end
  local w=s.coralWall
  if w then
   if s.actors[w.owner].hp<=0 then s.coralWall=nil
   else
    w.elapsed=w.elapsed+dt
    if w.pulses<8 and w.elapsed+1e-8>=w.pulses+1 then
     w.pulses=w.pulses+1
     for _,a in ipairs(s.actors) do local behind=(w.x-a.x)*w.dir
      if a.hp>0 and behind>=0 and behind<=220 and math.abs(a.y-w.y)<75 then a.hp=math.min(a.maxhp,a.hp+a.maxhp*.006) end
     end
    end
    if w.pulses==8 then s.coralWall=nil end
   end
  end
  local returns=s.returns;step(s,dt,input);if returns~=s.returns then clear(s) end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  if s.coralWall then local w=s.coralWall
   f.draws[#f.draws+1]={kind='rect',x=w.x-s.camera-12,y=w.y-120,w=24,h=120,color='#e5aab3'}
  end
  for _,a in ipairs(s.actors) do if (a.lavaArmor or 0)>0 then
   f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera-22,y=a.y-55,w=5,h=55,color='#ef9871'}
   f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera+17,y=a.y-55,w=5,h=55,color='#ef9871'}
  end end
  for _,cast in ipairs(s.pending) do if cast.placed=='SK40' then
   f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera-7,y=cast.y-85,w=14,h=85,color='#bdd695'}
   f.draws[#f.draws+1]={kind='rect',x=cast.x-s.camera-35,y=cast.y-85,w=70,h=25,color='#c3b6ff'}
  end end
  f.commands=#f.draws;return f
 end
end
