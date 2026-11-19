return function(C,G)
 local M={}
 local function between(t,a,b) return t>=a and t<b end
 local function mix(start,stop,u) return start+(stop-start)*math.max(0,math.min(1,u)) end
 local function sign(x) return x>=0 and 1 or -1 end
 local function log(s,r,c,tag,value,actor)
  C.combatEvent(s,'stygian:wanderer:'..c.key..':'..tag,actor or 0,r.boss.id,value or 0)
  local e=s.events[#s.events]
  e.tick,e.cast=c.t,c.serial
 end
 local function aim(s,r,c)
  local a,b=r.spec.arena,r.boss
  local target=s.actors[s.active].x
  c.dir=sign(target-c.originX)
  b.dir=c.dir
  if c.key=='WD02' then
   local span=math.max(126,math.min(c.data.maxTravel,math.abs(target-c.originX)+112))
   if c.originX+c.dir*92<a.left or c.originX+c.dir*92>a.right then c.dir=-c.dir;b.dir=c.dir end
   c.stopX=G.clamp(r.spec,c.originX+c.dir*span,26)
  elseif c.key=='WD04' then c.stopX=G.clamp(r.spec,target,c.data.radius+8) end
 end
 function M.begin(s,r,key)
  local d=r.spec.moves[key]
  r.serial=r.serial+1
  local b=r.boss
  local c={key=key,data=d,t=0,serial=r.serial,originX=b.x,originY=b.y,seen={},
   untilTick=d.total,recover=d.recover,damage=math.floor(d.damage*r.rules.damageScale+.5)}
  if d.marks then
   c.marks={};c.collected=0
   local mirror=s.actors[s.active].x>r.spec.arena.centerX
   if key=='WD06' then c.hoverX=r.spec.arena.centerX+(mirror and -155 or 155) end
   for i,slot in ipairs(d.marks) do
    if mirror and slot~='C' then slot=slot=='L' and 'R' or 'L' end
    local p=r.spec.arena.marks[slot]
    c.marks[i]={id=i,x=p[1],y=p[2]}
   end
  end
  aim(s,r,c)
  log(s,r,c,'start',c.serial)
  return c
 end
 local function takeMarks(s,r,c)
  local w=c.data.markWindow
  if not w or c.drop or not between(c.t,w[1],w[2]) or s.auto then return end
  local a=s.actors[s.active]
  if a.hp<=0 or not a.ground then return end
  for _,p in ipairs(c.marks) do
   if not p.taken and a.y==p.y and math.abs(p.x-a.x)<=26 then
    p.taken=true
    c.collected=c.collected+1
    log(s,r,c,'mark',c.collected,a.id)
    if c.collected==#c.marks and c.key=='WD03' then
     local b=r.boss
     local offset=p.x<r.spec.arena.centerX and 58 or -58
     c.drop={at=c.t,fromX=b.x,fromY=b.y,toX=p.x+offset,toY=p.y}
     c.recover=c.t+c.data.dropTicks
     c.untilTick=c.recover+c.data.successRecovery
     log(s,r,c,'air-open',c.data.successRecovery,a.id)
    end
   end
  end
 end
 local function flight(r,c)
  local b,a,d=r.boss,r.spec.arena,c.data
  local t=c.t
  if c.key=='WD02' then
   local v=d.flight
   if t>=v[1] and t<v[2] then
    b.y=mix(c.originY,a.floor-d.height,(t-v[1])/(v[2]-v[1]))
   elseif t>=v[2] and t<v[3] then
    b.x=mix(c.originX,c.stopX,G.dashProgress(t-v[2],v[3]-v[2]))
    b.y=a.floor-d.height
   elseif t>=v[3] then
    b.x=c.stopX
    b.y=mix(a.floor-d.height,a.floor,(t-v[4])/(v[5]-v[4]))
   end
  elseif c.key=='WD03' and c.drop then
   local v=c.drop
   local progress=(t-v.at)/d.dropTicks
   b.x=mix(v.fromX,v.toX,progress)
   b.y=mix(v.fromY,v.toY,progress)
  elseif c.key=='WD03' or c.key=='WD06' then
   local untilFall=c.key=='WD03' and 399 or 574
   local fallDuration=c.key=='WD03' and 30 or 26
   local lift=math.min(1,math.max(0,(t-32)/36),math.max(0,(untilFall+fallDuration-t)/fallDuration))
   b.y=a.floor-d.elevation*lift
   b.x=mix(c.originX,c.hoverX or a.centerX,(t-30)/42)
  elseif c.key=='WD04' then
   local v=d.flight
   if t>=v[1] and t<v[2] then
    b.y=mix(c.originY,a.floor-d.height,(t-v[1])/(v[2]-v[1]))
   elseif t>=v[2] then
    local p=(t-v[2])/(v[3]-v[2])
    b.x=mix(c.originX,c.stopX,p)
    b.y=mix(a.floor-d.height,a.floor,p*p)
   end
  end
  b.hitTop,b.hitBottom=b.y-105,b.y
 end
 local function landBox(r,l,x,top,y)
  local a=r.spec.arena
  return G.groundBox(r.spec,l,x,top,y or a.floor)
 end
 local function shape(r,c,i)
  local a=r.spec.arena
  if c.key=='WD01' then
   local span=({150,210,245})[i]
   local y=({a.floor-49,a.floor-105,a.floor-45})[i]
   local from,to=c.originX+24*c.dir,c.originX+span*c.dir
   return landBox(r,math.min(from,to),math.max(from,to),y,i==2 and a.floor-27 or a.floor)
  elseif c.key=='WD02' then
   return landBox(r,math.min(c.stopX,c.originX)-28,math.max(c.stopX,c.originX)+28,a.floor-191,a.floor-99)
  elseif c.key=='WD04' then
   return landBox(r,c.stopX-c.data.radius,c.stopX+c.data.radius,a.floor-67)
  elseif c.key=='WD05' and i==2 then
   return landBox(r,a.left,a.right,a.floor-286,a.floor-95)
  end
  return landBox(r,a.left,a.right,a.floor-35)
 end
 local function zones(r,c,i)
  if c.drop then return {} end
  if c.key=='WD06' and i==2 then
   if not c.gate then return {} end
   local a,g=r.spec.arena,c.gate
   return {landBox(r,a.left,g.x-g.half,92),landBox(r,g.x+g.half,a.right,92)}
  end
  return {shape(r,c,i)}
 end
 local function fixGate(s,r,c)
  local x=s.actors[s.active].x
  local nearest
  for _,site in ipairs(r.spec.arena.gateSites) do
   if not nearest or math.abs(x-site)<math.abs(x-nearest) then nearest=site end
  end
  local full=c.collected==#c.marks
  c.gate={x=nearest,half=full and c.data.wide or c.data.narrow}
  if not full then c.untilTick=c.data.failureEnd end
  log(s,r,c,'gate',nearest)
 end
 local function hitWindow(s,r,c,i)
  local bands=zones(r,c,i)
  c.seen[i]=c.seen[i] or {}
  local seen=c.seen[i]
  for _,a in ipairs(s.actors) do
   if not seen[a.id] then
    for _,z in ipairs(bands) do
     if G.bodyContact(z,a) then
      seen[a.id]=true
      local amount=C.damageActor(s,a,c.damage,r.boss,true,true)
      log(s,r,c,'contact',amount,a.id)
      break
     end
    end
   end
  end
 end
 function M.tick(s,r,c)
  if c.t<=c.data.lock then aim(s,r,c) end
  if c.t==c.data.lock then log(s,r,c,'lock',c.stopX or c.dir) end
  flight(r,c)
  takeMarks(s,r,c)
  if c.t==c.data.gateTick then fixGate(s,r,c) end
  if c.drop then return end
  for i,w in ipairs(c.data.windows) do
   if c.t==w[1] then log(s,r,c,'window',i) end
   if between(c.t,w[1],w[2]) then hitWindow(s,r,c,i) end
  end
 end
 local warnings={WD01={0,59,96},WD02={0},WD03={399},WD04={0},WD05={0,76},WD06={0,438}}
 function M.cues(r,c)
  local shown={}
  for i,w in ipairs(c.data.windows) do
   if c.t>=warnings[c.key][i] and c.t<w[2] then
    for _,z in ipairs(zones(r,c,i)) do
     shown[#shown+1]={shape=z,active=c.t>=w[1],index=i}
    end
   end
  end
  return shown
 end
 return M
end
