-- Hydro skills: source multipliers, provisional ranges and shapes.
return function(C)
 local action,attack,step,frame=C.action,C.attack,C.step,C.frame
 C.skillDefinitions.SK17={range=400,targets=4,mult=1.55,hits=3,ct=3,lock=.45,interval=.15,color='#80d9ff',element='hydro'}
 C.skillDefinitions.SK19={range=160,targets=8,mult=1.5,hits=5,ct=10,lock=.7,interval=.2,color='#72cff7',element='hydro',travelSpeed=250,groundOnly=true,push=24}
 local function clear(s)
  s.healingField=nil
  for _,a in ipairs(s.actors) do a.waterShield=nil end
 end
 function C.attack(s,a,key)
  if key~='SK18' and key~='SK20' then return attack(s,a,key) end
  if s.paused or a.id~=1 or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 then return false end
  a.cd[key]=key=='SK18' and 24 or 22;a.lock=.3
  if key=='SK18' then s.healingField={x=a.x,y=a.y,owner=a.id,elapsed=0,pulses=0,radius=220}
  else
   local hp=math.max(1,math.floor(a.atk*1.4))
   local stats={};for _,k in ipairs({'atk','elementBonus','skillBonus','troupe4','critRate','critDamageBonus'}) do stats[k]=a[k] end
   a.waterShield={hp=hp,maxhp=hp,life=7,counters=0,stats=stats}
  end
  return true
 end
 function C.absorbDamage(s,a,damage,source)
  local shield=a.waterShield
  if not shield or shield.life<=0 or shield.hp<=0 then return damage end
  local absorbed=math.min(damage,shield.hp);shield.hp=shield.hp-absorbed
  if absorbed>0 and shield.counters<3 then
   shield.counters=shield.counters+1
   local cast={id=a.id,x=a.x,y=a.y,dir=a.dir,radial=true,range=220,limit=4,mult=.65,color='#86dbff',element='hydro',gain=0}
   for k,v in pairs(shield.stats) do cast[k]=v end
   C.resolveCast(s,cast)
  end
  if shield.hp<=0 then a.waterShield=nil end
  return damage-absorbed
 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then clear(s) end
 end
 function C.advanceWaterField(s,dt)
  local field=s.healingField
  if not field or s.paused then return end
  if s.actors[field.owner].hp<=0 then s.healingField=nil;return end
  field.elapsed=field.elapsed+dt
  if field.elapsed+1e-8<field.pulses+1 then return end
  field.pulses=field.pulses+1
  if field.pulses==6 then s.healingField=nil end
  return field
 end
 function C.healInWaterField(s,a,field)
  if a.hp<=0 or math.abs(a.x-field.x)>field.radius or math.abs(a.y-field.y)>=75 then return false end
  C.healActor(s,a,a.maxhp*.025)
  return true
 end
 function C.step(s,dt,input)
  if s.paused then return step(s,dt,input) end
  dt=math.max(0,math.min(dt,1/30))
  for _,a in ipairs(s.actors) do if a.waterShield then
   a.waterShield.life=a.waterShield.life-dt
   if a.waterShield.life<=0 or a.hp<=0 then a.waterShield=nil end
  end end
  if not s.coop or not C.sharesCoopField(s) then
   local field=C.advanceWaterField(s,dt)
   if field then for _,a in ipairs(s.actors) do C.healInWaterField(s,a,field) end end
  end
  local returns=s.returns;step(s,dt,input)
  if s.returns~=returns then clear(s) end
 end
 function C.drawWaterField(f,camera,field)
  f.draws[#f.draws+1]={kind='rect',x=field.x-field.radius-camera,y=field.y-8,w=field.radius*2,h=8,color='#70cce9'}
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);f.healingField=s.healingField
  if s.healingField then C.drawWaterField(f,s.camera,s.healingField) end
  for _,a in ipairs(s.actors) do if a.waterShield then
   local x=a.x-s.camera
   f.draws[#f.draws+1]={kind='rect',x=x-24,y=a.y-60,w=4,h=60,color='#a1e7ff'}
   f.draws[#f.draws+1]={kind='rect',x=x+20,y=a.y-60,w=4,h=60,color='#a1e7ff'}
   f.draws[#f.draws+1]={kind='rect',x=x-24,y=a.y-64,w=48*a.waterShield.hp/a.waterShield.maxhp,h=4,color='#a1e7ff'}
  end end
  f.commands=#f.draws;return f
 end
end
