return function(C)
 local A={}
 local previousWipe=C.handlesPartyWipe
 local previousAttack,previousDamage=C.attack,C.damageActor
 local function match(s)
  local r=s.endgameRun
  return r and r.match=='ronova' and r.status=='fighting' and r or nil
 end
 function A.init(r,spec)
  r.protected,r.generation,r.aidCooldown=0,0,0
  r.echoes,r.downed={},{}
  r.life,r.lamps=spec.life.max,spec.revive.lamps
 end
 function A.log(s,r,kind,actor,value,cast)
  C.combatEvent(s,'stygian:ronova:'..kind,actor or 0,r.boss.id,value or 0)
  local e=s.events[#s.events]
  e.owner=s.coopMember and s.coopMember.id or 1
  e.generation=r.generation
  if cast then e.cast,e.tick=cast.serial,cast.t end
 end
 function C.handlesPartyWipe(s)
  return match(s)~=nil or (previousWipe and previousWipe(s))
 end
 local function breakProtection(s,r,a)
  if r.protected>0 then
   r.protected=0
   A.log(s,r,'protection-ended',a.id)
  end
 end
 function C.attack(s,a,key)
  local used=previousAttack(s,a,key)
  local r=used and match(s)
  if r and s.active==a.id and not s.auto then
   r.aid=nil
   breakProtection(s,r,a)
  end
  return used
 end
 function C.damageActor(s,a,amount,source,blockable,telegraphed)
  local r=match(s)
  if r and r.protected>0 then return 0 end
  local damage=previousDamage(s,a,amount,source,blockable,telegraphed)
  if r and damage>0 and r.aid and r.aid.by==a.id then
   r.aid=nil
   A.log(s,r,'aid-interrupted',a.id)
  end
  return damage
 end
 function A.blockAction(s,r,key)
  if key=='pause' then return false end
  return s.paused or r.wipe~=nil or s.actors[s.active].hp<=0
 end
 local function dodge(s,a)
  return (a.dodgeInvUntil or 0)>s.t+1e-8
 end
 function A.down(s,r,a,kind,c)
  if a.hp<=0 then return false end
  if kind=='authority_lethal' and (r.protected>0 or dodge(s,a)) then return false end
  r.aid=nil
  a.hp=0
  if C.interruptChannel then C.interruptChannel(s,a) end
  r.generation=r.generation+1
  r.downed[a.id]=true
  r.lastDown={actor=a.id,at=r.age,cause=kind}
  A.log(s,r,kind,a.id,1,c)
  local other=s.actors[3-a.id]
  if a.id==s.active and other.hp>0 then
   s.active=other.id
   if kind=='life-zero' then
    r.life=r.spec.life.afterZero
    A.log(s,r,'life-relay',other.id,r.life,c)
   end
  end
  return true
 end
 function A.lose(s,r,n,c,dodgable)
  local a=s.actors[s.active]
  if a.hp<=0 or r.protected>0 or dodgable and dodge(s,a) then return 0 end
  local amount=math.min(r.life,n)
  if amount<=0 then return 0 end
  r.life=r.life-amount
  A.log(s,r,'life-loss',a.id,amount,c)
  if r.life==0 then A.down(s,r,a,'life-zero',c) end
  return amount
 end
 function A.gain(s,r,n,c)
  local a=s.actors[s.active]
  if a.hp<=0 then return end
  local amount=math.min(n,r.spec.life.max-r.life)
  r.life=r.life+amount
  A.log(s,r,'life-pickup',a.id,amount,c)
 end
 function A.interact(s,r)
  local a,other=s.actors[s.active],s.actors[3-s.active]
  local range=r.spec.revive.aidRange
  if r.aid or r.wipe or r.aidCooldown>0 or a.hp<=0 or other.hp>0 then return end
  if math.abs(a.x-other.x)>range or math.abs(a.y-other.y)>48 then return end
  r.aid={by=a.id,to=other.id,x=a.x,y=a.y,finish=r.age+r.spec.revive.aidTime}
  A.log(s,r,'aid-start',a.id)
 end
 function A.tickAid(s,r,age)
  r.aidCooldown=math.max(0,r.aidCooldown-1)
  local aid=r.aid
  if not aid then return end
  local a,other=s.actors[aid.by],s.actors[aid.to]
  if s.active~=aid.by or a.hp<=0 or other.hp>0 or math.abs(a.x-aid.x)>8 or math.abs(a.y-aid.y)>8 then
   r.aid=nil
   A.log(s,r,'aid-interrupted',a.id)
  elseif (age or r.age)>=aid.finish then
   other.hp=math.max(1,math.floor(other.maxhp*r.spec.revive.aidFraction))
   other.inv=.6
   r.downed[other.id]=nil
   r.aid,r.aidCooldown=nil,r.spec.revive.aidCooldown
   A.log(s,r,'aid-success',other.id,other.hp)
  end
 end
 function A.observeLoss(s,r)
  for _,a in ipairs(s.actors) do
   if a.hp<=0 and not r.downed[a.id] then
    r.downed[a.id]=true
    r.generation=r.generation+1
    r.lastDown={actor=a.id,at=r.age,cause='hp'}
    A.log(s,r,'hp-down',a.id,1,r.cast)
   end
  end
  if s.actors[s.active].hp<=0 and s.actors[3-s.active].hp>0 then s.active=3-s.active end
 end
 function A.beginWipe(s,r)
  if r.wipe or s.actors[1].hp>0 or s.actors[2].hp>0 then return false end
  r.aid=nil
  r.protected=0
  if r.lamps==0 then
   if r.shared then r.status='spectate'
   else r.status,r.phase='failed','spectate' end
   A.log(s,r,'spectate')
  else
   r.lamps=r.lamps-1
   r.wipe={wait=r.spec.revive.wait}
   A.log(s,r,'lamp-spent',nil,r.lamps)
  end
  return true
 end
 function A.returnPair(s,r,x)
  local floor=r.spec.arena.floor
  for i,a in ipairs(s.actors) do
   a.hp,a.x,a.y,a.vy,a.ground=a.maxhp,x+(i==1 and -14 or 14),floor,0,true
   a.inv,a.dodgeInvUntil,a.dash,a.drop,a.buffer=0,nil,0,0,0
   a.lock,a.channel,a.waterShield,a.iceShield=0,nil,nil,nil
  end
  r.downed,r.wipe,r.lastDown={},nil,nil
  r.life,r.protected=r.spec.life.max,r.spec.revive.protection
  A.log(s,r,'returned',s.active,r.lamps)
 end
 return A
end
