return function(C,G,A)
 local M={}
 local function log(s,r,c,kind,value)
  A.log(s,r,c.key..':'..kind,0,value,c)
 end
 local function between(t,a,b) return t>=a and t<b end
 local function follow(s,r,c)
  local a=s.actors[s.active]
  local arena=r.spec.arena
  local U=arena.unit
  c.dir=a.x<r.boss.x and -1 or 1
  r.boss.dir=c.dir
  c.mark=G.clamp(r.spec,a.x,30)
  if c.key=='RN07' then
   c.mark=G.clamp(r.spec,a.x,1.8*U)
   c.endMark=c.mark+(c.mark<480 and 1 or -1)*.8*U
  elseif c.key=='RN11' then
   c.mark=G.clamp(r.spec,a.x,2*U)
  end
 end
 function M.begin(s,r,key)
  r.serial=r.serial+1
  local d=r.spec.cards[key]
  local c={key=key,data=d,t=0,serial=r.serial,stop=d.total_ticks,recover=d.recovery[1],
   downGeneration=r.generation,seen={},shots={},hits={},shadows={},found=0,passed=0,
   damage=math.floor((r.spec.damage[key] or 0)*r.rules.damageScale+.5)}
  follow(s,r,c)
  if key=='RN05' or key=='RN06' or key=='RN08' then c.waived=r.protected>0 end
  if key=='RN01' or key=='RN10' or key=='RN08' then
   c.startX,c.startY=r.boss.x,r.spec.arena.floor-.75*r.spec.arena.unit
  end
  log(s,r,c,'start',r.serial)
  return c
 end
 local function point(c,x,y,speed,angle,radius,ttl,kind)
  local p={x=x,y=y,dx=c.dir*math.cos(angle)*speed/60,dy=math.sin(angle)*speed/60,
   first=c.t,expires=c.t+ttl,radius=radius,seen={},kind=kind}
  c.shots[#c.shots+1]=p
  return p
 end
 local function shot(s,r,c,w,i)
  local unit=r.spec.arena.unit
  if c.key=='RN02' then
   point(c,r.boss.x,r.spec.arena.floor,3.75*unit,0,.2*unit,96,'wave')
  elseif c.key=='RN10' then
   local start=4*unit*(w[1]==150 and 1 or 0)
   local x=G.clamp(r.spec,c.startX+c.dir*start,5)
   local p=point(c,x,c.startY,4*unit,0,.12*unit,60,'return')
   if w[1]==150 then p.dx=-p.dx end
  else
   for _,deg in ipairs(c.key=='RN08' and {-15,0,15} or {(-2+i)*15}) do
    point(c,c.startX+c.dir*30,c.startY-24,3.5*unit,math.rad(deg),.10*unit,w[2]-w[1],'feather')
   end
  end
  log(s,r,c,'launch',i)
 end
 local function waveEcho(r,a,c,n)
  local y=r.spec.arena.floor
  local x=G.clamp(r.spec,a.x-c.dir*48,28)
  if math.abs(a.x-x)<=24 then x=G.clamp(r.spec,a.x+c.dir*48,28) end
  r.echoes[#r.echoes+1]={x=x,y=y-23,sole=y,value=n,owner=1,cast=c.serial,
   event={serial=c.serial,t=c.t},expires=r.age+r.spec.life.waveEchoTicks}
 end
 local function sampleShots(s,r,c)
  local arena=r.spec.arena
  for i=#c.shots,1,-1 do
   local p=c.shots[i]
   if c.t>=p.expires then
    table.remove(c.shots,i)
   else
    local nx,ny=G.clamp(r.spec,p.x+p.dx,5),p.y+p.dy
    if p.kind=='wave' then
     local a=s.actors[s.active]
     local area=G.groundBox(r.spec,math.min(p.x,nx)-p.radius,math.max(p.x,nx)+p.radius,arena.floor-.4*arena.unit,arena.floor)
     if not c.waveHit and a.hp>0 and G.bodyContact(area,a) then
      c.waveHit=true
      local n=A.lose(s,r,r.spec.life.waveLoss,c,true)
      if n>0 and s.actors[s.active].hp>0 then waveEcho(r,a,c,n) end
     end
    else
     for _,a in ipairs(s.actors) do
      if not p.seen[a.id] and (c.hits[a.id] or 0)<2 and G.boltContact(p.x,p.y,nx,ny,p.radius,a) then
       p.seen[a.id]=true
       c.hits[a.id]=(c.hits[a.id] or 0)+1
       C.damageActor(s,a,c.damage,{id=r.boss.id,x=p.x,y=p.y+30},true,true)
      end
     end
    end
    p.x,p.y=nx,ny
    if ny>arena.floor or nx<=arena.left+5 or nx>=arena.right-5 or
       (p.kind=='return' and c.t>=150 and (nx-c.startX)*c.dir<=0) then table.remove(c.shots,i) end
   end
  end
 end
 local function spawnShadows(s,r,c,n,lo,hi)
  for i,p in ipairs(r.spec.arena.shadowSlots) do
   local value=lo+((i<=hi) and 1 or 0)
   if value>0 then
    c.shadows[#c.shadows+1]={x=p[1],y=p[2]-24,sole=p[2],id=i,value=value,owner=1,cast=c.serial}
   end
  end
  log(s,r,c,'shadows',n)
 end
 local function split(s,r,c)
  local n=math.min(r.spec.life.splitMax,math.max(0,r.life-1))
  if n==0 then
   if c.key=='RN03' then c.recover,c.stop=78,168 end
   return
  end
  A.lose(s,r,n,c,false)
  if r.protected==0 then spawnShadows(s,r,c,n,math.floor(n/3),n%3)
  elseif c.key=='RN03' then c.recover,c.stop=78,168 end
 end
 local function touches(a,x,y)
  return a.hp>0 and math.abs(a.x-x)<=24 and a.y>=y and a.y-68<=y
 end
 function M.touchEchoes(s,r)
  local a=s.actors[s.active]
  for i=#r.echoes,1,-1 do
   local p=r.echoes[i]
   if r.age>=p.expires then table.remove(r.echoes,i)
   elseif not s.auto and touches(a,p.x,p.y) then
    A.gain(s,r,p.value,p.event)
    table.remove(r.echoes,i)
   end
  end
 end
 local function collect(s,r,c)
  if s.auto then return end
  local a=s.actors[s.active]
  for _,p in ipairs(c.shadows) do
   if not p.taken and touches(a,p.x,p.y) then
    p.taken=true
    c.found=c.found+1
    A.gain(s,r,p.value,c)
    log(s,r,c,'collected',c.found)
   end
  end
  if c.key=='RN03' and #c.shadows>0 and c.found==#c.shadows and c.stop==c.data.total_ticks then
   c.recover,c.stop=c.t+6,c.t+96
  elseif c.key=='RN06' and c.found>=2 and c.stop==c.data.total_ticks then
   c.recover,c.stop=c.t+12,c.t+132
   for _,p in ipairs(c.shadows) do
    if not p.taken then
     p.expires,p.event=r.age+(660-c.t),{serial=c.serial,t=c.t}
     r.echoes[#r.echoes+1]=p
     p.taken=true
    end
   end
   log(s,r,c,'exempt',c.found)
  end
 end
 function M.gate(s,r,c)
  if not c.gateX then return false end
  return math.abs(s.actors[s.active].x-c.gateX)<=.70*r.spec.arena.unit
 end
 local function trials(s,r,c)
  if c.waived then return end
  local key,t=c.key,c.t
  if key=='RN03' then
   if t==66 then split(s,r,c) end
   if between(t,78,606) then collect(s,r,c) end
  elseif key=='RN06' then
   if t==60 then spawnShadows(s,r,c,0,r.spec.life.trialEcho,0) end
   if between(t,60,660) then collect(s,r,c) end
  elseif key=='RN08' then
   if t==240 then split(s,r,c) end
   if between(t,252,612) then collect(s,r,c) end
   if t==612 and c.found>=2 then
    local x=s.actors[s.active].x
    for _,candidate in ipairs(r.spec.arena.gateX) do
     if not c.gateX or math.abs(candidate-x)<math.abs(c.gateX-x) then c.gateX=candidate end
    end
    log(s,r,c,'gate',c.gateX)
   end
  elseif key=='RN12' and between(t,90,690) and not c.arrived and not s.auto then
   local a=s.actors[s.active]
   local p=r.spec.arena.road[c.passed+1]
   if touches(a,p[1],p[2]-24) then
    c.passed=c.passed+1
    log(s,r,c,'road',c.passed)
    if c.passed==#r.spec.arena.road then
     c.arrived=true
     c.recover,c.stop=t+30,t+210
    end
   end
  end
 end
 function M.columns(r,c,i)
  local U,floor=r.spec.arena.unit,r.spec.arena.floor
  if c.key=='RN04' then
   return G.shape(r.spec,{kind='rect',u0=.4,u1=4.5,v0=.15,v1=1.25},r.boss.x,c.dir)
  end
  if c.key=='RN05' then
   return G.groundBox(r.spec,c.mark-.3*U,c.mark+.3*U,floor-3.8*U,floor)
  end
  local x=c.mark+({-1.6,1.6,0})[i]*U
  return G.groundBox(r.spec,x-.2*U,x+.2*U,floor-1.3*U,floor)
 end
 function M.curtain(r,c)
  local u=math.max(0,math.min(1,(c.t-72)/180))
  local x=c.mark+(c.endMark-c.mark)*u
  return x,r.spec.arena.unit
 end
 local function damageArea(s,r,c,i)
  c.seen[i]=c.seen[i] or {}
  local seen=c.seen[i]
  local key=c.key
  local area=(key=='RN04' or key=='RN11') and M.columns(r,c,i) or nil
  for _,a in ipairs(s.actors) do
   if a.hp>0 and not seen[a.id] then
    local inside
    if key=='RN07' then
     local x,w=M.curtain(r,c)
     inside=math.abs(a.x-x)>w
    elseif key=='RN12' then inside=not c.arrived and s.active==a.id
    else inside=G.bodyContact(area,a) end
    if inside then
     seen[a.id]=true
     C.damageActor(s,a,c.damage,r.boss,true,true)
    end
   end
  end
 end
 local function verdict(s,r,c)
  if c.waived or c.verdict then return end
  local a=s.actors[s.active]
  if c.key=='RN05' then
   if not G.bodyContact(M.columns(r,c,1),a) then return end
  else
   c.verdict=true
   if c.key=='RN06' and c.found>=2 or
      c.key=='RN08' and (c.downGeneration~=r.generation or c.found>=2 and M.gate(s,r,c)) then
    log(s,r,c,'verdict-safe',c.found)
    return
   end
  end
  if A.down(s,r,a,'authority_lethal',c) then c.verdict=true end
 end
 function M.tick(s,r,c)
  local locks=c.data.lock_ticks
  if c.t<=(locks[1] or -1) then follow(s,r,c) end
  if c.t==locks[1] or c.t==locks[2] then log(s,r,c,'lock',c.mark or 0) end
  trials(s,r,c)
  for i,w in ipairs(c.data.active_windows) do
   if c.t==w[1] then
    log(s,r,c,'window',i)
    if w[3]=='projectile' or w[3]=='life_loss' then shot(s,r,c,w,i) end
   end
   if between(c.t,w[1],w[2]) then
    if w[3]=='damage' and not (c.key=='RN12' and c.arrived) then damageArea(s,r,c,i)
    elseif w[3]=='authority_lethal' and (c.key=='RN05' or c.t==w[1]) then verdict(s,r,c) end
   end
  end
  sampleShots(s,r,c)
 end
 function M.hazards(r,c)
  local items={}
  if not c then return items end
  local key=c.key
  if key=='RN04' or key=='RN05' or key=='RN11' then
   for i,w in ipairs(c.data.active_windows) do
    if c.t<w[2] and not c.waived then
     items[#items+1]={shape=M.columns(r,c,i),active=c.t>=w[1],judge=key=='RN05',index=i}
    end
   end
  elseif key=='RN07' and c.t<252 then
   local arena=r.spec.arena
   local x,w=M.curtain(r,c)
   items[1]={shape=G.groundBox(r.spec,arena.left,x-w,141,arena.floor),active=c.t>=72}
   items[2]={shape=G.groundBox(r.spec,x+w,arena.right,141,arena.floor),active=c.t>=72}
  end
  return items
 end
 function M.returnFloor(r)
  local c,b=r.cast,r.boss
  local floor=r.spec.arena.floor
  local options=r.spec.arena.returnX
  if c and c.key=='RN07' and between(c.t,72,252) then
   local center=M.curtain(r,c)
   options={center,center-46,center+46}
  end
  for _,x in ipairs(options) do
   local safe=math.abs(x-b.x)>50
   if safe and c then
    for _,dx in ipairs({-14,14}) do
     local a={x=x+dx,y=floor,hp=1}
     for _,z in ipairs(M.hazards(r,c)) do
      if z.active and G.bodyContact(z.shape,a) then safe=false;break end
     end
     for _,p in ipairs(c.shots) do
      if p.kind~='wave' and G.boltContact(p.x,p.y,p.x+p.dx*10,p.y+p.dy*10,p.radius,a) then
       safe=false;break
      end
     end
    end
   end
   if safe then return x end
  end
 end
 return M
end
