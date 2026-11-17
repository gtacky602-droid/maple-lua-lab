return function(C)
 local attack,ai,bonus,action,step,frame=C.companionAttack,C.companionAI,C.damageBonus,C.action,C.step,C.frame
 local defs={normal={mult=.9,hits=2,ct=0,lock=.75,targets=3},skill1={mult=.9,hits=10,ct=16,lock=.45,targets=6,delay=.5,interval=1,duration=10},skill2={mult=1.35,hits=4,ct=8,lock=.55,targets=5},skill3={ct=18,lock=.35},skill4={mult=1.4,hits=10,ct=24,lock=.65,targets=8,delay=.4,interval=.3,duration=3.5}}
 local function burning(s,a)
  for _,e in ipairs(s.enemies) do if C.canTargetEnemy(e) and e.burning and e.burning.remaining>0 and math.abs(e.x-a.x)<360 and math.abs(e.y-a.y)<160 then return true end end
  return false
 end
 function C.companionAttack(s,a,key)
  if s.companion~='emilie' then return attack(s,a,key) end
  local d=defs[key]
  if not d or s.paused or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 or #s.pending>=64 or (C.canAttack and not C.canAttack(s)) then return false end
  if key=='skill3' and not burning(s,a) then s.skillNotice='燃焼強化には近くで燃焼している敵が必要です。';return false end
  a.cd[key]=d.ct;a.lock=d.lock;s.skillNotice=nil
  if key=='skill3' then a.burnBoostUntil=s.t+8;return true end
  local cast={id=2,key='emilie:'..key,x=a.x,y=a.y,dir=a.dir,range=key=='normal' and 180 or 360,vertical=160,limit=d.targets,mult=d.mult,remaining=d.hits,interval=d.interval or .08,next=s.t+(d.delay or .15),gain=key=='normal' and 2 or 5,element=key=='normal' and 'physical' or 'dendro',isNormal=key=='normal',color='#badf91'}
  for _,k in ipairs({'atk','elementBonus','normalBonus','skillBonus','troupe4','critRate','critDamageBonus'}) do cast[k]=a[k] end
  if d.duration then
   cast.x=math.max(20,math.min((s.worldwidth or 2880)-20,a.x+a.dir*120));cast.radial=true;cast.placed=cast.key
   for i=#s.pending,1,-1 do if s.pending[i].placed==cast.key then table.remove(s.pending,i) end end
   s.perfume=s.perfume or {};s.perfume[key]={x=cast.x,y=cast.y,expires=s.t+d.duration}
  end
  cast.startedAt=s.t;s.pending[#s.pending+1]=cast;return true
 end
 function C.damageBonus(s,cast,element,e)
  local amount=bonus(s,cast,element,e)
  if s.companion=='emilie' and cast.id==2 and s.actors[2].hp>0 and s.t<(s.actors[2].burnBoostUntil or 0) and e and e.burning and e.burning.remaining>0 then amount=amount+.3 end
  return amount
 end
 function C.companionAI(s,a,nearest)
  if s.companion~='emilie' then return ai(s,a,nearest) end
  if burning(s,a) and C.attack(s,a,'skill3') then return true end
  for _,key in ipairs({'skill4','skill1','skill2','normal'}) do if C.attack(s,a,key) then break end end
  return true
 end
 local function clear(s) s.perfume=nil;s.actors[2].burnBoostUntil=0 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;local companion=s.companion;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or companion~=s.companion or key=='boss_anemo' then clear(s) end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input)
  if s.actors[2].hp<=0 or s.returns~=returns then clear(s) end
  for key,p in pairs(s.perfume or {}) do if p.expires<=s.t then s.perfume[key]=nil end end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  if s.companion=='emilie' then
   f.companion.name='エミリエ（仮表示）';f.companion.skills={'通常槍撃','ルミドゥースの瓶','芳香散布','燃焼強化','追撃奥義'};f.companion.burnBoostSeconds=math.max(0,(s.actors[2].burnBoostUntil or 0)-s.t)
  end
  f.perfume=s.perfume
  for key,p in pairs(s.perfume or {}) do
   f.draws[#f.draws+1]={kind='rect',x=p.x-s.camera-10,y=p.y-65,w=20,h=65,color=key=='skill1' and '#badf91' or '#f0dfb4'}
  end
  f.commands=#f.draws;return f
 end
end
