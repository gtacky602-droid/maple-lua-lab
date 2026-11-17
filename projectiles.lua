return function(C)
 local action,step,frame=C.action,C.step,C.frame
 C.skillDefinitions.SK47={range=180,vertical=100,targets=6,mult=.7,hits=6,ct=20,lock=.4,interval=7/6,delay=7/6,color='#c9d8df',element='fusion',damageElements={'hydro','pyro'},applicationElement='hydro',placed=true}
 function C.inSteam(s,x,y)
  for _,cast in ipairs(s.pending) do if cast.placed=='SK47' and math.abs(x-cast.x)<=180 and math.abs(y-(cast.y-45))<=90 then return true end end
  return false
 end
 function C.spawnEnemyProjectile(s,x,y,target,angle,options)
  s.projectiles=s.projectiles or {};if #s.projectiles>=128 then return false end
  local a=s.actors[target];if not a or a.hp<=0 then return false end
  local o=options or {}
  s.projectiles[#s.projectiles+1]={x=x,y=y,angle=angle or math.atan(a.y-30-y,a.x-x),target=target,speed=o.speed or 180,turnRate=o.turnRate or 2.4,damage=o.damage or 14,life=o.life or 6,age=0,homingTime=o.homingTime,source=o.source,color=o.color}
  return true
 end
 local function intersects(x,y,nx,ny,w,radius)
  local count=math.max(1,math.ceil(math.sqrt((nx-x)^2+(ny-y)^2)/4))
  for i=0,count do local px,py=x+(nx-x)*i/count,y+(ny-y)*i/count
   if px>=w.x-radius and px<=w.x+w.w+radius and py>=w.y-radius and py<=w.y+w.h+radius then return true end
  end
  return false
 end
 function C.resolveEnemyProjectileSegment(s,p,nx,ny,radius,halfWidth,height)
   local blocked=false
   for _,w in ipairs(s.solids or {}) do if intersects(p.x,p.y,nx,ny,w,radius) then blocked=true;break end end
   for _,kind in ipairs({'coralWall','rockWall'}) do local w=s[kind]
    if not blocked and w and intersects(p.x,p.y,nx,ny,{x=w.x-12,y=w.y-120,w=24,h=120},radius) then
     blocked=true
     if kind=='rockWall' then local absorbed=math.min(w.hp,p.damage);w.hp=w.hp-absorbed;p.damage=p.damage-absorbed;blocked=p.damage<=0;if w.hp==0 then s.rockWall=nil end end
    end
   end
   if not blocked then
    for _,victim in ipairs(s.actors) do if victim.hp>0 and intersects(p.x,p.y,nx,ny,{x=victim.x-halfWidth,y=victim.y-height,w=2*halfWidth,h=height},radius) then
     C.damageActor(s,victim,p.damage,{id=p.source or 0,x=p.x,y=p.y+30},true);blocked=true;break
    end end
   end
  return blocked
 end
 function C.action(s,key)
  if key=='projectile_trial' then s.projectileTrial=not s.projectileTrial;s.projectileClock=0;return end
  local zone=s.campaign and s.campaign.zone;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or key=='boss_anemo' then s.projectiles={};s.projectileTrial=false end
 end
 function C.step(s,dt,input)
  if s.paused then return step(s,dt,input) end
  dt=math.max(0,math.min(dt,1/30));s.projectiles=s.projectiles or {}
  if s.projectileTrial then
   s.projectileClock=(s.projectileClock or 0)-dt
   if s.projectileClock<=0 then C.spawnEnemyProjectile(s,s.actors[s.active].x+350,280,s.active);s.projectileClock=3 end
  end
  for i=#s.projectiles,1,-1 do local p=s.projectiles[i];local a=s.actors[p.target]
   p.life=p.life-dt;p.age=(p.age or 0)+dt
   local cloud=C.inSteam(s,p.x,p.y) or (a and C.inSteam(s,a.x,a.y-30))
   if a and a.hp>0 and (not p.homingTime or p.age<=p.homingTime) then
    local wanted=math.atan(a.y-30-p.y,a.x-p.x)
    local delta=(wanted-p.angle+math.pi)%(2*math.pi)-math.pi
    local turn=p.turnRate*(cloud and .2 or 1)*dt
    p.angle=p.angle+math.max(-turn,math.min(turn,delta))
   end
   p.obscured=not not cloud
   local nx,ny=p.x+math.cos(p.angle)*p.speed*dt,p.y+math.sin(p.angle)*p.speed*dt
   local blocked=C.resolveEnemyProjectileSegment(s,p,nx,ny,5,14,55)
   p.x=nx;p.y=ny
   if blocked or p.life<=0 then table.remove(s.projectiles,i) end
  end
  local returns=s.returns;step(s,dt,input)
  if s.returns~=returns then s.projectiles={};s.projectileTrial=false end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);f.projectiles=s.projectiles or {};f.projectileTrial=not not s.projectileTrial
  for _,cast in ipairs(s.pending) do if cast.placed=='SK47' then
   for i=-2,2 do f.draws[#f.draws+1]={kind='effect',x=cast.x-s.camera+i*60,y=cast.y-55,w=110,h=110,color='#c9d8df',alpha=.18} end
  end end
  for _,p in ipairs(s.projectiles or {}) do f.draws[#f.draws+1]={kind='rect',x=p.x-s.camera-5,y=p.y-5,w=10,h=10,color=p.obscured and '#d4dce4' or p.color or '#ff7959'} end
  f.commands=#f.draws;return f
 end
end
