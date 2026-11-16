return function(C)
 local attack,ai,bonus,action,step,frame=C.companionAttack,C.companionAI,C.damageBonus,C.action,C.step,C.frame
 local defs={normal={mult=.95,hits=2,ct=0,lock=.75,targets=3},skill1={mult=1.4,hits=5,ct=7,lock=.6,targets=5},skill2={mult=.8,hits=8,ct=20,lock=.5,targets=6,delay=.6,interval=1.2},skill3={mult=1.15,hits=3,ct=10,lock=.4,targets=4},skill4={mult=1.5,hits=7,ct=24,lock=.75,targets=8}}
 function C.companionAttack(s,a,key)
  if s.companion~='mitya' then return attack(s,a,key) end
  local d=defs[key]
  if not d or s.paused or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 or #s.pending>=64 or (C.canAttack and not C.canAttack(s)) then return false end
  a.cd[key]=d.ct;a.lock=d.lock
  local cast={id=2,key='mitya:'..key,x=a.x,y=a.y,dir=a.dir,range=360,vertical=160,limit=d.targets,mult=d.mult,remaining=d.hits,interval=d.interval or .08,next=s.t+(d.delay or .15),gain=key=='normal' and 2 or 5,element='electro',isNormal=key=='normal',color='#bba8f4'}
  for _,k in ipairs({'atk','elementBonus','normalBonus','skillBonus','troupe4','critRate','critDamageBonus'}) do cast[k]=a[k] end
  if key=='skill3' then a.inv=math.max(a.inv,.45);a.vy=-360;a.ground=false;a.leap=.45 end
  if key=='skill2' then
   cast.radial=true;cast.placed='mitya:field'
   for i=#s.pending,1,-1 do if s.pending[i].placed==cast.placed then table.remove(s.pending,i) end end
   s.stellarField={x=cast.x,y=cast.y,expires=s.t+10,range=360,vertical=160}
  end
  s.pending[#s.pending+1]=cast;return true
 end
 function C.damageBonus(s,cast,element,e)
  local amount=bonus(s,cast,element,e);local f=s.stellarField;local a=s.actors[1]
  if not f or f.expires<=s.t or cast.id~=1 or cast.isNormal or cast.reaction or s.actors[2].hp<=0 or math.abs(a.x-f.x)>=f.range or math.abs(a.y-f.y)>=f.vertical then return amount end
  local eligible=element=='cryo' or element=='electro'
  for _,part in ipairs(cast.damageElements or {}) do if part=='cryo' or part=='electro' then eligible=true end end
  if eligible then amount=amount+.12 end
  return amount
 end
 function C.companionAI(s,a,nearest)
  if s.companion~='mitya' then return ai(s,a,nearest) end
  local danger=((nearest.warning or 0)>0 and math.abs(nearest.x-a.x)<170) or (nearest.strike and nearest.strike.left<=.4 and math.abs(nearest.strike.x-a.x)<nearest.strike.radius) or (nearest.phase=='clap_warning' and nearest.timer<=.4 and math.abs((nearest.target or 0)-a.x)<125)
  if danger and C.attack(s,a,'skill3') then return true end
  for _,key in ipairs({'skill2','skill4','skill1','normal'}) do if C.attack(s,a,key) then break end end
  return true
 end
 function C.partnerAvailable(s,required)
  if s.actors[2].hp<=0 then return false end
  if required=='electro' then return s.companion=='beidou' or s.companion=='mitya' end
  return s.companion==required
 end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;local companion=s.companion;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or companion~=s.companion or key=='boss_anemo' then s.stellarField=nil end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input)
  if s.actors[2].hp<=0 or s.returns~=returns or (s.stellarField and s.stellarField.expires<=s.t) then s.stellarField=nil end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  if s.companion=='mitya' then f.companion.name='ミティア（仮表示）';f.companion.skills={'通常雷球','雷連射','極星フィールド','雷の跳躍','星電導奥義'} end
  if s.stellarField then local p=s.stellarField;f.stellarField={seconds=math.max(0,p.expires-s.t)};f.draws[#f.draws+1]={kind='rect',x=p.x-s.camera-p.range,y=p.y-4,w=p.range*2,h=4,color='#bba8f4'} end
  f.commands=#f.draws;return f
 end
end
