return function(C,G,M,view)
 local D={}
 local priorMovement,priorAvoid=C.moveActorOverride,C.aiAvoidTarget
 local function event(s,r,kind,value,actor)
  C.combatEvent(s,'stygian:wanderer:'..kind,actor or 0,r.boss.id,value or 0)
 end
 local function targetable(b,value)
  b.invulnerable,b.noAutoTarget=not value,not value
 end
 local function contact(s,r,cast,mult,color,element)
  local b=r.boss
  local party=s.endgameRun
  if not party or b.hp<=0 or b.invulnerable or r.status~='fighting' or party.status~='fighting' then return false end
  local resist=C.enemyResistance(cast,b,element)
  if resist>=1 then return false end
  local amount,critical=C.enemyHitDamage(s,cast,b,mult,element,resist)
  local threshold=r.spec.thresholds[r.stage]
  local lower=threshold and math.ceil(b.maxhp*threshold) or not r.finaleOpen and 1 or 0
  amount=math.min(amount,b.hp-lower)
  if amount<=0 then return false end
  local name=cast.key or 'normal'
  party.skills[name]=(party.skills[name] or 0)+amount
  s.damage=s.damage+amount;s.hits=s.hits+1
  C.combatNumber(s,b,critical and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,b.id,amount)
  local e=s.events[#s.events]
  e.element,e.critical,e.reaction=element,not not critical,cast.reaction or false
  local c=r.cast
  if c and c.t>=c.recover then C.noteGrowth(s,'stygian-opening') end
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
   hitTop=a.floor-105,hitBottom=a.floor,hitHalfWidth=23,dir=-1,warning=0,
   custom=true,fieldBoss=true,boss=true,damageElement='anemo',respawn=math.huge,rewardMora=0}
  b.onCastContact=function(state,cast,_,mult,color,element) return contact(state,r,cast,mult,color,element) end
  s.enemies={b}
  r.boss,r.spec,r.stage,r.phase=b,spec,1,'enter'
  r.age,r.phaseAt,r.rest,r.serial,r.index,r.remainder=0,0,0,0,1,0
  r.skills,r.shown,r.ordinary={},{},0
  targetable(b,false)
  event(s,r,'enter')
 end
 function C.moveActorOverride(s,a,dt,move,held)
  if priorMovement and priorMovement(s,a,dt,move,held) then return true end
  local r=s.endgameRun
  if not r or r.match~='wanderer' or r.status~='fighting' or s.auto or a.id~=s.active or
     not a.ground or a.y~=r.spec.arena.floor or not held or a.buffer<=0 then return end
  local arena=r.spec.arena
  for _,x in ipairs(arena.risingPads) do
   if math.abs(a.x-x)<=arena.padRadius then
    local source=a.jumpInputAt
    a.vy,a.ground,a.buffer,a.coyote=-arena.boost,false,0,0
    if C.onPlayerMotion and source then C.onPlayerMotion(s,a,'jump',source,a.dir) end
    event(s,r,'updraft',x,a.id)
    break
   end
  end
 end
 local function shift(s,r)
  r.stage,r.pendingStage=r.pendingStage,nil
  r.phase,r.phaseAt,r.index,r.rest='phase',r.age,1,0
  local b=r.boss
  b.burning,b.aura,b.applicationClocks=nil,nil,nil
  targetable(b,false)
  event(s,r,'phase',r.stage)
 end
 local function choose(s,r)
  local tutorial=r.stage==1 and 'WD02' or 'WD03'
  if r.pendingStage and r.shown[tutorial] then shift(s,r);return end
  if r.stage==3 and (not r.shown.WD06 or r.ordinary>=r.spec.timing.finaleBetween) then
   r.cast=M.begin(s,r,'WD06');r.ordinary=0
  else
   local order=r.spec.orders[r.stage]
   r.cast=M.begin(s,r,order[r.index])
   r.index=r.index%#order+1
  end
  r.phase='cast'
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
   M.tick(s,r,c)
   if c.key=='WD06' and c.t>=c.recover then r.finaleOpen=true end
   if c.t>=c.untilTick then
    r.shown[c.key]=true
    if r.stage==3 and c.key~='WD06' then r.ordinary=r.ordinary+1 end
    r.cast,r.rest,r.phase=nil,r.rules.rest,'ready'
   end
   return
  end
  if r.rest>0 then
   r.rest=r.rest-1
   b.y=math.min(spec.arena.floor,b.y+4)
   b.hitTop,b.hitBottom=b.y-105,b.y
   local gap=(r.target or s.actors[s.active]).x-b.x
   if math.abs(gap)>115 then
    b.dir=gap>=0 and 1 or -1
    b.x=G.clamp(spec,b.x+b.dir*2,28)
   end
  else choose(s,r) end
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
  if r and r.match=='wanderer' and r.status=='fighting' and r.cast then
   local c=r.cast
   local gate=M.progress(s,c).gate
   if gate and c.t<574 then return gate.x end
   if c.key=='WD03' and not c.drop or c.key=='WD06' and c.t<438 then
    local lead=s.actors[s.active]
    return lead.x-lead.dir*44
   end
   for _,z in ipairs(M.cues(r,c,s)) do
    local g=z.shape
    if G.bodyContact(g,a) then
     local left,right=g.left-25,g.right+25
     if left>=26 and (right>932 or a.x-left<right-a.x) then return left end
     if right<=932 then return right end
    end
   end
  end
  if priorAvoid then return priorAvoid(s,a) end
 end
 function D.abort(s,r) r.cast=nil end
 function D.afterClear(s,r,spec,dt)
  r.endTicks=math.min(36,(r.endTicks or 0)+dt*60)
  local first=r.landedFrom or spec.arena.floor
  r.boss.y=first+(spec.arena.floor-first)*r.endTicks/36
 end
 D.observe=view
 return D
end
