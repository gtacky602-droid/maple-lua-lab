return function(C,G)
 local M={}
 local function rect(u0,u1,v0,v1)
  return {kind='rect',u0=u0,u1=u1,v0=v0,v1=v1}
 end
 local function capsule(u0,v0,u1,v1,r)
  return {kind='capsule',u0=u0,u1=u1,v0=v0,v1=v1,radius=r}
 end
 local claw,kick=rect(.1,1.45,.35,1.30),rect(.05,1.6,.05,1)
 local rush,slam=rect(0,1.6,.15,1.2),rect(-1.1,1.1,0,.45)
 local wave=rect(-1.35,1.35,0,.45)
 local shapes={
  RR01={claw,claw,claw,kick,kick,kick},RR02={rush},RR04={slam},
  RR05={rect(0,1.4,.1,1)},
  RR06={capsule(.1,.75,2.2,.75,.16),rect(.1,2,.3,1.2),capsule(.15,.1,1.7,1.75,.18)},
  RR07={capsule(.4,.65,.4,.65,.85)},RR08={rush},RR08B={rect(-1.3,1.3,0,.45),rect(-1.3,1.3,0,.45)},
  RR10={rect(-1.2,1.2,0,.6)},RR11={wave,wave,wave},
 }
 local projectile={
  RR03={speed=3.5,radius=.10,angles={-20,0,20},ahead=.3,height=.98,kind='spike',perGroup=1,warn=0},
  RR04={speed=3,radius=.14,kind='orb',height=1.8,perGroup=2,warn=84},
  RR08={speed=3,radius=.14,kind='orb',height=1.8,perGroup=2,warn=0},
  RR08B={speed=3,radius=.10,angles={-30,-15,0,15,30},ahead=.3,height=.98,kind='spike',perGroup=1,warn=0},
  RR11={speed=3,radius=.14,kind='orb',height=1.8,perGroup=1,warn=216},
 }
 local travel={RR02={54,78,3},RR07={72,108,3,1.4},RR08={210,234,2}}
 local function holdShape(s,run,c)
  local b,spec=run.boss,run.spec
  if not c.targetMember then c.targetActor=s.actors[s.active] end
  local x=G.trackTarget(s,c)
  c.dir=x>=c.startX and 1 or -1
  b.dir=c.dir
  c.aimX,c.aimY=x,c.targetY-36
  if c.key=='RR05' then c.dir=x>=c.origin and 1 or -1;b.dir=c.dir end
  if c.travel then
   local gap=math.max(0,math.min(c.travel[3]*spec.arena.unit,math.abs(c.aimX-c.startX)-.58*spec.arena.unit))
   c.finishX=G.clamp(spec,c.startX+c.dir*gap,28)
  end
 end
 function M.log(s,run,c,tag,actor,value,index)
  C.combatEvent(s,'stygian:rerir:'..c.key..':'..tag,actor or 0,run.boss.id,value or 0)
  local e=s.events[#s.events]
  e.tick,e.cast,e.group,e.variant=c.t,c.serial,index,c.variant
 end
 function M.begin(s,run,key,variant)
  local base=run.spec.cards[key]
  local d=variant and base.variants[variant] or base
  run.serial=run.serial+1
  local alternate=key=='RR08' and variant=='B'
  local poseKey=alternate and 'RR08B' or key
  local a=run.target or s.actors[s.active]
  local c={key=key,variant=variant,data=d,title=base.title,t=0,serial=run.serial,
   targetActor=a,targetMember=run.targetMember,target=a.x,targetY=a.y,
   startX=run.boss.x,origin=run.boss.x,windows={},areas={},shots={},groups={},
   travel=travel[poseKey],projectile=projectile[poseKey],
   damage=math.floor((run.spec.damage[key] or 0)*run.rules.damageScale+.5)}
  if key=='RR05' then
   local anchor=run.spec.fog.anchors[(run.fog.attempt-1)%#run.spec.fog.anchors+1]
   local side=a.x>=anchor and -1 or 1
   c.origin=G.clamp(run.spec,a.x+side*run.spec.arena.unit*.91,64)
  end
  local area,shot=0,0
  for i,entry in ipairs(d.active_windows) do
   local w={first=entry[1],last=entry[2],shot=entry[3]=='projectile',seen={},index=i}
   if w.shot then shot=shot+1;w.sequence=shot
   else area=area+1;w.shape=shapes[poseKey] and shapes[poseKey][area];w.sequence=area end
   c.windows[i]=w
  end
  if key=='RR09' or key=='RR13' then
   c.path=c.key=='RR09' and 1 or 2
   c.pickups={};c.collected=0;c.burst={}
   if run.parties then c.pickupsByMember={} end
   for i,p in ipairs(run.spec.trials.paths[c.path].pickups) do
    c.pickups[i]={id=i,x=p[1],y=p[2]-24,sole=p[2]}
   end
  end
  holdShape(s,run,c)
  return c
 end
 local function areaFor(run,c,w)
  local arena=run.spec.arena
  if c.path then
   if w.sequence==4 then return G.groundBox(run.spec,arena.left,arena.right,0,arena.floor) end
   local x=run.spec.trials.paths[c.path].columns[w.sequence]
   local h=.325*arena.unit
   return G.groundBox(run.spec,x-h,x+h,arena.floor-2*arena.unit,arena.floor)
  end
  if not w.shape then return end
  local x=c.travel and c.finishX or c.origin
  if c.key=='RR01' then x=x+.35*arena.unit*(w.sequence-1)/5*c.dir end
  if c.key=='RR06' then x=x+.20*arena.unit*(w.sequence-1)/2*c.dir end
  return G.shape(run.spec,w.shape,x,c.dir)
 end
 local function shotsFor(run,c,w)
  local p,U=c.projectile,run.spec.arena.unit
  local origin=c.origin
  local x,y=origin+c.dir*(p.ahead or -1+(.4*w.sequence))*U,run.spec.arena.floor-p.height*U
  local aim=not p.angles and math.atan(c.aimY-y,math.max(U*.55,math.abs(c.aimX-x))) or 0
  local list={}
  for _,deg in ipairs(p.angles or {0}) do
   local a=aim+math.rad(deg)
   list[#list+1]={x=x,y=y,dx=c.dir*math.cos(a)*p.speed*U/60,dy=math.sin(a)*p.speed*U/60,
    radius=p.radius*U,index=w.index,group=p.angles and w.sequence or 1,expires=w.last,life=w.last-w.first,
    kind=p.kind,seen={},cap=p.perGroup}
  end
  return list
 end
 local function damage(s,run,c,a,w,source)
  local amount=C.damageActor(s,a,c.damage,source or run.boss,true,true)
  M.log(s,run,c,'contact',a.id,amount,w.index)
  return amount
 end
 local function travelTick(run,c)
  local b,arena=run.boss,run.spec.arena
  if c.path then
   local rise=math.min(1,math.max(0,(c.t-72)/48),math.max(0,(1050-c.t)/30))
   b.y=arena.floor-3.5*arena.unit*rise
  elseif c.travel and c.t>=c.travel[1] then
   local start,stop=c.travel[1],c.travel[2]
   local p=G.dashProgress(c.t-start,stop-start)
   b.x=c.startX+(c.finishX-c.startX)*p
   local apex=c.travel[4]
   if apex then
    local rise=c.t<=stop and math.min(1,2*p) or math.max(0,(120-c.t)/(120-stop))
    b.y=arena.floor-apex*arena.unit*rise
   end
  elseif c.key=='RR05' and c.t==48 then
   b.x=c.origin
  end
  b.hitTop,b.hitBottom=b.y-136,b.y
 end
 local function tickShots(s,run,c)
  local arena=run.spec.arena
  for i=#c.shots,1,-1 do
   local p=c.shots[i]
   local nx,ny=p.x+p.dx,p.y+p.dy
   if c.t>=p.expires or ny>arena.floor or nx<arena.left-p.radius or nx>arena.right+p.radius then
    table.remove(c.shots,i)
   else
    local group=c.groups[p.group]
    G.eachContact(s,run,p.seen,function(a,key)
     return (group[key] or 0)<p.cap and G.boltContact(p.x,p.y,nx,ny,p.radius,a)
    end,function(party,a,key)
     group[key]=(group[key] or 0)+1
     damage(party,run,c,a,c.windows[p.index],{id=run.boss.id,x=p.x,y=p.y+30})
    end)
    p.x,p.y=nx,ny
   end
  end
 end
 function M.trialProgress(c,s)
  return c.pickupsByMember and c.pickupsByMember[s.coopMember] or c
 end
 local function collect(s,run,c)
  local a=s.actors[s.active]
  if a.hp<=0 or s.auto then return end
  local personal=M.trialProgress(c,s)
  if c.pickupsByMember and personal==c then
   personal={collected=0,pickups={}}
   for i,p in ipairs(c.pickups) do personal.pickups[i]={id=p.id,x=p.x,y=p.y,sole=p.sole} end
   c.pickupsByMember[s.coopMember]=personal
  end
  for _,p in ipairs(personal.pickups) do
   if not p.owner and math.abs(a.x-p.x)<=24 and a.y>=p.y and a.y-68<=p.y then
    p.owner=s.coopMember and s.coopMember.id or 1
    p.t=c.t
    personal.collected=personal.collected+1
    M.log(s,run,c,'pickup',a.id,personal.collected,p.id)
   end
  end
 end
 local function tickPath(s,run,c)
  if c.t<120 or c.t>=960 then return end
  for _,party in ipairs(run.parties or {s}) do collect(party,run,c) end
 end
 local function finalBurst(s,run,c,w)
  local anyProtected=false
  for _,party in ipairs(run.parties or {s}) do
   local personal=M.trialProgress(c,party)
   local protected=personal.collected==3
   if personal~=c then personal.protected=protected end
   if protected then
    anyProtected=true
    if c.path==2 and run.parties then party.endgameRun.mechanicContribution=true end
   end
   for _,a in ipairs(party.actors) do
    if a.hp>0 then
     if protected then
      M.log(party,run,c,'protected',a.id,1,w.index)
     else
      local n=C.damageActor(party,a,math.floor(run.spec.damage.collapse*run.rules.damageScale+.5),run.boss,false,true)
      M.log(party,run,c,'collapse',a.id,n,w.index)
     end
    end
   end
  end
  c.burst.complete=anyProtected
  if c.key=='RR13' and not c.burst.complete then c.stop=1176 end
 end
 function M.tick(s,run,c)
  local locks=c.data.lock_ticks
  if c.t<=(locks[1] or -1) or c.t==locks[2] then holdShape(s,run,c) end
  if c.t==locks[1] or c.t==locks[2] then M.log(s,run,c,'lock',nil,c.dir) end
  if c.lamp then return end
  travelTick(run,c)
  if c.path then tickPath(s,run,c) end
  for _,w in ipairs(c.windows) do
   if c.t==w.first then
    M.log(s,run,c,'window',nil,w.index,w.index)
    if w.shot then
     for _,p in ipairs(shotsFor(run,c,w)) do
      c.groups[p.group]=c.groups[p.group] or {}
      c.shots[#c.shots+1]=p
     end
     M.log(s,run,c,'launch',nil,w.index,w.index)
    else
     c.areas[w.index]=areaFor(run,c,w)
     if c.path and w.sequence==4 then finalBurst(s,run,c,w) end
     if c.key=='RR01' or c.key=='RR06' then run.boss.x=c.areas[w.index].x end
    end
   end
   if not w.shot and c.t>=w.first and c.t<w.last and not (c.path and w.sequence==4) then
    G.eachContact(s,run,w.seen,function(a) return G.bodyContact(c.areas[w.index],a) end,
     function(party,a) damage(party,run,c,a,w) end)
   end
  end
  if #c.shots>0 then tickShots(s,run,c) end
 end
 local function warnAt(c,w)
  if c.path then return w.first-(w.sequence==4 and 48 or 120) end
  if c.key=='RR01' and w.sequence>3 then return 96 end
  if c.key=='RR05' then return 48 end
  if c.key=='RR08' then
   if c.variant=='A' then return 174 end
   return w.sequence==1 and 132 or 192
  end
  if c.key=='RR10' then return 108 end
  if c.key=='RR11' and w.sequence>1 then return c.windows[w.index-1].last end
  return 0
 end
 function M.cues(run,c)
  local out={areas={},rays={},road=nil}
  if c.lamp then return out end
  for _,w in ipairs(c.windows) do
   if w.shot and c.t>=c.projectile.warn and c.t<w.first then
    for _,shot in ipairs(shotsFor(run,c,w)) do
     local duplicate=false
     for _,prior in ipairs(out.rays) do
      if prior.x==shot.x and prior.y==shot.y and prior.dx==shot.dx and prior.dy==shot.dy then duplicate=true;break end
     end
     if not duplicate then out.rays[#out.rays+1]=shot end
    end
   elseif not w.shot and c.t>=warnAt(c,w) and c.t<w.last then
    local shape=c.areas[w.index] or areaFor(run,c,w)
    if shape then out.areas[#out.areas+1]={shape=shape,index=w.index,active=c.t>=w.first,final=c.path and w.sequence==4} end
   end
  end
  local t=c.travel
  if t and c.t<(t[2] or 0) and (c.key~='RR08' or c.t>=174) then out.road={from=c.startX,to=c.finishX} end
  return out
 end
 return M
end
