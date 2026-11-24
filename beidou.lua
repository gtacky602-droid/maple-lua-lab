return function(C)
 local attack,ai,mitigate,absorb,step,action,frame,prerequisite=C.companionAttack,C.companionAI,C.mitigateDamage,C.absorbDamage,C.step,C.action,C.frame,C.skillPrerequisite
 local defs={normal={mult=1.15,hits=2,ct=0,lock=.85,targets=3},skill1={mult=2.6,hits=5,ct=8,lock=.85,targets=5},skill2={mult=1.5,hits=4,ct=7,lock=.75,targets=6},skill3={ct=15,lock=.35},skill4={mult=1.1,hits=8,ct=22,lock=.55,targets=5,delay=.8,interval=1.2}}
 local function cast(s,a,key)
  local d=defs[key]
  local c={id=2,key='beidou:'..key,atk=a.atk,elementBonus=a.elementBonus,normalBonus=a.normalBonus,skillBonus=a.skillBonus,troupe4=a.troupe4,critRate=a.critRate,critDamageBonus=a.critDamageBonus,isNormal=key=='normal',x=a.x,y=a.y,dir=a.dir,range=key=='skill4' and 220 or 180,limit=d.targets,mult=d.mult,color='#bc9de6',element=key=='normal' and 'physical' or 'electro',remaining=d.hits,interval=d.interval or .08,next=s.t+(d.delay or .15),gain=key=='normal' and 2 or 5}
  if key=='skill4' then c.follow=true;c.radial=true;c.placed='beidou:shield' end
  c.startedAt=s.t
  return c
 end
 function C.companionAttack(s,a,key)
  if s.companion~='beidou' then return attack(s,a,key) end
  local d=defs[key]
  if not d or s.paused or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 or #s.pending>=64 or (C.canAttack and not C.canAttack(s)) then return false end
  a.cd[key]=d.ct;a.lock=d.lock
  if key=='skill1' then a.counterUntil=s.t+.85;a.counterCast=cast(s,a,key);return true end
  if key=='skill3' then a.guardUntil=s.t+2;return true end
  if key=='skill4' then
   a.thunderShield={hp=math.floor(a.maxhp*.18),untilTime=s.t+10};a.waterShield=nil
   for i=#s.pending,1,-1 do if s.pending[i].placed=='beidou:shield' then table.remove(s.pending,i) end end
  end
  s.pending[#s.pending+1]=cast(s,a,key);return true
 end
 function C.mitigateDamage(s,a,damage,source,blockable,telegraphed)
  damage=mitigate(s,a,damage,source,blockable)
  if a.id~=2 or s.companion~='beidou' then return damage end
  if damage>0 and telegraphed and a.counterCast and s.t<=(a.counterUntil or 0) and #s.pending<64 then
   local c=a.counterCast;c.x=a.x;c.y=a.y;c.dir=a.dir;c.next=s.t+.15
   s.pending[#s.pending+1]=c;a.counterCast=nil;a.counterUntil=0;return 0
  end
  if s.t<(a.guardUntil or 0) then damage=math.floor(damage*.5) end
  return damage
 end
 function C.absorbDamage(s,a,damage,source)
  local shield=a.thunderShield
  if shield and shield.untilTime>s.t and s.companion=='beidou' then
   local n=math.min(shield.hp,damage);shield.hp=shield.hp-n
   if shield.hp<=0 then a.thunderShield=nil end
   return damage-n
  end
  return absorb(s,a,damage,source)
 end
 function C.companionAI(s,a,nearest)
  if s.companion~='beidou' then return ai(s,a,nearest) end
  local impact=C.nextFieldImpact and C.nextFieldImpact(s,a)
  if impact and (a.guardUntil or 0)<=s.t+impact and (a.counterUntil or 0)<=s.t+impact then
   if impact<=.8 and (C.attack(s,a,'skill1') or C.attack(s,a,'skill3')) then return true end
   if impact<=1.65 and math.min(a.cd.skill1 or 0,a.cd.skill3 or 0)<=impact then return true end
  end
  local danger=((nearest.warning or 0)>0 and math.abs(nearest.x-a.x)<170) or (nearest.strike and nearest.strike.left<=.8 and math.abs(nearest.strike.x-a.x)<nearest.strike.radius) or (nearest.phase=='clap_warning' and nearest.timer<=.8 and math.abs((nearest.target or 0)-a.x)<125)
  if danger and (C.attack(s,a,'skill1') or C.attack(s,a,'skill3')) then return true end
  for _,key in ipairs({'skill4','skill2','normal'}) do if C.attack(s,a,key) then break end end
  return true
 end
 local function clear(s) local a=s.actors[2];a.counterCast=nil;a.counterUntil=0;a.guardUntil=0;a.thunderShield=nil end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;local companion=s.companion;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or companion~=s.companion or key=='boss_anemo' then clear(s) end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input);local a=s.actors[2]
  if a.hp<=0 or returns~=s.returns then clear(s) end
  if (a.counterUntil or 0)<s.t then a.counterCast=nil end
  if a.thunderShield and a.thunderShield.untilTime<=s.t then a.thunderShield=nil end
 end
 C.skillDefinitions.SK57={range=400,targets=3,mult=4.5,hits=6,ct=30,lock=1,interval=.116,delay=.12,color='#d6b8fa',element='star',damageElements={'cryo','electro'},special=true,suppressAura=true,partnerRequired='electro'}
 function C.skillPrerequisite(s,a,key)
  if key=='SK57' and ((s.companion~='beidou' and s.companion~='mitya') or s.actors[2].hp<=0) then return false,'北辰の一閃には生存している雷仲間の同行が必要です。' end
  return prerequisite(s,a,key)
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile);local a=s.actors[2]
  if s.companion=='beidou' then
   f.companion.name='北斗（仮表示）';f.companion.skills={'通常斬り','反撃','雷連斬','防御構え','雷の盾'}
   f.companion.counterSeconds=math.max(0,(a.counterUntil or 0)-s.t);f.companion.guardSeconds=math.max(0,(a.guardUntil or 0)-s.t);f.companion.shieldHP=a.thunderShield and a.thunderShield.hp or 0
   if a.hp>0 and (f.companion.counterSeconds>0 or f.companion.guardSeconds>0 or f.companion.shieldHP>0) then
    f.draws[#f.draws+1]={kind='rect',x=a.x-s.camera-25,y=a.y-85,w=5,h=85,color='#bc9de6'}
   end
  end
  f.commands=#f.draws;return f
 end
end
