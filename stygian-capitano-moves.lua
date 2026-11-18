return function(C)
 local M={ice='#a4dfef',pale='#effbff',edge='#557d9c',warning='#ffce9a',locked='#ffe9bd'}
 local function clamp(x,a,b) return math.max(a,math.min(b,x)) end
 function M.clamp(spec,x,margin)
  local board=spec.arena
  return clamp(x,board.left+(margin or 0),board.right-(margin or 0))
 end
 local function abs(a) return math.abs(a) end
 local function distance2(x,y,x0,y0,x1,y1)
  local dx,dy=x1-x0,y1-y0
  local d=dx*dx+dy*dy
  local t=d>0 and clamp(((x-x0)*dx+(y-y0)*dy)/d,0,1) or 0
  return (x-x0-t*dx)^2+(y-y0-t*dy)^2
 end
 local function shape(spec,p,x,dir,y)
  local U=spec.arena.unit
  local g={kind=p.kind,x=x,y=y or spec.arena.floor,direction=dir,unit=U}
  if p.kind=='sector' then
   g.radius,g.height,g.a0,g.a1=p.radius,p.v,math.rad(p.a0),math.rad(p.a1)
   g.u0,g.u1,g.v0,g.v1=0,p.radius,math.max(0,p.v-p.radius),p.v+p.radius
  else
   g.u0,g.u1,g.v0,g.v1,g.radius=p.u0,p.u1,p.v0,p.v1,p.radius
  end
  local r=g.kind=='capsule' and g.radius or 0
  local x0=x+dir*(g.u0-r)*U
  local x1=x+dir*(g.u1+r)*U
  g.left,g.right=M.clamp(spec,math.min(x0,x1)),M.clamp(spec,math.max(x0,x1))
  g.top,g.bottom=g.y-(math.max(g.v0,g.v1)+r)*U,g.y-(math.min(g.v0,g.v1)-r)*U
  return g
 end
 local function includes(g,x,y)
  if x<g.left or x>g.right or y<g.top or y>g.bottom then return false end
  local u,v=(x-g.x)*g.direction/g.unit,(g.y-y)/g.unit
  if g.kind=='sector' then
   local dv=v-g.height
   local angle=math.atan(dv,u)
   return u*u+dv*dv<=g.radius*g.radius and angle>=g.a0 and angle<=g.a1
  elseif g.kind=='capsule' then
   return distance2(u,v,g.u0,g.v0,g.u1,g.v1)<=g.radius*g.radius
  end
  return true
 end
 local function bodyContact(g,a)
  if a.hp<=0 or a.x<g.left-9 or a.x>g.right+9 or a.y<g.top or a.y-68>g.bottom then return false end
  for _,lift in ipairs({8,32,58}) do
   for _,offset in ipairs({0,-8,8}) do
    if includes(g,a.x+offset,a.y-lift) then return true end
   end
  end
  return false
 end
 local function groundBox(spec,x0,x1,top,bottom)
  local y=spec.arena.floor
  return shape(spec,{kind='rect',u0=0,u1=(x1-x0)/spec.arena.unit,
   v0=(y-bottom)/spec.arena.unit,v1=(y-top)/spec.arena.unit},x0,1,y)
 end
 local function cluster(s,run,c,index,g)
  local seen=c.hit[index] or {}
  c.hit[index]=seen
  for _,a in ipairs(s.actors) do
   if not seen[a.id] and bodyContact(g,a) then
    M.hit(s,run,c,seen,a,index)
   end
  end
 end
 function M.hit(s,run,c,seen,a,group)
  seen[a.id]=true
  local b=run.boss
  local damage=C.damageActor(s,a,c.damage,b,true,true)
  C.combatEvent(s,'stygian:capitano:'..c.key..':contact',a.id,b.id,damage)
  local e=s.events[#s.events];e.group=group;e.tick=c.t;e.cast=c.serial
  if damage>0 then
   c.sparks[#c.sparks+1]={x=a.x,y=a.y-32,t=c.t}
  end
 end
 function M.plan(s,run,spec,c)
  local b=run.boss
  local a=s.actors[c.owner]
  local d=c.data
  local U=spec.arena.unit
  local dir=a.x>b.x and 1 or -1
  if math.abs(a.x-b.x)<12 then dir=b.dir end
  c.origin=b.x;c.dir=dir;c.target=a.x
  c.land=d.dash and M.clamp(spec,b.x+dir*math.min(d.reach*U,math.abs(a.x-b.x)),.60*U) or b.x
  c.shapes={};c.roots={}
  local root=d.dash and c.land or b.x
  for i,p in ipairs(d.shapes) do
   if d.root then root=M.clamp(spec,root+dir*d.root[i]*U,.60*U) end
   c.roots[i]=root
   c.shapes[i]=shape(spec,p,p.origin=='landing' and c.land or root,dir)
  end
  if d.pillars then
   local p=d.pillars
   local at=M.clamp(spec,a.x,(p.spacing+.8)*U)
   for _,offset in ipairs({-p.spacing,p.spacing,0}) do
    c.shapes[#c.shapes+1]=shape(spec,{kind='rect',u0=-p.width/2,u1=p.width/2,v0=0,v1=p.height},at+offset*U,1)
   end
  elseif d.plate then
   c.boardX=M.clamp(spec,c.origin+dir*d.plate.front*U,.6*U)
  end
  b.dir=dir
 end
 local function projectile(spec,c)
  local d,U=c.data,spec.arena.unit
  local p=d.projectile
  local floor=spec.arena.floor
  if c.key=='CP05' then
   c.shots[1]={x=c.origin+c.dir*.22*U,y=floor-p.height/2*U,vx=c.dir*p.speed*U/60,vy=0,
    radius=p.width/2*U,h=p.height*U,expire=c.t+p.ttl,startX=c.origin+c.dir*.22*U,maxRange=p.reach*U}
  else
   for i,angle in ipairs(p.angles) do
    local rad=math.rad(angle)
    c.shots[i]={x=c.boardX,y=floor-d.plate.height*U*.47,
     vx=c.dir*math.cos(rad)*p.speed*U/60,vy=-math.sin(rad)*p.speed*U/60,radius=p.radius*U,
     expire=c.t+p.ttl}
   end
  end
 end
 local function advanceShot(s,run,spec,c,p)
  local nextX,nextY=p.x+p.vx,p.y+p.vy
  if c.t>=p.expire or nextX<spec.arena.left-p.radius or nextX>spec.arena.right+p.radius or
     p.maxRange and abs(nextX-p.startX)>p.maxRange+1e-8 then return false end
  local seen=c.hit.projectiles
  for _,a in ipairs(s.actors) do
   if a.hp>0 and not seen[a.id] then
    local touched
    if p.h then
     touched=bodyContact(groundBox(spec,math.min(p.x,nextX)-p.radius,math.max(p.x,nextX)+p.radius,p.y-p.h/2,p.y+p.h/2),a)
    else
     for _,lift in ipairs({8,28,48,68}) do
      if distance2(a.x,a.y-lift,p.x,p.y,nextX,nextY)<=(p.radius+8)^2 then touched=true;break end
     end
    end
    if touched then M.hit(s,run,c,seen,a,'projectiles') end
   end
  end
  p.prevX,p.prevY,p.x,p.y=p.x,p.y,nextX,nextY
  return true
 end
 local function dashProgress(n,span)
  if n<=0 then return 0 end
  if n>=span then return 1 end
  if n<2 then return n*n/4/(span-2) end
  if n>span-2 then return 1-(span-n)^2/4/(span-2) end
  return (n-1)/(span-2)
 end
 function M.tick(s,run,spec,c)
  local b,d=run.boss,c.data
  if c.t<=d.lock then M.plan(s,run,spec,c) end
  if c.t==d.lock then
   C.combatEvent(s,'stygian:capitano:'..c.key..':lock',c.owner,b.id,c.dir)
  end
  if d.dash and c.t>=d.dash[1] and c.t<=d.dash[2] then
   local u=dashProgress(c.t-d.dash[1],d.dash[2]-d.dash[1])
   b.x=c.origin+(c.land-c.origin)*u
  end
  for i,win in ipairs(d.windows) do
   if c.t==win[1] then
    C.combatEvent(s,'stygian:capitano:'..c.key..':window',0,b.id,i)
    local e=s.events[#s.events];e.tick=c.t;e.cast=c.serial
    if d.projectile then projectile(spec,c)
    else b.x=c.roots[i] or b.x end
   end
   if c.t>=win[1] and c.t<win[2] and c.shapes[i] then
    cluster(s,run,c,i,c.shapes[i])
   end
  end
  for i=#c.shots,1,-1 do
   if not advanceShot(s,run,spec,c,c.shots[i]) then table.remove(c.shots,i) end
  end
 end
 function M.cue(spec,c)
  local d=c.data
  local tells={}
  if d.dash and c.t<d.dash[2] then
   tells.road={from=c.origin,to=c.land,y=spec.arena.floor}
  end
  for i,g in ipairs(c.shapes) do
   local win=d.windows[i]
   local begin=d.leads and d.leads[i] or (d.guard and d.guard[2] or 0)
   if c.t>=begin and c.t<win[2] then
    tells[#tells+1]={shape=g,index=i,active=c.t>=win[1],near=d.lateTell and i==3 and c.t>=d.lateTell}
   end
  end
  if c.key=='CP05' and c.t<d.windows[1][1] then
   local U,y=spec.arena.unit,spec.arena.floor
   local start=c.origin+c.dir*.22*U
   local stop=M.clamp(spec,start+c.dir*d.projectile.reach*U)
   tells[#tells+1]={shape=groundBox(spec,math.min(start,stop),math.max(start,stop),y-d.projectile.height*U,y),index=1}
  elseif c.key=='CP07' and c.t<d.plate.burst then
   local U=spec.arena.unit
   local y=spec.arena.floor-d.plate.height*U*.47
   local travel=d.projectile.speed*U*d.projectile.ttl/60
   tells.rays={}
   for i,angle in ipairs(d.projectile.angles) do
    local rad=math.rad(angle)
    local endX=M.clamp(spec,c.boardX+c.dir*math.cos(rad)*travel)
    local endY=y-abs(endX-c.boardX)*math.tan(rad)
    tells.rays[i]={x=c.boardX,y=y,x1=endX,y1=endY}
   end
  end
  return tells
 end
 function M.drawShape(rect,z,color,active,lock)
  local lo,hi,top,base=z.left,z.right,z.top,z.bottom
  if hi-lo<1 then return end
  if z.kind=='rect' then
   rect(lo,top,hi-lo,base-top,color,active and .21 or .08,true)
   rect(lo,base-3,hi-lo,3,color,.91);rect(lo,top,hi-lo,2,color,.56)
   for x=lo+4,hi-4,18 do rect(x,base-8,6,3,color,.85) end
   rect(lo,top,lock and 3 or 2,base-top,color,.78);rect(hi-2,top,2,base-top,color,.78)
   return
  end
  for y=top,base-1,6 do
   local lx,hx
   for x=lo,hi,4 do
    if includes(z,x,y) then lx=lx or x;hx=x end
   end
   if lx and hx>lx then
    rect(lx,y,hx-lx,6,color,active and .25 or .09,true)
    rect(lx,y,2,6,color,.7);rect(hx,y,2,6,color,.7)
   end
  end
 end
 function M.collisionThreat(spec,c,a)
  if not c then return end
  for _,cue in ipairs(M.cue(spec,c)) do
   if bodyContact(cue.shape,a) then return cue.shape end
  end
 end
 return M
end
