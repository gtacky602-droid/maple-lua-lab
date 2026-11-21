return function(C)
 local controller={}
 local previousAvoid=C.aiAvoidTarget
 local clamp=function(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 local mix=function(a,b,t) return a+(b-a)*clamp(t,0,1) end
 local purple,pale,dark='#bd9afa','#f4e9ff','#583c8b'
 local function actor(s) return s.actors[s.active] end
 local function target(s,e)
  if not s.parties then return actor(s) end
  local best,distance=nil,math.huge
  for _,party in ipairs(s.parties) do
   local a=actor(party)
   if a.hp<=0 then a=party.actors[3-party.active] end
   local dx=math.abs(a.x-e.x)
   if a.hp>0 and dx<distance then best,distance=a,dx end
  end
  return best or e
 end
 local function ownLog(s,w,key,owner,value) C.combatEvent(s,'raiden:'..key,owner or 0,w.primary.id,value or 0) end
 local function log(s,w,key,owner,value)
  for _,party in ipairs(s.parties or {s}) do ownLog(party,w,key,owner,value) end
 end
 local function body(e,x,y,h)
  e.x,e.y,e.hitTop,e.hitBottom=x,y,y-h,y
 end
 local function band(x,r,y,h) return {lo=x-r,hi=x+r,y=y,h=h} end
 local function ahead(x,dir,near,far,y,h)
  local a,b=x+dir*near,x+dir*far
  return {lo=math.min(a,b),hi=math.max(a,b),y=y,h=h}
 end
 local function inside(a,b)
  return a.hp>0 and a.x>=b.lo and a.x<=b.hi and a.y>=b.y-b.h and a.y<=b.y+6
 end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function clearObjects(s,w)
  for _,e in ipairs(w.objects or {}) do remove(s,e) end
  w.objects={}
 end
 local function spawnObject(s,w,spec,c,kind,x,index,accept,contact)
  local e={id=spec.entity+200+index,custom=true,boss=true,weeklyPart=true,noRewards=true,noAutoTarget=true,
    kind=kind,index=index,hp=1,maxhp=1,warning=0,respawn=math.huge,acceptsCast=accept,onCastContact=contact}
  body(e,x,spec.floorY,kind=='shade' and 106 or 57)
  w.objects[#w.objects+1]=e
  s.enemies[#s.enemies+1]=e
  return e
 end
 local function manual(s,w,cast,opened)
  -- Compare elapsed time because a guest's input timestamp uses that player's clock.
  local now=s.coop and s.coop.weeklySlot==w and s.coop.time or s.t
  return opened and cast.playerInputAt and not cast.reaction and not cast.growthAI
   and s.t-cast.playerInputAt<=now-opened+1e-8
 end
 local function weakKeys() return setmetatable({},{__mode='k'}) end
 local function spend(c,cast,owner,ownerClock,spent,delay)
  if not owner or spent[cast] or (ownerClock[owner] or -math.huge)+delay>c.t then return false end
  spent[cast]=true;ownerClock[owner]=c.t
  return true
 end
 local function contribution(s,w,cast)
  if s.coop then C.coopContact(s,w.primary,cast.id) end
 end
 local function elements(cast,element,get)
  local n=get(element)
  for _,part in ipairs(cast.damageElements or {}) do n=math.max(n,get(part)) end
  for _,part in ipairs(cast.elements or {}) do n=math.max(n,get(part)) end
  return n
 end
 local function posture(s,w,spec,stage,key)
  clearObjects(s,w);w.stage=stage;w.phase=stage;w.cast=nil;w.rest=spec.restTicks;w.stageTick=0
  local e=w.primary
  e.invulnerable=stage=='awaken' or stage=='collapse'
  e.underground=false;e.noAutoTarget=e.invulnerable
  local h=stage=='armored' and 144 or 112
  body(e,e.x,spec.floorY,h)
  if key then log(s,w,key) end
 end
 local function armorHit(s,w,spec,cast,element)
  local a=spec.armor
  local owner=s.actors[cast.id]
  if not owner or not manual(s,w,cast,w.armorOpened) or w.armorTouched[cast] or
    w.clock<(w.armorOwners[owner] or -math.huge)+a.hitInterval then return end
  local used=0
  for i=#w.armorWindow,1,-1 do
   local hit=w.armorWindow[i]
   if w.clock>=hit.tick+60 then table.remove(w.armorWindow,i) else used=used+hit.value end
  end
  local n=elements(cast,element,function(el)
   return (el=='pyro' or el=='cryo') and 2 or (el=='electro' or el=='physical' or not el) and .25 or 1
  end)
  n=math.min(n,a.hitBudget-used,w.armor)
  if n<=0 then return end
  w.armorTouched[cast]=true;w.armorOwners[owner]=w.clock
  w.armorWindow[#w.armorWindow+1]={tick=w.clock,value=n}
  w.armor=w.armor-n;log(s,w,'WR18:hit',cast.id,n)
 end
 local function contact(s,w,spec,cast,mult,color,element)
  local e=w.primary
  if e.invulnerable or e.hp<=0 then return false end
  local resistance=C.enemyResistance(cast,e,element)
  if resistance>=1 then return false end
  local n,critical=C.enemyHitDamage(s,cast,e,mult,element,resistance)
  n=math.min(n,e.hp);s.hits=s.hits+1;s.damage=s.damage+n
  C.combatNumber(s,e,critical and (n..'!') or n,color)
  C.combatEvent(s,'hit',cast.id,e.id,n)
  local event=s.events[#s.events];event.element=element;event.critical=not not critical;event.reaction=cast.reaction or false
  contribution(s,w,cast)
  if n==e.hp then C.defeatEnemy(s,e,cast.id);return true end
  e.hp=e.hp-n
  if w.stage=='armored' and w.armor>0 then armorHit(s,w,spec,cast,element) end
  if C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  return true
 end
 function controller.spawn(s,w,spec)
  w.clock,w.stageTick,w.remainder=0,0,0
  w.omen,w.omenTicks,w.armor,w.armorTime=0,0,0,0
  w.weapon,w.weaponCasts,w.normalIndex=1,0,{1,1}
  w.primary.dir=-1
  posture(s,w,spec,'normal');w.rest=spec.noticeTicks
  w.primary.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,cast,mult,color,element) end
 end
 function controller.attach(s,w)
  remove(s,w.primary);s.enemies[#s.enemies+1]=w.primary
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  clearObjects(s,w);remove(s,w.primary)
  w.cast=nil;w.primary.underground=true;w.armorWindow={};w.armorOwners={};w.armorTouched={}
 end
 local function waves(c,i)
  local xs=i<4 and {c.posts[i]} or c.posts
  for _,x in ipairs(xs) do
   for dir=-1,1,2 do c.waves[#c.waves+1]={x=x,dir=dir,start=c.t,group=i} end
  end
 end
 local function stop(s,w,spec,c,duration,x)
  clearObjects(s,w)
  c.downUntil=c.t+duration;c.waves={};w.phase='recovery'
  w.primary.invulnerable=false;w.primary.noAutoTarget=false
  body(w.primary,x or w.primary.x,spec.floorY,112)
  log(s,w,c.id..':down')
 end
 local function eyes(s,w,spec,c)
  c.opened=s.t
  local xs=c.key=='WR05' and {spec.center} or {192,480,768}
  for i,x in ipairs(xs) do
   local e=spawnObject(s,w,spec,c,'eye',x,i,
    function(cast,state) return w.cast==c and c.t<360 and manual(state,w,cast,c.opened) end,
    function(state,cast,obj)
     if not spend(c,cast,state.actors[cast.id],obj.owners,obj.spent,spec.objects.cooldown) then return false end
     contribution(state,w,cast)
     obj.charges=obj.charges-1;log(state,w,'WR05:hit',cast.id,obj.index)
     if obj.charges==0 then
      obj.hp=0;remove(state,obj);c.eyes=c.eyes-1
      if c.eyes==0 then stop(state,w,spec,c,spec.objects.eyePause) end
     end
     return true
    end)
   e.charges=spec.objects.eyeHits;e.owners=weakKeys();e.spent=weakKeys()
  end
  c.eyes=#xs
  w.primary.underground=true;w.primary.invulnerable=true
 end
 local function nearestShade(s,w)
  local x=actor(s).x;local best=nil
  for _,e in ipairs(w.objects) do
   if e.hp>0 and (not best or math.abs(x-e.x)<math.abs(x-best.x)) then best=e end
  end
  return best
 end
 local function shades(s,w,spec,c)
  c.correct=(w.shadeIndex or 0)%4+1;w.shadeIndex=c.correct
  c.choices=weakKeys()
  for i,x in ipairs({144,365,595,816}) do
   spawnObject(s,w,spec,c,'shade',x,i,
    function(cast,state)
     if w.cast~=c or not manual(state,w,cast,c.opened) then return false end
     if c.choices[cast]==nil then c.choices[cast]=nearestShade(state,w) or false end
     return c.choices[cast] and c.choices[cast].index==i
    end,
    function(state,cast,obj)
     obj.hp=0;remove(state,obj)
     log(state,w,'WR06:choice',cast.id,i)
     if i==c.correct then
      contribution(state,w,cast);stop(state,w,spec,c,spec.objects.shadePause,x)
     end
     return true
    end)
  end
  w.primary.underground=true;w.primary.invulnerable=true
 end
 local function openFlower(s,w,spec,c)
  local rule=spec.objects
  c.opened=s.t;c.owners=weakKeys();c.spent=weakKeys();c.charges=0
  c.flower=spawnObject(s,w,spec,c,'flower',c.location,1,
   function(cast,state) return w.cast==c and c.t<rule.flowerLockout and c.charges<rule.flowerHits and manual(state,w,cast,c.opened) end,
   function(state,cast,_,_,_,element)
    if not spend(c,cast,state.actors[cast.id],c.owners,c.spent,rule.cooldown) then return false end
    local n=elements(cast,element,function(el) return el=='electro' and rule.flowerHits or 1 end)
    c.charges=math.min(rule.flowerHits,c.charges+n)
    contribution(state,w,cast)
    log(state,w,'WR14:charge',cast.id,c.charges)
    return true
   end)
 end
 local function lock(s,w,spec,c,i)
  local e=w.primary;local a=target(s,e)
  local dir=a.x>=e.x and 1 or -1
  if i==1 then c.dir=dir;e.dir=dir;c.origin=e.x end
  local id=c.id
  if id=='WR02' then c.land=clamp(a.x,124,836)
  elseif id=='WR04' then
   if i==1 then c.to=clamp(c.origin+dir*176,80,880)
   else c.back=clamp(c.to-c.dir*220,80,880) end
  elseif id=='WR05' then eyes(s,w,spec,c)
  elseif id=='WR06' then shades(s,w,spec,c)
  elseif id=='WR07' then c.land=clamp(a.x,315,645)
  elseif id=='WR12' then c.posts={240,480,720}
  elseif id=='WR13' then c.land=clamp(a.x,170,790)
  elseif id=='WR14' then openFlower(s,w,spec,c) end
  log(s,w,id..':lock',0,i)
 end
 local function shape(spec,c,i)
  local y,id,x,d=spec.floorY,c.id,c.origin,c.dir
  if id=='WR01' then return ahead(x,d,12,i==3 and 220 or 176,y,i==3 and 132 or 114)
  elseif id=='WR02' then return i==1 and band(c.land,88,y,96) or band(c.land+d*70,31,y,162)
  elseif id=='WR03' then return ahead(x,d,12,i==3 and 185 or 150,y,108)
  elseif id=='WR04' then
   local from,to=x,c.to
   if i==2 then from,to=c.to,c.back end
   return from and to and {lo=math.min(from,to)-15,hi=math.max(from,to)+15,y=y,h=81}
  elseif id=='WR07' then return band(c.land,i==1 and 69 or 176,y,i==1 and 75 or 140)
  elseif id=='WR10' then return ahead(x,d,44,i==1 and 317 or 282,y,i==1 and 82 or 150)
  elseif id=='WR11' then
   if c.key=='WR11.sweep' then return ahead(x,d,30,i==1 and 268 or 294,y,i==1 and 99 or 150) end
   return ahead(x,d,24,352,y,49)
  elseif id=='WR13' then return i==3 and band(c.land,106,y,112) or ahead(x,d,22,227,y,99) end
 end
 local function deal(s,w,spec,c,i,a,x)
  if w.primary.hp<=0 then return end
  local hit=c.hit[i]
  if not hit then hit={};c.hit[i]=hit end
  if hit[a] then return end
  hit[a]=true
  local party=s.actorOwners and s.actorOwners[a] or s
  local n=C.damageActor(party,a,c.move.damage,{id=w.primary.id,x=x,y=spec.floorY,damageElement='electro'},true,true)
  if n>0 then
   ownLog(party,w,c.id..':hit',a.id,i)
   if w.stage=='normal' and not c.raised and a.id==party.active and not party.auto then
    c.raised=true;w.omen=math.min(spec.omen.max,w.omen+spec.omen.onHit)
   end
  end
 end
 local function area(s,w,spec,c,i,b)
  for _,a in ipairs(s.actors) do if inside(a,b) then deal(s,w,spec,c,i,a,(b.lo+b.hi)/2) end end
 end
 local function start(s,w,spec,key,flower)
  local e=w.primary;local a=target(s,e)
  local c={key=key,id=key:sub(1,4),t=0,move=spec.moves[key],hit={},waves={},origin=e.x,dir=a.x>=e.x and 1 or -1,
    land=clamp(a.x,170,790)}
  c.to=clamp(c.origin+c.dir*176,80,880);c.back=clamp(c.to-c.dir*220,80,880)
  if key=='WR14' then
   c.location=s.parties and spec.center or (a.x<480 and 192 or 768);w.flowerCount=w.flowerCount+1
   e.invulnerable=true;e.noAutoTarget=true
  elseif key=='WR15' then c.location,c.charges=flower.location,flower.charges end
  w.cast=c;w.phase='tell'
  if c.move.locks[1]==0 then lock(s,w,spec,c,1) end
  log(s,w,c.id)
 end
 local function inDome(a,x,spec)
  local dx=(a.x-x)/spec.objects.flowerRadius
  local dy=math.max(0,spec.floorY-a.y)/126
  return a.hp>0 and dx*dx+dy*dy<=1
 end
 local function finishCast(s,w,spec)
  clearObjects(s,w);w.cast=nil;w.phase='available';w.rest=spec.restTicks
  local e=w.primary
  e.underground=false;e.invulnerable=false;e.noAutoTarget=false
 end
 local function attack(s,w,spec,c)
  c.t=c.t+1
  local t,id,e,y=c.t,c.id,w.primary,spec.floorY
  if c.downUntil then if t>=c.downUntil then finishCast(s,w,spec) end;return end
  for i,when in ipairs(c.move.locks) do if t==when then lock(s,w,spec,c,i) end end
  if id=='WR02' and t>=72 and t<=120 then
   body(e,mix(c.origin,c.land,(t-72)/48),y-106*math.sin(math.pi*(t-72)/48),112)
  elseif id=='WR04' then
   if t>=72 and t<=96 then body(e,mix(c.origin,c.to,(t-72)/24),y,112)
   elseif t>=156 and t<=180 then body(e,mix(c.to,c.back,(t-156)/24),y,112) end
  elseif id=='WR06' and t==spec.objects.shadeReady then c.opened=s.t
  elseif (id=='WR05' and t==372) or (id=='WR06' and t==480) then
   clearObjects(s,w);e.underground=false;e.invulnerable=false
  end
  w.phase=t>=c.move.recovery and 'recovery' or 'tell'
  for i,win in ipairs(c.move.windows) do
   if t>=win[1] and t<win[2] then
    w.phase='active'
    local b=shape(spec,c,i)
    if b then area(s,w,spec,c,i,b)
    elseif id=='WR05' then
     for _,eye in ipairs(w.objects) do if eye.hp>0 then area(s,w,spec,c,eye.index,band(eye.x,88,y,176)) end end
    elseif id=='WR06' then
     area(s,w,spec,c,i,{lo=156,hi=804,y=y,h=57})
    elseif id=='WR15' and t==win[1] then
     for _,a in ipairs(s.actors) do
      local protected=c.charges==spec.objects.flowerHits and inDome(a,c.location,spec)
      if protected then
       ownLog(s.actorOwners and s.actorOwners[a] or s,w,'WR15:protected',a.id)
      else deal(s,w,spec,c,i,a,spec.center) end
     end
     w.armor=math.max(0,w.armor-spec.armor.slashDrain)
     log(s,w,'WR15:drain',0,spec.armor.slashDrain)
    end
   end
  end
  for i,when in ipairs(c.move.launches) do
   if t==when then waves(c,i);log(s,w,id..':spawn',0,i) end
  end
  for i=#c.waves,1,-1 do
   local p=c.waves[i];local age=t-p.start
   p.drawX=p.x+p.dir*age*440/60
   if age>=c.move.projectileTtl or p.drawX<-38 or p.drawX>998 then table.remove(c.waves,i)
   else area(s,w,spec,c,p.group,band(p.drawX,24,y,54)) end
  end
  if t<c.move.total then return end
  if id=='WR14' then
   local valid=false
   for _,obj in ipairs(s.enemies) do
    if obj==c.flower and obj.hp>0 then valid=true;break end
   end
   clearObjects(s,w)
   if valid then start(s,w,spec,'WR15',c);return end
   log(s,w,'WR14:cancel')
  elseif id=='WR15' then
   w.lastFlower=w.armorTime;w.sinceFlower=0
  end
  finishCast(s,w,spec)
 end
 local function tick(s,w,spec)
  w.clock=w.clock+1;w.stageTick=w.stageTick+1
  local stage,e,c,t=w.stage,w.primary,w.cast,w.stageTick
  if stage=='awaken' then
   if t==120 then w.armor=spec.armor.max end
   if t==spec.moves.WR09.total then
    posture(s,w,spec,'armored');w.armorTime=0;w.armorOpened=s.t
    w.armorTouched=weakKeys();w.armorOwners=weakKeys();w.armorWindow={}
    w.armorIndex=1;w.flowerCount=0;w.sinceFlower=0;w.lastFlower=0
   end
   return
  elseif stage=='collapse' then
   if t==spec.moves.WR16.recovery then e.invulnerable=false;e.noAutoTarget=false;w.phase='recovery' end
   if t==spec.moves.WR16.total then posture(s,w,spec,'repair','WR17') end
   return
  elseif stage=='repair' then
   if t==spec.moves.WR17.recovery then w.omen=0;w.omenTicks=0;w.weapon=3-w.weapon;w.weaponCasts=0 end
   if t==spec.moves.WR17.total then posture(s,w,spec,'normal') end
   return
  elseif stage=='switch' then
   if t>=spec.omen.switchTicks then w.weapon=3-w.weapon;w.weaponCasts=0;posture(s,w,spec,'normal') end
   return
  elseif stage=='normal' and not (c and c.downUntil) then
   w.omenTicks=w.omenTicks+1
   if w.omenTicks%spec.omen.period==0 then w.omen=math.min(spec.omen.max,w.omen+1) end
  elseif stage=='armored' then
   if not (c and (c.id=='WR14' or c.id=='WR15')) then
    w.armorTime=w.armorTime+1;w.armor=math.max(0,w.armor-spec.armor.perSecond/60)
   end
   if (w.armor<=0 or w.armorTime>=spec.armor.limit) and not (c and c.id=='WR15') then
    w.armor=0;posture(s,w,spec,'collapse','WR16');return
   end
  end
  if c then attack(s,w,spec,c);return end
  if stage=='normal' and w.omen>=spec.omen.max then posture(s,w,spec,'awaken','WR09');return end
  if stage=='normal' and w.weaponCasts==spec.omen.switchAfter then posture(s,w,spec,'switch','WR08');return end
  w.rest=w.rest-1
  local dx=target(s,e).x-e.x
  if math.abs(dx)>194 and w.rest>0 then
   e.dir=dx>0 and 1 or -1
   body(e,clamp(e.x+e.dir*2,98,862),spec.floorY,stage=='armored' and 144 or 112)
  end
  if w.rest>0 then return end
  if stage=='normal' then
   local list=spec.normalOrders[w.weapon];local i=w.normalIndex[w.weapon]
   start(s,w,spec,list[i])
   w.normalIndex[w.weapon]=i%#list+1;w.weaponCasts=w.weaponCasts+1
  else
   local rules=spec.armor
   if (w.flowerCount==0 and w.sinceFlower>=rules.firstFlowerAfter)
      or (w.flowerCount>0 and w.flowerCount<rules.flowerLimit and w.sinceFlower>=3 and w.armorTime-w.lastFlower>=rules.flowerSpacing) then
    start(s,w,spec,'WR14')
   else
    start(s,w,spec,spec.armorOrder[w.armorIndex])
    w.armorIndex=w.armorIndex%#spec.armorOrder+1;w.sinceFlower=w.sinceFlower+1
   end
  end
 end
 function controller.prepare() end
 function controller.finish(s,w,spec,dt)
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;tick(s,w,spec) end
  if not s.parties or w.primary.hp<=0 then return end
  for _,a in ipairs(s.actors) do if a.hp>0 then return end end
  clearObjects(s,w);w.cast=nil;w.rechallenge=true;w.primary.invulnerable=true
 end

 local function warnings(spec,c)
  local out={}
  if not c or c.downUntil or c.t>=c.move.recovery then return out end
  for i,win in ipairs(c.move.windows) do
   local lead=c.id=='WR04' and i==2 and 108 or c.id=='WR13' and i==3 and 180 or 0
   if c.t>=lead and c.t<win[2] then
    local b=shape(spec,c,i)
    if b then out[#out+1]={b=b,at=win[1]} end
   end
  end
  return out
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=C.currentWeeklyBoss(s)
  local c=w and spec.controller=='raiden' and w.cast
  if c then
   if (c.id=='WR14' or c.id=='WR15') and c.charges==spec.objects.flowerHits then return c.location end
   for _,warning in ipairs(warnings(spec,c)) do
    local b=warning.b
    if warning.at-c.t<=33 and inside(a,b) then
     local l,r=b.lo-34,b.hi+34
     if l>=20 and (r>940 or a.x-l<r-a.x) then return l end
     if r<=940 then return r end
    end
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 function controller.observe(f,s,w,spec,mode,profile)
  local b,e,c,stage=f.weeklyBoss,w.primary,w.cast,w.stage
  local gestures={switch='持ち替え',awaken='悪曜の顕現',collapse='悪曜装甲の崩壊',repair='修復と再始動'}
  local cards={switch='WR08',awaken='WR09',collapse='WR16',repair='WR17'}
  local armor=stage=='armored' or stage=='awaken' and w.stageTick>=120
  b.x,b.y,b.raidenStage=e.x,e.y,stage
  b.formName=armor and '悪曜' or w.weapon==1 and '薙刀' or '刀'
  b.label=c and (c.downUntil and '短いダウン' or c.move.title) or gestures[stage] or '構え'
  b.damageable=e.hp>0 and not e.underground and not e.invulnerable
  b.move=c and c.id or cards[stage];b.moveTick=c and c.t or w.stageTick
  local armorMeter=armor or stage=='collapse' or stage=='repair' and w.stageTick<spec.moves.WR17.recovery
  b.raidenMeter={name=armorMeter and '装甲' or '凶運',value=armorMeter and w.armor or w.omen}
  b.down=stage=='collapse' and math.max(0,spec.moves.WR16.total-math.max(spec.moves.WR16.recovery,w.stageTick)) or nil
  if c and (c.id=='WR14' or c.id=='WR15') then
   b.flower={x=c.location,value=c.charges or 0,max=spec.objects.flowerHits,limit=c.id=='WR14' and math.max(0,spec.objects.flowerLockout-c.t) or 0,
     ready=c.opened~=nil and c.t<spec.objects.flowerLockout,
     protected=c.charges==spec.objects.flowerHits and (c.id=='WR14' or c.t<spec.objects.flowerProtectUntil)}
  end
  if e.hp<=0 then return end
  local function rect(x,y,wid,h,color)
   f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=wid,h=h,color=color}
  end
  local function label(x,y,value,color)
   f.draws[#f.draws+1]={kind='text',x=x-s.camera,y=y,text=value,color=color,size=15}
  end
  local function edge(x,y,width,color)
   local left,right=math.max(0,x),math.min(960,x+width)
   if right<=left then return end
   rect(left,y,right-left,6,dark);rect(left,y-5,right-left,3,color)
  end
  local y=spec.floorY
  b.warnings={}
  for _,hint in ipairs(warnings(spec,c)) do
   edge(hint.b.lo,hint.b.y-4,hint.b.hi-hint.b.lo,c.t>=hint.at and purple or pale)
   b.warnings[#b.warnings+1]={lo=hint.b.lo,hi=hint.b.hi,y=hint.b.y,h=hint.b.h,starts=hint.at}
  end
  if c and c.posts and c.t<486 then
   for i,x in ipairs(c.posts) do
    local pulse=c.move.launches[i]-c.t
    local last=c.move.launches[4]-c.t
    local armed=pulse>=0 and pulse<=36 or last>=0 and last<=36
    rect(x-9,y-67,18,63,dark);rect(x-4,y-70,8,48,armed and pale or purple)
    if armed then edge(x-36,y-3,72,pale) end
   end
  end
  if c then
   for _,p in ipairs(c.waves) do
    rect(p.drawX-24,y-9,48,8,dark);rect(p.drawX-12,y-36,24,5,purple);rect(p.drawX-5,y-51,10,15,pale)
   end
  end
  if not e.underground then
   local h=armor and 144 or (stage=='collapse' and w.stageTick>=48 or c and c.downUntil) and 87 or 112
   local art=armor and C.raidenWeeklyArt.armored or C.raidenWeeklyArt.normal
   C.drawFieldDisplayArt(f,art,e.x-s.camera,e.y,h,mode,profile,armor and e.dir>0 or not armor and e.dir<0)
   if not armor then
    local long=w.weapon==1;local startX=e.x+e.dir*(h*.29)
    for i=0,long and 9 or 6 do
     rect(startX-4+e.dir*i*3,e.y-h*.47-i*(long and 7 or 4),8,8,i>4 and pale or dark)
    end
   end
  end
  local shade=c and c.id=='WR06' and nearestShade(s,w)
  b.targets={}
  for _,obj in ipairs(w.objects) do
   if obj.hp>0 and obj.kind=='eye' then
    b.targets[#b.targets+1]={kind='eye',x=obj.x,charges=obj.charges}
    edge(obj.x-88,y-4,176,pale);rect(obj.x-23,y-50,46,20,dark);rect(obj.x-9,y-46,18,12,purple)
    for i=1,obj.charges do rect(obj.x-23+i*9,y-58,6,6,pale) end
   elseif obj.hp>0 and obj.kind=='shade' then
    b.targets[#b.targets+1]={kind='shade',x=obj.x,selected=obj==shade,
     clue=c.t>=spec.objects.shadeClue and (obj.index==c.correct and '╳' or '／') or nil}
    local normal=C.raidenWeeklyArt.normal
    C.drawFieldDisplayArt(f,normal,obj.x-s.camera,y,106,mode,profile,obj.x>480,nil,nil,.58)
    if c.t>=spec.objects.shadeClue then
     label(obj.x,y-118,obj.index==c.correct and '╳' or '／',pale)
    end
    if shade==obj then edge(obj.x-33,y-3,66,'#ffe7a1') end
   end
  end
  if b.flower then
   local flower=b.flower;local x=flower.x
   if c.flower or c.id=='WR15' then
    rect(x-4,y-43,8,41,dark);rect(x-19,y-51,38,15,purple);rect(x-7,y-57,14,27,pale)
    for i=1,flower.max do rect(x-30+i*9,y-68,7,6,i<=flower.value and pale or dark) end
   end
   if flower.protected then
    local r=spec.objects.flowerRadius
    edge(x-r,y-4,r*2,'#b6f6eb')
    for i=0,24 do
     local angle=math.pi*i/24
     rect(x+r*math.cos(angle)-5,y-126*math.sin(angle)-6,10,7,'#b6f6eb')
    end
   end
   if c.id=='WR15' and c.t<90 then
    for i=1,34 do rect(930-i*23,60+i*10,23,11,c.t>=60 and pale or dark) end
   end
  end
 end
 return controller
end
