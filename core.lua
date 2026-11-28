-- Offline laboratory. No Miliastra API is mocked as verified.
local C = {}
local floor, abs, min, max = math.floor, math.abs, math.min, math.max
local function clamp(v,a,b) return max(a,min(b,v)) end
local function actor(id,x)
 return {id=id,x=x,y=480,vy=0,dir=1,hp=140,maxhp=140,atk=id==1 and 4 or 3,cd={},lock=0,inv=0,ground=true,light=0,walk=0,coyote=0,buffer=0,drop=0}
end
function C.new(density)
 local s={t=0,active=1,gauge=60,swap=0,actors={actor(1,200),actor(2,140)},enemies={},pending={},numbers={},effects={},events={},hits=0,kills=0,mora=0,damage=0,returns=0,camera=0,auto=false,paused=false,mode='sprite',density=density or 16,seq=0}
 s.platforms={{x=0,y=480,w=2880},{x=110,y=340,w=650},{x=1010,y=340,w=650},{x=1980,y=340,w=650}}
 for screen=0,2 do for i=1,s.density do
  local upper=i>s.density/2
  local n=upper and i-math.floor(s.density/2) or i
  local x=screen*960+260+(n-1)*(455/max(1,math.ceil(s.density/2)-1))
  s.enemies[#s.enemies+1]={id=#s.enemies+1,x=x,home=x,y=upper and 340 or 480,hp=15,maxhp=15,respawn=0,cd=2+i*.21,warning=0,kind=i%3==0 and 2 or 1}
 end end
 return s
end
local function event(s,kind,a,e,n)
 s.seq=s.seq+1
 s.events[#s.events+1]={seq=s.seq,t=s.t,kind=kind,actor=a or 0,target=e or 0,value=n or 0}
 if #s.events>240 then table.remove(s.events,1) end
end
local function number(s,e,n,color)
 if #s.numbers>=80 then table.remove(s.numbers,1) end
 s.numbers[#s.numbers+1]={x=e.x+(s.hits%5)*8,y=e.y-45-(s.hits%4)*15,text=tostring(n),life=.8,color=color}
end
function C.damageActor(s,a,amount,source,blockable,telegraphed)
 if s.paused or a.hp<=0 or a.inv>0 or amount<=0 then return 0 end
 local damage=math.max(0,math.floor(amount));local wall=s.rockWall
 if C.mitigateDamage then damage=C.mitigateDamage(s,a,damage,source,blockable,telegraphed) end
 if blockable and source and wall and wall.hp>0 and wall.life>0 and source.x~=a.x then
  local t=(wall.x-source.x)/(a.x-source.x)
  local height=source.y-30+t*((a.y-40)-(source.y-30))
  if t>=0 and t<=1 and height>=wall.y-120 and height<=wall.y then
   local absorbed=math.min(damage,wall.hp);wall.hp=wall.hp-absorbed;damage=damage-absorbed
   event(s,'wall_block',a.id,source.id,absorbed)
   if wall.hp<=0 then s.rockWall=nil end
  end
 end
 if damage>0 and C.absorbDamage then
  local incoming=damage
  damage=C.absorbDamage(s,a,damage,source)
  if damage<incoming and source and source.onShieldAbsorb then source.onShieldAbsorb(incoming-damage) end
 end
 a.hp=math.max(0,a.hp-damage);a.inv=.6
 if damage>0 and C.interruptChannel then C.interruptChannel(s,a) end
 if damage>0 then
  event(s,'hurt',a.id,source and source.id or 0,damage)
  if source and source.damageElement then s.events[#s.events].element=source.damageElement end
 end
 return damage
end
function C.healActor(s,a,amount)
 if a.hp<=0 or amount<=0 then return 0 end
 local factor=C.healingFactor and C.healingFactor(s,a) or 1
 amount=amount*factor
 if C.applyHealingDebt then amount=C.applyHealingDebt(s,a,amount) end
 local before=a.hp
 a.hp=min(a.maxhp,a.hp+amount)
 return a.hp-before
end
function C.defeatEnemy(s,e,owner)
 e=e.sharedHealth or e
 if e.hp<=0 then return false end
 e.hp=0
 if e.noRewards then e.respawn=1e9;event(s,'object_destroyed',owner,e.id,0)
 else
  e.respawn=e.respawnSeconds or 6
  if s.coop and C.sharesCoopField(s) then C.coopDefeat(s,e) else C.creditDefeat(s,e,owner) end
 end
 return true
end
function C.creditDefeat(s,e,owner)
 local mora=e.rewardMora or 10
 s.kills=s.kills+1;s.mora=s.mora+mora
 event(s,'kill',owner,e.id,mora)
 if C.onKill then C.onKill(s,e) end
end
function C.enemyResistance(a,e,element)
 local resist=(e.resist and e.resist[element]) or 0
 if a.damageElements then
  resist=0
  for _,part in ipairs(a.damageElements) do resist=resist+(e.immune==part and 1 or ((e.resist and e.resist[part]) or 0))/#a.damageElements end
 elseif e.immune==element then resist=1 end

 return resist
end
function C.enemyHitDamage(s,a,e,mult,element,resist)
 resist=resist or C.enemyResistance(a,e,element)
 if resist>=1 then return 0,false end
 if element=='physical' and (e.physicalBreak or 0)>0 then resist=resist-.12 end
 local bonus=element~='physical' and (a.elementBonus or 0) or 0
 if element=='physical' then
  local actor=s.actors[a.id]
  if actor then
   bonus=bonus+(actor.artifactPhysicalBonus or 0)
   if (e.physicalBreak or 0)>0 then bonus=bonus+(actor.artifactBreakBonus or 0) end
  end
 end
 bonus=bonus+(a.isNormal and (a.normalBonus or 0) or (a.skillBonus or 0))
 if not a.isNormal and a.troupe4 then bonus=bonus+((s.active==a.id and not s.auto) and .15 or .25) end
 if C.damageBonus then bonus=bonus+C.damageBonus(s,a,element,e) end
 local critical=C.criticalRoll and C.criticalRoll(s,a.critRate)
 local critMultiplier=critical and (1.5+(a.critDamageBonus or 0)) or 1
 if a.coldBonus and ((e.chill or 0)>0 or (e.frozen or 0)>0 or (e.aura and e.aura.element=='cryo' and e.aura.expires>(s.coop and s.coop.time or s.t))) then mult=mult*(1+a.coldBonus) end
 local defense=(e.defense or 5)*((e.armorBreak or 0)>0 and .85 or 1)
 local n=max(1,floor(a.atk*mult*100/(100+defense)*(1-resist)*(1+bonus)*critMultiplier*(C.damageFactor and C.damageFactor(s,a,e,element) or 1)+1e-9))
 return n,critical
end
C.combatEvent=event
C.combatNumber=number
local function hit(s,a,e,mult,color,element)
 if e.hp<=0 or e.invulnerable then return false end
 if e.onCastContact then return e.onCastContact(s,a,e,mult,color,element) end
 if C.interceptHit and C.interceptHit(s,a,e,element) then return true end
 local resist=C.enemyResistance(a,e,element)
 if resist>=1 then number(s,e,'無効','#b6e9df');event(s,'immune:'..element,a.id,e.id);return false end
 local n,critical=C.enemyHitDamage(s,a,e,mult,element,resist)
 if (e.damageShield or 0)>0 then
  if element=='physical' then
   number(s,e,'シールド','#d6b4ff')
   event(s,'shield_block',a.id,e.id,0)
  else
   local absorbed=min(e.damageShield,n*((e.shieldFactors and e.shieldFactors[element]) or 1))
   e.damageShield=e.damageShield-absorbed
   number(s,e,absorbed,'#eeb9ff')
   event(s,'shield_hit',a.id,e.id,absorbed)
   s.events[#s.events].element=element
   if e.onShieldDamage then e.onShieldDamage(s,a,e) end
  end
  return true
 end
 n=min(n,max(0,e.hp-(e.minhp or 0)))
 if n<=0 then return false end
 local remaining=max(e.minhp or 0,e.hp-n);s.hits=s.hits+1;s.damage=s.damage+n
 if not e.underground then number(s,e,critical and (tostring(n)..'!') or n,color) end
 event(s,'hit',a.id,e.id,n);s.events[#s.events].element=element;s.events[#s.events].critical=not not critical;s.events[#s.events].reaction=a.reaction or false
 local actual=(e.spawnId or e.growthEvidence) and not e.noRewards
 if actual and (a.growthAI or s.growthAIActor==a.id) and C.noteGrowth then C.noteGrowth(s,'ai-hit') end
 if C.noteGrowthHit and (actual or s.growthPracticeMarks and e.growthPracticeTarget) then C.noteGrowthHit(s,a) end
 if s.coop then C.coopContact(s,e,a.id) end
 if remaining==0 then C.defeatEnemy(s,e,a.id) else e.hp=remaining end
 if C.afterElementHit then C.afterElementHit(s,a,e,a.applicationElement or element,element,n) end
 return true
end
function C.enemyRate(e) return (e.slow or 0)>0 and .7 or 1 end
function C.canTargetEnemy(e) return e.hp>0 and not e.underground end
function C.targetHeight(a,e)
 return math.max(e.hitTop or e.y,math.min(e.hitBottom or e.y,a.y))
end
function C.hitFieldWeakpoint(cast,e,range)
 local point=e.weakpoint
 if not point or cast.persistentTarget then return false end
 if cast.upward and point.y-point.radius-cast.y>=75 then return false end
 local reach=range or cast.range
 local left=cast.x-((cast.radial or cast.dir<0) and reach or math.min(25,reach))
 local right=cast.x+((cast.radial or cast.dir>0) and reach or math.min(25,reach))
 local vertical=cast.vertical or 75
 local dx=max(0,left-point.x,point.x-right)
 local dy=max(0,abs(point.y-cast.y)-vertical)
 return dx*dx+dy*dy<point.radius*point.radius
end
local function receiver(e) return e.sharedHealth or e end
local function firstContact(a,e)
 if not a.travelSpeed or not a.lastPulseX then return 0 end
 return max(0,(e.x-a.lastPulseX)*a.dir-a.range)
end
local function hitRegion(a,e,range)
 local y=C.targetHeight(a,e)-a.y
 local half=e.hitHalfWidth or 0
 if (not a.upward or y<75) and abs(y)<(a.vertical or 75) and abs(e.x-a.x)<range+half and
    (a.radial or (e.x-a.x)*a.dir>-25-half) then return true end
 return e.weakpoint and C.hitFieldWeakpoint(a,e,range)
end
local function castReaches(a,e,range,left,right)
 return (not left or (e.x+(e.hitHalfWidth or 0)>=left and e.x-(e.hitHalfWidth or 0)<=right)) and
        (not a.groundWave or e.boss or abs(e.y-a.y)<5) and
        (not a.groundOnly or not e.flying) and hitRegion(a,e,range)
end
function C.castReachesFieldPart(cast,part,left,right)
 return castReaches(cast,part,cast.range,left,right)
end
function C.placeGroundCast(s,cast)
 local floorY=math.huge
 for _,p in ipairs(s.platforms) do
  if cast.x>=p.x and cast.x<=p.x+p.w and p.y>=cast.y and p.y<floorY then floorY=p.y end
 end
 if floorY<math.huge then cast.y=floorY end
end
local function groundWaveSpan(s,cast)
 local left,right=cast.x,cast.x
 local prevLeft,prevRight
 repeat
  prevLeft,prevRight=left,right
  for _,p in ipairs(s.platforms) do
   if p.y==cast.y and p.x<=right and p.x+p.w>=left then
    left,right=min(left,p.x),max(right,p.x+p.w)
   end
  end
 until left==prevLeft and right==prevRight
 if left<right then return left,right end
end
local function targets(s,a,range,limit,includePartners,left,right)
 local out={}
 local contacts={}
 for _,e in ipairs(s.enemies) do
  if (C.canTargetEnemy(e) or (a.persistentTarget==e and e.hp>0)) and (not a.targetId or e.id==a.targetId) and
     (not e.acceptsCast or e.acceptsCast(a,s)) and castReaches(a,e,range,left,right) then
   out[#out+1]=e
   if not includePartners and (e.sharedHealth or e.fieldPartner) then
    local key=receiver(e)
    local first=contacts[key]
    local time=firstContact(a,e)
    if not first or time<first.time or (time==first.time and e.id<first.body.id) then
     contacts[key]={body=e,time=time}
    end
   end
  end
 end
 for i=#out,1,-1 do
  local first=contacts[receiver(out[i])]
  if first and first.body~=out[i] then table.remove(out,i) end
 end
 table.sort(out,function(a1,b) if a.farthest then return abs(a1.x-a.x)>abs(b.x-a.x) end;return abs(a1.x-a.x)<abs(b.x-a.x) end)
 while #out>limit do table.remove(out) end
 return out
end
local function pulse(s,cast)
 cast.impactEvent=(cast.impactEvent or 0)+1
 local touched=false
 if cast.follow then local owner=s.actors[cast.id];cast.x=owner.x;cast.y=owner.y end
 local waveLeft,waveRight
 if cast.groundWave then
  waveLeft,waveRight=groundWaveSpan(s,cast)
  if not waveLeft then return end
  waveLeft=max(waveLeft,cast.x-(cast.dir<0 and cast.range or 25))
  waveRight=min(waveRight,cast.x+(cast.dir>0 and cast.range or 25))
 end
 local chainLightning,stakeLightning=cast.key=='SK10',cast.key=='SK12'
 local seedTrail=cast.key=='SK15'
 local lightningX,lightningY=cast.x,cast.y-(stakeLightning and 37 or 45)
 if cast.trail then s.effects[#s.effects+1]={x=cast.x-cast.dir*30,y=cast.y-15,w=80,h=30,life=.3,color=cast.color} end
 local selected=targets(s,cast,cast.range,cast.limit,false,waveLeft,waveRight)
 if cast.scatter then
  cast.pellet=(cast.pellet or 0)+1
  if #selected>0 then
   local index=abs(selected[1].x-cast.x)<=100 and 1 or ((cast.pellet-1)%#selected)+1
   selected={selected[index]}
   s.effects[#s.effects+1]={x=selected[1].x,y=selected[1].y-35,w=12,h=12,life=.2,color=cast.color}
  end
 end
 if cast.homing then
  if not cast.tracked then cast.tracked={};for _,e in ipairs(selected) do cast.tracked[e.id]=true end end
  selected={}
  for _,e in ipairs(s.enemies) do if cast.tracked[e.id] and C.canTargetEnemy(e) and abs(e.x-cast.x)<900 and abs(e.y-cast.y)<360 then
   selected[#selected+1]=e
   if not seedTrail then
    s.effects[#s.effects+1]={x=e.x,y=e.y-30,w=24,h=24,life=.2,color=cast.color}
   end
  end end
 end
 if cast.sharedProjectiles and #selected>0 then
  table.sort(selected,function(a,b)return a.id<b.id end)
  cast.shot=(cast.shot or 0)+1;selected={selected[(cast.shot-1)%#selected+1]}
 end
 if cast.chain then
  local candidates=targets(s,cast,cast.range,#s.enemies,true);selected={};local x,y=cast.x,cast.y
  local receivers={}
  while #selected<cast.limit do
   local nearest,distance=nil,math.huge
   for _,e in ipairs(candidates) do local d=math.sqrt((e.x-x)^2+(e.y-y)^2)
    if not receivers[receiver(e)] and d<=(#selected==0 and 320 or cast.chain) and
       (d<distance or (d==distance and e.id<nearest.id)) then nearest,distance=e,d end
   end
   if not nearest then break end
   if not chainLightning then
    s.effects[#s.effects+1]={x=(x+nearest.x)/2,y=nearest.y-45,w=math.max(8,abs(nearest.x-x)),h=5,life=.18,color=cast.color}
   end
   selected[#selected+1]=nearest;receivers[receiver(nearest)]=true;x,y=nearest.x,nearest.y
  end
 end
 if waveLeft then
  s.effects[#s.effects+1]={x=waveLeft,y=cast.y,w=waveRight-waveLeft,life=.19,color=cast.color,groundWave=true,phase=cast.impactEvent}
 elseif not (chainLightning or stakeLightning) and (cast.interval==.3 or cast.travelSpeed or cast.element=='electro') then
  s.effects[#s.effects+1]={x=cast.radial and cast.x or cast.x+cast.dir*cast.range/2,y=cast.y-40,w=cast.radial and cast.range*2 or cast.range,h=60,life=.3,color=cast.color}
 end
 for _,e in ipairs(selected) do
  cast.contactHits=cast.contactHits or {};cast.contactTargets=cast.contactTargets or 0
  local id=receiver(e).id
  local count=cast.contactHits[id] or 0
  local allowed=not cast.contactBudget or (count<cast.contactBudget and (count>0 or cast.contactTargets<cast.limit))
  if allowed and hit(s,cast,e,cast.mult,cast.color,cast.element) then
   if chainLightning or stakeLightning then
    local y=e.y-35
    s.effects[#s.effects+1]={x=lightningX,y=lightningY,endX=e.x,endY=y,life=.16,color=cast.color}
   elseif seedTrail then
    s.effects[#s.effects+1]={x=cast.x,y=cast.y-42,endX=e.x,endY=e.y-31,life=.20,color=cast.color,seedTrail=true}
   end
   if count==0 then cast.contactTargets=cast.contactTargets+1 end;cast.contactHits[id]=count+1
   touched=true
   if cast.pull and e.hp>0 and not e.boss then
    local center=cast.pullCenter or cast.x
    local nextX=e.x+clamp(center-e.x,-cast.pull,cast.pull)
    if e.patrolMin then nextX=clamp(nextX,e.patrolMin,e.patrolMax) end
    if not C.pathClear or C.pathClear(s,e,nextX,e.y) then e.x=nextX;e.home=nextX end
   end
   if cast.armorBreak then e.armorBreak=cast.armorBreak end
   if cast.physicalBreak then e.physicalBreak=cast.physicalBreak end
   if cast.chill then e.chill=cast.chill end
   cast.rooted=cast.rooted or {}
   if cast.root and e.hp>0 and (not cast.rootOnce or not cast.rooted[e.id]) then
    if e.boss then e.slow=cast.root else e.root=cast.root end
    cast.rooted[e.id]=true
   end
   if cast.push and not e.boss then
    local nextX=clamp(e.x+cast.dir*cast.push,20,(s.worldwidth or 2880)-20)
    e.x=e.patrolMin and clamp(nextX,e.patrolMin,e.patrolMax) or nextX
    e.home=e.x
   end
  end
  if chainLightning then lightningX,lightningY=e.x,e.y-35 end
 end
 if C.onFieldAttackPulse then C.onFieldAttackPulse(s,cast,selected,waveLeft,waveRight) end
 if cast.travelSpeed then cast.lastPulseX=cast.x end
 if touched and not cast.gained then
  local actor=s.actors[cast.id]
  local bonus=cast.gain>0 and actor and actor.artifactGaugeBonus or 0
  s.gauge=min(100,s.gauge+cast.gain+bonus);cast.gained=true
 end
end
C.resolveCast=pulse
function C.playerAttackAt(s,a)
 if not s.auto and a.id==s.active and s.growthAIActor~=a.id then return s.macroInputAt or s.t end
end
function C.attack(s,a,key)
 if a.id==2 and C.companionAttack then
  local first=#s.pending+1
  local handled=C.companionAttack(s,a,key)
  if handled~=nil then
   if handled then
    for index=first,#s.pending do
     local pending=s.pending[index]
     if pending.id==a.id then
      if s.growthAIActor==a.id then pending.growthAI=true end
      pending.playerInputAt=C.playerAttackAt(s,a)
     end
    end
   end
   return handled
  end
 end
 if C.canAttack and not C.canAttack(s) then return false end
 if s.paused or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 or #s.pending>=64 then return false end
 local definition=a.id==1 and C.skillDefinitions and C.skillDefinitions[key]
 if not definition and key~='normal' and key~='skill1' and key~='skill2' and not (a.id==2 and (key=='skill3' or key=='skill4')) then return false end
 local delay,interval=0,key=='skill2' and .3 or .12
 local range,limit,mult,hits,ct,lock,color=125,2,1.1,2,.6,.35,'#fff1a2'
 if a.id==2 then range=360;mult=.95;ct=0;lock=.7;color='#ffba72';delay=.15;interval=.08 end
 if key=='skill1' then range=a.id==1 and 170 or 400;limit=4;mult=a.id==1 and 1.2 or 1.7;hits=a.id==1 and 3 or 4;ct=a.id==1 and 2 or 7;lock=.65;color=a.id==1 and '#8ffff0' or '#ff9c67' end
 if key=='skill2' then range=380;limit=8;mult=a.id==1 and .85 or 1.05;hits=a.id==1 and 8 or 12;ct=a.id==1 and 8 or 24;lock=.8;color=a.id==1 and '#82f5c8' or '#ff856d' end
 if a.id==2 and key=='skill2' then delay=.4;interval=.3 end
 if key=='skill3' then range=160;limit=6;mult=2;hits=3;ct=14;lock=.45;delay=3.8;interval=.1 end
 if key=='skill4' then range=360;limit=3;mult=1.25;hits=3;ct=9;lock=.5 end
 if key=='normal' and a.id==1 and a.light>0 then mult=1.9;hits=4;limit=5 end
 if definition then range=definition.range;limit=definition.targets;mult=definition.mult;hits=definition.hits;ct=definition.ct;lock=definition.lock;interval=definition.interval;color=definition.color;delay=definition.delay or 0 end
 local ts=targets(s,a,range,limit)
 a.cd[key]=ct;a.lock=lock;a.walk=0
 if key=='SK10' then
  s.effects[#s.effects+1]={x=a.x,y=a.y-45,w=20,h=20,life=.2,color=color}
 elseif key~='SK12' and key~='SK07' and key~='SK15' then
  s.effects[#s.effects+1]={x=a.x+a.dir*range/2,y=a.y-40,w=range,h=60,life=.3,color=color}
 end
 local cast={id=a.id,startedAt=s.t,atk=a.atk,elementBonus=a.elementBonus,x=a.x,y=a.y,dir=a.dir,range=range,limit=limit,mult=mult,color=color,
  growthAI=s.growthAIActor==a.id or nil,playerInputAt=C.playerAttackAt(s,a),
  key=key,isNormal=key=='normal',normalBonus=a.normalBonus,skillBonus=a.skillBonus,troupe4=a.troupe4,critRate=a.critRate,critDamageBonus=a.critDamageBonus,
  element=key=='normal' and 'physical' or (a.id==1 and 'anemo' or 'pyro'),
  remaining=hits,interval=interval,gain=key=='normal' and 2 or 5}
 if a.id==1 and key=='skill2' then
  cast.pull=C.tornadoPull
  cast.pullCenter=clamp(a.x+a.dir*range/2,20,(s.worldwidth or 2880)-20)
 end
 if key=='normal' and a.id==1 and a.light>0 then cast.lightNormal=true;cast.suppressAura=true end
 if definition then
  cast.element=definition.element;cast.push=definition.push;cast.travelSpeed=definition.travelSpeed;cast.groundOnly=definition.groundOnly;cast.chain=definition.chain;cast.root=definition.root;cast.vertical=definition.vertical;cast.homing=definition.homing;cast.upward=definition.upward
  cast.groundWave=definition.groundWave
  if definition.dash then a.dash=definition.dash;a.dashDir=a.dir;cast.follow=true end
  if definition.follow then cast.follow=true end
  cast.trail=definition.trail
  cast.scatter=definition.scatter;cast.chill=definition.chill;cast.rootOnce=definition.rootOnce
  cast.damageElements=definition.damageElements;cast.applicationElement=definition.applicationElement;cast.farthest=definition.farthest
  cast.pull=definition.pull;cast.armorBreak=definition.armorBreak;cast.contactBudget=definition.contactBudget;cast.gliding=definition.gliding
  cast.coldBonus=definition.coldBonus
  cast.sharedProjectiles=definition.sharedProjectiles;cast.channel=definition.channel
  cast.special=definition.special;cast.suppressAura=definition.suppressAura;cast.partnerRequired=definition.partnerRequired
  cast.physicalBreak=definition.physicalBreak
  if definition.radial then cast.radial=true end
  if definition.offset then cast.x=clamp(a.x+a.dir*definition.offset,20,(s.worldwidth or 2880)-20) end
  if definition.groundPlacement then C.placeGroundCast(s,cast) end
  if definition.placed then
   cast.placed=key;cast.radial=true
   for i=#s.pending,1,-1 do if s.pending[i].placed==key and s.pending[i].id==a.id then table.remove(s.pending,i) end end
  end
 end
 if key=='skill3' then
  cast.x=clamp(a.x+a.dir*150,20,(s.worldwidth or 2880)-20);cast.radial=true
  s.decoys=s.decoys or {};s.decoys[#s.decoys+1]={x=cast.x,y=a.y,life=4,owner=a.id,id=-1,inv=0}
 elseif key=='skill4' then a.inv=max(a.inv,.45);a.vy=-360;a.ground=false;a.leap=.45 end
 if C.onCastBuilt then C.onCastBuilt(s,a,cast,delay,lock,definition) end
 if cast.travelSpeed then cast.lastPulseX=cast.x end
 cast.next=s.t+(delay>0 and delay or interval)
 if delay==0 then pulse(s,cast);cast.remaining=cast.remaining-1 end
 if cast.remaining>0 then s.pending[#s.pending+1]=cast end
 event(s,'cast:'..key,a.id,0,#ts)
 return true
end
local function reportMotion(s,a,kind,at,dir)
 if C.onPlayerMotion and at and not s.paused and a.hp>0 then C.onPlayerMotion(s,a,kind,at,dir) end
end
function C.action(s,key)
 if key=='hold_ally_fire' then s.holdAllyFire=not s.holdAllyFire;return end
 local a=s.actors[s.active]
 if key=='swap' and s.swap<=0 and s.actors[3-s.active].hp>0 then
  local b=s.actors[3-s.active];b.x,a.x=a.x,a.x-35*a.dir;b.y=a.y;b.vy=a.vy;b.ground=a.ground
  s.active=3-s.active;s.swap=.8;event(s,'swap',s.active)
  if C.noteGrowth then C.noteGrowth(s,'manual-swap') end
 elseif key=='light' and a.id==1 and s.gauge>=60 and (a.cd.light or 0)<=0 then
  s.gauge=s.gauge-60;a.light=12;a.cd.light=60;event(s,'light',1)
 elseif key=='dodge' and (a.cd.dodge or 0)<=0 then
  a.inv=.45;a.cd.dodge=2;a.x=clamp(a.x+a.dir*100,20,(s.worldwidth or 2880)-20);a.lock=0
  a.dodgeInvUntil=s.t+.45
  reportMotion(s,a,'dodge',C.playerAttackAt(s,a))
 elseif key=='jump' then a.buffer=.1;a.jumpInputAt=C.playerAttackAt(s,a)
 elseif key=='drop' then
  if not a.ground or a.y~=480 then
   a.drop=.25
   if a.ground then a.ground=false;a.y=a.y+3 end
   reportMotion(s,a,'drop',C.playerAttackAt(s,a))
  end
 elseif key=='auto' then s.auto=not s.auto
 elseif key=='pause' then s.paused=not s.paused
 elseif key=='normal' or key=='skill1' or key=='skill2' or key=='skill3' or key=='skill4' then C.attack(s,a,key) end
end
local function physics(s,a,dt,move,held,manual)
 if C.moveActorOverride and C.moveActorOverride(s,a,dt,move,held) then
  if manual and move~=0 and a.walk==move then reportMotion(s,a,'walk',s.t,a.dir) end
  a.runDistance=nil;return
 end
 local oldy=a.y
 local wasGrounded,previousMove=a.ground,a.walk
 if a.channel then move=0;a.buffer=0 end
 if (a.dash or 0)>0 then
  local nx=clamp(a.x+a.dashDir*650*dt,20,(s.worldwidth or 2880)-20)
  local supported=false
  for _,p in ipairs(s.platforms) do if abs(p.y-a.y)<5 and nx>=p.x and nx<=p.x+p.w then supported=true end end
  local blocked=false
  for _,w in ipairs(s.solids or {}) do if nx+12>w.x and nx-12<w.x+w.w and a.y>w.y and a.y-50<w.y+w.h then blocked=true end end
  if supported and not blocked then a.x=nx else a.dash=0 end
  a.dash=max(0,(a.dash or 0)-dt);move=0
 end
 local speed=210*((a.haste or 0)>0 and 1.25 or 1)*((a.iceRun or 0)>0 and a.ground and 1.6 or 1)
 if C.fieldMoveFactor then speed=speed*C.fieldMoveFactor(s,a) end
 a.walk=move
 local nx=clamp(a.x+move*speed*dt,20,(s.worldwidth or 2880)-20)
 for _,w in ipairs(s.solids or {}) do
  if a.y>w.y and a.y-50<w.y+w.h then
   if a.x<=w.x+w.w/2 and nx+12>w.x and a.x-12<w.x+w.w then nx=math.min(nx,w.x-12)
   elseif a.x>w.x+w.w/2 and nx-12<w.x+w.w and a.x+12>w.x then nx=math.max(nx,w.x+w.w+12) end
  end
 end
 local dx=nx-a.x
 a.x=nx
 if move~=0 then
  a.dir=move>0 and 1 or -1
  if manual then reportMotion(s,a,'walk',s.t,a.dir) end
 end
 a.coyote=a.ground and .08 or max(0,a.coyote-dt)
 if a.buffer>0 and a.coyote>0 then
  a.vy=-650;a.buffer=0;a.ground=false;a.coyote=0
  if manual then reportMotion(s,a,'jump',a.jumpInputAt) end
 end
 a.buffer=max(0,a.buffer-dt);a.drop=max(0,a.drop-dt)
 if a.buffer==0 then a.jumpInputAt=nil end
 if not held and a.vy < -210 then a.vy=-210 end
 local gravity=C.fieldGravityFactor and C.fieldGravityFactor(s,a) or 1
 a.vy=a.vy+1300*gravity*dt
 if (a.glide or 0)>0 then a.vy=min(a.vy,90);a.glide=max(0,a.glide-dt) end
 a.y=a.y+a.vy*dt;a.ground=false
 if a.vy>=0 then for _,p in ipairs(s.platforms) do
  if (p.y==480 or a.drop<=0) and a.x>=p.x and a.x<=p.x+p.w and oldy<=p.y and a.y>=p.y then a.y=p.y;a.vy=0;a.ground=true;a.glide=0;break end
 end end
 -- The run art advances by actual ground travel, including when slowed by a wall.
 if a.id==1 then
  a.runDistance=wasGrounded and a.ground and move~=0 and move==previousMove and ((a.runDistance or 0)+abs(dx)) or 0
 end
end
function C.moveOrdinaryFlier(e,dt)
 local f=e.flight
 e.flightTime=(e.flightTime+dt)%f.period
 local lift=f.lift+f.rise*(1-math.cos(e.flightTime/f.period*2*math.pi))/2
 e.y=e.flightHome-lift
 e.flying=true
end

function C.advanceActorTimers(a,dt)
  a.lock=max(0,a.lock-dt);a.inv=max(0,a.inv-dt);a.light=max(0,a.light-dt);a.leap=max(0,(a.leap or 0)-dt)
  for k,v in pairs(a.cd) do a.cd[k]=max(0,v-dt) end
end

function C.checkPartyDefeat(s)
 if s.actors[s.active].hp<=0 then
  if s.actors[3-s.active].hp>0 then s.active=3-s.active
  elseif not (C.handlesPartyWipe and C.handlesPartyWipe(s)) then
   for _,a in ipairs(s.actors) do a.hp=a.maxhp;a.x=140+a.id*60;a.y=480;a.inv=3 end
   s.returns=s.returns+1;event(s,'return')
  end
 end
end

function C.advanceCombatVisuals(s,dt)
 for _,list in ipairs({s.numbers,s.effects}) do for i=#list,1,-1 do list[i].life=list[i].life-dt;if list[i].life<=0 then table.remove(list,i) end end end
end

function C.advanceEnemies(s,dt,actors,decoys,owners)
 actors,decoys=actors or s.actors,decoys or s.decoys
 for _,e in ipairs(s.enemies) do
  e.root=max(0,(e.root or 0)-dt);e.slow=max(0,(e.slow or 0)-dt);e.chill=max(0,(e.chill or 0)-dt);e.armorBreak=max(0,(e.armorBreak or 0)-dt);e.physicalBreak=max(0,(e.physicalBreak or 0)-dt)
  local rate=C.enemyRate(e)
  if e.hp<=0 then e.respawn=e.respawn-dt;if e.respawn<=0 then e.hp=e.maxhp;e.x=e.home;e.cd=2;e.coopHits=nil end
  elseif not e.custom then
   if e.flight then C.moveOrdinaryFlier(e,e.root<=0 and dt*rate or 0) end
   e.cd=e.cd-dt*rate
   local near=nil;local attracted=false
   for _,a in ipairs(actors) do if a.hp>0 and abs(e.x-a.x)<60 and abs(e.y-a.y)<45 then near=a;break end end
   if not e.boss then for _,d in ipairs(decoys) do
    if abs(e.x-d.x)<300 and abs(e.y-d.y)<45 then
     if e.root<=0 then e.x=e.x+clamp(d.x-e.x,-70*dt*rate,70*dt*rate) end;attracted=true
     near=abs(e.x-d.x)<60 and d or nil;break
    end
   end end
   if near and e.cd<=0 and e.warning<=0 then e.warning=.65 end
   if e.warning>0 then
    e.warning=e.warning-dt*rate
    if e.warning<=0 then
     if near and near.owner then event(owners and owners[near] or s,'decoy_hit',near.owner,e.id,0)
     elseif near then C.damageActor(owners and owners[near] or s,near,e.contactDamage or 14,e,true,true) end
    e.cd=e.contactCooldown or 3.2
    end
   end
   if near==nil and not attracted and e.root<=0 then
    if e.pursuit then
     local target,distance=e.home,e.pursuit.range
     for _,a in ipairs(actors) do
      local dx=abs(e.x-a.x)
      if a.hp>0 and dx<distance and abs(e.y-a.y)<45 and abs(e.home-a.x)<e.pursuit.leash then
       target,distance=a.x,dx
      end
     end
     local speed=e.pursuit.speed*dt*rate
     e.x=e.x+clamp(target-e.x,-speed,speed)
    else
     e.motionTime=(e.motionTime or 0)+dt*rate;e.x=e.home+math.sin(e.motionTime*1.2+e.id)*18
    end
   end
   if e.patrolMin then e.x=clamp(e.x,e.patrolMin,e.patrolMax) end
  end
 end
end

function C.step(s,dt,input)
 if s.paused then return end
 dt=clamp(dt,0,1/30);input=input or {};s.t=s.t+dt;s.swap=max(0,s.swap-dt)
 s.decoys=s.decoys or {}
 for i=#s.decoys,1,-1 do local d=s.decoys[i];d.life=d.life-dt;if d.life<=0 or s.actors[d.owner].hp<=0 then table.remove(s.decoys,i) end end
 local pending=s.pending
 for i=#pending,1,-1 do
  local cast=pending[i]
  if cast.travelSpeed then
   local x=cast.x+cast.dir*cast.travelSpeed*dt
   if cast.groundWave then
    local left,right=groundWaveSpan(s,cast)
    if left then cast.x=clamp(x,left,right) end
   else cast.x=x end
  end
  if s.actors[cast.id].hp<=0 or (cast.gliding and s.actors[cast.id].ground) then table.remove(pending,i)
  elseif s.t+1e-8>=cast.next then
   C.resolveCast(s,cast)
   if s.pending~=pending then break end
   cast.remaining=cast.remaining-1;cast.next=cast.next+cast.interval
   if cast.remaining<=0 then if cast.channel then s.actors[cast.id].channel=nil end;table.remove(pending,i) end
  end
 end
 for _,a in ipairs(s.actors) do
  C.advanceActorTimers(a,dt)
  if a.hp>0 then
   local manual=a.id==s.active and not s.auto
   local move=manual and ((input.right and 1 or 0)-(input.left and 1 or 0)) or 0
   local nearest,dist=nil,10000
   if not manual then
    for _,e in ipairs(s.enemies) do
     local d=abs(e.x-a.x)+abs(e.y-a.y)*2
     if d<dist and not e.noAutoTarget and C.canTargetEnemy(e) and (not e.acceptsAutoTarget or e.acceptsAutoTarget(s,a)) then
      nearest,dist=e,d
     end
    end
    if s.holdAllyFire and a.id~=s.active then nearest=nil end
    local leader=s.actors[s.active]
    local avoid=C.aiAvoidTarget and C.aiAvoidTarget(s,a)
    local climb
    if a.id==2 and C.companionClimbX then
     climb=C.companionClimbX(s,a,not avoid and (nearest and dist<450 and nearest or leader))
    end
    if avoid then
     move=abs(avoid-a.x)>6 and (avoid>a.x and 1 or -1) or 0
    elseif climb then
     move=abs(climb-a.x)>12 and (climb>a.x and 1 or -1) or 0
    elseif nearest and dist<450 then
     a.dir=nearest.x>=a.x and 1 or -1
     if abs(nearest.x-a.x)>(a.id==1 and 85 or 220) then move=a.dir end
     if nearest.y<a.y-60 and a.ground then a.buffer=.1 end
     local skillElement=a.id==1 and 'anemo' or 'pyro'
     s.growthAIActor=not s.auto and a.id~=s.active and a.id or nil
     if a.id==2 and C.companionAI and C.companionAI(s,a,nearest) then
     elseif a.id==2 and nearest.immune~=skillElement then
      local danger=false
      for _,e in ipairs(s.enemies) do
       if e.hp>0 and abs(e.x-a.x)<160 and (e.warning or 0)>0 then danger=true end
      end
      local b=s.encounter
      if b and b.phase=='clap_warning' and abs(a.x-b.target)<125 then danger=true end
      if not (danger and C.attack(s,a,'skill4')) and not C.attack(s,a,'skill2') and not C.attack(s,a,'skill3') and not C.attack(s,a,'skill1') then C.attack(s,a,'normal') end
     elseif nearest.immune==skillElement or not C.attack(s,a,'skill1') then C.attack(s,a,'normal') end
     s.growthAIActor=nil
    elseif abs(leader.x-a.x)>75 then move=leader.x>a.x and 1 or -1 end
    if abs(leader.x-a.x)>650 or abs(leader.y-a.y)>200 then a.x=leader.x-45;a.y=leader.y;a.vy=0 end
   elseif input.attack then C.attack(s,a,'normal') end
   physics(s,a,dt,move,a.leap>0 or (manual and input.jump or not manual),manual)
  end
 end
 if not s.coop then C.advanceEnemies(s,dt) end
 C.checkPartyDefeat(s)
 C.advanceCombatVisuals(s,dt)
 local player=s.actors[s.active];s.camera=clamp(player.x-400,0,math.max(0,(s.worldwidth or 2880)-960))
end
function C.enemyHeadY(e)
 local layout=not e.custom and C.enemyArtLayout and C.enemyArtLayout[e.art]
 return e.y-(e.drawHeight or (layout and (layout.height+layout.hover) or 40))
end

local function drawLightning(add,e,camera)
 local dx,dy=e.endX-e.x,e.endY-e.y
 local x,y=e.x,e.y
 for index=1,4 do
  local t=index/4
  local offset=index<4 and (index==2 and -6 or 6) or 0
  local nextX,nextY=e.x+dx*t,e.y+dy*t+offset
  local rotation=math.atan(nextY-y,nextX-x)
  local length=math.sqrt((nextX-x)^2+(nextY-y)^2)
  add({kind='rect',x=x-camera,y=y-2,w=length+2,h=5,rotation=rotation,color=e.color,opacity=e.life/.16})
  add({kind='rect',x=x-camera,y=y-1,w=length+1,h=2,rotation=rotation,color='#f8efff',opacity=e.life/.16})
  x,y=nextX,nextY
 end
end

local function drawGroundWave(add,e,camera)
 local markers=math.ceil(e.w/23)
 for i=1,markers do
  local x=e.x+(i-1)*23
  local height=4+((e.phase+i)%3)*3
  local width=min(18,e.x+e.w-x)
  add({kind='rect',x=x-camera,y=e.y-height,w=width,h=height,color=e.color,opacity=e.life/.19})
 end
end

local function drawSeedTrail(add,e,camera)
 local opacity=e.life/.20
 for i=1,4 do
  local t=.4+i*.15
  local x=e.x+(e.endX-e.x)*t
  local y=e.y+(e.endY-e.y)*t-34*math.sin(math.pi*t)
  local size=2+i
  add({kind='rect',x=x-camera-size/2,y=y-size/2,w=size,h=size,color=e.color,opacity=opacity})
 end
end

function C.frame(s,mode,profile)
 local draws={};local visible=0
 local artFrame={draws=draws}
 if (s.coop or (s.story and s.story.active)) and s.packRectArt and mode=='rect' then
  artFrame.rectIndex,artFrame.rectBatches={},{}
 end
 local assets=(profile and C.variants and C.variants[profile]) or C.assets
 local function add(v)
  local asset=v.kind=='sprite' and assets and assets[v.asset]
  if asset then v.w=v.h*asset.box[3]/asset.box[4] end
  if asset and mode=='rect' then
   local sx,sy=v.w/asset.width,v.h/asset.height
   for _,r in ipairs(asset.runs) do
    local rx=v.flip and asset.width-r[1]-r[3] or r[1]
    draws[#draws+1]={kind='rect',x=v.x-v.w/2+rx*sx,y=v.y-v.h+r[2]*sy,w=r[3]*sx+.05,h=r[4]*sy+.05,color=r[5]}
   end
  else draws[#draws+1]=v end
 end
 local function rect(x,y,w,h,c) add({kind='rect',x=floor(x),y=floor(y),w=w,h=h,color=c}) end
 -- Background and terrain visuals belong to the host renderer (3D in production).
 -- Only collision platform data is owned by Lua; no scenery draw commands here.
 local wildlife=s.storySwimming and s.storyWildlife
 if wildlife then
  for _,animal in ipairs(wildlife) do
   local layout=C.enemyArtLayout[animal.art]
   local x=animal.x-s.camera
   local art=C.enemyIdleArt[animal.art]
   local width=layout.height*art.box[3]/art.box[4]
   local anchor=art.anchorX or .5
   local left=x-width*(animal.flip and (1-anchor) or anchor)
   if left+width>0 and left<960 then
    local y=animal.y+3*math.sin(s.t*1.4)
    C.drawFieldDisplayArt(artFrame,art,x,y,layout.height,mode,profile,animal.flip)
   end
  end
 end
 for _,d in ipairs(s.decoys or {}) do
  rect(d.x-s.camera-15,d.y-30,30,30,'#d95a4c')
  rect(d.x-s.camera-12,d.y-50,8,23,'#e98b71');rect(d.x-s.camera+4,d.y-50,8,23,'#e98b71')
  add({kind='text',x=d.x-s.camera,y=d.y-57,text=string.format('%.1f',d.life),color='#fff0c4',size=14})
 end
 for _,e in ipairs(s.enemies) do if C.canTargetEnemy(e) and e.x>s.camera-40 and e.x<s.camera+1000 then
  visible=visible+1
  if not e.custom and not e.storyDrawn then
   if C.enemyIdleArt and C.enemyIdleArt[e.art] then C.drawEnemyIdleArt(artFrame,s,e,mode,profile)
   else add({kind='sprite',asset=e.kind==1 and 5 or 7,x=e.x-s.camera,y=e.y,w=e.boss and 144 or 48,h=e.boss and 120 or 40,flip=false}) end
  end
  local headY=C.enemyHeadY(e)
  if e.hp<e.maxhp and not e.fieldBoss then rect(e.x-s.camera-20,headY-9,40,4,'#45645d');rect(e.x-s.camera-20,headY-9,40*e.hp/e.maxhp,4,'#ffcc7c') end
  if e.warning>0 then add({kind='text',x=e.x-s.camera,y=headY-23,text='!',color='#e54b35',size=26}) end
 end end
 if s.coop then C.drawCoopPeers(s,artFrame,mode,profile) end
 for _,a in ipairs(s.actors) do
  if a.hp>0 and (not s.toyDive or a.id==1) and (not (s.surfRound or s.springRun) or a.id==s.active) then
   local asset=a.id==1 and (a.walk~=0 and 2 or 1) or (a.lock>0 and 4 or 3)
   local amberArt=asset==3 and C.amberIdleArt or asset==4 and C.amberBowArt
   local companionArt=a.id==2 and C.companionArt and C.companionArt[s.companion]
   if asset==1 and C.travelerIdleArt then
    C.drawTravelerIdleArt(artFrame,s,a,mode,profile)
   elseif asset==2 and C.travelerRunArt then
    C.drawTravelerRunArt(artFrame,s,a,mode,profile)
   elseif amberArt and (s.companion or 'amber')=='amber' then
    C.drawAmberArt(artFrame,s,a,mode,profile,amberArt)
   elseif not companionArt then
    -- The companion frame wrapper adds its custom art after the base frame.
    add({kind='sprite',asset=asset,x=a.x-s.camera,y=a.y,w=70,h=88,flip=a.dir<0,glow=a.light>0})
   end
   if a.id==s.active then add({kind='text',x=a.x-s.camera,y=a.y-116,text='▼',color='#fff8cc',size=17}) end
  end
 end
 for _,e in ipairs(s.effects) do
  if e.groundWave then drawGroundWave(add,e,s.camera)
  elseif e.seedTrail then drawSeedTrail(add,e,s.camera)
  elseif e.endX then drawLightning(add,e,s.camera)
  else add({kind='effect',x=e.x-s.camera,y=e.y,w=e.w,h=e.h,color=e.color,alpha=e.life/.3}) end
 end
 for _,n in ipairs(s.numbers) do add({kind='text',x=n.x-s.camera,y=n.y-(.8-n.life)*35,text=n.text,color=n.color,size=19}) end
 return {draws=draws,rectBatches=artFrame.rectBatches,camera=s.camera,platforms=s.platforms,t=s.t,active=s.active,gauge=s.gauge,actors=s.actors,hits=s.hits,kills=s.kills,mora=s.mora,damage=s.damage,returns=s.returns,visible=visible,total=#s.enemies,commands=#draws,numbers=#s.numbers,auto=s.auto,holdAllyFire=s.holdAllyFire,paused=s.paused,events=s.events}
end
return C
