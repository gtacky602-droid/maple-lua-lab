return function(C)
 local controller={}
 local avoid=C.aiAvoidTarget
 local colors={cryo='#9bd9f3',pyro='#ff864d'}
 local pale={cryo='#e9faff',pyro='#fff0ad'}
 local function clamp(x,lo,hi)return math.max(lo,math.min(hi,x)) end
 local function mix(a,b,q)return a+(b-a)*q end
 local function actor(s)
  local a=s.actors[s.active]
  if a and a.hp>0 then return a end
  for _,other in ipairs(s.actors) do if other.hp>0 then return other end end
 end
 local function body(e,x,y,height)
  e.x,e.y,e.drawHeight=x,y,height;e.hitTop=y-height;e.hitBottom=y
 end
 local function log(s,w,key,id,value)
  for _,party in ipairs(s.parties or {s}) do
   C.combatEvent(party,'signora:'..key,id or 0,w.primary.id,value)
  end
 end
 local function box(x,r,y,h) return {lo=x-r,hi=x+r,y=y,h=h} end
 local function standing(a,shape)
  return a.hp>0 and a.x+9>=shape.lo and a.x-9<=shape.hi
    and a.y<=shape.y+6 and a.y>shape.y-shape.h
 end
 local function remove(s,w)
  for i=#s.enemies,1,-1 do if s.enemies[i]==w.primary then table.remove(s.enemies,i) end end
 end
 local function newClimate(temperature) return {temperature=temperature or 0,hold=0,lastFloor={}} end
 local function climate(w,party)
  local record=w.climates[party]
  if not record then record=newClimate();w.climates[party]=record end
  return record
 end
 local function clearEnvironment(w,keepTemperature)
  local climates=setmetatable({},{__mode='k'})
  if keepTemperature then
   for party,record in pairs(w.climates) do climates[party]=newClimate(record.temperature) end
  end
  w.climates=climates;w.floors={};w.devices={0,0}
 end
 local function cause(w,record,kind) record.cause={kind=kind,untilTick=w.clock+60} end
 local function transformation(s,w,spec)
  w.stage='transform';w.phase='transition';w.cast=nil;w.seal=nil;w.stageTick=0
  clearEnvironment(w,true);w.primary.invulnerable=true
  log(s,w,'WS09')
 end
 local function cocoon(s,w,spec)
  local e=w.primary
  w.stage='seal';w.phase='cocoon';w.stageTick=0;w.cast=nil
  w.seal={hp=spec.seal.strength,moths={},serial=0,spent=setmetatable({},{__mode='k'}),
   nextHit=setmetatable({},{__mode='k'}),tokens=setmetatable({},{__mode='k'}),
   nextMoths=spec.seal.opening,nextPressure=spec.seal.pressureFirst}
  w.sealResults=setmetatable({},{__mode='k'})
  clearEnvironment(w,true)
  body(e,spec.center,spec.floorY,115)
  e.invulnerable=true;e.noAutoTarget=true;e.aura=nil;e.burning=nil;e.applicationClocks=nil
  log(s,w,'WS08')
 end
 local function hitSeal(s,w,spec,cast,element)
  local seal=w.seal
  local inputAt=cast.playerInputAt
  local now=s.coop and s.coop.weeklySlot==w and s.coop.time or s.t
  if not seal.openedAt or not inputAt or s.t-inputAt>now-seal.openedAt+1e-8 or cast.reaction
     or seal.spent[cast] or w.clock<(seal.nextHit[s] or 0) then return false end
  local flame=element=='pyro'
  for _,part in ipairs(cast.damageElements or {}) do if part=='pyro' then flame=true end end
  local charge=flame and spec.seal.pyroCharge or spec.seal.plainCharge
  local source=flame and 'pyro' or 'plain'
  local token=seal.tokens[s]
  if token and inputAt>=token.at then
   charge=spec.seal.mothCharge;source='moth';seal.tokens[s]=nil
   log(s,w,'moth-used',cast.id,token.id)
  end
  seal.spent[cast]=true;seal.nextHit[s]=w.clock+spec.seal.hitInterval
  local removed=math.min(seal.hp,charge)
  seal.hp=math.max(0,seal.hp-charge)
  w.sealResults[s]={source=source,damage=removed,remaining=seal.hp,untilTick=w.clock+90}
  log(s,w,'seal-hit',cast.id,charge)
  C.combatNumber(s,w.primary,charge,'#ffdc8e')
  if s.coop then C.coopContact(s,w.primary,cast.id) end
  if seal.hp==0 then transformation(s,w,spec) end
  return true
 end
 local function contact(s,w,spec,cast,mult,color,element)
  if w.stage=='seal' then return hitSeal(s,w,spec,cast,element) end
  local e=w.primary
  if e.invulnerable or e.hp<=0 then return false end
  local resist=C.enemyResistance(cast,e,element)
  if resist>=1 then return false end
  local amount,critical=C.enemyHitDamage(s,cast,e,mult,element,resist)
  local floor=w.stage=='cryo' and spec.pyroHp or 0
  amount=math.min(amount,e.hp-floor)
  if amount<=0 then return false end
  s.hits=s.hits+1;s.damage=s.damage+amount
  C.combatNumber(s,e,critical and tostring(amount)..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,e.id,amount)
  local last=s.events[#s.events];last.element=element;last.critical=not not critical;last.reaction=cast.reaction or false
  if s.coop then C.coopContact(s,e,cast.id) end
  if amount==e.hp then C.defeatEnemy(s,e,cast.id)
  else
   e.hp=e.hp-amount
   if e.hp==floor then cocoon(s,w,spec)
   elseif C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,amount) end
  end
  return true
 end
 function controller.spawn(s,w,spec)
  w.stage='cryo';w.stageTick=0;w.clock=0;w.remainder=0
  w.index=1;w.cast=nil;w.rest=spec.noticeTicks;w.seal=nil;w.sealResults=nil;w.lastTornado=-math.huge;w.sinceTornado=3
  clearEnvironment(w)
  local e=w.primary;e.dir=-1;e.invulnerable=false;e.underground=false
  body(e,spec.center,spec.floorY,spec.artHeight)
  e.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,cast,mult,color,element) end
 end
 function controller.attach(s,w)
  remove(s,w);s.enemies[#s.enemies+1]=w.primary
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  remove(s,w);w.cast=nil;w.seal=nil;w.sealResults=nil;w.primary.underground=true
  clearEnvironment(w)
 end
 function controller.leaveCoop(party,w)
  w.climates[party]=nil
  if w.seal then w.seal.tokens[party]=nil;w.seal.nextHit[party]=nil end
  if w.sealResults then w.sealResults[party]=nil end
 end
 local function damage(s,w,spec,c,index,a,amount,element,raises)
  if w.primary.hp<=0 then return end
  local hit=c.hit[index]
  if not hit then hit={};c.hit[index]=hit end
  if hit[a] then return end
  hit[a]=true
  local party=s.actorOwners and s.actorOwners[a] or s
  local actual=C.damageActor(party,a,amount,{id=w.primary.id,x=w.primary.x,y=w.primary.y,damageElement=element},true,true)
  if actual<=0 then return end
  log(party,w,c.id..':hit',a.id,index)
  if raises and a.id==party.active then
   local record=climate(w,party)
   if not c.raised[party] and w.clock>=(record.lastHeatHit or -60)+spec.temperature.hitInterval then
    c.raised[party]=true;record.lastHeatHit=w.clock
    record.temperature=math.min(100,record.temperature+spec.temperature.hitRise)
    cause(w,record,'hit')
   end
  end
 end
 local function area(s,w,spec,c,i,b,amount,element,raises)
  for _,a in ipairs(s.actors) do if standing(a,b) then damage(s,w,spec,c,i,a,amount,element,raises) end end
 end
 local function covered(a,f)
  return a.hp>0 and a.ground and math.abs(a.y-f.y)<5 and math.abs(a.x-f.x)<f.width/2
 end
 local function floorAt(s,a,floor)
  if not a then return floor,55,905 end
  for _,p in ipairs(s.platforms) do
   if p.y<floor and a.x>=p.x and a.x<=p.x+p.w and a.y<=p.y+5 then return p.y,p.x+24,p.x+p.w-24 end
  end
  return floor,55,905
 end
 local function inDevice(a,spec,index,radius)
  return a and a.hp>0 and math.abs(a.y-spec.floorY)<30 and math.abs(a.x-spec.temperature.deviceX[index])<=radius
 end
 local function addFloor(s,w,spec,x,y,width)
  local conf=spec.temperature
  if y==spec.floorY then for _,edge in ipairs(conf.deviceX) do
   if math.abs(edge-x)<conf.deviceRange+width/2 then return end
  end end
  for i=#w.floors,1,-1 do
   local f=w.floors[i]
   if f.y==y and math.abs(f.x-x)<(f.width+width)/2 then table.remove(w.floors,i) end
  end
  if #w.floors>=conf.floorLimit then table.remove(w.floors,1) end
  w.floors[#w.floors+1]={x=x,y=y,width=width,expires=w.clock+conf.floorTtl}
  log(s,w,'floor-set',0,x)
 end
 local function updateClimate(party,w,spec,input,element,releases)
  local a=actor(party);if not a then return end
  local conf=spec.temperature
  local record=climate(w,party)
  local device
  for i=1,2 do if w.clock>=w.devices[i] and inDevice(a,spec,i,conf.deviceRange) then device=i;break end end
  if device then
   record.temperature=math.max(0,record.temperature-conf.devicePerSecond/60)
   if input and input.interact and not party.auto then
    if record.heldDevice~=device or record.holdActor~=a then record.hold=0 end
    record.heldDevice=device;record.holdActor=a;record.hold=record.hold+1
    if record.hold>=conf.hold then releases[device]=releases[device] or party end
   else record.hold=0 end
  else
   record.hold=0;record.heldDevice=nil
   local rise=w.stage=='seal' and conf.sealPerSecond or conf.basePerSecond
   for _,f in ipairs(w.floors) do if covered(a,f) then rise=rise+conf.floorPerSecond;break end end
   record.temperature=math.min(100,record.temperature+rise/60)
  end
  for _,other in ipairs(party.actors) do
   if w.clock>=(record.lastFloor[other] or 0) and not (other==a and device) then
    for _,f in ipairs(w.floors) do if covered(other,f) then
     record.lastFloor[other]=w.clock+conf.hazardInterval
     if C.damageActor(party,other,conf.floorDamage,{id=w.primary.id,damageElement=element},false,false)>0 then
      if other.id==party.active then cause(w,record,'floor') end
      log(party,w,'floor-damage',other.id)
     end
     break
    end end
   end
  end
  if record.temperature<100 then record.nextExtreme=nil
  elseif not record.nextExtreme then record.nextExtreme=w.clock+conf.hazardInterval
  elseif w.clock>=record.nextExtreme then
   record.nextExtreme=w.clock+conf.hazardInterval
   if C.damageActor(party,a,conf.envDamage,{id=w.primary.id,damageElement=element},false,false)>0 then
    cause(w,record,'overload');log(party,w,'temperature-damage',a.id)
   end
  end
 end
 local function releaseDevice(w,spec,parties,device,holder)
  local conf=spec.temperature
  w.devices[device]=w.clock+conf.recharge
  local other=3-device
  if w.clock<w.devices[other] then w.devices[other]=w.clock end
  local cleared=0
  for i=#w.floors,1,-1 do
   local f=w.floors[i]
   if f.y==spec.floorY and math.abs(f.x-conf.deviceX[device])<conf.clearRange+f.width/2 then
    table.remove(w.floors,i);cleared=cleared+1
   end
  end
  for _,party in ipairs(parties) do
   if inDevice(actor(party),spec,device,conf.deviceRange) then
    local record=climate(w,party)
    record.temperature=0;record.hold=0;record.nextExtreme=nil
    cause(w,record,'release')
    record.cause.release={side=device,floors=cleared}
   end
  end
  log(holder,w,'WS16:release',holder.active,device)
 end
 local function environment(s,w,spec,input)
  local parties=s.parties or {s}
  local releases={}
  local element=w.stage=='pyro' and 'pyro' or 'cryo'
  for i=#w.floors,1,-1 do if w.clock>=w.floors[i].expires then table.remove(w.floors,i) end end
  for _,party in ipairs(parties) do
   local held=s.parties and party.coopMember.input or input
   updateClimate(party,w,spec,held,element,releases)
  end
  for device=1,2 do
   if releases[device] then releaseDevice(w,spec,parties,device,releases[device]) end
  end
 end
 local function sealTick(s,w,spec)
  local seal,conf=w.seal,spec.seal
  local t=w.stageTick
  if t<conf.opening then return end
  if not seal.openedAt then seal.openedAt=s.t;w.primary.invulnerable=false end
  local a=actor(s)
  for i,moth in pairs(seal.moths) do
   if t>=moth.expires then
    seal.serial=seal.serial+1
    seal.moths[i]={id=seal.serial,x=conf.moths[i]+(i==1 and 36 or -36),expires=t+conf.mothTtl}
   else
    for _,party in ipairs(s.parties or {s}) do
     local picker=actor(party)
     if picker and not party.auto and not seal.tokens[party]
        and math.abs(picker.x-moth.x)<33 and math.abs(picker.y-spec.floorY)<36 then
      seal.tokens[party]={id=moth.id,at=party.t};seal.moths[i]=nil
      log(party,w,'moth-picked',picker.id,moth.id)
      break
     end
    end
   end
  end
  if t>=seal.nextMoths then
   seal.nextMoths=t+conf.mothCycle
   for i,x in ipairs(conf.moths) do if not seal.moths[i] then
    seal.serial=seal.serial+1;seal.moths[i]={id=seal.serial,x=x,expires=t+conf.mothTtl}
   end end
  end
  if t>=seal.nextPressure then
   seal.nextPressure=t+conf.pressureInterval
   local x=a and a.x<spec.center and 383 or 577
   seal.pressure={x=x,active=t+60,hit={},id='WS08'}
  end
  local p=seal.pressure
  if p and t>=p.active then
   if t>=p.active+6 then seal.pressure=nil
   else area(s,w,spec,p,1,box(p.x,31,spec.floorY,99),conf.pressureDamage,'cryo',false) end
  end
 end

 local function spread(x,deltas,lo,hi,y)
  local out={}
  for i,delta in ipairs(deltas) do out[i]={x=clamp(x+delta,lo,hi),y=y} end
  return out
 end
 local function lock(s,w,spec,c,i)
  local a=actor(s);local e=w.primary;local raw=a and a.x or spec.center
  local y,lo,hi=floorAt(s,a,spec.floorY)
  local x=clamp(raw,lo,hi)
  if i==1 then c.dir=raw>=e.x and 1 or -1;e.dir=c.dir end
  if c.id=='WS01' or c.id=='WS03' or c.id=='WS12' then
   c.points=spread(x,{-92,0,92},lo,hi,y)
  elseif c.id=='WS02' and c.key~='WS02' then
   c.targets[i]={x=raw,y=(a and a.y or spec.floorY)-42}
  elseif c.id=='WS05' then
   c.dest=clamp(raw+(c.dir>0 and -98 or 98),190,770)
   if math.abs(c.dest-raw)<70 then c.dest=clamp(raw+(raw<480 and 104 or -104),164,796) end
  elseif c.id=='WS06' or c.id=='WS07' then
   c.points={{x=x,y=y}}
  elseif c.id=='WS10' and c.key=='WS10.long' then
   c.points=spread(c.origin+c.dir*226,{-82,0,82},150,810,spec.floorY)
  elseif c.id=='WS13' and c.key=='WS13.giant' then
   c.targets[1]={x=raw,y=(a and a.y or spec.floorY)-40}
  elseif c.id=='WS14' then
   c.tornadoStart=clamp(c.origin,260,700)
   c.tornadoEnd=c.tornadoStart<=480 and 700 or 260
  end
 end
 local function start(s,w,spec,key)
  local move=spec.moves[key];local e=w.primary
  local c={key=key,id=key:sub(1,4),t=0,move=move,hit={},raised={},projectiles={},points={},targets={},
   origin=e.x,dir=e.dir,element=w.stage,floor=spec.floorY}
  for i in ipairs(move.locks) do lock(s,w,spec,c,i) end
  if c.id=='WS14' then w.lastTornado=w.clock;w.sinceTornado=0
  else w.sinceTornado=w.sinceTornado+1 end
  w.cast=c;w.phase='tell'
  log(s,w,c.id,0,w.stage=='pyro' and 2 or 1)
 end
 local function bands(c,i)
  local id=c.id
  if id=='WS01' or id=='WS03' or id=='WS12' then
   local p=c.points[i];return box(p.x,id=='WS01' and 35 or 40,p.y,id=='WS03' and 70 or 98)
  elseif id=='WS05' then return box(c.dest,75,c.floor,108)
  elseif id=='WS06' then local p=c.points[1];return box(p.x,53,p.y,120)
  elseif id=='WS07' then local p=c.points[1];return box(p.x,i==1 and 29 or 66,p.y,135)
  elseif id=='WS10' then
   if c.key=='WS10.long' and i>1 then local p=c.points[i-1];return box(p.x,36,p.y,116) end
   local far=c.origin+c.dir*(c.key=='WS10.long' and 306 or 194)
   return {lo=math.min(c.origin,far),hi=math.max(c.origin,far),y=c.floor,h=133}
  elseif id=='WS14' and i<3 then
   return {lo=math.min(c.tornadoStart,c.tornadoEnd)-43,hi=math.max(c.tornadoStart,c.tornadoEnd)+43,y=c.floor,h=114}
  elseif id=='WS14' then return box(480,126,c.floor,134) end
 end
 local function launch(s,w,c,i)
  local id=c.id
  local p={index=i,x=c.origin+c.dir*23,y=c.floor-56,start=c.t,dir=c.dir,life=60,radius=18,speed=8.8}
  if id=='WS02' and c.key=='WS02.seeking' then
   local target=c.targets[i];local dx,dy=target.x-p.x,target.y-p.y
   local length=math.max(1,math.sqrt(dx*dx+dy*dy));p.dx=dx/length*p.speed;p.dy=dy/length*p.speed
  elseif id=='WS04' then p.life,p.radius,p.ring=126,25,true
  elseif id=='WS11' then p.life,p.radius,p.speed,p.y=132,29,352/60,c.floor-30
  elseif id=='WS13' and c.key=='WS13.giant' then
   p.life,p.radius,p.giant,p.dest=132,34,true,c.targets[1]
  elseif id=='WS13' then p.life,p.radius,p.speed=96,17,440/60
  elseif id=='WS14' then
   p.life,p.radius,p.index,p.gust,p.speed=84,24,i,true,2.1
   local tip=i==1 and c.tornadoEnd or c.tornadoStart
   p.x,p.y=tip,c.floor-35
   local twin={index=i,x=tip,y=p.y,start=p.start,dir=-1,life=p.life,radius=p.radius,gust=true,speed=p.speed}
   c.projectiles[#c.projectiles+1]=twin;p.dir=1
  end
  c.projectiles[#c.projectiles+1]=p
  log(s,w,c.id..':spawn',0,i)
 end
 local function projectileTick(s,w,spec,c)
  for i=#c.projectiles,1,-1 do
   local p=c.projectiles[i];local age=c.t-p.start
   if age>=p.life then table.remove(c.projectiles,i)
   else
    local x,y=p.x,p.y
    local group=p.index
    if p.ring then
     local q=age/63
     x=x+p.dir*264*(q<1 and q or 2-q);group=q<1 and 1 or 2
    elseif p.giant then
     local q=age/132
     x=mix(x,p.dest.x,q);y=mix(y,p.dest.y,q)-math.sin(math.pi*q)*48
    else x=x+(p.dx or p.dir*p.speed)*age;y=y+(p.dy or 0)*age end
    p.drawX,p.drawY=x,y
    for _,a in ipairs(s.actors) do
     if a.hp>0 and math.abs(a.x-x)<p.radius+9 and a.y-8>=y-p.radius and a.y-76<=y+p.radius then
      damage(s,w,spec,c,group,a,c.move.damage,c.element,true)
     end
    end
   end
  end
 end
 local function attackTick(s,w,spec,c)
  local e=w.primary;c.t=c.t+1
  local t,id=c.t,c.id
  for i,when in ipairs(c.move.locks) do
   if t==when then lock(s,w,spec,c,i);log(s,w,id..':lock',0,i) end
  end
  if id=='WS05' then
   if t==54 then e.invulnerable=true;e.underground=true
   elseif t==90 then body(e,c.dest,c.floor,e.drawHeight);e.underground=false
   elseif t==102 then e.invulnerable=false end
  elseif id=='WS14' then
   if t==72 then e.invulnerable=true;e.underground=true
   elseif t==384 then body(e,480,c.floor,144);e.invulnerable=false;e.underground=false end
  end
  for i,when in ipairs(c.move.launches) do if t==when then launch(s,w,c,i) end end
  w.phase=t>=c.move.recovery and 'recovery' or 'tell'
  for i,win in ipairs(c.move.windows) do
   if t>=win[1] and t<win[2] then
    w.phase='active'
    local geometry=bands(c,i)
    if id=='WS14' and i<3 then
     local q=(t-win[1]+1)/(win[2]-win[1])
     c.twister=mix(c.tornadoStart,c.tornadoEnd,i==1 and q or 1-q)
     geometry=box(c.twister,45,c.floor,111)
    end
    area(s,w,spec,c,i,geometry,c.move.damage,c.element,true)
    if w.primary.hp<=0 then return end
   end
  end
  if id=='WS14' and (t==144 or t==264) then c.twister=nil end
  for _,when in ipairs(c.move.floors) do if t==when then
   for i,win in ipairs(c.move.windows) do if win[1]==when then
    local b=bands(c,i);addFloor(s,w,spec,(b.lo+b.hi)/2,b.y,math.min(88,b.hi-b.lo))
   end end
  end end
  projectileTick(s,w,spec,c)
  if t>=c.move.total and w.primary.hp>0 then w.cast=nil;w.rest=spec.restTicks;w.phase='available' end
 end
 local function tick(s,w,spec,input)
  w.clock=w.clock+1;w.stageTick=w.stageTick+1
  if w.stage=='transform' then
   if w.stageTick>=spec.moves.WS09.total then
    w.stage='pyro';w.phase='available';w.stageTick=0;w.index=1;w.rest=30
    w.sealResults=nil
    clearEnvironment(w)
    body(w.primary,spec.center,spec.floorY,144);w.primary.noAutoTarget=false;w.primary.invulnerable=false
   end
   return
  end
  environment(s,w,spec,input)
  if w.stage=='seal' then sealTick(s,w,spec);return end
  if w.cast then attackTick(s,w,spec,w.cast);return end
  local e=w.primary;local a=actor(s)
  if not a then return end
  w.rest=w.rest-1
  local dx=a.x-e.x
  if math.abs(dx)>190 then
   e.dir=dx>0 and 1 or -1;body(e,clamp(e.x+e.dir*2.35,162,798),spec.floorY,e.drawHeight)
  end
  if w.rest>0 then return end
  local order=spec.orders[w.stage=='pyro' and 2 or 1]
  local key=order[w.index];w.index=w.index%#order+1
  if key=='WS14' and (w.clock-w.lastTornado<900 or w.sinceTornado<3) then key='WS11' end
  start(s,w,spec,key)
 end
 function controller.finish(s,w,spec,dt)
  -- The weekly host supplies the same held inputs to each 60 Hz server tick.
  local input=w.input or {}
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do
   w.remainder=w.remainder-1;tick(s,w,spec,input)
  end
 end
 function controller.prepare(_,w,_,input) w.input=input end

 local function warnings(c)
  local shapes={}
  if c.t>=c.move.recovery then return shapes end
  for i,win in ipairs(c.move.windows) do
   local appears=c.id=='WS07' and i==2 and 150 or 0
   if c.t>=appears and c.t<win[2] then
    shapes[#shapes+1]={shape=bands(c,i),at=win[1],active=c.t>=win[1]}
   end
  end
  return shapes
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='signora' then
   if w.cast then for _,warning in ipairs(warnings(w.cast)) do
    local b=warning.shape
    if warning.at-w.cast.t<=32 and standing(a,b) then
     local l,r=b.lo-38,b.hi+38
     if l>=20 and (r>940 or a.x-l<r-a.x) then return l end
     if r<=940 then return r end
    end
   end end
   for _,f in ipairs(w.floors) do if covered(a,f) then return a.x<f.x and f.x-f.width/2-24 or f.x+f.width/2+24 end end
  end
  if avoid then return avoid(s,a) end
 end

 function controller.observe(f,s,w,spec,mode,profile)
  local e,c,seal=w.primary,w.cast,w.seal
  local v=f.weeklyBoss
  local element=w.stage=='pyro' and 'pyro' or 'cryo'
  v.formName=w.stage=='pyro' and '炎' or w.stage=='cryo' and '氷' or nil
  v.x,v.y,v.signoraStage=e.x,e.y,w.stage
  v.damageable=e.hp>0 and not e.invulnerable and not e.underground
  v.phaseHp={{name='氷',max=spec.cryoHp,hp=math.max(0,e.hp-spec.pyroHp)},
   {name='炎',max=spec.pyroHp,hp=math.min(e.hp,spec.pyroHp)}}
  v.move=w.stage=='transform' and 'WS09' or w.stage=='seal' and 'WS08' or c and c.id or nil
  v.moveTick=c and c.t or w.stageTick
  v.label=w.stage=='seal' and '氷の繭' or w.stage=='transform' and '焔蝶の羽化' or
    c and (c.t>=c.move.recovery and '反撃の隙' or c.move.title) or '構え'
  local record=climate(w,s)
  v.temperature=record.temperature;v.temperatureLabel=element=='cryo' and '極寒' or '灼熱'
  v.deviceLabel=element=='cryo' and '炎心' or '霜眼'
  v.devices={math.max(0,w.devices[1]-w.clock),math.max(0,w.devices[2]-w.clock)}
  v.deviceHold=record.hold;v.deviceTotal=spec.temperature.hold
  v.deviceEnabled=w.stage~='transform' and w.phase~='clear'
  local recent=record.cause and record.cause.untilTick>w.clock and record.cause
  v.cause=recent and recent.kind or nil
  v.deviceRelease=recent and recent.release or nil
  local strike=w.sealResults and w.sealResults[s]
  if strike and strike.untilTick>w.clock then
   v.sealStrike={source=strike.source,damage=strike.damage,remaining=strike.remaining}
  end
  if seal then
   v.seal={hp=seal.hp,max=spec.seal.strength,ready=seal.openedAt~=nil,
    carrying=seal.tokens[s]~=nil,moths={}}
   for i=1,2 do local m=seal.moths[i];if m then v.seal.moths[#v.seal.moths+1]={x=m.x,id=m.id} end end
  end
  if e.hp<=0 then return end
  local function rect(x,y,width,height,color)
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color}
  end
  local function text(x,y,label,color)
   f.draws[#f.draws+1]={kind='text',x=x-s.camera,y=y,text=label,color=color,size=15}
  end
  for _,floor in ipairs(w.floors) do
   rect(floor.x-floor.width/2,floor.y-7,floor.width,7,colors[element])
   rect(floor.x-floor.width/2+2,floor.y-8,math.max(1,floor.width-4),2,pale[element])
  end
  for i,x in ipairs(spec.temperature.deviceX) do
   local hue=v.devices[i]>0 and '#777d85' or element=='cryo' and '#ff964c' or '#8be5f3'
   rect(x-23,spec.floorY-16,46,16,'#4b4b61');rect(x-8,spec.floorY-62,16,48,hue)
   rect(x-15,spec.floorY-49,30,15,hue);rect(x-4,spec.floorY-53,8,10,'#fff3bd')
   text(x,spec.floorY-76,v.deviceLabel,hue)
  end
  if c then
   for _,warn in ipairs(warnings(c)) do local b=warn.shape
    rect(b.lo,b.y-5,b.hi-b.lo,5,'#51394e')
    rect(b.lo+2,b.y-4,b.hi-b.lo-4,3,warn.active and '#ff875c' or '#ffecb1')
   end
   if c.id=='WS04' and c.t>=117 and c.t<147 then text(c.origin+c.dir*205,c.floor-65,'↶ 折り返し','#e9faff') end
   if c.id=='WS05' and c.t<102 then rect(c.dest-38,c.floor-6,76,6,pale[element]) end
   for _,p in ipairs(c.projectiles) do
    local x,y=p.drawX or p.x,p.drawY or p.y
    rect(x-p.radius,y-5,p.radius*2,10,colors[element])
    rect(x-math.floor(p.radius/2),y-10,p.radius,6,pale[element])
   end
   if c.id=='WS14' and e.underground then
    local x=c.twister or (c.t<144 and c.tornadoStart or c.t<264 and c.tornadoEnd or c.tornadoStart)
    for i=1,5 do
     local offset=math.sin(c.t*.14+i)*26
     rect(x-38+offset,c.floor-i*19,76,7,i%2==0 and '#f9a66a' or '#ec684d')
    end
   end
  end
  if w.stage=='seal' or w.stage=='transform' then
   local h=w.stage=='seal' and math.min(115,24+w.stageTick) or math.max(12,115-w.stageTick*.7)
   rect(e.x-48,e.y-h*.72,96,h*.72,'#597b9d');rect(e.x-36,e.y-h,72,h,'#91c7dd')
   rect(e.x-20,e.y-h+10,40,h-10,'#c0eff3')
   local cracks=seal and math.floor((spec.seal.strength-seal.hp)/25) or 4
   for i=1,cracks do rect(e.x-39+i*14,e.y-20-i*11,27,3,'#ffb676') end
   if seal then
    for _,m in pairs(seal.moths) do
     local y=spec.floorY-38+math.sin(w.clock/10)*3
     rect(m.x-13,y-6,9,12,'#ffd98b');rect(m.x+5,y-6,9,12,'#ffd98b')
     rect(m.x-3,y-4,6,8,'#fff5cb')
    end
    if seal.pressure then rect(seal.pressure.x-31,spec.floorY-6,62,6,'#ffe8ae') end
   elseif w.stageTick>=96 then
    C.drawTallerHumanArt(f,C.signoraWeeklyArt.pyro,e.x-s.camera,e.y,144,mode,profile,e.dir>0,nil,w.clock/60)
   end
  elseif not e.underground then
   C.drawTallerHumanArt(f,C.signoraWeeklyArt[element],e.x-s.camera,e.y,e.drawHeight,mode,profile,e.dir>0,nil,w.clock/60)
  end
  if seal then
   local function drawMoth(party,offset)
    local a=actor(party)
    if a and seal.tokens[party] then text(a.x,a.y-offset,'紅蓮蛾','#ffde91') end
   end
   drawMoth(s,104)
   if s.coop and s.coop.weeklySlot==w then
    for _,member in ipairs(s.coop.members) do
     if member.online and member.state~=s and C.sharesCoopField(member.state) then drawMoth(member.state,132) end
    end
   end
  end
 end
 return controller
end
