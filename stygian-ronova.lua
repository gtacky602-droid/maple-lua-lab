return function(C,G,A,M,view)
 local D={}
 local previousAvoid=C.aiAvoidTarget
 local extra={RN10=true,RN11=true}
 local function targetable(b,open)
  b.invulnerable,b.noAutoTarget=not open,not open
 end
 local function contact(s,r,cast,mult,color,element)
  local b,spec=r.boss,r.spec
  local party=s.endgameRun
  if b.hp<=0 or b.invulnerable or r.status~='fighting' or party.status~='fighting' or party.wipe then return false end
  local resist=C.enemyResistance(cast,b,element)
  if resist>=1 then return false end
  local amount,critical=C.enemyHitDamage(s,cast,b,mult,element,resist)
  local boundary=spec.thresholds[r.stage]
  local lower=boundary and math.ceil(b.maxhp*boundary) or not r.finaleOpen and 1 or 0
  amount=math.min(amount,b.hp-lower)
  if amount<=0 then return false end
  local key=cast.key or 'normal'
  party.skills[key]=(party.skills[key] or 0)+amount
  s.damage=s.damage+amount;s.hits=s.hits+1
  C.combatNumber(s,b,critical and amount..'!' or amount,color)
  C.combatEvent(s,'hit',cast.id,b.id,amount)
  local e=s.events[#s.events]
  e.element,e.critical,e.reaction=element,not not critical,cast.reaction or false
  local c=r.cast
  if c and c.t>=c.recover then C.noteGrowth(s,'stygian-opening') end
  if amount==b.hp then
   r.cast,r.echoes,r.aid=nil,{},nil
   C.defeatEnemy(s,b,cast.id)
  else
   b.hp=b.hp-amount
   if boundary and b.hp==lower then r.pendingStage=r.stage+1
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
   owner.inv,owner.dodgeInvUntil=0,nil
  end
  local b={id=spec.entity,x=a.bossX,y=a.floor,hp=r.rules.hp,maxhp=r.rules.hp,level=r.rules.level,
   hitTop=a.floor-147,hitBottom=a.floor-15,hitHalfWidth=27,dir=-1,warning=0,
   custom=true,fieldBoss=true,boss=true,respawn=math.huge,rewardMora=0}
  b.onCastContact=function(state,cast,_,mult,color,element) return contact(state,r,cast,mult,color,element) end
  s.enemies={b}
  r.boss,r.spec,r.stage,r.phase=b,spec,1,'enter'
  r.serial,r.age,r.index,r.rest,r.remainder,r.phaseAt=0,0,1,0,0,0
  A.init(r,spec)
  r.finaleRest,r.finaleSeen,r.finaleOpen=0,false,false
  r.skills,r.orders={},{}
  for i,order in ipairs(spec.orders) do
   local selected={}
   for _,key in ipairs(order) do
    if r.rules.extraCards or not extra[key] then selected[#selected+1]=key end
   end
   r.orders[i]=selected
  end
  targetable(b,false)
  A.log(s,r,'enter',nil,r.life)
 end
 function D.attachCoop(r)
  A.init(r,r.spec)
 end
 local function start(s,r,key)
  r.cast=M.begin(s,r,key)
  r.phase='cast'
  if key=='RN08' then r.finaleRest=0;r.finaleSeen=true end
 end
 local function safeTransition(r)
  local finished=r.completed or 0
  if r.stage==3 then return r.roadSeen end
  return finished>=#r.orders[r.stage]
 end
 local function shift(s,r)
  r.stage,r.pendingStage=r.pendingStage,nil
  r.phase,r.phaseAt,r.rest,r.index,r.completed='phase',r.age,0,1,0
  r.boss.burning,r.boss.aura,r.boss.applicationClocks=nil,nil,nil
  targetable(r.boss,false)
  A.log(s,r,'phase',nil,r.stage)
 end
 local function choose(s,r)
  if r.pendingStage and safeTransition(r) then shift(s,r);return end
  if r.stage==4 and (not r.finaleSeen or r.finaleRest>=r.spec.timing.finaleBetween) then
   if r.protected>0 then r.rest=r.protected;return end
   start(s,r,'RN08');return
  end
  local order=r.orders[r.stage]
  local key=order[r.index]
  r.index=r.index%#order+1
  if r.protected>0 and (key=='RN05' or key=='RN06') then
   -- Keep the preview available after protection rather than spending its one-person verdict.
   r.index=(r.index-2)%#order+1
   start(s,r,r.stage==2 and 'RN04' or 'RN01')
   r.cast.extraPreview=true
  else start(s,r,key) end
 end
 local function finished(s,r,c)
  r.cast,r.phase,r.rest=nil,'ready',r.rules.rest
  if not c.extraPreview then r.completed=(r.completed or 0)+1 end
  if c.key=='RN12' then r.roadSeen=true end
  if r.stage==4 and c.key~='RN08' then r.finaleRest=r.finaleRest+1 end
 end
 local function bossTick(s,r)
  local c,spec=r.cast,r.spec
  if c then
   c.t=c.t+1
   M.tick(s,r,c)
   if c.key=='RN08' and c.t>=c.recover then r.finaleOpen=true end
   if c.t==c.recover and (c.key=='RN08' or c.key=='RN12') then A.log(s,r,'RN09:pose',nil,0,c) end
   if c.t>=c.stop then finished(s,r,c) end
   return
  end
  local age=r.age-r.phaseAt
  if r.phase=='enter' or r.phase=='phase' then
   if age>=(r.phase=='enter' and spec.timing.enter or spec.timing.shift) then
    r.phase,r.rest='ready',r.rules.rest
    targetable(r.boss,true)
   end
  elseif r.rest>0 then
   r.rest=r.rest-1
  else choose(s,r) end
 end
 local function wipe(s,r)
  if not A.beginWipe(s,r) then return false end
  C.clearWeeklySceneCasts(s)
  r.echoes={}
  M.waive(s,r.cast)
  if r.status=='failed' then
   r.cast=nil
   s.campaign.message='復活の灯が尽きました。入口から再挑戦できます。'
  elseif r.status=='spectate' then
   s.campaign.message='復活の灯が尽きました。味方の挑戦を観戦しています。'
  end
  return true
 end
 local function tick(s,r)
  r.age=r.age+1
  A.observeLoss(s,r)
  if wipe(s,r) then return end
  A.tickAid(s,r)
  if r.wipe then
   if r.phase=='enter' or r.phase=='phase' then r.phaseAt=r.phaseAt+1 end
   r.wipe.wait=math.max(0,r.wipe.wait-1)
   if r.wipe.wait==0 then
    local x=M.returnFloor(r)
    if x then A.returnPair(s,r,x)
    else bossTick(s,r) end
   end
   return
  end
  r.protected=math.max(0,r.protected-1)
  M.touchEchoes(s,r)
  bossTick(s,r)
  A.observeLoss(s,r)
  wipe(s,r)
 end
 function D.finish(s,r,spec,dt)
  r.remainder=r.remainder+math.min(dt,1/30)*60
  while r.remainder>=1-1e-8 and r.status=='fighting' do
   r.remainder=r.remainder-1
   if r.parties then
    r.age=r.age+1
    bossTick(s,r)
   else tick(s,r) end
  end
 end
 function D.advanceCoopParties(parties,dt)
  local waiting=false
  for _,s in ipairs(parties) do
   local r=s.endgameRun
   if r.status=='fighting' then
    r.reviveRemainder=(r.reviveRemainder or 0)+math.min(dt,1/30)*60
    while r.reviveRemainder>=1-1e-8 and r.status=='fighting' do
     r.reviveRemainder=r.reviveRemainder-1
     A.observeLoss(s,r)
     if wipe(s,r) then break end
     A.tickAid(s,r,r.age+1)
     if r.wipe then
      r.wipe.wait=math.max(0,r.wipe.wait-1)
      if r.wipe.wait==0 then
       local x=M.returnFloor(r)
       if x then A.returnPair(s,r,x) end
      end
     else
      r.protected=math.max(0,r.protected-1)
      M.touchEchoes(s,r)
     end
    end
    waiting=waiting or r.wipe~=nil
   end
  end
  return waiting
 end
 function D.finishCoopParty(r)
  r.wipe,r.aid,r.echoes=nil,nil,{}
 end
 function D.abort(s,r)
  r.cast,r.wipe,r.aid,r.echoes=nil,nil,nil,{}
 end
 function C.aiAvoidTarget(s,a)
  local r=s.endgameRun
  if r and r.match=='ronova' and r.status=='fighting' then
   local c=r.cast
   if c then
    if c.key=='RN07' and c.t<252 then
     local center=M.curtain(r,c)
     return center
    elseif c.key=='RN04' or c.key=='RN11' then
     for _,item in ipairs(M.hazards(r,c)) do
      local z=item.shape
      if G.bodyContact(z,a) then
       local left,right=z.left-24,z.right+24
       if left<28 then return right end
       if right>932 then return left end
       return a.x-left<right-a.x and left or right
      end
     end
    elseif c.key=='RN03' or c.key=='RN06' or c.key=='RN08' and c.t<c.recover or c.key=='RN12' then
     local leader=s.actors[s.active]
     return leader.x-leader.dir*48
    end
   end
  end
  if previousAvoid then return previousAvoid(s,a) end
 end
 D.observe,D.interact,D.blocksAction=view,A.interact,A.blockAction
 return D
end
