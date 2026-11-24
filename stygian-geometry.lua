local G={}
 local function clamp(x,a,b) return math.max(a,math.min(b,x)) end
 function G.clamp(spec,x,margin)
  local board=spec.arena
  return clamp(x,board.left+(margin or 0),board.right-(margin or 0))
 end
 local function abs(a) return math.abs(a) end
 function G.distance2(x,y,x0,y0,x1,y1)
  local dx,dy=x1-x0,y1-y0
  local d=dx*dx+dy*dy
  local t=d>0 and clamp(((x-x0)*dx+(y-y0)*dy)/d,0,1) or 0
  return (x-x0-t*dx)^2+(y-y0-t*dy)^2
 end
 function G.shape(spec,p,x,dir,y)
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
  g.left,g.right=G.clamp(spec,math.min(x0,x1)),G.clamp(spec,math.max(x0,x1))
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
   return G.distance2(u,v,g.u0,g.v0,g.u1,g.v1)<=g.radius*g.radius
  end
  return true
 end
 function G.bodyContact(g,a)
  if a.hp<=0 or a.x<g.left-9 or a.x>g.right+9 or a.y<g.top or a.y-68>g.bottom then return false end
  for _,lift in ipairs({8,32,58}) do
   for _,offset in ipairs({0,-8,8}) do
    if includes(g,a.x+offset,a.y-lift) then return true end
   end
  end
  return false
 end
 function G.groundBox(spec,x0,x1,top,bottom)
  local y=spec.arena.floor
  return G.shape(spec,{kind='rect',u0=0,u1=(x1-x0)/spec.arena.unit,
   v0=(y-bottom)/spec.arena.unit,v1=(y-top)/spec.arena.unit},x0,1,y)
 end
 function G.trackTarget(s,c)
  local member=c.targetMember
  if not member or (member.online and member.state.coop==s.coop and c.targetActor.hp>0) then
   c.target=c.targetActor.x
   c.targetY=c.targetActor.y
  end
  return c.target
 end
 function G.eachContact(s,run,seen,collides,hit)
  for _,party in ipairs(run.parties or {s}) do
   for _,a in ipairs(party.actors) do
    local key=run.parties and a or a.id
    if a.hp>0 and not seen[key] and collides(a,key) then
     seen[key]=true
     hit(party,a,key)
    end
   end
  end
 end
 function G.dashProgress(n,span)
  if n<=0 then return 0 end
  if n>=span then return 1 end
  if n<2 then return n*n/4/(span-2) end
  if n>span-2 then return 1-(span-n)^2/4/(span-2) end
  return (n-1)/(span-2)
 end
 function G.drawShape(rect,z,color,active,lock)
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
 function G.boltContact(x,y,nextX,nextY,radius,a)
  if a.hp<=0 then return false end
  for _,lift in ipairs({8,28,48,68}) do
   if G.distance2(a.x,a.y-lift,x,y,nextX,nextY)<=(radius+8)^2 then return true end
  end
  return false
 end
return G
