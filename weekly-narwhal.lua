return function(C)
 local controller={}
 local previousAvoid,canAttack=C.aiAvoidTarget,C.canAttack
 local blue,white,violet='#bfdff8','#eaf5ff','#bd9fea'
 local function clamp(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 local function actor(s) return s.actors[s.active] end
 local function roomFor(s,w)
  return s.coopWorld or (s.coop and s.coop.weeklySlot==w and s.coop)
 end
 local function forParties(s,w,action)
  local room=roomFor(s,w)
  if not room then action(s);return end
  for _,member in ipairs(room.members) do
   local party=member.state
   if C.sharesCoopField(party) then action(party) end
  end
 end
 local function ownLog(s,w,key,owner,value) C.combatEvent(s,'narwhal:'..key,owner or 0,w.primary.id,value or 0) end
 local function log(s,w,key,owner,value)
  forParties(s,w,function(party) ownLog(party,w,key,owner,value) end)
 end
 local function contribution(s,w,id)
  if s.coop and s.coop.weeklySlot==w then C.coopContact(s,w.primary,id) end
 end
 local function choose(s,e)
  if not s.parties then return actor(s) end
  local best,distance=e,math.huge
  for _,party in ipairs(s.parties) do
   local a=actor(party)
   if a.hp<=0 then a=party.actors[3-party.active] end
   local dx=math.abs(a.x-e.x)
   if a.hp>0 and dx<distance then best,distance=a,dx end
  end
  return best
 end
 local function band(x,r,y,h) return {lo=x-r,hi=x+r,y=y,h=h} end
 local function inside(a,b) return a.hp>0 and a.x>=b.lo and a.x<=b.hi and a.y>=b.y-b.h and a.y<=b.y+5 end
 local function remove(s,e)
  if not e then return end
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function entity(spec,index,x,y,low,high,contact)
  return {id=spec.entity+index,x=x,y=y,hp=1,maxhp=1,hitTop=high,hitBottom=low,boss=true,custom=true,noRewards=true,
    noAutoTarget=true,weeklyPart=true,warning=0,respawn=math.huge,onCastContact=contact}
 end
 local function target(w,enabled)
  local e=w.primary
  e.invulnerable=not enabled;e.underground=not enabled;e.noAutoTarget=not enabled
  for _,part in ipairs(w.parts) do part.invulnerable=not enabled;part.underground=not enabled end
 end
 local function locate(w,x,y)
  local e=w.primary
  e.x,e.y,e.hitTop,e.hitBottom=x,y,y-128,y
  for i,p in ipairs(w.parts) do
   p.x=x+(i==1 and -142 or 142);p.y=y;p.hitTop=y-100;p.hitBottom=y
  end
 end
 local function clearCast(s,w)
  remove(s,w.special);w.special=nil;w.cast=nil
 end
 local function phase(s,w,spec,stage,card)
  clearCast(s,w)
  w.stage=stage;w.phase=stage;w.stageTick=0;w.rest=spec.restTicks
  if stage=='swallow' or stage=='expel' then
   w.epoch=w.epoch+1;forParties(s,w,C.clearWeeklySceneCasts)
   local e=w.primary
   e.aura=nil;e.burning=nil;e.applicationClocks=nil
  end
  if stage~='inner' then remove(s,w.shadow) end
  locate(w,spec.center,spec.floorY)
  target(w,stage=='outer')
  if card then log(s,w,card) end
 end
 local function threshold(w,spec)
  return w.primary.hp<=w.primary.maxhp*spec.hostility.lowRatio
 end
 local function hostility(s,w,spec,value,source,id)
  if threshold(w,spec) then return end
  local before=w.h
  w.h=math.min(spec.hostility.max,w.h+value)
  if w.h>before and source then log(s,w,source,id,w.h-before) end
  if w.h==spec.hostility.max and not w.queued then
   w.queued=true;log(s,w,'WV06:reserve')
  end
 end
 local function commonHit(s,cast,e,mult,color,element)
  local r=C.enemyResistance(cast,e,element)
  if r>=1 then return 0 end
  local n,critical=C.enemyHitDamage(s,cast,e,mult,element,r)
  n=math.min(n,e.hp)
  if n<=0 then return 0 end
  s.hits=s.hits+1;s.damage=s.damage+n
  C.combatNumber(s,e,critical and (n..'!') or n,color)
  C.combatEvent(s,'hit',cast.id,e.id,n)
  local event=s.events[#s.events];event.element=element;event.critical=not not critical;event.reaction=cast.reaction or false
  return n
 end
 local function whaleHit(s,w,spec,cast,mult,color,element)
  local e=w.primary
  if e.hp<=0 or e.invulnerable then return false end
  local n=commonHit(s,cast,e,mult,color,element)
  if n<=0 then return false end
  contribution(s,w,cast.id)
  if n==e.hp then C.defeatEnemy(s,e,cast.id);return true end
  e.hp=e.hp-n
  if threshold(w,spec) and w.queued then w.queued=false;log(s,w,'WV06:cancel') end
  local h=spec.hostility
  if w.stage=='outer' and not w.hSeen[cast] and not cast.reaction and w.clock>=w.hLast+h.gap then
   w.hSeen[cast]=true;w.hLast=w.clock;hostility(s,w,spec,h.perCast,'WV06:hit',cast.id)
  end
  if C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  return true
 end
 local function completeShadow(s,w,spec,owner)
  local e=w.shadow
  if w.stage~='inner' or e.hp>0 then return end
  w.returnOwner,w.returnParty=owner,s
  phase(s,w,spec,'expel','WV14')
 end
 local function shadowHit(s,w,spec,cast,e,mult,color,element)
  if w.stage~='inner' or e.hp<=0 or e.invulnerable then return false end
  local n=commonHit(s,cast,e,mult,color,element)
  if n<=0 then return false end
  contribution(s,w,cast.id)
  e.hp=e.hp-n
  if e.hp<=0 then completeShadow(s,w,spec,cast.id)
  elseif C.afterElementHit then C.afterElementHit(s,cast,e,cast.applicationElement or element,element,n) end
  return true
 end
 function controller.spawn(s,w,spec)
  w.clock,w.remainder,w.epoch,w.entries=0,0,0,0
  w.h,w.hLast,w.outerTicks=0,-math.huge,0;w.queued=false;w.returned=0;w.returnParty=nil
  w.hSeen=setmetatable({},{__mode='k'})
  w.outerIndex=1;w.finalIndex=1;w.innerIndex=1;w.variant=1;w.parts={};w.shadow=nil
  phase(s,w,spec,'outer');w.rest=spec.noticeTicks;w.primary.dir=-1
  w.primary.onCastContact=function(state,cast,_,mult,color,element) return whaleHit(state,w,spec,cast,mult,color,element) end
 end
 function controller.attach(s,w,spec)
  remove(s,w.primary)
  for _,e in ipairs(w.parts) do remove(s,e) end
  s.enemies[#s.enemies+1]=w.primary;w.parts={}
  for i=1,2 do
   local e=entity(spec,i,spec.center,spec.floorY,spec.floorY,spec.floorY-100,w.primary.onCastContact)
   e.sharedHealth=w.primary;w.parts[#w.parts+1]=e;s.enemies[#s.enemies+1]=e
  end
  locate(w,spec.center,spec.floorY);target(w,true)
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  clearCast(s,w);remove(s,w.shadow)
  for _,e in ipairs(w.parts) do remove(s,e) end
  w.parts={};w.queued=false;w.primary.underground=true
  remove(s,w.primary)
 end
 local function point(a,y,spread)
  local x=clamp(a.x+(spread or 0),128,832)
  if a.y<=385 then
   x=a.x<480 and clamp(x,132,245) or clamp(x,714,838)
   y=355
  end
  return {x=x,y=y}
 end
 local function lock(s,w,spec,c,i)
  local e=w.stage=='inner' and w.shadow or w.primary
  local a=choose(s,e)
  local id=c.id
  if i==1 then c.dir=a.x>=e.x and 1 or -1;e.dir=c.dir;c.origin=e.x end
  if id=='WV01' or id=='WV02' or id=='WV03' then
   c.goal=clamp(a.x,212,748)
   c.finish=clamp(c.goal+c.dir*264,158,802)
  elseif id=='WV04' then
   c.points={point(a,spec.floorY,-107),point(a,spec.floorY),point(a,spec.floorY,107)}
  elseif id=='WV10' then c.points[i]=point(a,spec.floorY)
  elseif id=='WV12' then
   c.points={point(a,spec.floorY,-101),point(a,spec.floorY,101)}
  end
 end
 local function start(s,w,spec,key)
  local c={key=key,id=key:sub(1,4),move=spec.moves[key],t=0,hits={},shots={},points={}}
  lock(s,w,spec,c,1)
  if c.id=='WV10' then for i=2,3 do c.points[i]=point(choose(s,w.shadow),spec.floorY) end end
  if c.id=='WV05' then target(w,false) end
  w.cast=c;w.phase='tell';log(s,w,key)
 end
 local function eye(s,w,spec,c)
  local rule=spec.eye
  local part=entity(spec,10,spec.center,spec.floorY-70,spec.floorY-46,spec.floorY-104,
   function(state,cast,obj)
    local impact=cast.impactEvent or state.t
    if w.cast~=c or w.special~=obj or obj.hp<=0 or c.t>=rule.close or cast.reaction or obj.spent[cast]==impact then return false end
    obj.spent[cast]=impact;obj.hp=obj.hp-1
    contribution(state,w,cast.id)
    ownLog(state,w,'WV05:eye-hit',cast.id,rule.hits-obj.hp)
    if obj.hp==0 then
     remove(state,obj);w.special=nil;c.successUntil=c.t+rule.successRest
     hostility(state,w,spec,spec.hostility.eyeBonus,'WV05:broken',cast.id)
    end
    return true
   end)
  part.spent=setmetatable({},{__mode='k'});part.hp=rule.hits;part.maxhp=rule.hits
  part.hitHalfWidth=33;part.noAutoTarget=false
  w.special=part;s.enemies[#s.enemies+1]=part
 end
 local function startKernel(s,w,spec)
  local e=w.shadow
  e.invulnerable=true;e.underground=true;e.noAutoTarget=true
  local x=clamp(e.x+(choose(s,e).x<e.x and -68 or 68),184,776)
  w.cast={id='WV11',key='WV11',t=0,x=x,variant=spec.variants[w.variant],hits={}}
  w.variant=w.variant%#spec.variants+1
  w.phase='kernel';log(s,w,'WV11')
 end
 local function kernel(s,w,spec,c)
  local rule=spec.kernel
  local y=spec.floorY
  local function fresh(cast,state,opened)
   local room=roomFor(state,w)
   local now=room and room.time or state.t
   return cast.playerInputAt and not cast.reaction and not cast.growthAI and state.t-cast.playerInputAt<=now-opened+1e-8
  end
  local part=entity(spec,11,c.x,y-rule.center,y-rule.bottom,y-rule.top,
   function(state,cast,obj)
    local a=state.actors[cast.id]
    if w.cast~=c or w.special~=obj or not a or obj.hp<=0 or c.t>=rule.close or not fresh(cast,state,obj.opened)
       or obj.spent[cast] or w.clock<(obj.owners[a] or -math.huge)+rule.gap then return false end
    obj.spent[cast]=true;obj.owners[a]=w.clock;obj.hp=obj.hp-1
    contribution(state,w,cast.id)
    ownLog(state,w,'WV11:kernel-hit',cast.id,rule.casts-obj.hp)
    if obj.hp==0 then
     remove(state,obj);w.special=nil;c.successUntil=c.t+rule.stagger;w.phase='stagger'
     local e=w.shadow
     local loss=math.min(e.hp,math.floor(e.maxhp*rule.lossRatio+.5))
     e.hp=e.hp-loss;log(state,w,'WV13:kernel-loss',cast.id,loss)
     if e.hp==0 then completeShadow(state,w,spec,cast.id)
     else e.invulnerable=false;e.underground=false;e.noAutoTarget=false end
    end
    return true
   end)
  part.spent=setmetatable({},{__mode='k'});part.owners=setmetatable({},{__mode='k'});part.opened=s.t
  part.hp=rule.casts;part.maxhp=rule.casts;part.hitHalfWidth=rule.rangeHalf
  part.acceptsCast=function(cast,state) return fresh(cast,state,part.opened) end
  w.special=part;s.enemies[#s.enemies+1]=part
 end
 local function shape(spec,c,i)
  local id,y,x=c.id,spec.floorY,c.origin
  if id=='WV01' then return i==1 and band(c.goal,88,y,106) or band(c.goal,152,y,96)
  elseif id=='WV02' then return band(c.goal,i==1 and 110 or 151,y,i==1 and 125 or 92)
  elseif id=='WV03' then return i==1 and band(c.goal,88,y,107) or band(c.finish,73,y,101)
  elseif id=='WV04' then local p=c.points[i];return band(p.x,c.key=='WV04' and 39 or 57,p.y,112)
  elseif id=='WV05' then return band(spec.center,141,y,174)
  elseif id=='WV08' then
   if i>=5 then return band(x,118,y,i==5 and 122 or 97) end
   local far=x+c.dir*(i%2==1 and 158 or 172)
   return {lo=math.min(x,far),hi=math.max(x,far),y=y,h=i%2==1 and 121 or 85}
  elseif id=='WV10' then local p=c.points[i];return band(p.x,35,p.y,134)
  elseif id=='WV12' then
   if c.key=='WV12.vishap' and i<3 then local p=c.points[i];return band(p.x,86,p.y,120) end
   return band(x+c.dir*57,83,y,102)
  end
 end
 local function damage(s,w,spec,c,group,a,x,y,element)
  if w.primary.hp<=0 then return end
  local hit=c.hits[group]
  if not hit then hit={};c.hits[group]=hit end
  if hit[a] then return end
  hit[a]=true
  local party=s.actorOwners and s.actorOwners[a] or s
  if C.damageActor(party,a,c.move.damage,{id=w.primary.id,x=x,y=y,damageElement=element},true,true)>0 then
   ownLog(party,w,c.key..':hit',a.id,group)
  end
 end
 local function launch(s,w,spec,c,i)
  local y=spec.floorY
  local p={ageStart=c.t,group=i,dir=c.dir,x=c.origin+c.dir*24,y=y-77,radius=22,speed=5.2,type='sword'}
  if c.key=='WV12' then
   p.dir=i%2==1 and 1 or -1;p.x=p.dir==1 and 42 or 918;p.y=y-30;p.radius=28;p.speed=440/60;p.type='beast'
  elseif c.key=='WV12.jellyfish' then
   p.y=y-37-(i%3)*37;p.radius=21;p.speed=352/60;p.type='jelly'
  end
  c.shots[#c.shots+1]=p
  log(s,w,c.key..':launch',0,i)
 end
 local function finish(s,w,spec)
  clearCast(s,w);w.phase='available';w.rest=spec.restTicks
  if w.stage=='outer' then target(w,true) end
 end
 local function runCast(s,w,spec,c)
  c.t=c.t+1
  local id,t=c.id,c.t
  if id=='WV11' then
   local rule=spec.kernel
   if c.successUntil then if t>=c.successUntil then finish(s,w,spec) end;return end
   if t==rule.open then kernel(s,w,spec,c)
   elseif t==rule.close then
    remove(s,w.special);w.special=nil;w.phase='kernel-failed';log(s,w,'WV11:failed')
   elseif t>=rule.failure then
    w.shadow.invulnerable=false;w.shadow.underground=false;w.shadow.noAutoTarget=false
    start(s,w,spec,c.variant)
   end
   return
  end
  if c.successUntil then if t>=c.successUntil then finish(s,w,spec) end;return end
  for i,at in ipairs(c.move.locks) do if t==at then lock(s,w,spec,c,i);log(s,w,c.key..':lock',0,i) end end
  if id=='WV01' and t==108 or id=='WV02' and t==156 or id=='WV03' and t==96 then
   locate(w,c.goal,spec.floorY)
  elseif id=='WV03' and t>=126 and t<=276 then
   locate(w,c.goal+(c.finish-c.goal)*(t-126)/150,spec.floorY)
  elseif id=='WV05' then
   if t==spec.eye.spawn then eye(s,w,spec,c)
   elseif t==spec.eye.close then if w.special then w.special.invulnerable=true;w.special.noAutoTarget=true end
   elseif t==spec.eye.expiry then remove(s,w.special);w.special=nil;target(w,true) end
  end
  w.phase=t>=c.move.recovery and 'recovery' or 'tell'
  for i,win in ipairs(c.move.windows) do
   if t>=win[1] and t<win[2] then
    w.phase='active'
    local b=shape(spec,c,i)
    local group=id=='WV08' and math.ceil(i/2) or i
    local element=w.stage=='outer' and 'hydro' or c.key=='WV12.vishap' and i<3 and 'pyro' or 'electro'
    for _,a in ipairs(s.actors) do
     local gap=id=='WV01' and i==2 and math.abs(a.x-c.goal)<89
     if not gap and inside(a,b) then damage(s,w,spec,c,group,a,(b.lo+b.hi)/2,b.y,element) end
     if w.cast~=c then return end
    end
   end
  end
  for i,at in ipairs(c.move.launches) do if t==at then launch(s,w,spec,c,i) end end
  for i=#c.shots,1,-1 do
   local p=c.shots[i];local age=t-p.ageStart
   local travel,group=age,p.group
   if p.type=='sword' then
    travel=age<90 and age or 180-age
    group=age<90 and 1 or 2
   end
   p.drawX=p.x+p.dir*p.speed*travel
   if age>=c.move.ttl or p.drawX<-26 or p.drawX>986 then table.remove(c.shots,i)
   else for _,a in ipairs(s.actors) do
    if a.hp>0 and math.abs(a.x-p.drawX)<p.radius and a.y>=p.y-p.radius and a.y-70<=p.y+p.radius then
     damage(s,w,spec,c,group,a,p.drawX,p.y,p.type=='jelly' and 'hydro' or 'electro')
     if w.cast~=c then return end
    end
   end end
  end
  if t>=c.move.total then finish(s,w,spec) end
 end
 local function switch(s,w,spec,inner)
  local id=inner and spec.innerNode or spec.node
  if not C.moveWeeklyScene(s,id,spec.sceneSpawn) then error('Unregistered weekly scene: '..id) end
  w.epoch=w.epoch+1
  log(s,w,'WV16:scene',0,w.epoch)
  if inner then
   w.entries=w.entries+1
   local n=w.entries==1 and spec.shadowHp or math.floor(spec.shadowHp*spec.transition.secondShadowRatio+.5)
   local floor=spec.floorY
   local e=entity(spec,9,spec.center,floor,floor,floor-124,
     function(state,cast,part,mult,color,element) return shadowHit(state,w,spec,cast,part,mult,color,element) end)
   e.hp,e.maxhp,e.dir,e.invulnerable=n,n,-1,true
   w.shadow=e;s.enemies[#s.enemies+1]=e
  end
 end
 local function update(s,w,spec)
  w.clock=w.clock+1;w.stageTick=w.stageTick+1
  local stage,t,tr=w.stage,w.stageTick,spec.transition
  if stage=='swallow' then
   if t==tr.sceneTick then switch(s,w,spec,true) end
   if t>=spec.moves.WV07.total then
    phase(s,w,spec,'inner');w.innerIndex=1;w.rest=18
    w.shadow.invulnerable=false;w.shadow.noAutoTarget=false
   end
  elseif stage=='expel' then
   if t==tr.sceneTick then switch(s,w,spec,false) end
   if t==tr.lossTick and w.returned~=w.entries then
    w.returned=w.entries
    local e=w.primary
    local n=math.min(e.hp,math.floor(e.maxhp*tr.lossRatio+.5))
    log(s,w,'WV14:return-loss',w.returnOwner,n)
    local party=w.returnParty;w.returnParty=nil
    if n==e.hp then
     local winner=s
     if s.parties then
      winner=s.parties[1]
      for _,present in ipairs(s.parties) do if present==party then winner=party;break end end
     end
     C.defeatEnemy(winner,e,w.returnOwner);return
    end
    e.hp=e.hp-n
   end
   if t>=spec.moves.WV14.total then phase(s,w,spec,'weak','WV15') end
  elseif stage=='weak' then
   if t==tr.weakOpen then target(w,true);w.phase='exposure'
   elseif t==tr.weakClose then target(w,false);w.phase='recovery'
   elseif t>=spec.moves.WV15.total then
    w.h=0;w.hLast=-math.huge;w.outerTicks=0;w.queued=false
    phase(s,w,spec,'outer')
   end
  else
   if stage=='outer' then
    w.outerTicks=w.outerTicks+1
    if w.queued and threshold(w,spec) then w.queued=false;log(s,w,'WV06:cancel') end
    if w.outerTicks%spec.hostility.period==0 then hostility(s,w,spec,1) end
   end
   if w.cast then runCast(s,w,spec,w.cast);return end
   if stage=='outer' and w.queued and not threshold(w,spec) then
    w.queued=false;phase(s,w,spec,'swallow','WV07');return
   end
   w.rest=w.rest-1
   if w.rest>0 then return end
   if stage=='outer' then
    local index,order='outerIndex',spec.outerOrder
    if threshold(w,spec) then index,order='finalIndex',spec.finalOrder end
    local key=order[w[index]]
    w[index]=w[index]%#order+1
    start(s,w,spec,key)
   else
    local key=spec.innerOrder[w.innerIndex]
    w.innerIndex=w.innerIndex%#spec.innerOrder+1
    if key=='WV11' then startKernel(s,w,spec)
    else start(s,w,spec,key) end
   end
  end
 end
 function C.canAttack(s)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='narwhal' and (w.stage=='swallow' or w.stage=='expel') then return false end
  if canAttack then return canAttack(s) end
  return true
 end
 function controller.prepare(s,w)
  if w.stage=='swallow' or w.stage=='expel' then forParties(s,w,function(party) party.macro=nil end) end
 end
 function controller.finish(s,w,spec,dt)
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;update(s,w,spec) end
  if not s.parties or w.primary.hp<=0 then return end
  for _,a in ipairs(s.actors) do if a.hp>0 then return end end
  clearCast(s,w);w.rechallenge=true;target(w,false)
 end
 local function warnings(spec,c)
  local out={}
  if not c or not c.move or c.successUntil or c.t>=c.move.recovery then return out end
  for i,win in ipairs(c.move.windows) do
   local lead=0
   if c.id=='WV01' and i==2 then lead=126
   elseif c.id=='WV02' and i==2 then lead=180
   elseif c.id=='WV03' and i==2 then lead=240
   elseif c.id=='WV05' then lead=spec.eye.close
   elseif c.id=='WV10' then lead=c.move.locks[i]
   elseif c.id=='WV12' and i==#c.move.windows then lead=win[1]-48 end
   if c.t>=lead and c.t<win[2] then
    if c.id=='WV01' and i==2 then
     for _,dir in ipairs({-1,1}) do out[#out+1]={b=band(c.goal+dir*120,31,spec.floorY,96),at=win[1]} end
    else out[#out+1]={b=shape(spec,c,i),at=win[1],delayed=c.id=='WV08' and i%2==0} end
   end
  end
  return out
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='narwhal' then
   for _,warn in ipairs(warnings(spec,w.cast)) do
    local b=warn.b
    if warn.at-w.cast.t<=32 and inside(a,b) then
     local l,r=b.lo-26,b.hi+26
     if l>=20 and (r>940 or a.x-l<r-a.x) then return l end
     if r<=940 then return r end
    end
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 function controller.observe(f,s,w,spec,mode,profile)
  local v,e,c,stage=f.weeklyBoss,w.primary,w.cast,w.stage
  local scene=s.story.node==spec.innerNode and 'inner' or 'outer'
  local textLabel={swallow='腹中へ移動',expel='星海へ帰還',weak='巨鯨の衰弱',inner='黒い幻影',outer='構え'}
  local idLabel={swallow='WV07',expel='WV14',weak='WV15'}
  v.x,v.y=e.x,e.y;v.narwhalStage=stage
  v.damageable=e.hp>0 and not e.invulnerable
  v.move=c and c.id or idLabel[stage];v.moveTick=c and c.t or w.stageTick
  v.label=c and (c.id=='WV11' and (c.successUntil and '核を中断' or '幻形の核') or c.move.title) or textLabel[stage]
  local shadow=w.shadow
  local b={scene=scene,h=w.h,maxH=spec.hostility.max,queued=w.queued,low=threshold(w,spec),entries=w.entries,epoch=w.epoch}
  v.narwhal=b
  if shadow and scene=='inner' then
   b.shadow={x=shadow.x,hp=shadow.hp,max=shadow.maxhp,damageable=stage=='inner' and not shadow.invulnerable and shadow.hp>0}
  end
  if stage=='weak' and w.stageTick>=spec.transition.weakOpen and w.stageTick<spec.transition.weakClose then
   b.exposure=spec.transition.weakClose-w.stageTick
  end
  if w.special and c then
   b.object={kind=c.id=='WV11' and 'kernel' or 'eye',x=w.special.x,y=w.special.y,
     hp=w.special.hp,max=w.special.maxhp,time=math.max(0,(c.id=='WV11' and spec.kernel.close or spec.eye.close)-c.t)}
  end
  if c and c.id=='WV11' and not c.successUntil and c.t>=spec.kernel.close then b.incoming=c.variant end
  if e.hp<=0 then return end
  local back={draws={}}
  if scene=='outer' then
   if stage~='swallow' or w.stageTick<spec.transition.sceneTick then
    local h=stage=='weak' and 159 or 212
    local y=spec.floorY-12
    if c and c.id=='WV02' and c.t>=96 and c.t<156 then y=y-math.sin(math.pi*(c.t-96)/120)*110
    elseif c and c.id=='WV05' and c.t<spec.eye.expiry then y=y-66;h=188
    elseif stage=='swallow' then h=214+math.sin(w.stageTick*.017)*38
    end
    C.drawFieldDisplayArt(back,C.narwhalWeeklyArt.whale,e.x-s.camera,y,h,mode,profile,e.dir>0)
   end
  elseif shadow and shadow.hp>0 then
   local height=c and c.successUntil and 123 or 140
   C.drawFieldDisplayArt(back,C.narwhalWeeklyArt.shadow,shadow.x-s.camera,spec.floorY,height,mode,profile,shadow.dir<0)
  end
  if #back.draws>0 then
   table.move(f.draws,1,#f.draws,#back.draws+1,back.draws)
   f.draws=back.draws
  end
  local function rect(x,y,width,height,color,opacity)
   if width>0 then f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color,opacity=opacity} end
  end
  v.warnings={}
  for _,warn in ipairs(warnings(spec,c)) do
   local z=warn.b
   local color=w.stage=='outer' and blue or violet
   rect(z.lo,z.y-5,z.hi-z.lo,4,warn.at<=c.t and color or white)
   rect(z.lo,z.y-z.h,3,z.h,color,.46);rect(z.hi-3,z.y-z.h,3,z.h,color,.46)
   if warn.delayed then rect(z.lo,z.y-11,z.hi-z.lo,3,violet) end
   if warn.at<=c.t then rect((z.lo+z.hi)/2-6,z.y-z.h,12,z.h,color,.68) end
   v.warnings[#v.warnings+1]={lo=z.lo,hi=z.hi,y=z.y,h=z.h,starts=warn.at}
  end
  if c and c.shots then for _,p in ipairs(c.shots) do
   rect(p.drawX-p.radius,p.y-7,2*p.radius,14,p.type=='jelly' and blue or violet)
   rect(p.drawX-8,p.y-12,19,8,white)
  end end
  if b.object then
   local obj=b.object
   local width=obj.kind=='kernel' and spec.kernel.rangeHalf or 33
   local hi=obj.kind=='kernel' and spec.floorY-spec.kernel.top or obj.y-27
   local lo=obj.kind=='kernel' and spec.floorY-spec.kernel.bottom or obj.y+25
   rect(obj.x-width,hi,width*2,lo-hi,'#443258')
   rect(obj.x-width+3,hi+4,width*2-6,lo-hi-8,obj.time>0 and violet or '#957b9a')
   rect(obj.x-8,obj.y-7,16,15,white)
   for i=1,obj.hp do rect(obj.x-obj.max*4+i*8-6,hi-10,6,5,'#f3d992') end
  end
  if stage=='swallow' or stage=='expel' then
   local progress=1-math.abs(w.stageTick-96)/96
   for i=0,23 do
    local a=i*math.pi/12+w.stageTick*.07
    rect(spec.center+math.cos(a)*(53+76*progress)-4,spec.floorY-142+math.sin(a)*(50+21*progress)-4,8,8,violet,.72)
   end
  end
 end
 return controller
end
