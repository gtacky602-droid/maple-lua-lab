return function(C)
 local attack,ai,action,step,frame=C.companionAttack,C.companionAI,C.action,C.step,C.frame
 local defs={normal={mult=1,hits=3,ct=0,lock=.75,targets=3},skill1={mult=1.25,hits=3,ct=6,lock=.45,targets=4},skill2={mult=1.6,hits=6,ct=8,lock=.7,targets=6},skill3={ct=10,lock=.3},skill4={mult=1.5,hits=12,ct=25,lock=.75,targets=6,delay=.4,interval=.25}}
 function C.companionAttack(s,a,key)
  if s.companion~='ayaka' then return attack(s,a,key) end
  local d=defs[key]
  if not d or s.paused or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 or #s.pending>=64 or (C.canAttack and not C.canAttack(s)) then return false end
  a.cd[key]=d.ct;a.lock=d.lock
  if key=='skill3' then a.inv=math.max(a.inv,.6);return true end
  local cast={id=2,key='ayaka:'..key,x=a.x,y=a.y,dir=a.dir,range=180,limit=d.targets,mult=d.mult,remaining=d.hits,interval=d.interval or .08,next=s.t+(d.delay or .15),gain=key=='normal' and 2 or 5,element=key=='normal' and 'physical' or 'cryo',isNormal=key=='normal',color='#b4e9ff'}
  for _,k in ipairs({'atk','elementBonus','normalBonus','skillBonus','troupe4','critRate','critDamageBonus'}) do cast[k]=a[k] end
  if key=='skill1' then a.dash=.25;a.dashDir=a.dir;cast.follow=true end
  if key=='skill4' then
   cast.x=math.max(20,math.min((s.worldwidth or 2880)-20,a.x+a.dir*150));cast.radial=true;cast.placed='ayaka:blizzard';cast.vertical=160
   for i=#s.pending,1,-1 do if s.pending[i].placed=='ayaka:blizzard' then table.remove(s.pending,i) end end
   s.blizzard={x=cast.x,y=cast.y,expires=s.t+3.5}
  end
  cast.startedAt=s.t;s.pending[#s.pending+1]=cast;return true
 end
 function C.companionAI(s,a,nearest)
  if s.companion~='ayaka' then return ai(s,a,nearest) end
  local danger=((nearest.warning or 0)>0 and (nearest.warning or 0)<=.55 and math.abs(nearest.x-a.x)<170) or (nearest.strike and nearest.strike.left<=.55 and math.abs(nearest.strike.x-a.x)<nearest.strike.radius) or (nearest.phase=='clap_warning' and nearest.timer<=.55 and math.abs((nearest.target or 0)-a.x)<125)
  if danger and C.attack(s,a,'skill3') then return true end
  for _,key in ipairs({'skill4','skill2','skill1','normal'}) do if C.attack(s,a,key) then break end end
  return true
 end
 local function clear(s) s.blizzard=nil;s.actors[2].dash=0 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;local companion=s.companion;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or companion~=s.companion or key=='boss_anemo' then clear(s) end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input)
  if s.actors[2].hp<=0 or s.returns~=returns then clear(s) end
  if s.blizzard and s.blizzard.expires<=s.t then s.blizzard=nil end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  if s.companion=='ayaka' then f.companion.name='綾華（仮表示）';f.companion.skills={'通常剣技','高速踏込','氷刃斬','霜影回避','吹雪奥義'} end
  if s.blizzard then
   f.blizzard={seconds=math.max(0,s.blizzard.expires-s.t)}
   for i=1,8 do f.draws[#f.draws+1]={kind='rect',x=s.blizzard.x-s.camera+math.sin(s.t*5+i)*150,y=s.blizzard.y-75+math.cos(s.t*5+i)*65,w=8,h=22,color='#b4e9ff'} end
  end
  f.commands=#f.draws;return f
 end
end
