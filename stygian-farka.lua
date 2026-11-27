return function(C,G,M,view)
 local D={}
 local priorAvoid=C.aiAvoidTarget
 local function event(s,r,kind,value)
  C.combatEvent(s,'stygian:farka:'..kind,0,r.boss.id,value or 0)
 end
 local function targetable(b,open)
  b.invulnerable,b.noAutoTarget=not open,not open
 end
 local function contact(s,r,cast,mult,color,element)
  local b=r.boss
  local personal=s.endgameRun
  if not personal or personal.status~='fighting' or b.hp<=0 or b.invulnerable or r.status~='fighting' then return false end
  local resist=C.enemyResistance(cast,b,element)
  if resist>=1 then return false end
  local amount,critical=C.enemyHitDamage(s,cast,b,mult,element,resist)
  local threshold=r.spec.thresholds[r.stage]
  local lower=threshold and math.ceil(b.maxhp*threshold) or not r.chainOpen and 1 or 0
  amount=math.min(amount,b.hp-lower)
  if amount<=0 then return false end
  local name=cast.key or 'normal'
  local skills=personal.skills
  skills[name]=(skills[name] or 0)+amount
  s.damage=s.damage+amount;s.hits=s.hits+1
  C.combatNumber(s,b,critical and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,b.id,amount)
  local e=s.events[#s.events]
  e.element,e.critical,e.reaction=element,not not critical,cast.reaction or false
  local c=r.cast
  if c and (c.t>=c.card.recovery[1] or c.child.t>=c.child.card.recovery[1]) then
   C.noteGrowth(s,'stygian-opening')
  end
  if amount==b.hp then
   r.cast=nil
   r.landedFrom=b.y
   C.defeatEnemy(s,b,cast.id)
  else
   b.hp=b.hp-amount
   if threshold and b.hp==lower then r.pendingStage=r.stage+1
   elseif C.afterElementHit then C.afterElementHit(s,cast,b,cast.applicationElement or element,element,amount) end
  end
  return true
 end
 function D.spawn(s,r,spec)
  local a=spec.arena
  C.clearWeeklySceneCasts(s);s.camera=0
  for i,owner in ipairs(s.actors) do
   owner.x,owner.y=a.playerX-(i-1)*44,a.floor
   owner.vy,owner.ground,owner.dash,owner.buffer=0,true,0,0
  end
  local b={id=spec.entity,x=a.bossX,y=a.floor,hp=r.rules.hp,maxhp=r.rules.hp,level=r.rules.level,
   hitTop=a.floor-139,hitBottom=a.floor,hitHalfWidth=28,dir=-1,warning=0,
   custom=true,fieldBoss=true,boss=true,respawn=math.huge,rewardMora=0}
  b.onCastContact=function(state,cast,_,mult,color,element) return contact(state,r,cast,mult,color,element) end
  s.enemies={b}
  r.boss,r.spec,r.stage,r.phase=b,spec,1,'enter'
  r.age,r.phaseAt,r.index,r.serial,r.rest,r.remainder=0,0,1,0,0,0
  r.skills,r.solo,r.nextChain={},{},r.rules.firstChain
  targetable(b,false)
  event(s,r,'enter')
 end
 local function start(s,r,key)
  r.serial=r.serial+1
  local base=r.spec.cards[key]
  local c={key=key,card=base,title=base.title,t=0,serial=r.serial}
  if key=='FK07' then
   c.chainHits={}
   c.variant=r.nextChain
   c.second=c.variant=='A' and 'FK04' or 'FK05'
   c.card=c.variant=='B' and base.variants.B or base
   c.child=M.begin(s,r,'FK03',c.serial)
   r.nextChain=c.variant=='A' and 'B' or 'A'
  else c.child=M.begin(s,r,key,c.serial) end
  r.cast,r.phase=c,'cast'
  event(s,r,key..(c.variant and ':'..c.variant or ''),c.serial)
 end
 local function canShift(r)
  if not r.pendingStage then return false end
  for _,key in ipairs(r.spec.required[r.stage]) do
   if not r.solo[key] then return false end
  end
  return true
 end
 local function shift(s,r)
  r.stage,r.pendingStage=r.pendingStage,nil
  r.phase,r.phaseAt,r.index,r.rest='phase',r.age,1,0
  local b=r.boss
  b.burning,b.aura,b.applicationClocks=nil,nil,nil
  targetable(b,false)
  event(s,r,'phase',r.stage)
 end
 local function tick(s,r,spec)
  r.age=r.age+1
  local b=r.boss
  if r.phase=='enter' or r.phase=='phase' then
   if r.age-r.phaseAt>=(r.phase=='enter' and spec.timing.enter or spec.timing.shift) then
    r.phase,r.rest='ready',r.rules.rest
    targetable(b,true)
   end
   return
  end
  local c=r.cast
  if c then
   c.t=c.t+1
   if c.second and c.t==spec.timing.chainAt then
    c.child=M.begin(s,r,c.second,c.serial,spec.timing.chainAt)
   end
   c.child.t=c.t-c.child.offset
   M.tick(s,r,c.child)
   if c.key=='FK07' and c.t>=c.card.recovery[1] then r.chainOpen=true end
   if c.t>=c.card.total_ticks then
    if not c.second then r.solo[c.key]=true end
    r.cast,r.phase,r.rest=nil,'ready',r.rules.rest
   end
   return
  end
  if canShift(r) then shift(s,r);return end
  if r.rest>0 then
   r.rest=r.rest-1
   b.y=math.min(spec.arena.floor,b.y+6)
   b.hitTop,b.hitBottom=b.y-139,b.y
   local gap=(r.target or s.actors[s.active]).x-b.x
   if math.abs(gap)>106 then
    b.dir=gap>0 and 1 or -1
    b.x=G.clamp(spec,b.x+b.dir*2.1,32)
   end
   return
  end
  local order=r.spec.orders[r.stage]
  local key=order[r.index]
  r.index=r.index%#order+1
  start(s,r,key)
 end
 function D.finish(s,r,spec,dt)
  r.remainder=r.remainder+math.min(dt,1/30)*60
  while r.remainder>=1-1e-8 do
   r.remainder=r.remainder-1
   tick(s,r,spec)
  end
 end
 function C.aiAvoidTarget(s,a)
  local r=s.endgameRun
  if r and r.match=='farka' and r.status=='fighting' and r.cast then
   local c=r.cast.child
   if a.id~=s.active and c.key=='FK05' and c.t<180 then
    return G.clamp(r.spec,r.boss.x-r.boss.dir*108,18)
   end
   for _,cue in ipairs(M.cues(r,c)) do
    local g=cue.area
    if G.bodyContact(g,a) then
     local left,right=g.left-24,g.right+24
     if left>=26 and (right>934 or a.x-left<right-a.x) then return left end
     if right<=934 then return right end
    end
   end
  end
  if priorAvoid then return priorAvoid(s,a) end
 end
 function D.abort(s,r) r.cast=nil end
 function D.afterClear(s,r,spec,dt)
  r.endAge=math.min(42,(r.endAge or 0)+dt*60)
  local start=r.landedFrom or spec.arena.floor
  r.boss.y=start+(spec.arena.floor-start)*r.endAge/42
 end
 D.observe=view
 return D
end
