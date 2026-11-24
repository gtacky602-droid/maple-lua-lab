return function(C)
 local attack,ai,action,step,frame=C.companionAttack,C.companionAI,C.action,C.step,C.frame
 local defs={normal={mult=1,hits=2,ct=0,lock=.75,targets=3},skill1={mult=1.1,hits=8,ct=16,lock=.45,targets=6,delay=.5,interval=1.1},skill2={mult=1.4,hits=5,ct=10,lock=.65,targets=5},skill3={ct=12,lock=.3},skill4={mult=1.85,hits=7,ct=24,lock=.8,targets=8}}
 function C.traversalRate(s,a) return a.id==2 and s.companion=='kachina' and (a.climbBoostUntil or 0)>s.t and 1.25 or 1 end
 function C.companionAttack(s,a,key)
  if s.companion~='kachina' then return attack(s,a,key) end
  local d=defs[key]
  if not d or s.paused or a.hp<=0 or a.lock>0 or (a.cd[key] or 0)>0 or #s.pending>=64 or (C.canAttack and not C.canAttack(s)) then return false end
  a.cd[key]=d.ct;a.lock=d.lock
  if key=='skill3' then a.climbBoostUntil=s.t+5;return true end
  local cast={id=2,key='kachina:'..key,x=a.x,y=a.y,dir=a.dir,range=key=='normal' and 180 or 300,vertical=160,limit=d.targets,mult=d.mult,remaining=d.hits,interval=d.interval or .08,next=s.t+(d.delay or .15),gain=key=='normal' and 2 or 5,element=key=='normal' and 'physical' or 'geo',isNormal=key=='normal',color='#edce85'}
  for _,k in ipairs({'atk','elementBonus','normalBonus','skillBonus','troupe4','critRate','critDamageBonus'}) do cast[k]=a[k] end
  if key=='skill2' then a.dash=.25;a.dashDir=a.dir;cast.follow=true end
  if key=='skill1' then
   cast.x=math.max(20,math.min((s.worldwidth or 2880)-20,a.x+a.dir*120));cast.radial=true;cast.placed='kachina:top'
   for i=#s.pending,1,-1 do if s.pending[i].placed==cast.placed then table.remove(s.pending,i) end end
   s.drillTop={x=cast.x,y=cast.y,expires=s.t+9}
  end
  cast.startedAt=s.t;s.pending[#s.pending+1]=cast;return true
 end
 function C.companionClimbX(s,a,target)
  local climbing=a.climbIntent
  a.climbIntent=false
  if s.companion~='kachina' or not target then return end
  local nearest,distance
  for _,p in ipairs(s.platforms) do
   if p.structure=='vine' and a.y>p.y and a.y<=p.base+10 and target.y<p.base-60
      and (climbing or target.y<a.y-60) then
    local x=p.x+p.w/2
    local dx=math.abs(a.x-x)
    if dx<320 and math.abs(target.x-x)<225 and (not p.life or p.life>dx/210+(a.y-p.y)/280)
       and (not distance or dx<distance) and C.pathClear(s,a,x,a.y) then
     nearest,distance=x,dx
    end
   end
  end
  if not nearest then return end
  a.climbIntent=distance<35
  if a.climbIntent and C.traversalRate(s,a)==1 then C.attack(s,a,'skill3') end
  return nearest
 end
 function C.companionAI(s,a,nearest)
  if s.companion~='kachina' then return ai(s,a,nearest) end
  for _,key in ipairs({'skill4','skill1','skill2','normal'}) do if C.attack(s,a,key) then break end end
  return true
 end
 local function clear(s) s.drillTop=nil;local a=s.actors[2];a.climbBoostUntil=0;a.climbIntent=false end
 function C.action(s,key)
  local zone=s.campaign and s.campaign.zone;local companion=s.companion;action(s,key)
  if zone~=(s.campaign and s.campaign.zone) or companion~=s.companion or key=='boss_anemo' then clear(s) end
  if key=='swap' then s.actors[2].climbIntent=false end
 end
 function C.step(s,dt,input)
  local returns=s.returns;step(s,dt,input)
  if s.actors[2].hp<=0 or s.returns~=returns then clear(s) end
  if s.drillTop and s.drillTop.expires<=s.t then s.drillTop=nil end
 end
 function C.frame(s,mode,profile)
  local f=frame(s,mode,profile)
  if s.companion=='kachina' then f.companion.name='カチーナ（仮表示）';f.companion.skills={'通常槍撃','コマちゃん','掘削突進','登攀加速','地響き奥義'};f.companion.climbBoostSeconds=math.max(0,(s.actors[2].climbBoostUntil or 0)-s.t) end
  if s.drillTop then local p=s.drillTop;f.drillTop={seconds=math.max(0,p.expires-s.t)};f.draws[#f.draws+1]={kind='rect',x=p.x-s.camera-24,y=p.y-42,w=48,h=42,color='#edce85'} end
  f.commands=#f.draws;return f
 end
end
