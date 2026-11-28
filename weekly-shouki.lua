return function(C)
 local controller={}
 local avoid=C.aiAvoidTarget
 local clamp=function(x,lo,hi) return math.max(lo,math.min(hi,x)) end
 local colors={pyro='#ff9469',cryo='#a1daf7',electro='#caa3fc',anemo='#91e3cb',hydro='#87c6ff',charge='#b9f2a9',gold='#f5d794'}


 -- Keep the shield HUD transition independent of the torso-only illustration.
 local function armorPhase(w)
  return w.stage~='p1' and w.stage~='overload' and (w.stage~='rise' or w.stageTick>=120)
 end
 local function actor(s) return s.actors[s.active] end
 local function weakKeys() return setmetatable({},{__mode='k'}) end
 local function ownEvent(s,w,key,owner,v) C.combatEvent(s,'shouki:'..key,owner or 0,w.primary.id,v or 0) end
 local function event(s,w,key,owner,v)
  for _,party in ipairs(s.parties or {s}) do ownEvent(party,w,key,owner,v) end
 end
 local function actorParty(s,a) return s.actorOwners and s.actorOwners[a] or s end
 local function target(s,x)
  local best,distance
  for _,party in ipairs(s.parties or {s}) do
   local a=actor(party);local dx=math.abs(a.x-x)
   if a.hp>0 and (not distance or dx<distance) then best,distance=a,dx end
  end
  return best,distance
 end
 local function contribution(s,w,id)
  if s.coop then C.coopContact(s,w.primary,id) end
 end
 local function body(e,x,y,h) e.x,e.y,e.hitTop,e.hitBottom=x,y,y-h,y end
 local function band(x,r,y,h) return {lo=x-r,hi=x+r,y=y,h=h} end
 local function inside(a,b)
  return a.hp>0 and a.x>=b.lo and a.x<=b.hi and a.y<=b.y+5 and a.y>=b.y-b.h
 end
 local function remove(s,e)
  for i=#s.enemies,1,-1 do if s.enemies[i]==e then table.remove(s.enemies,i) end end
 end
 local function clearParts(s,list)
  for _,e in ipairs(list or {}) do remove(s,e) end
 end
 local function addPart(s,spec,id,x,height,contact)
  local e={id=spec.entity+id,custom=true,boss=true,noRewards=true,weeklyPart=true,hp=1,maxhp=1,warning=0,respawn=math.huge,
    onCastContact=contact}
  body(e,x,spec.floorY,height);s.enemies[#s.enemies+1]=e
  return e
 end
 local function releaseAim(w)
  w.aim=nil;w.shot=nil
 end
 local function cleanupCast(s,w)
  clearParts(s,w.targets);w.targets={};w.cast=nil;w.floors={};w.blocks={};w.floorClock=weakKeys()
  w.windUntil=0;w.healUntil=0;w.assists=weakKeys();releaseAim(w)
 end
 local function posture(s,w,spec,name,card)
  cleanupCast(s,w)
  w.stage=name;w.phase=name;w.stageTick=0;w.rest=spec.restTicks
  local lock=name=='rise' or name=='trial' or name=='failure' or name=='collapse' or name=='overload'
  w.primary.invulnerable=lock;w.primary.noAutoTarget=lock
  if name~='p1' and name~='overload' then clearParts(s,w.hands);w.hands={} end
  for _,e in ipairs(w.hands) do e.invulnerable=lock;e.noAutoTarget=lock end
  body(w.primary,spec.center,spec.floorY,name=='p1' and 138 or 165)
  w.lastSupply=w.clock
  if card then event(s,w,card) end
 end
 local function charge(w,spec,n) w.charge=math.min(spec.charge.max,w.charge+n) end
 local function addBlock(s,w,spec,value,avoidX)
  local y=spec.floorY
  local best,dist=nil,math.huge
  for _,x in ipairs({128,183,351,609,777,832}) do
   local safe=math.abs(x-(avoidX or w.primary.x))>=75
   for _,f in ipairs(w.floors) do if math.abs(x-f.x)<f.width/2+25 then safe=false end end
   for _,b in ipairs(w.blocks) do if math.abs(x-b.x)<45 then safe=false end end
   local _,dx=target(s,x);dx=dx or math.abs(x-w.primary.x)
   if safe and dx<dist then best,dist=x,dx end
  end
  if not best then return end
  if #w.blocks>=spec.charge.maxBlocks then table.remove(w.blocks,1) end
  w.serial=w.serial+1
  w.blocks[#w.blocks+1]={x=best,y=y,value=value,id=w.serial,expires=w.clock+spec.charge.blockTtl}
  w.lastSupply=w.clock;event(s,w,'WN18:supply',0,value)
 end
 local function addFloor(w,spec,x,width,element,ttl)
  x=clamp(x,width/2+spec.hazards.floorMargin,960-width/2-spec.hazards.floorMargin)
  for i=#w.floors,1,-1 do
   if math.abs(x-w.floors[i].x)<(width+w.floors[i].width)/2 then table.remove(w.floors,i) end
  end
  if #w.floors>=spec.hazards.cap then table.remove(w.floors,1) end
  w.floors[#w.floors+1]={x=x,width=width,element=element,expires=w.clock+ttl}
 end
 local function environment(s,w,spec)
  for i=#w.blocks,1,-1 do
   local b=w.blocks[i]
   if w.clock>=b.expires then table.remove(w.blocks,i)
   elseif w.charge<spec.charge.max then
    for _,party in ipairs(s.parties or {s}) do
     local a=actor(party)
     if not party.auto and a.hp>0 and math.abs(a.x-b.x)<=spec.charge.collectRange and math.abs(a.y-b.y)<26 then
      charge(w,spec,b.value);table.remove(w.blocks,i);ownEvent(party,w,'WN18:collected',a.id,b.id);break
     end
    end
   end
  end
  for i=#w.floors,1,-1 do if w.clock>=w.floors[i].expires then table.remove(w.floors,i) end end
  for _,a in ipairs(s.actors) do
   local party=actorParty(s,a)
   if a.hp>0 and w.clock>=(w.floorClock[a] or 0) and a.ground and math.abs(a.y-spec.floorY)<5 then
    for _,f in ipairs(w.floors) do if math.abs(a.x-f.x)<f.width/2 then
     w.floorClock[a]=w.clock+spec.hazards.interval
     if C.damageActor(party,a,spec.hazards.damage,{id=w.primary.id,x=f.x,y=spec.floorY,damageElement=f.element},false,false)>0 then
      ownEvent(party,w,'WN18:floor-hit',a.id)
     end
     break
    end end
   end
   if w.clock<w.healUntil and w.clock>=w.healNext and math.abs(a.x-557)<=84 and math.abs(a.y-spec.floorY)<72 then
    local amount=C.healActor(party,a,spec.charge.healPulse)
    if amount>0 then ownEvent(party,w,'WN06:healed',a.id,amount) end
   end
   if w.clock<w.windUntil and w.wasGround[a] and not a.ground and a.vy<-300 and math.abs(a.x-230)<=72
      and a.hp>0 and a.id==party.active and not party.auto then
    a.vy=math.min(a.vy,-790);ownEvent(party,w,'WN06:lift',a.id)
   end
  end
  if w.clock<w.healUntil and w.clock>=w.healNext then w.healNext=w.clock+60 end
  if (w.stage=='p1' or w.stage=='p2') and w.charge<spec.charge.max and w.clock>=w.lastSupply+spec.charge.replenish then
   -- A reachable existing block already provides the supply.
   if #w.blocks==0 then addBlock(s,w,spec,50) end
   w.lastSupply=w.clock
  end
 end
 local function deviceNear(s,w,spec)
  if w.stage~='p1' then return nil end
  local a=actor(s)
  if a.hp<=0 or math.abs(a.y-spec.floorY)>30 then return nil end
  for _,d in ipairs(spec.devices) do if math.abs(a.x-d.x)<=spec.charge.deviceRange then return d end end
 end
 local function device(s,w,spec,d)
  local rule=spec.charge
  if w.charge<rule.max or w.clock<(w.deviceCd[d.id] or 0) then return end
  w.charge=0;w.deviceCd[d.id]=w.clock+rule.deviceCd
  event(s,w,'WN06:'..d.id,s.active)
  if d.id=='pyro' or d.id=='cryo' then
   local opposite=d.id=='pyro' and 'cryo' or 'pyro'
   for i=#w.floors,1,-1 do if w.floors[i].element==opposite then table.remove(w.floors,i) end end
  elseif d.id=='anemo' then w.windUntil=w.clock+rule.fieldDuration
  elseif d.id=='hydro' then w.healUntil=w.clock+rule.fieldDuration;w.healNext=w.clock+1
  else
   local other=d.id=='left' and 'right' or 'left'
   w.suppressed[d.id]=w.clock+rule.suppression
   if w.clock<(w.suppressed[other] or 0) then
    posture(s,w,spec,'overload','WN07');w.suppressed={}
    w.deviceCd[d.id]=w.clock+rule.pairCd;w.deviceCd[other]=w.clock+rule.pairCd
   end
  end
 end
 local function manual(s,w,cast,since)
  local now=s.coop and s.coop.weeklySlot==w and s.coop.time or s.t
  return cast.playerInputAt and not cast.reaction and not cast.growthAI and s.t-cast.playerInputAt<=now-since+1e-8
 end
 local function shieldHit(s,w,spec,cast)
  local rule=spec.charge
  local a=s.actors[cast.id]
  if not a or cast.reaction or w.shieldSpent[cast] or w.clock<(w.shieldOwners[a] or -math.huge)+rule.hitInterval then return false end
  w.shieldSpent[cast]=true;w.shieldOwners[a]=w.clock
  w.shield=math.max(0,w.shield-1);event(s,w,'WN18:guard-hit',cast.id,w.shield)
  contribution(s,w,cast.id)
  return true
 end
 local function contact(s,w,spec,cast,mult,color,element)
  local e=w.primary
  if e.hp<=0 or e.invulnerable then return false end
  if w.stage=='p2' and w.shield>0 then return shieldHit(s,w,spec,cast) end
  if w.stage=='p2' and w.needTrial then return false end
  local r=C.enemyResistance(cast,e,element)
  if r>=1 then return false end
  local amount,critical=C.enemyHitDamage(s,cast,e,mult,element,r)
  local minHp=(w.stage=='p1' or w.stage=='overload') and spec.p2Hp or 0
  amount=math.min(e.hp-minHp,amount)
  if amount<=0 then return false end
  s.hits=s.hits+1;s.damage=s.damage+amount
  C.combatNumber(s,e,critical and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,e.id,amount)
  local last=s.events[#s.events];last.element=element;last.critical=not not critical;last.reaction=cast.reaction or false
  contribution(s,w,cast.id)
  if e.hp==amount then C.defeatEnemy(s,e,cast.id);return true end
  e.hp=e.hp-amount
  if minHp>0 and e.hp==minHp then
   posture(s,w,spec,'rise','WN08');w.suppressed={};w.deviceCd={}
   e.aura=nil;e.applicationClocks=nil;e.burning=nil
  elseif C.afterElementHit then
   C.afterElementHit(s,cast,e,cast.applicationElement or element,element,amount)
  end
  return true
 end
 function controller.spawn(s,w,spec)
  w.clock=0;w.remainder=0;w.charge=0;w.shield=0;w.serial=0
  w.hands={};w.targets={};w.deviceCd={};w.suppressed={}
  w.index=1;w.elementIndex=0;w.needTrial=true;w.trialCasts=0;w.trialLeftAt=nil;w.trialFailed=false;w.trialResult=nil
  w.autoAt=nil;w.shieldSpent=weakKeys();w.shieldOwners=weakKeys();w.wasGround=weakKeys()
  posture(s,w,spec,'p1');w.rest=spec.noticeTicks
  w.primary.onCastContact=function(state,cast,_,mult,color,element) return contact(state,w,spec,cast,mult,color,element) end
 end
 function controller.attach(s,w,spec)
  remove(s,w.primary);s.enemies[#s.enemies+1]=w.primary
  clearParts(s,w.hands);w.hands={}
  if w.stage=='p1' then
   for i,x in ipairs({347,613}) do
    local e=addPart(s,spec,i,x,113,w.primary.onCastContact)
    e.sharedHealth=w.primary;e.noAutoTarget=true
    w.hands[#w.hands+1]=e
   end
  end
  s.grappleNodes={};s.selectedGrapple=nil
  for _,a in ipairs(s.actors) do a.grapple=nil end
 end
 function controller.cleanup(s,w)
  cleanupCast(s,w);clearParts(s,w.hands);w.hands={}
  remove(s,w.primary);w.primary.underground=true;w.charge=0;w.trialResult=nil
 end
 function controller.leaveCoop(s,w)
  w.assists[s]=nil
  local q=w.aim
  if q and q.party==s and not q.fired then releaseAim(w) end
 end
 local function armSuppressed(w,i)
  return w.clock<(w.suppressed[i==1 and 'left' or 'right'] or 0)
 end
 local function locate(s,w,spec,c)
  local e=w.primary;local a=target(s,e.x) or e
  local id=c.id
  c.origin=e.x;c.dir=a.x>=e.x and 1 or -1;c.target=clamp(a.x,122,838)
  if id=='WN01' then
   if armSuppressed(w,c.dir<0 and 1 or 2) then c.dir=-c.dir;c.target=960-c.target end
  elseif id=='WN12' then c.finish=clamp(e.x+c.dir*352,132,828)
  elseif id=='WN13' then c.upper=a.y<=410
  elseif id=='WN10' then c.lanes={-30,-57,-86,-42,-126} end
 end
 local function castShape(spec,c,i)
  local y=spec.floorY
  if c.id=='WN01' then return i==1 and band(c.target,79,y,126) or band(480+c.dir*155,132,y,105)
  elseif c.id=='WN02' then return band(({240,720,480})[i],44,y,106)
  elseif c.id=='WN04' then return {lo=104,hi=856,y=i==1 and y or y-128,h=i==1 and 57 or 74}
  elseif c.id=='WN05' then return {lo=128,hi=832,y=y,h=106}
  elseif c.id=='WN09' then return band(clamp(c.target+(i==1 and -75 or 75),124,836),105,y,75)
  elseif c.id=='WN11' then return band(clamp(c.target+(i-2)*112,110,850),40,y,88)
  elseif c.id=='WN12' then
   local finish=c.finish or c.origin
   return {lo=math.min(c.origin,finish)-48,hi=math.max(c.origin,finish)+48,y=y,h=107}
  elseif c.id=='WN13' then
   if i==2 then return {lo=100,hi=860,y=c.upper and y-120 or y,h=76} end
   local x=c.origin+c.dir*310
   return {lo=math.min(c.origin,x),hi=math.max(c.origin,x),y=y-26,h=65}
  end
 end
 local function elementFor(c,i)
  if c.id=='WN11' then return ({'pyro','cryo','hydro'})[i] end
  if c.id=='WN13' and i==1 then return 'hydro' end
  return c.element
 end
 local function damage(s,w,spec,c,i,b,element,result)
  local hit=c.hits[i]
  if not hit then hit={};c.hits[i]=hit end
  for _,a in ipairs(s.actors) do
   if inside(a,b) and not hit[a] then
    hit[a]=true
    local party=actorParty(s,a)
    local dealt=C.damageActor(party,a,c.move.damage,{id=w.primary.id,x=(b.lo+b.hi)/2,y=b.y,damageElement=element},true,true)
    if result then result[a]=dealt end
    if dealt>0 then
     ownEvent(party,w,c.id..':hit',a.id,i)
    end
   end
  end
 end
 local function begin(s,w,spec,id)
  local c={id=id,t=0,move=spec.moves[id],hits={},shots={}}
  if id=='WN01' then w.elementIndex=w.elementIndex+1 end
  c.element=id=='WN01' and (w.elementIndex%2==1 and 'pyro' or 'cryo') or
    id=='WN03' and 'anemo' or id=='WN12' and 'cryo' or 'electro'
  locate(s,w,spec,c)
  w.cast=c;w.phase='tell'
  event(s,w,id)
 end
 local function launch(s,w,spec,c,i)
  local swirl=c.id=='WN03'
  local y=spec.floorY+(swirl and -27 or c.lanes[i])
  c.shots[#c.shots+1]={x=c.origin,y=y,dir=c.dir,start=c.t,radius=swirl and 30 or 12,
    speed=(swirl and 176 or 440)/60,group=i}
  event(s,w,c.id..':launch',0,i)
 end
 local function runCast(s,w,spec,c)
  c.t=c.t+1
  local id,t,e=c.id,c.t,w.primary
  for i,at in ipairs(c.move.locks) do if at==t then locate(s,w,spec,c);event(s,w,id..':lock',0,i) end end
  if id=='WN12' and t>=84 and t<=126 then
   local q=(t-84)/42;body(e,c.origin+(c.finish-c.origin)*q,spec.floorY,165)
  end
  w.phase=t>=c.move.recovery and 'recovery' or 'tell'
  for i,win in ipairs(c.move.windows) do
   if t>=win[1] and t<win[2] then
    local b=castShape(spec,c,i)
    if id=='WN12' then b=band(e.x+c.dir*35,57,spec.floorY,106) end
    if id~='WN02' or i==3 or not armSuppressed(w,i) then
     w.phase='active';damage(s,w,spec,c,i,b,elementFor(c,i))
     if w.cast~=c then return end
    end
   end
  end
  for i,at in ipairs(c.move.launches) do if at==t then launch(s,w,spec,c,i) end end
  for i=#c.shots,1,-1 do
   local p=c.shots[i];local age=t-p.start
   p.drawX=p.x+p.dir*p.speed*age
   if age>=c.move.ttl or p.drawX<-32 or p.drawX>992 then table.remove(c.shots,i)
   else
    damage(s,w,spec,c,p.group,band(p.drawX,p.radius,p.y+p.radius,p.radius*2+45),c.element)
    if w.cast~=c then return end
   end
  end
  for i,at in ipairs(c.move.floors) do if at==t then
   if id=='WN01' then addFloor(w,spec,480+c.dir*155,141,c.element,c.move.floorTtl)
   elseif id=='WN11' then addFloor(w,spec,clamp(c.target+(i-2)*112,110,850),80,i==1 and 'pyro' or 'cryo',c.move.floorTtl)
   elseif id=='WN12' then addFloor(w,spec,(c.origin+c.finish)/2,176,'cryo',c.move.floorTtl) end
  end end
  if (id=='WN01' and t==204) or (id=='WN05' and t==270) then addBlock(s,w,spec,100,c.target)
  elseif id=='WN11' and t==276 then addBlock(s,w,spec,50);addBlock(s,w,spec,50) end
  if t<c.move.total then return end
  if id~='WN01' and id~='WN05' and id~='WN11' then addBlock(s,w,spec,50) end
  if w.stage=='p2' and w.shield==0 then w.trialCasts=w.trialCasts+1 end
  w.cast=nil;w.phase='available';w.rest=spec.restTicks
 end
 local function targets(s,w,spec)
  w.trialOpened=s.t
  for i,x in ipairs(spec.trial.positions) do
   local function accepted(state,cast)
    if w.stage~='trial' then return false end
    if manual(state,w,cast,w.trialOpened) then return true end
    local assist=w.assists[state]
    return assist and assist.index==i and not state.auto and cast.id~=state.active and not cast.reaction and
     (cast.growthAI or state.growthAIActor==cast.id) and cast.startedAt and cast.startedAt>=assist.at
   end
   local e=addPart(s,spec,9+i,x,52,function(state,cast,obj)
    if not accepted(state,cast) or obj.charged[cast] then return false end
    obj.charged[cast]=true;obj.charges=obj.charges-1
    contribution(state,w,cast.id)
    event(state,w,'WN15:hit',cast.id,obj.index)
    if obj.charges==0 then
     obj.hp=0;remove(state,obj);w.trialLeft=w.trialLeft-1
     for party,assist in pairs(w.assists) do if assist.index==i then w.assists[party]=nil end end
     charge(w,spec,spec.trial.reward)
     event(state,w,'WN15:destroyed',cast.id,obj.index)
    end
    return true
   end)
   e.index=i;e.charges=spec.trial.hits;e.charged=weakKeys()
   e.acceptsAutoTarget=function(state,a)
    local assist=w.assists[state]
    return assist and assist.index==i and a.id~=state.active and not state.auto
   end
   e.acceptsCast=function(cast,state) return accepted(state,cast) end
   w.targets[#w.targets+1]=e
  end
 end
 local function canAim(w,spec)
  return w.stage=='p2' and w.shield>0 or w.stage=='trial' and w.stageTick>=60 and w.trialLeft==0 and
    w.stageTick+spec.trial.minimumFireTime<=spec.trial.deadline
 end
 function controller.interact(s,w,spec,key)
  local a=actor(s)
  if a.hp<=0 or s.auto then return end
  local q=w.aim
  local owns=q and q.party==s and q.actor==a
  local option=key:match('^encounter_target:(%w+)$')
  if w.stage=='trial' and option and option:match('^pod[1-4]$') then
   local index=tonumber(option:sub(4))
   local selected=w.targets[index]
   if not selected or selected.hp<=0 then return end
   local assist=w.assists[s]
   w.assists[s]=(not assist or assist.index~=index) and {index=index,at=s.t} or nil
   ownEvent(s,w,'WN15:assist',a.id,w.assists[s] and index)
   return
  end
  if key=='encounter_cancel' then
   if owns and not q.fired then releaseAim(w);ownEvent(s,w,'WN14:cancel',a.id) end
   return
  end
  if key=='encounter_interact' and w.stage=='p1' then
   local d=deviceNear(s,w,spec)
   if d then device(s,w,spec,d) end
   return
  end
  if key=='encounter_interact' and not q and canAim(w,spec) and w.charge==spec.charge.max then
   w.aim={owner=a.id,actor=a,party=s,slot=s.coopMember and s.coopMember.id,started=w.clock,target='core'}
   ownEvent(s,w,'WN14:reserve',a.id)
  elseif owns and not q.confirmed then
   if option=='left' or option=='core' or option=='right' then q.target=option
   elseif key=='encounter_confirm' and canAim(w,spec) then
    q.confirmed=true;q.tick=0;ownEvent(s,w,'WN14',a.id)
   end
  end
 end
 local function aimPoint(w,spec,option)
  local box=C.shoukiWeeklyArt.upper.box
  local x,y=w.primary.x,spec.floorY-spec.artHeight*(box[2]+box[4]-spec.openingPose.chestSourceY)/box[4]
  if option=='left' then return x-170,y end
  if option=='right' then return x+170,y end
  return x,y
 end
 local function aimStep(s,w,spec)
  local q=w.aim
  if not q then return end
  local a,party,m=q.actor,q.party,spec.moves.WN14
  local present=actorParty(s,a)==party
  if not q.slot and party.coopMember then q.slot=party.coopMember.id end
  if not q.fired and (not present or a.hp<=0 or actor(party)~=a or (not q.confirmed and w.clock>=q.started+spec.charge.aimLimit)) then
   releaseAim(w)
   if present then ownEvent(party,w,'WN14:cancel',q.owner) end
   return
  end
  if not q.confirmed then return end
  q.tick=q.tick+1
  if q.tick==m.locks[1] then q.tx,q.ty=aimPoint(w,spec,q.target);ownEvent(party,w,'WN14:lock',q.owner) end
  if q.tick==m.launches[1] then
   local x,y=a.x+a.dir*39,a.y-72
   local dx,dy=q.tx-x,q.ty-y
   local dist=math.max(1,math.sqrt(dx*dx+dy*dy))
   q.fired=true;q.launchX=x;q.launchY=y;w.charge=0;w.shot={x=x,y=y,dx=dx/dist,dy=dy/dist}
   ownEvent(party,w,'WN14:fire',q.owner)
  end
  local shot=w.shot
  if shot then
   local x,y=aimPoint(w,spec,'core')
   for i=1,2 do
    shot.x=shot.x+shot.dx*spec.charge.shotSpeed/2
    shot.y=shot.y+shot.dy*spec.charge.shotSpeed/2
    if math.abs(shot.x-x)<23 and math.abs(shot.y-y)<25 then
     w.shot=nil
     if w.stage=='trial' and w.trialLeft==0 then
      if present then ownEvent(party,w,'WN14:core-hit',q.owner);contribution(party,w,q.owner) end
      posture(s,w,spec,'collapse','WN17');w.trialLeftAt=w.clock;w.trialCasts=0;w.trialFailed=false
      w.trialResult={kind='core-hit'}
      return
     elseif w.stage=='p2' and w.shield>0 then
      w.shield=math.max(0,w.shield-spec.charge.shotDamage)
      if present then ownEvent(party,w,'WN14:guard-hit',q.owner,w.shield);contribution(party,w,q.owner) end
     end
     break
    end
   end
   if w.shot and q.tick>=m.launches[1]+m.ttl then
    w.shot=nil
    if present then ownEvent(party,w,'WN14:miss',q.owner) end
   end
  end
  if q.tick>=m.total then releaseAim(w) end
 end
 function controller.prepare(s,w)
  for _,a in ipairs(s.actors) do w.wasGround[a]=a.ground end
 end
 local function tick(s,w,spec)
  w.clock=w.clock+1;w.stageTick=w.stageTick+1
  local name,t,e=w.stage,w.stageTick,w.primary
  aimStep(s,w,spec)
  if name~=w.stage then return end
  if name=='rise' then
   if t>=spec.moves.WN08.total then
    posture(s,w,spec,'p2');w.index=1;w.shield=spec.charge.shield;w.autoAt=w.clock+spec.charge.autoPeriod
    addBlock(s,w,spec,100)
   end
   return
  elseif name=='overload' then
   local on=t>=60 and t<420
   e.invulnerable=not on;e.noAutoTarget=not on
   for _,part in ipairs(w.hands) do part.invulnerable=not on end
   if t>=spec.moves.WN07.total then posture(s,w,spec,'p1') end
   return
  elseif name=='trial' then
   if t==60 then targets(s,w,spec) end
   if t>=spec.trial.deadline then
    posture(s,w,spec,'failure','WN16')
    w.failed={id='WN16',move=spec.moves.WN16,hits={}}
    w.trialResult={kind='timeout',remainingPods=w.trialLeft}
   end
   return
  elseif name=='failure' then
   local card=spec.moves.WN16
   if t==card.windows[1][1] then
    local received=weakKeys()
    damage(s,w,spec,w.failed,1,band(480,540,spec.floorY,480),'electro',received)
    w.trialResult.damage=received
   end
   if t>=card.total then
    posture(s,w,spec,'p2');w.needTrial=false;w.trialLeftAt=w.clock;w.trialCasts=0
    w.trialResult.untilTick=w.clock+120
   end
   return
  elseif name=='collapse' then
   local on=t>=60 and t<spec.moves.WN17.recovery
   e.invulnerable=not on;e.noAutoTarget=not on
   if t>=spec.moves.WN17.total then posture(s,w,spec,'p2');w.needTrial=false;w.trialResult=nil end
   return
  end
  environment(s,w,spec)
  if w.primary.hp<=0 or w.stage~=name then return end
  if name=='p2' then
   if w.shield>0 and w.clock>=w.autoAt then
    w.autoAt=w.clock+spec.charge.autoPeriod;w.shield=w.shield-1
    event(s,w,'WN18:auto',0,w.shield)
   end
   if w.shield==0 and (w.needTrial or w.trialCasts>=spec.trial.retryCasts and
       w.clock>=w.trialLeftAt+spec.trial.retryTicks and w.trialFailed) then
    posture(s,w,spec,'trial','WN15');w.trialLeft=#spec.trial.positions;w.needTrial=false
    w.trialFailed=true;w.trialResult=nil
    return
   end
  end
  if w.cast then runCast(s,w,spec,w.cast);return end
  w.rest=w.rest-1
  if w.rest>0 then return end
  local order=spec.orders[name=='p1' and 1 or 2]
  begin(s,w,spec,order[w.index]);w.index=w.index%#order+1
 end
 function controller.finish(s,w,spec,dt)
  w.remainder=w.remainder+math.min(dt,1/30)*60
  while w.remainder>=1-1e-8 and w.primary.hp>0 do w.remainder=w.remainder-1;tick(s,w,spec) end
  if not s.parties or w.primary.hp<=0 then return end
  for _,a in ipairs(s.actors) do if a.hp>0 then return end end
  cleanupCast(s,w);w.rechallenge=true;w.primary.invulnerable=true
 end
 local function warnings(spec,c)
  local out={}
  if not c or c.t>=c.move.recovery then return out end
  for i,win in ipairs(c.move.windows) do
   if c.t<win[2] and (c.id~='WN13' or i==1 or c.t>=144) then
    local b=castShape(spec,c,i)
    if b then out[#out+1]={b=b,start=win[1],element=elementFor(c,i)} end
   end
  end
  return out
 end
 function C.aiAvoidTarget(s,a)
  local w,spec=C.currentWeeklyBoss(s)
  if w and spec.controller=='shouki' then
   for _,hint in ipairs(warnings(spec,w.cast)) do
    local b=hint.b
    if hint.start-w.cast.t<=36 and inside(a,b) then
     local l,r=b.lo-19,b.hi+19
     if a.x-l<r-a.x and l>=20 or r>940 then return math.max(20,l) end
     return r
    end
   end
  end
  if avoid then return avoid(s,a) end
 end
 function controller.observe(f,s,w,spec,mode,profile)
  local b,e,c,name=f.weeklyBoss,w.primary,w.cast,w.stage
  local label={rise='装甲起動',overload='過負荷停止',trial='滅度機と胸部弱点',failure='刹那生滅',collapse='神機崩落'}
  local card={rise='WN08',overload='WN07',trial='WN15',failure='WN16',collapse='WN17'}
  local armored=armorPhase(w)
  b.x,b.y,b.shoukiStage=e.x,e.y,name
  b.formName=armored and '上半身・装甲起動後' or '上半身'
  b.label=c and c.move.title or label[name] or '構え'
  b.move=c and c.id or card[name];b.moveTick=c and c.t or w.stageTick
  b.damageable=e.hp>0 and not e.invulnerable and not (name=='p2' and w.shield>0)
  b.phaseHp={{name='上半身',max=spec.p1Hp,hp=math.max(0,e.hp-spec.p2Hp)},
    {name='装甲起動後',max=spec.p2Hp,hp=math.min(e.hp,spec.p2Hp)}}
  local device=deviceNear(s,w,spec)
  local q=w.aim
  local assist=w.assists[s]
  local state={charge=w.charge,max=spec.charge.max,shield=w.shield,shieldMax=spec.charge.shield,
    p2=armored,blocks={},targets={},canAim=not q and canAim(w,spec) and w.charge==spec.charge.max,
    left=w.clock<(w.suppressed.left or 0),right=w.clock<(w.suppressed.right or 0),
    trialLeft=name=='trial' and w.trialLeft or nil,trialTime=name=='trial' and math.max(0,spec.trial.deadline-w.stageTick) or nil,
    trialSpawning=name=='trial' and w.stageTick<60 or nil,
    assist=assist and assist.index}
  if name=='collapse' and b.damageable then state.exposure=spec.moves.WN17.recovery-w.stageTick end
  if name=='overload' and b.damageable then state.exposure=420-w.stageTick end
  local trial=w.trialResult
  if trial and (not trial.untilTick or w.clock<trial.untilTick) then
   state.trialResult={kind=trial.kind,remainingPods=trial.remainingPods,
    damage=trial.damage and (trial.damage[actor(s)] or 0),resumed=name=='p2'}
  end
  if device then
   state.device={id=device.id,title=device.title,cooldown=math.max(0,(w.deviceCd[device.id] or 0)-w.clock)}
  end
  if q then
   local active=actor(s)
   local mine=q.party==s and q.actor==active
   state.aim={owner=q.owner,slot=q.slot or (q.party.coopMember and q.party.coopMember.id),
    mine=mine,target=q.target,confirmed=not not q.confirmed,fired=not not q.fired,tick=q.tick,
    canConfirm=mine and active.hp>0 and not s.auto and not q.confirmed and canAim(w,spec)}
  end
  b.shouki=state
  if e.hp<=0 then return end
  local function rect(x,y,width,height,color,opacity)
   if width>0 then
    f.draws[#f.draws+1]={kind='rect',x=x-s.camera,y=y,w=width,h=height,color=color,opacity=opacity}
   end
  end
  local function text(x,y,value,color)
   f.draws[#f.draws+1]={kind='text',x=x-s.camera,y=y,text=value,color=color,size=15}
  end
  local y=spec.floorY
  -- Put the oversized machine behind the party and its combat cues.
  local bodyFrame={draws={},clipToViewport=spec.openingPose.clipToViewport,rectBatches=f.rectBatches}
  C.drawFieldDisplayArt(bodyFrame,C.shoukiWeeklyArt.upper,e.x-s.camera,spec.floorY,spec.artHeight,mode,profile,false)
  table.move(f.draws,1,#f.draws,#bodyFrame.draws+1,bodyFrame.draws)
  f.draws=bodyFrame.draws
  for _,p in ipairs(w.floors) do
   rect(p.x-p.width/2,y-7,p.width,6,colors[p.element])
   for dx=4,p.width-4,13 do rect(p.x-p.width/2+dx,y-11,(p.element=='cryo' and 6 or 4),7,colors[p.element]) end
  end
  b.warnings={}
  for _,hint in ipairs(warnings(spec,c)) do
   local bnd=hint.b
   local on=hint.start<=c.t
   local color=colors[hint.element]
   rect(bnd.lo,bnd.y-bnd.h,bnd.hi-bnd.lo,3,color,on and .9 or .52)
   rect(bnd.lo,bnd.y-bnd.h,3,bnd.h,color,.46)
   rect(bnd.hi-3,bnd.y-bnd.h,3,bnd.h,color,.46)
   rect(bnd.lo,bnd.y-4,bnd.hi-bnd.lo,4,on and color or colors.gold)
   b.warnings[#b.warnings+1]={lo=bnd.lo,hi=bnd.hi,y=bnd.y,h=bnd.h,starts=hint.start}
  end
  if c then for _,p in ipairs(c.shots) do
   rect(p.drawX-p.radius,p.y-4,p.radius*2,8,colors[c.element]);rect(p.drawX-4,p.y-8,8,16,'#f4f1ff')
  end end
  if name=='p1' or name=='overload' then
   if b.damageable then
    for _,x in ipairs({347,480,613}) do
     rect(x-23,y-5,46,4,colors.gold,.64)
     rect(x-3,y-10,6,5,colors.gold)
    end
   end
   for _,d in ipairs(spec.devices) do
    local hot=w.clock>=(w.deviceCd[d.id] or 0)
    local color=hot and (colors[d.id] or colors.electro) or '#818493'
    rect(d.x-20,y-13,40,13,'#423850');rect(d.x-13,y-16,26,5,color)
    rect(d.x-5,y-33,10,17,color);text(d.x,y-38,d.title,color)
   end
   if state.left then rect(347-35,y-92,70,8,colors.electro) end
   if state.right then rect(613-35,y-92,70,8,colors.electro) end
   for _,effect in ipairs({{230,w.windUntil,colors.anemo},{557,w.healUntil,colors.hydro}}) do
    if w.clock<effect[2] then rect(effect[1]-51,y-91,102,91,effect[3],.20) end
   end
  end
  for _,item in ipairs(w.blocks) do
   rect(item.x-11,y-24,22,15,'#4d846b');rect(item.x-7,y-29,14,20,colors.charge)
   text(item.x,y-32,'+'..item.value,colors.charge)
   state.blocks[#state.blocks+1]={x=item.x,y=y,id=item.id,value=item.value}
  end
  for _,part in ipairs(w.targets) do if part.hp>0 then
   rect(part.x-13,y-45,26,45,'#5c4472');rect(part.x-8,y-52,16,37,colors.electro)
   for i=1,part.charges do rect(part.x-23+i*8,y-63,6,6,colors.gold) end
   text(part.x,y-72,tostring(part.index),state.assist==part.index and colors.charge or colors.gold)
   if state.assist==part.index then rect(part.x-26,y-5,52,4,colors.charge) end
   state.targets[#state.targets+1]={x=part.x,y=y,charges=part.charges,index=part.index}
  end end
  if name=='trial' or name=='p2' and w.shield>0 then
   local x,cy=aimPoint(w,spec,'core')
   local exposed=name~='trial' or w.trialLeft==0
   local color=exposed and colors.charge or colors.electro
   state.core={x=x,y=cy,exposed=exposed}
   rect(x-18,cy-19,36,38,color,.22)
   rect(x-19,cy-21,38,4,color);rect(x-19,cy+17,38,4,color)
   rect(x-21,cy-17,4,34,color);rect(x+17,cy-17,4,34,color)
  end
  if q then
   local x,cy=aimPoint(w,spec,q.target)
   if q.tx then x,cy=q.tx,q.ty end
   local ax,ay=q.launchX or q.actor.x,q.launchY or q.actor.y-72
   for i=1,10 do rect(ax+(x-ax)*i/10-2,ay+(cy-ay)*i/10,4,4,colors.charge) end
  end
  if w.shot then rect(w.shot.x-7,w.shot.y-4,14,8,colors.charge) end
  if name=='failure' and w.stageTick<186 then
   local spread=math.floor(math.min(1,w.stageTick/180)*410+30)
   rect(480-spread,y-40,spread*2,5,colors.electro)
   rect(480-spread,y-83,spread*2,42,colors.electro,w.stageTick>=180 and .36 or .13)
  end
 end
 return controller
end
