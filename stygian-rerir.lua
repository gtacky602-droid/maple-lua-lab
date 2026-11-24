return function(C,G,M,render)
 local D={}
 local previousAvoid=C.aiAvoidTarget
 local function event(s,run,tag,value)
  C.combatEvent(s,'stygian:rerir:'..tag,0,run.boss.id,value or 0)
 end
 local function targetable(b,enabled)
  b.invulnerable,b.noAutoTarget=not enabled,not enabled
 end
 local function clearEffects(s,run)
  if s.coop and s.coop.stygianRun==run then
   for _,member in ipairs(s.coop.members) do C.clearWeeklySceneCasts(member.state) end
  else C.clearWeeklySceneCasts(s) end
  local b=run.boss
  b.burning,b.aura,b.applicationClocks=nil,nil,nil
 end
 local function contact(s,run,cast,mult,color,element)
  local b,spec=run.boss,run.spec
  local personal=s.endgameRun
  if not personal or personal.status~='fighting' or b.hp<=0 or b.invulnerable or run.status~='fighting' then return false end
  local resist=C.enemyResistance(cast,b,element)
  if resist>=1 then return false end
  local amount,critical=C.enemyHitDamage(s,cast,b,mult,element,resist)
  local lower=0
  if run.stage==1 and not run.fog then lower=math.ceil(b.maxhp*spec.fog.threshold) end
  if run.phase=='fog' then lower=1 end
  amount=math.min(amount,b.hp-lower)
  if amount<=0 then return false end
  local ability=cast.key or 'normal'
  personal.skills[ability]=(personal.skills[ability] or 0)+amount
  s.damage=s.damage+amount;s.hits=s.hits+1
  C.combatNumber(s,b,critical and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,b.id,amount)
  local e=s.events[#s.events]
  e.element,e.critical,e.reaction=element,not not critical,cast.reaction or false
  local c=run.cast
  if c and (c.lamp or c.t>=c.data.recovery[1]) then C.noteGrowth(s,'stygian-opening') end

  if amount==b.hp then
   run.cast=nil
   if run.stage==1 then
    b.hp=0
    run.phase,run.age,run.preparingNextAct='interlude',0,true
    b.x,b.y=spec.arena.bossX,spec.arena.floor
    b.hitTop,b.hitBottom=b.y-136,b.y
    targetable(b,false);event(s,run,'act-one-ended')
   else
    C.defeatEnemy(s,b,cast.id)
   end
   return true
  end

  b.hp=b.hp-amount
  if run.stage==1 and not run.fog and b.hp==lower then
   run.fogPending=true
   targetable(b,false)
  elseif run.stage==2 then
   for i,ratio in ipairs(spec.trials.thresholds) do
    if b.hp<=math.ceil(b.maxhp*ratio) and not run.trials[i] then run.trials[i]='queued' end
   end
  end
  if not b.invulnerable and C.afterElementHit then
   C.afterElementHit(s,cast,b,cast.applicationElement or element,element,amount)
  end
  return true
 end
 function D.spawn(s,run,spec)
  local a=spec.arena
  C.clearWeeklySceneCasts(s);s.camera=0
  for i,owner in ipairs(s.actors) do
   owner.x,owner.y=a.playerX-(i-1)*44,a.floor
   owner.vy,owner.ground,owner.dash,owner.buffer=0,true,0,0
  end
  local b={id=spec.entity,x=a.bossX,y=a.floor,hp=run.rules.hp,maxhp=run.rules.hp,level=run.rules.level,
   hitTop=a.floor-136,hitBottom=a.floor,hitHalfWidth=26,dir=-1,warning=0,
   custom=true,fieldBoss=true,boss=true,respawn=math.huge,rewardMora=0}
  b.onCastContact=function(state,cast,_,mult,color,element) return contact(state,run,cast,mult,color,element) end
  s.enemies={b}
  run.boss,run.spec,run.stage,run.phase=b,spec,1,'enter'
  run.serial,run.age,run.index,run.rest,run.remainder,run.normals=0,0,1,0,0,0
  run.skills,run.trials={},{}
  targetable(b,false);event(s,run,'enter')
 end
 local function start(s,run,key,variant)
  local c=M.begin(s,run,key,variant)
  run.cast=c
  if key=='RR12' then
   run.phase='blessing'
  elseif c.path then
   run.phase='trial'
   run.trials[c.path]='active'
   targetable(run.boss,false)
   clearEffects(s,run)
  elseif key~='RR05' then
   run.phase='cast'
  end
  M.log(s,run,c,'start',nil,c.serial)
 end
 local function startFog(s,run)
  run.phase,run.age,run.cast='fog-entry',0,nil
  run.fogPending=nil
  run.fog={ward=run.spec.fog.ward,attempt=0}
  targetable(run.boss,false);clearEffects(s,run)
  event(s,run,'fog-entry',run.fog.ward)
 end
 local function ready(s,run)
  run.phase,run.cast,run.rest='ready',nil,run.rules.rest
  targetable(run.boss,true)
 end
 local function nextFog(s,run)
  run.fog.attempt=run.fog.attempt+1
  run.phase='fog'
  targetable(run.boss,false)
  start(s,run,'RR05')
 end
 function D.interact(s,run)
  local c=run.cast
  local a=s.actors[s.active]
  if run.phase~='fog' or not c or c.lamp or s.auto or a.hp<=0 then return end
  if c.t<84 or c.t>=132 then
   if run.shared then run.lampAttempt={cast=c.serial,tick=c.t}
   else c.tryAt=c.t end
   M.log(s,run,c,'lamp-early',a.id,0)
   return
  end
  run.fog.ward=run.fog.ward-1
  c.lamp={at=c.t,owner=s.coopMember and s.coopMember.id or 1,stop=c.t+(run.fog.ward==0 and 192 or 102)}
  if run.shared then run.mechanicContribution=true end
  M.log(s,run,c,'lamp',a.id,run.fog.ward)
 end
 local function nextAttack(s,run)
  local spec=run.spec
  if run.stage==1 and run.firstAfterFog then
   run.firstAfterFog=false
   start(s,run,'RR11','first_after_fog');return
  end
  if run.stage==2 then
   if run.trials[1]=='queued' then start(s,run,'RR09');return end
   if run.trials[2]=='queued' and run.trials[1]=='done' and run.normals>=spec.trials.normalBetween then
    start(s,run,'RR13');return
   end
  end
  local order=run.stage==1 and spec.firstOrder or spec.secondOrder
  local key,variant=order[run.index]:match('^(RR%d+):?(%a*)$')
  run.index=run.index%#order+1
  start(s,run,key,variant~='' and variant or nil)
 end
 local function tickFog(s,run,c)
  if not c.lamp then
   M.tick(s,run,c)
   if c.t>=c.data.total_ticks then nextFog(s,run) end
   return
  end
  if c.t==c.lamp.at+12 then
   targetable(run.boss,true)
   M.log(s,run,c,'exposed',nil,run.fog.ward)
  end
  if c.t<c.lamp.stop then return end
  if run.fog.ward>0 then
   nextFog(s,run)
  else
   event(s,run,'fog-done')
   run.firstAfterFog=true
   ready(s,run)
  end
 end
 local function tick(s,run,spec)
  local b=run.boss
  if run.phase=='enter' or run.phase=='interlude' or run.phase=='fog-entry' then
   if run.phase=='interlude' and run.age==0 then clearEffects(s,run) end
   run.age=run.age+1
   if run.phase=='enter' and run.age>=spec.timing.enter then
    ready(s,run)
   elseif run.phase=='fog-entry' and run.age>=spec.timing.fogEnter then
    nextFog(s,run)
   elseif run.phase=='interlude' and run.age>=spec.timing.interlude then
    run.stage,run.index,run.preparingNextAct=2,1,nil
    b.hp,b.maxhp=run.rules.secondHp,run.rules.secondHp
    start(s,run,'RR12');event(s,run,'act-two',b.hp)
   end
   return
  end
  local c=run.cast
  if c then
   c.t=c.t+1
   if run.phase=='fog' then tickFog(s,run,c);return end
   M.tick(s,run,c)
   if run.fogPending and c.t>=c.data.recovery[1] then startFog(s,run);return end
   if c.path and c.t==1080 then
    targetable(b,true)
    M.log(s,run,c,'exposed',nil,c.burst.complete and 1 or 0)
   end
   if c.t>=(c.stop or c.data.total_ticks) then
    if c.path then
     run.trials[c.path]='done'
     run.normals=0
    elseif run.stage==2 and run.trials[1]=='done' then
     run.normals=run.normals+1
    end
    ready(s,run)
   end
   return
  end
  if run.fogPending then startFog(s,run);return end
  if run.rest>0 then
   local a=run.target or s.actors[s.active]
   run.rest=run.rest-1
   local gap=a.x-b.x
   if math.abs(gap)>1.3*spec.arena.unit then
    b.dir=gap>0 and 1 or -1
    b.x=G.clamp(spec,b.x+b.dir*1.75,28)
   end
  else nextAttack(s,run) end
 end
 function D.finish(s,run,spec,dt)
  run.remainder=run.remainder+math.min(dt,1/30)*60
  while run.remainder>=1-1e-8 do
   run.remainder=run.remainder-1
   tick(s,run,spec)
  end
 end
 function D.abort(s,run)
  run.cast=nil
  targetable(run.boss,false)
 end
 function C.aiAvoidTarget(s,a)
  local run=s.endgameRun
  if run and run.match=='rerir' and run.status=='fighting' then
   local c=run.cast
   if c then
    for _,item in ipairs(M.cues(run,c).areas) do
     local z=item.shape
     if not item.final and G.bodyContact(z,a) then
      local left,right=z.left-24,z.right+24
      if (a.x-left<right-a.x and left>=28) or right>932 then return left end
      return right
     end
    end
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 D.observe=render
 return D
end
