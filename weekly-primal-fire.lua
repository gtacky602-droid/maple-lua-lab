return function(C)
 local controller={}
 local previousAvoid=C.aiAvoidTarget
 local U=88
 local ember,violet,pale='#ffc17d','#bd9aff','#f5eaff'
 local cleanse={WG06=true,WG09=true,WG14=true,WG16=true}
 local trials={WG05=true,WG06=true,WG14=true,WG16=true}
 local ordinary={WG01=true,WG02=true,WG03=true,WG04=true,WG07=true,WG10=true,WG11=true,WG12=true,WG13=true}
 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 local function active(s) return s.actors[s.active] end
 local function ownLog(s,w,key,owner,n) C.combatEvent(s,'primal:'..key,owner or 0,w.primary.id,n or 0) end
 local function log(s,w,key,owner,n)
  for _,party in ipairs(s.parties or {s}) do ownLog(party,w,key,owner,n) end
 end
 local function owner(s,a) return s.actorOwners and s.actorOwners[a] or s end
 local function target(s,e)
  if not s.parties then return active(s) end
  local best,distance=e,math.huge
  for _,party in ipairs(s.parties) do
   local a=active(party)
   if a.hp<=0 then a=party.actors[3-party.active] end
   local dx=math.abs(a.x-e.x)
   if a.hp>0 and dx<distance then best,distance=a,dx end
  end
  return best
 end
 local function weakKeys() return setmetatable({},{__mode='k'}) end
 local function state(w,a)
  local data=w.actors[a]
  if not data then data={marks={},last=-math.huge,floorAt=-math.huge,fallAt=0};w.actors[a]=data end
  return data
 end
 local function contribution(s,w,id)
  if s.coop then C.coopContact(s,w.primary,id) end
 end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function band(lo,hi,y,h,color)
  return {lo=math.min(lo,hi),hi=math.max(lo,hi),y=y,h=h,color=color}
 end
 local function ring(x,r,y,h,color) return band(x-r,x+r,y,h,color) end
 local function curse(z) z.erosion=true;return z end
 local function inside(a,z)
  return a.hp>0 and a.x>=z.lo and a.x<=z.hi and a.y>=z.y-z.h and a.y<=z.y+4
 end
 local function project(w,spec,x,pad) return clamp(x,w.left+pad,spec.arena.right-pad) end
 local function ledge(spec,left)
  local a=spec.arena
  return {x=left+a.platformInset,y=a.upperY,w=a.platformWidth}
 end
 local function putFloor(s,w,spec)
  local a=spec.arena
  s.platforms={{x=w.left,y=spec.floorY,w=a.right-w.left},ledge(spec,w.left),
   {x=a.right-a.platformInset-a.platformWidth,y=a.upperY,w=a.platformWidth}}
 end
 local function targetable(w,enabled)
  local e=w.primary
  e.invulnerable=not enabled;e.underground=not enabled;e.noAutoTarget=not enabled
  if w.part then w.part.invulnerable=not enabled;w.part.underground=not enabled end
 end
 local function locate(w,spec,x)
  local e=w.primary
  e.x=project(w,spec,x,92);e.y=spec.floorY;e.hitTop=e.y-85;e.hitBottom=e.y
  if w.part then
   local p=w.part
   p.x=project(w,spec,e.x-78,38);p.y=e.y;p.hitTop=e.y-58;p.hitBottom=e.y
  end
 end
 local function contact(s,w,cast,mult,color,element)
  local e,c=w.primary,w.cast
  local tick=w.contactTick or c and c.t
  if e.hp<=0 or e.invulnerable or c and c.key=='WG17' and tick>=c.move.exposure[2] then return false end
  local resist=C.enemyResistance(cast,e,element)
  if resist>=1 then return false end
  local n,critical=C.enemyHitDamage(s,cast,e,mult,element,resist)
  n=math.min(e.hp,n)
  if n<=0 then return false end
  s.hits=s.hits+1;s.damage=s.damage+n
  C.combatNumber(s,e,critical and n..'!' or n,color)
  C.combatEvent(s,'hit',cast.id,e.id,n)
  local hit=s.events[#s.events];hit.element=element;hit.reaction=cast.reaction or false;hit.critical=not not critical
  contribution(s,w,cast.id)
  if n==e.hp then C.defeatEnemy(s,e,cast.id)
  else
   e.hp=e.hp-n
   if C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  end
  return true
 end
 local function dropObjects(s,w)
  for _,o in ipairs(w.objects) do remove(s,o) end
  w.objects={}
 end
 local function recordErosion(s,w,spec,a)
  local d=state(w,a);local data=spec.erosion
  if a.hp<=0 or #d.marks>=data.cap or w.clock-d.last<data.gap then return end
  d.last=w.clock;w.serial=w.serial+1
  d.marks[#d.marks+1]={id=w.serial,due=w.clock+data.delay}
  ownLog(s,w,'WG18:mark',a.id,#d.marks)
 end
 local function damage(s,w,spec,a,amount,erosion,tag)
  local party=owner(s,a)
  local actual=C.damageActor(party,a,amount,w.primary,true,true)
  if actual<=0 then return end
  if erosion then recordErosion(party,w,spec,a) end
  ownLog(party,w,tag..':hit',a.id,actual)
 end
 local function strike(s,w,spec,zones,seen,amount,tag)
  for _,a in ipairs(s.actors) do
   if not seen[a] then
    for _,z in ipairs(zones) do
     if inside(a,z) then
      seen[a]=true;damage(s,w,spec,a,amount,z.erosion,tag);break
     end
    end
   end
  end
 end
 local function resolveErosion(s,w,spec)
  for _,a in ipairs(s.actors) do
   local d=state(w,a)
   if a.hp<=0 then d.marks={}
   else
    while d.marks[1] and d.marks[1].due<=w.clock do
     local mark=table.remove(d.marks,1)
     local party=owner(s,a)
     C.damageActor(party,a,math.max(1,a.maxhp*spec.erosion.ratio),w.primary,false,false)
     ownLog(party,w,'WG18:resolve',a.id,mark.id)
     if a.hp<=0 then d.marks={};break end
    end
   end
  end
 end
 local function safeGround(w,spec,extra)
  local ordered={table.unpack(w.ground)}
  if extra then ordered[#ordered+1]=extra end
  table.sort(ordered,function(a,b) return a.lo<b.lo end)
  local start,right=w.left,spec.arena.right
  local bestLeft,bestRight=start,start
  for _,g in ipairs(ordered) do
   if g.lo-start>bestRight-bestLeft then bestLeft,bestRight=start,g.lo end
   start=math.max(start,g.hi)
  end
  if right-start>bestRight-bestLeft then return start,right end
  return bestLeft,bestRight
 end
 local function groundShape(w,spec,c)
  local key=c.key
  local offset=(key=='WG01' and 78 or key=='WG10' and 160 or 136)
  local x=project(w,spec,c.x+(key=='WG10' and 1 or c.dir)*offset,64)
  local fire=key=='WG02' or key=='WG03'
  local g=ring(x,key=='WG02' and 44 or 53,spec.floorY,16,fire and ember or violet)
  g.cell=math.floor((x-spec.arena.left)/U)
  return g
 end
 local function addGround(s,w,spec,c)
  local g=groundShape(w,spec,c)
  local lo,hi=safeGround(w,spec,g)
  if hi-lo<spec.ground.safeWidth then return end
  for i=#w.ground,1,-1 do if w.ground[i].cell==g.cell then table.remove(w.ground,i) end end
  if #w.ground>=spec.ground.limit then table.remove(w.ground,1) end
  g.expires=w.clock+spec.ground.ttl;w.ground[#w.ground+1]=g
  log(s,w,'WG18:ground',0,g.expires)
 end
 local function tickGround(s,w,spec)
  for i=#w.ground,1,-1 do if w.clock>=w.ground[i].expires then table.remove(w.ground,i) end end
  for _,a in ipairs(s.actors) do
   local d=state(w,a)
   if w.clock>=d.floorAt+spec.ground.gap then
    for i=#w.ground,1,-1 do
     local g=w.ground[i]
     if inside(a,g) then
      d.floorAt=w.clock;damage(s,w,spec,a,spec.damage.ground,g.color==violet,'WG18:ground');break
     end
    end
   end
  end
 end
 local function land(a,x,y)
  a.x,a.y,a.vy,a.ground,a.glide=x,y,0,true,0
  a.dash=0;a.buffer=0
 end
 local function falls(s,w,spec)
  for _,a in ipairs(s.actors) do
   if a.hp>0 then
    local data=state(w,a)
    a.x=math.min(a.x,spec.arena.right-4)
    if a.y>spec.floorY+spec.arena.fallDepth then
     if w.clock>=data.fallAt then
      data.fallAt=w.clock+spec.arena.fallGrace;w.serial=w.serial+1
      local party=owner(s,a)
      C.damageActor(party,a,a.maxhp*spec.arena.fallRatio,w.primary,false,false)
      ownLog(party,w,'WG18:fall',a.id,w.serial)
     end
     if a.hp>0 then
      local lo,hi=safeGround(w,spec)
      land(a,clamp(w.left+64,lo+15,hi-15),spec.floorY)
     end
    end
   end
  end
 end
 local function start(s,w,spec,key)
  dropObjects(s,w);w.contactTick=nil
  if cleanse[key] then w.ground={} end
  local e=w.primary;local a=target(s,e)
  local c={key=key,move=spec.moves[key],x=e.x,t=0,dir=a.x<e.x and -1 or 1,mark=project(w,spec,a.x,48),
   seen={},shots={},left=w.left}
  c.travel=project(w,spec,e.x+c.dir*math.min(3*U,math.abs(a.x-e.x)),92)
  c.returnX=e.x;w.cast=c;w.phase='warning'
  targetable(w,not (key=='WG17' or (trials[key] and key~='WG05')))
  log(s,w,key)
  return c
 end
 local function gateContact(s,w,spec,c,o,cast,element)
  local t=w.contactTick or c.t
  if w.cast~=c or o.hp<=0 or t<spec.gate.opens or t>=(c.move.accept and c.move.accept[2] or c.move.total) then return false end
  local root=cast.rootCast or cast
  local a=s.actors[cast.id]
  if not a then return false end
  local last=o.last[a]
  local clock=w.clock+t-c.t
  if o.seen[root] or last and clock<last+spec.gate.gap then return false end
  o.last[a]=clock;o.seen[root]=true
  local n=math.min(o.hp,element=='physical' and spec.gate.physical or spec.gate.element)
  o.hp=o.hp-n
  contribution(s,w,cast.id)
  log(s,w,c.key..':gate',cast.id,n)
  if o.hp==0 then
   o.underground=true
   if o.kind=='bud' then
    for i=#c.shots,1,-1 do if c.shots[i].owner==o then table.remove(c.shots,i) end end
   end
   log(s,w,c.key..':broken',cast.id,o.id)
   for _,other in ipairs(w.objects) do if other.hp>0 then return true end end
   c.success=true
  end
  return true
 end
 local function addObjects(s,w,spec,c)
  local kind=(c.key=='WG06' and 'bud') or (c.key=='WG14' and 'pillar') or 'gate'
  for i=1,(c.move.targets or 1) do
   local x=kind=='gate' and w.primary.x or w.left+(spec.arena.right-w.left)*(.2+.3*(i-1))
   local o={id=spec.entity+20+i,x=x,y=spec.floorY,hp=c.move.units,maxhp=c.move.units,
    hitTop=spec.floorY-120,hitBottom=spec.floorY-40,hitHalfWidth=kind=='gate' and 27 or 12,
    kind=kind,custom=true,boss=true,noRewards=true,weeklyPart=true,warning=0,respawn=math.huge,last=weakKeys(),seen=weakKeys()}
   o.onCastContact=function(state,cast,_,_,_,element) return gateContact(state,w,spec,c,o,cast,element) end
   w.objects[#w.objects+1]=o;s.enemies[#s.enemies+1]=o
  end
  log(s,w,c.key..':open',0,#w.objects)
 end
 local function cut(s,w,spec,c)
  if c.left~=w.left or w.cuts>=#spec.arena.cutThresholds then return end
  w.cuts=w.cuts+1;w.left=w.left+spec.arena.cutStep
  w.cutAt=w.clock;w.normalCount=0
  w.ground={};c.shots={}
  putFloor(s,w,spec);locate(w,spec,w.primary.x)
  log(s,w,'WG09:commit',0,w.left)
 end
 local function lock(s,w,spec,c)
  local a=target(s,w.primary)
  if c.key=='WG04' and c.t==180 or c.key=='WG13' and c.t==318 then
   c.returnX=w.primary.x
   local x=project(w,spec,a.x-c.dir*118,92)
   local open=true
   for _,g in ipairs(w.ground) do if x>=g.lo and x<=g.hi then open=false end end
   if open then c.returnX=x end
   return
  end
  if c.key=='WG10' and c.t==192 then c.breathDir=a.x<c.x and -1 or 1;return end
  c.mark=project(w,spec,a.x,48)
  if c.key=='WG13' and c.t==180 then return end
  c.dir=a.x<c.x and -1 or 1
  c.travel=project(w,spec,c.x+c.dir*math.min(3*U,math.abs(a.x-c.x)),92)
 end
 local function shape(w,spec,c,i)
  local k,y,x,d=c.key,spec.floorY,c.x,c.dir
  local right=spec.arena.right
  local function side(origin,dir,len,height,color)
   return band(project(w,spec,origin+dir*26,0),project(w,spec,origin+dir*len,0),y,height,color)
  end
  if k=='WG05' or k=='WG14' then return {band(w.left,right,y,.55*U,violet)} end
  if k=='WG09' then return {band(c.left,c.left+spec.arena.cutStep,y,3.5*U,ember)} end
  if k=='WG15' then return {curse(band(w.left,right,y,3.5*U,violet))} end
  if k=='WG07' then return {curse(ring(c.mark,.7*U,y,1.25*U,violet))} end
  if k=='WG08' then
   return {ring(project(w,spec,c.mark+(i-2)*126,32),.35*U,y,1.8*U,ember)}
  end
  if k=='WG10' then
   if i==2 then return {side(x,c.breathDir or d,3.5*U,1.3*U,ember)} end
   return {ring(project(w,spec,x-146,42),.55*U,y,1.3*U,ember),curse(ring(project(w,spec,x+146,42),.55*U,y,1.3*U,violet))}
  end
  if k=='WG13' then
   if i==1 then return {side(x,d,2.5*U,1.4*U,ember)} end
   if i==4 then return {side(c.returnX,d,2.7*U,1.4*U,violet)} end
   return {ring(project(w,spec,c.mark+(i==2 and -67 or 67),58),.65*U,y,1.35*U,violet)}
  end
  if k=='WG04' then return {side(c.travel,d,1.8*U,1.25*U,ember)} end
  local length=k=='WG02' and 2.6 or k=='WG11' and (i==3 and 3 or 2.5) or 2.8
  local z=side(x,d,length*U,1.4*U,k=='WG11' and i>1 and violet or ember)
  return {k=='WG11' and i>1 and curse(z) or z}
 end
 local function launch(w,spec,c,ttl,owner)
  local r=c.key=='WG05' and 31 or c.key=='WG12' and 11 or 16
  local x=owner and owner.x or c.x
  local dir=owner and (c.mark<x and -1 or 1) or c.dir
  local count=c.key=='WG12' and 3 or 1
  local seen={}
  for i=1,count do
   local z=spec.floorY-(c.key=='WG12' and (.55+(i-1)*.53)*U or .75*U)
   local p={x=x,y=z,dx=dir*5*U/60,r=r,last=c.t+ttl,seen=seen,owner=owner,
    color=owner and ember or violet,erosion=c.key=='WG01'}
   c.shots[#c.shots+1]=p
  end
 end
 local function tickShots(s,w,spec,c)
  for i=#c.shots,1,-1 do
   local p=c.shots[i]
   if c.t>=p.last or p.x<w.left or p.x>spec.arena.right then table.remove(c.shots,i)
   else
    local z=ring(p.x,p.r,p.y+.57*U+p.r,2*p.r,p.color);z.erosion=p.erosion
    strike(s,w,spec,{z},p.seen,spec.damage.orb,c.key)
    p.x=p.x+p.dx
   end
  end
 end
 local function castTick(s,w,spec,c)
  local m,k=c.move,c.key
  if c.success then start(s,w,spec,'WG17');return end
  c.t=c.t+1
  if c.t>=m.total then
   if m.failure then start(s,w,spec,m.failure);return end
   dropObjects(s,w);w.cast=nil;w.phase='available';w.rest=spec.restTicks;targetable(w,true)
   if ordinary[k] then w.normalCount=w.normalCount+1 end
   return
  end
  for _,t in ipairs(m.locks) do if c.t==t then lock(s,w,spec,c) end end
  if trials[k] and c.t==spec.gate.opens then
   targetable(w,false);addObjects(s,w,spec,c)
  elseif k=='WG05' and c.t==m.accept[2] then dropObjects(s,w);targetable(w,true);log(s,w,'WG05:failed') end
  if k=='WG08' and c.t==300 then w.form=2;w.index=1;w.cutPending=true;targetable(w,false);log(s,w,'WG08:commit') end
  if k=='WG09' and c.t==spec.arena.cutTick then cut(s,w,spec,c) end
  if k=='WG04' and c.t>=54 and c.t<=84 then locate(w,spec,c.x+(c.travel-c.x)*(c.t-54)/30) end
  if k=='WG04' and c.t==210 or k=='WG13' and c.t==336 then locate(w,spec,c.returnX) end
  if k=='WG17' then
   local exposed=c.t>=m.exposure[1] and c.t<m.exposure[2]
   targetable(w,exposed);w.phase=exposed and 'exposed' or 'collapse';return
  end
  w.phase=c.t>=m.recovery and 'recover' or #w.objects>0 and 'trial' or 'warning'
  for i,window in ipairs(m.windows) do
   if c.t>=window[1] and c.t<window[2] then
    c.seen[i]=c.seen[i] or {}
    local amount=(k=='WG05' or k=='WG14') and spec.damage.wave or k=='WG15' and spec.damage.catastrophe or spec.damage.default
    strike(s,w,spec,shape(w,spec,c,i),c.seen[i],amount,k)
    if w.phase~='trial' then w.phase='active' end
   end
  end
  if c.t==m.groundAt then addGround(s,w,spec,c) end
  for _,p in ipairs(m.projectiles) do
   for _,at in ipairs(p.spawn_ticks or p.relative_spawn_ticks) do
    if c.t==at then
     if k=='WG06' then
      c.mark=target(s,w.primary).x
      for _,o in ipairs(w.objects) do if o.hp>0 then launch(w,spec,c,p.ttl_ticks,o) end end
     else launch(w,spec,c,p.ttl_ticks) end
    end
   end
  end
  tickShots(s,w,spec,c)
 end
 local function tick(s,w,spec)
  w.clock=w.clock+1
  resolveErosion(s,w,spec);tickGround(s,w,spec);falls(s,w,spec)
  if w.cast then castTick(s,w,spec,w.cast);return end
  if w.rest>0 then w.rest=w.rest-1;return end
  local a=spec.arena
  local threshold=a.cutThresholds[w.cuts+1]
  if w.form==1 and w.primary.hp<=w.primary.maxhp*a.cutThresholds[1] then start(s,w,spec,'WG08');return end
  if w.cutPending or (threshold and w.primary.hp<=w.primary.maxhp*threshold and w.clock>=w.cutAt+a.cutGap and w.normalCount>=a.ordinaryBetween) then
   w.cutPending=false;start(s,w,spec,'WG09');return
  end
  local order=w.form==1 and spec.first or spec.second
  local key=order[w.index];w.index=w.index%#order+1
  start(s,w,spec,key)
 end
 function controller.spawn(s,w,spec)
  w.clock,w.serial,w.remainder=0,0,0
  w.left,w.cuts,w.cutAt,w.normalCount=spec.arena.left,0,0,0
  w.form,w.index,w.rest=1,1,spec.noticeTicks
  w.cutPending=false;w.contactTick=nil;w.objects={};w.ground={};w.part=nil
  w.actors=weakKeys()
  locate(w,spec,spec.center);targetable(w,true)
  w.primary.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,cast,mult,color,element) end
 end
 function controller.attach(s,w,spec)
  putFloor(s,w,spec)
  s.enemies[#s.enemies+1]=w.primary
  w.part={id=spec.entity+1,sharedHealth=w.primary,hp=1,maxhp=1,custom=true,boss=true,noRewards=true,noAutoTarget=true,weeklyPart=true,
   respawn=math.huge,warning=0,onCastContact=w.primary.onCastContact}
  s.enemies[#s.enemies+1]=w.part;locate(w,spec,w.primary.x)
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  dropObjects(s,w);w.ground={};w.contactTick=nil;w.cast=nil;w.actors=weakKeys()
  if w.part then remove(s,w.part);w.part=nil end
  remove(s,w.primary)
 end
 function controller.leaveCoop(s,w)
  for _,a in ipairs(s.actors) do w.actors[a]=nil end
 end
 function controller.prepare(s,w,spec,input,dt)
  local c=w.cast
  if not c then return end
  w.contactTick=c.t+math.floor(w.remainder+math.min(dt,1/30)*60+1e-8)
  if c.key~='WG05' and c.key~='WG14' then return end
  for _,win in ipairs(c.move.windows) do
   if win[1]-c.t==13 then
    for _,party in ipairs(s.parties or {s}) do
     local ally=party.actors[3-party.active]
     if ally.ground and ally.hp>0 then ally.buffer=.1 end
    end
    return
   end
  end
 end
 function controller.finish(s,w,spec,dt)
  w.contactTick=nil
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;tick(s,w,spec) end
  if not s.parties or w.primary.hp<=0 then return end
  for _,a in ipairs(s.actors) do if a.hp>0 then return end end
  dropObjects(s,w);w.cast=nil;w.rechallenge=true;targetable(w,false)
 end
 function controller.afterStep(s,w,spec)
  if not w.waitUntil then return end
  for _,a in ipairs(s.actors) do
   if a.hp>0 then
    a.x=math.min(a.x,spec.arena.right-4)
    if a.y>spec.floorY+spec.arena.fallDepth then land(a,w.left+64,spec.floorY) end
   end
  end
 end
 local function warnings(w,spec,c)
  local out={}
  if not c then return out end
  for i,win in ipairs(c.move.windows) do
   local lead=math.max(0,win[1]-76)
   if c.key=='WG08' or c.key=='WG09' or c.key=='WG15' then lead=0 end
   if c.key=='WG10' and i==2 then lead=168 end
   if c.t>=lead and c.t<win[2] then
    for _,z in ipairs(shape(w,spec,c,i)) do z.at=win[1];out[#out+1]=z end
   end
  end
  return out
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='primal_fire' and not w.waitUntil then
   if a.x<w.left+17 then return w.left+63 end
   local c=w.cast
   if c and c.key=='WG09' and c.t<spec.arena.cutTick and a.x<c.left+spec.arena.cutStep+18 then
    return c.left+spec.arena.cutStep+58
   end
   if c and c.key~='WG05' and c.key~='WG14' and c.key~='WG15' then
    for _,z in ipairs(warnings(w,spec,c)) do
     if z.at-c.t<=23 and a.x>=z.lo and a.x<=z.hi and inside(a,z) then
      local l,r=z.lo-19,z.hi+19
      if l>=w.left+12 and (r>spec.arena.right-12 or a.x-l<r-a.x) then return l end
      if r<=spec.arena.right-12 then return r end
     end
    end
   end
   for _,g in ipairs(w.ground) do
    if inside(a,g) then local lo,hi=safeGround(w,spec);return clamp(a.x,lo+16,hi-16) end
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 local labels={warning='予兆',active='攻撃中',recover='後隙',trial='虚界障壁',available='構え直し',
  exposed='反撃の好機',collapse='体勢崩れ'}
 local function painter(f,s)
  return function(x,y,width,height,color,opacity)
   if width<=0 or height<=0 then return end
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color,opacity=opacity}
  end
 end
 local function blade(rect,x,y,dir,lift,color,shade,length)
  rect(x-10,y-5,20,11,shade);rect(x-3,y-7,7,15,color)
  for n=1,length do
   local a,b=x+dir*n*5,y-lift*n*4
   local width=n<3 and 9 or n<length-2 and 13 or (length-n)*4+3
   rect(a-4,b-width/2,9,width,shade)
   rect(a-3,b-width/2,7,3,color)
  end
 end
 function controller.observe(f,s,w,spec,mode,profile)
  local b,e,c=f.weeklyBoss,w.primary,w.cast
  b.x,b.y,b.damageable=e.x,e.y,e.hp>0 and not e.invulnerable
  b.formName=w.form==1 and '炎剣' or '双剣'
  local status=c and c.key=='WG09' and c.t>=spec.arena.cutTick and '床切断完了' or labels[w.phase]
  b.label=c and c.move.title..' ｜ '..(status or '') or status
  local v={left=w.left,right=spec.arena.right,cuts=w.cuts,form=w.form,card=c and c.key,tick=c and c.t,
   cutAt=c and c.key=='WG09' and spec.arena.cutTick,actors={},objects={},warnings={},ground={}}
  b.primal=v
  if e.hp<=0 then return end
  local back={draws={}};local rear=painter(back,s)
  if c and c.key=='WG15' and c.t<192 then
   local radius=math.min(76,14+c.t*.55)
   for dy=-72,72,6 do
    if math.abs(dy)<radius then
     local width=2*math.sqrt(radius*radius-dy*dy)
     rear((w.left+spec.arena.right-width)/2,182+dy,width,6,'#4d336f',.8)
    end
   end
  end
  local slump=c and c.key=='WG17' and math.min(1,c.t/60,(600-c.t)/60) or 0
  local mist=c and ((c.key=='WG04' and c.t>=144 and c.t<210) or (c.key=='WG13' and c.t>=126 and c.t<336))
  local height=spec.artHeight-64*slump
  C.drawFieldDisplayArt(back,C.primalWeeklyArt.idle,e.x-s.camera,e.y,height,mode,profile,false,nil,nil,mist and .53 or 1)
  local lift=w.phase=='warning' and .58 or w.phase=='active' and -.14 or .20
  blade(rear,e.x-82,e.y-125+36*slump,-1,lift,ember,'#af4f38',13)
  local grow=c and c.key=='WG08' and clamp(math.floor((c.t-216)/5),0,13) or 0
  if w.form==2 or grow>0 then
   local length=c and c.key=='WG16' and math.max(1,13-math.floor(c.t/7)) or w.form==2 and 13 or grow
   blade(rear,e.x+46,e.y-108+32*slump,1,lift,violet,'#7047b2',length)
  end
  table.move(f.draws,1,#f.draws,#back.draws+1,back.draws);f.draws=back.draws
  local rect=painter(f,s)
  local cutoff=c and c.key=='WG09' and c.t<spec.arena.cutTick
  if cutoff then
   local edge=c.left+spec.arena.cutStep
   local nextLedge=ledge(spec,edge)
   rect(c.left,spec.floorY-6,edge-c.left,6,ember)
   for x=c.left+3,edge-10,13 do rect(x,spec.floorY-16,7,5,ember,.7) end
   rect(edge,spec.floorY-172,2,172,pale,.8)
   rect(nextLedge.x,nextLedge.y,nextLedge.w,3,pale,.62)
  end
  for _,g in ipairs(w.ground) do
   rect(g.lo,g.y-10,g.hi-g.lo,10,g.color==violet and '#613da0' or '#a74c34',.76)
   for x=g.lo+3,g.hi-5,10 do
    if g.color==violet then rect(x,g.y-13,4,2,violet);rect(x+2,g.y-15,2,2,violet)
    else rect(x,g.y-13,3,5,ember) end
   end
   v.ground[#v.ground+1]={lo=g.lo,hi=g.hi,kind=g.color==violet and 'violet' or 'fire',remaining=g.expires-w.clock}
  end
  for _,a in ipairs(s.actors) do
   local d=state(w,a)
   local row={id=a.id,count=#d.marks,remaining=d.marks[1] and d.marks[1].due-w.clock}
   v.actors[#v.actors+1]=row
   for i=1,row.count do rect(a.x+(i-1)*9-14,a.y-99,6,6,violet) end
  end
  if not c then return end
  if c.move.groundAt and c.t>=c.move.groundAt-48 and c.t<c.move.groundAt then
   local g=groundShape(w,spec,c)
   rect(g.lo,g.y-16,g.hi-g.lo,2,g.color,.77)
  end
  if c.key=='WG04' and c.t<84 then rect(math.min(c.x,c.travel),e.y-12,math.abs(c.travel-c.x),2,ember,.77) end
  if (c.key=='WG04' and c.t>=180 and c.t<210) or (c.key=='WG13' and c.t>=288 and c.t<336) then
   rect(c.returnX-32,e.y-6,64,3,pale)
  end
  for _,z in ipairs(warnings(w,spec,c)) do
   local opacity=c.t>=z.at and 1 or .62
   rect(z.lo,z.y-2,z.hi-z.lo,3,z.color,opacity)
   rect(z.lo,z.y-z.h,2,z.h,z.color,opacity);rect(z.hi-2,z.y-z.h,2,z.h,z.color,opacity)
   if c.t>=z.at or c.key=='WG05' or c.key=='WG14' then rect(z.lo,z.y-z.h,z.hi-z.lo,2,pale,opacity) end
   v.warnings[#v.warnings+1]=z
  end
  v.closing=c.move.accept and c.move.accept[2] or trials[c.key] and c.move.total
  v.exposure=w.phase=='exposed' and c.move.exposure[2]-c.t
  for _,o in ipairs(w.objects) do
   local h=o.kind=='pillar' and 121 or o.kind=='gate' and 78 or 45
   local radius=o.kind=='gate' and 33 or 18
   if o.hp>0 then
    rect(o.x-radius,o.y-h,radius*2,h,'#412c65');rect(o.x-radius+5,o.y-h+4,radius*2-10,h-4,'#754bac')
    rect(o.x-4,o.y-h+9,8,h-16,pale,.86)
    for i=1,o.hp do rect(o.x-o.maxhp*3+i*6-5,o.y-h-9,4,4,pale) end
   end
   v.objects[#v.objects+1]={kind=o.kind,id=o.id,x=o.x,units=o.hp,max=o.maxhp}
  end
  for _,p in ipairs(c.shots) do
   rect(p.x-p.r,p.y-7,2*p.r,14,p.color);rect(p.x-6,p.y-5,12,10,pale)
  end
  if c.key=='WG05' and c.t>=780 and c.t<840 then rect(c.x-15,e.y-152,30,30,violet,.85) end
 end
 return controller
end
