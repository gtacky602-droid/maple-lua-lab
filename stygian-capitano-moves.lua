return function(C,G)
 local M={ice='#a4dfef',pale='#effbff',edge='#557d9c',warning='#ffce9a',locked='#ffe9bd'}
 local shape,bodyContact,groundBox=G.shape,G.bodyContact,G.groundBox
 local dashProgress=G.dashProgress
 local abs=math.abs
 M.clamp,M.drawShape=G.clamp,G.drawShape
 local function hit(s,run,c,a,group)
  local b=run.boss
  local damage=C.damageActor(s,a,c.damage,b,true,true)
  if c.finaleDamage then
   local hits=c.finaleDamage[group] or {};c.finaleDamage[group]=hits
   hits[a]=damage
  end
  C.combatEvent(s,'stygian:capitano:'..c.key..':contact',a.id,b.id,damage)
  local e=s.events[#s.events];e.group=group;e.tick=c.t;e.cast=c.serial
  if damage>0 then
   c.sparks[#c.sparks+1]={x=a.x,y=a.y-32,t=c.t}
  end
 end
 local function hitGroup(s,run,c,group,collides)
  local seen=c.hit[group] or {}
  c.hit[group]=seen
  G.eachContact(s,run,seen,collides,function(party,actor) hit(party,run,c,actor,group) end)
 end
 function M.plan(s,run,spec,c)
  local b=run.boss
  local target=G.trackTarget(s,c)
  local d=c.data
  local U=spec.arena.unit
  local dir=target>b.x and 1 or -1
  if math.abs(target-b.x)<12 then dir=b.dir end
  c.origin=b.x;c.dir=dir
  c.land=d.dash and M.clamp(spec,b.x+dir*math.min(d.reach*U,math.abs(target-b.x)),.60*U) or b.x
  c.shapes={};c.roots={}
  local root=d.dash and c.land or b.x
  for i,p in ipairs(d.shapes) do
   if d.root then root=M.clamp(spec,root+dir*d.root[i]*U,.60*U) end
   c.roots[i]=root
   c.shapes[i]=shape(spec,p,p.origin=='landing' and c.land or root,dir)
  end
  if d.pillars then
   local p=d.pillars
   local at=M.clamp(spec,target,(p.spacing+.8)*U)
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
  local swept=p.h and groundBox(spec,math.min(p.x,nextX)-p.radius,math.max(p.x,nextX)+p.radius,p.y-p.h/2,p.y+p.h/2)
  hitGroup(s,run,c,'projectiles',function(a)
   if swept then return bodyContact(swept,a) end
   return G.boltContact(p.x,p.y,nextX,nextY,p.radius,a)
  end)
  p.prevX,p.prevY,p.x,p.y=p.x,p.y,nextX,nextY
  return true
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
    hitGroup(s,run,c,i,function(a) return bodyContact(c.shapes[i],a) end)
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
 function M.collisionThreat(spec,c,a)
  if not c then return end
  for _,cue in ipairs(M.cue(spec,c)) do
   if bodyContact(cue.shape,a) then return cue.shape end
  end
 end
 return M
end
